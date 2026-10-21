// Device input → sim Commands (Tech §6). Pointer Events only, one path for mouse, touch and pen.
//   Mouse:  left button fires at once · right button / Space reloads · Q blows the Vuvuzela ·
//           1/2/3 use Season Run consumables and the rental (or tap/click their buttons) ·
//           A/D, ←/→ or the outer 12 % of the screen pans.
//   Touch:  tap fires at the finger · horizontal drag pans with inertia · flick-down or a tap on
//           the shell belt reloads · a tap on the gadget button blows the Vuvuzela.
//   Hold-to-fire (Mielie-Masjien, Chilli Biltong — the snapshot says when): pressing starts a
//   hold (fireHoldStart), moving aims it (fireHoldMove), lifting ends it (fireHoldEnd). On touch a
//   held finger aims instead of panning; holding it near a screen edge pans (D-021).
//   M9 Settings → hold to fire (GDD §18.3) gives every weapon the same hold: a weapon without its
//   own hold gets a plain `fire` at the held position each tick the gun is ready (never an empty
//   click), so the sim and replays are unchanged — these are ordinary fire commands. A mouse
//   press starts it at once. A finger first stays an ordinary gesture: only once it has been
//   still (< tapMaxMovePx) for touchHoldMs does it become the hold, so a tap still fires once and
//   a drag still pans, a flick still reloads (D-026). This hold doesn't edge-pan.
// Positions are converted to design px of the visible screen; the fire command carries dx from
// the screen centre (never an absolute x — the sim doesn't know the viewport width).
import type { Feel } from '../../content/schemas';
import type { Command, InputKind } from '../../sim/types';
import { GestureRecognizer } from './gestures';
import { edgeDirection, PanController } from './panController';

export interface InputHost {
  /** Design size of the visible screen right now. */
  designSize(): { width: number; height: number };
  /** True if (x, y) in design px is on the shell belt (touch reload target). */
  isOnBelt(x: number, y: number): boolean;
  /** True if (x, y) in design px is on the gadget button. */
  isOnGadget(x: number, y: number): boolean;
  /** Season Run consumable/rental button under (x, y) (its consumable slot), or null. */
  itemAt(x: number, y: number): number | null;
  /** True if (x, y) is on a HUD control handled elsewhere (pause, FTUE skip): never fires. */
  isOnUi(x: number, y: number): boolean;
  /** Esc / P: open the pause menu. */
  pause(): void;
  /** Holding fires: the weapon's own hold (snapshot weapon.holdToFire) or Settings → hold to fire. */
  holdToFire(): boolean;
  /** The active weapon has its own hold (fireHoldStart/Move/End commands). */
  weaponHolds(): boolean;
  /** The gun can fire this tick (loaded, not reloading, no cooldown): repeat-fire only then. */
  readyToFire(): boolean;
  queue(cmd: Command): void;
  /** Cursor/finger position for the reticle and gun lean. */
  aim(x: number, y: number, fromTap: boolean): void;
  fingerDown(down: boolean): void;
  toggleDebug(): void;
}

/** Pointer type → the sim's inputKind (touch gets aim assist). */
export function inputKindOf(pointerType: string): InputKind {
  return pointerType === 'mouse' ? 'pointer' : 'touch';
}

export class InputMapper {
  private readonly canvas: HTMLCanvasElement;
  private readonly feel: Feel;
  private readonly host: InputHost;
  private readonly gestures: GestureRecognizer;
  readonly pan: PanController;
  private enabled = false;
  private readonly keysDown = new Set<string>();
  private readonly ignored = new Set<number>();
  private readonly listeners: [EventTarget, string, EventListener][] = [];
  /** The pointer holding fire down (mouse or finger), if any. */
  private holdPointer: number | null = null;
  private lastHold = { x: 0, y: 0 };
  /** The hold repeats plain fire commands (Settings → hold to fire on a weapon without a hold). */
  private repeating = false;
  /** Touch + Settings → hold to fire: a finger that may still become a hold (see the header). */
  private pendingHold: { id: number; x: number; y: number; at: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    feel: Feel,
    host: InputHost,
    startCx: number,
    /** Same time base as PointerEvent.timeStamp (tests pass their own). */
    private readonly now: () => number = () => performance.now(),
  ) {
    this.canvas = canvas;
    this.feel = feel;
    this.host = host;
    this.gestures = new GestureRecognizer(feel.input);
    this.pan = new PanController(feel.input, startCx);
    this.on(canvas, 'pointerdown', (e) => {
      this.onDown(e as PointerEvent);
    });
    this.on(canvas, 'pointermove', (e) => {
      this.onMove(e as PointerEvent);
    });
    this.on(canvas, 'pointerup', (e) => {
      this.onUp(e as PointerEvent);
    });
    this.on(canvas, 'pointercancel', (e) => {
      this.onCancel(e as PointerEvent);
    });
    this.on(canvas, 'pointerleave', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse') {
        this.pan.setEdgeDirection(0);
        this.endHold((e as PointerEvent).pointerId);
      }
    });
    this.on(canvas, 'contextmenu', (e) => {
      e.preventDefault();
    });
    this.on(window, 'keydown', (e) => {
      this.onKey(e as KeyboardEvent, true);
    });
    this.on(window, 'keyup', (e) => {
      this.onKey(e as KeyboardEvent, false);
    });
    this.on(window, 'blur', () => {
      if (this.holdPointer !== null) this.endHold(this.holdPointer);
      this.keysDown.clear();
      this.pan.setKeyDirection(0);
      this.pan.setEdgeDirection(0);
    });
  }

  /** Start/stop turning input into commands (off on the start card and the tally). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      if (this.holdPointer !== null) this.endHold(this.holdPointer);
      this.pan.setEdgeDirection(0);
      this.pan.setKeyDirection(0);
      this.pan.hold();
      this.host.fingerDown(false);
    }
  }

  /** The sim dropped the hold (crate weapon armed or used up): stop treating the held pointer as
   *  a hold, so a finger can drag-pan again. */
  cancelHold(): void {
    if (this.holdPointer !== null) this.endHold(this.holdPointer);
  }

  /** Ignore this pointer until it lifts (e.g. the tap that started the hunt). */
  ignorePointer(id: number): void {
    this.ignored.add(id);
  }

  /** Commands for the next sim tick (camera from drag/inertia/keys/edges). */
  perTick(): Command[] {
    if (!this.enabled) return [];
    const pending = this.pendingHold;
    if (pending !== null && this.now() - pending.at >= this.feel.input.touchHoldMs) {
      // The finger stayed still long enough: no longer a tap, drag or flick, but the hold.
      this.pendingHold = null;
      this.gestures.cancel(pending.id);
      this.host.aim(pending.x, pending.y, true);
      this.startHold(pending.id, pending.x, pending.y);
    }
    const cx = this.pan.tick();
    const cmds: Command[] = cx === null ? [] : [{ t: 'cameraTarget', cx }];
    if (this.repeating && this.holdPointer !== null && this.host.readyToFire()) {
      const { width } = this.host.designSize();
      cmds.push({ t: 'fire', dx: this.lastHold.x - width / 2, sy: this.lastHold.y });
    }
    return cmds;
  }

  destroy(): void {
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.listeners.length = 0;
  }

  /** Client px → design px of the visible screen. */
  toDesign(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const { width, height } = this.host.designSize();
    return {
      x: ((clientX - r.left) / Math.max(1, r.width)) * width,
      y: ((clientY - r.top) / Math.max(1, r.height)) * height,
    };
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn, { passive: false });
    this.listeners.push([target, type, fn]);
  }

  private fireAt(x: number, y: number): void {
    const { width } = this.host.designSize();
    this.host.queue({ t: 'fire', dx: x - width / 2, sy: y });
  }

  private startHold(id: number, x: number, y: number): void {
    const { width } = this.host.designSize();
    this.holdPointer = id;
    this.lastHold = { x, y };
    this.repeating = !this.host.weaponHolds();
    // Repeat mode: the press itself fires once; perTick repeats while the gun is ready.
    if (this.repeating) this.fireAt(x, y);
    else this.host.queue({ t: 'fireHoldStart', dx: x - width / 2, sy: y });
  }

  private moveHold(x: number, y: number): void {
    // Only real moves (≥ 2 design px) become commands, so the replay log stays small.
    if (Math.abs(x - this.lastHold.x) < 2 && Math.abs(y - this.lastHold.y) < 2) return;
    const { width } = this.host.designSize();
    this.lastHold = { x, y };
    if (!this.repeating) this.host.queue({ t: 'fireHoldMove', dx: x - width / 2, sy: y });
  }

  private endHold(id: number): void {
    if (this.holdPointer !== id) return;
    this.holdPointer = null;
    if (this.repeating) this.repeating = false;
    else this.host.queue({ t: 'fireHoldEnd' });
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    if (!this.enabled || this.ignored.has(e.pointerId)) return;
    const p = this.toDesign(e.clientX, e.clientY);
    if (this.host.isOnUi(p.x, p.y)) {
      // A finger on a HUD control must not become a tap or drag when it lifts. (A mouse press is
      // simply dropped: its id is reused, and a release off the canvas would leave it ignored.)
      if (e.pointerType !== 'mouse') this.ignored.add(e.pointerId);
      return;
    }
    const item = this.host.itemAt(p.x, p.y);
    const onButton =
      this.host.isOnBelt(p.x, p.y) || this.host.isOnGadget(p.x, p.y) || item !== null;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) {
        this.host.aim(p.x, p.y, false);
        if (this.host.isOnBelt(p.x, p.y)) this.host.queue({ t: 'reload' });
        else if (this.host.isOnGadget(p.x, p.y)) this.host.queue({ t: 'gadget' });
        else if (item !== null) this.host.queue({ t: 'consumable', slot: item });
        else if (this.host.holdToFire()) this.startHold(e.pointerId, p.x, p.y);
        else this.fireAt(p.x, p.y);
      } else if (e.button === 2) {
        this.host.queue({ t: 'reload' });
      }
      return;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't always be captured; gestures still work without it.
    }
    if (
      !onButton &&
      this.holdPointer === null &&
      this.pendingHold === null &&
      this.host.holdToFire() &&
      !this.host.weaponHolds()
    ) {
      // Settings → hold to fire: an ordinary gesture until the finger has been still a moment.
      this.pendingHold = { id: e.pointerId, x: p.x, y: p.y, at: e.timeStamp };
    } else if (!onButton && this.holdPointer === null && this.host.holdToFire()) {
      // A weapon with its own hold: a held finger fires and aims; the screen edges pan.
      this.pan.hold();
      this.host.aim(p.x, p.y, true);
      this.host.fingerDown(true);
      this.startHold(e.pointerId, p.x, p.y);
      return;
    }
    this.pan.hold();
    this.gestures.down(e.pointerId, p.x, p.y, e.timeStamp);
    this.host.fingerDown(true);
  }

  private onMove(e: PointerEvent): void {
    if (!this.enabled || this.ignored.has(e.pointerId)) return;
    const p = this.toDesign(e.clientX, e.clientY);
    const pending = this.pendingHold;
    if (
      pending?.id === e.pointerId &&
      Math.hypot(p.x - pending.x, p.y - pending.y) > this.feel.input.tapMaxMovePx
    )
      this.pendingHold = null; // it moved: a drag or a flick, not a hold
    if (e.pointerId === this.holdPointer) this.moveHold(p.x, p.y);
    if (e.pointerType === 'mouse') {
      this.host.aim(p.x, p.y, true);
      const { width } = this.host.designSize();
      this.pan.setEdgeDirection(edgeDirection(p.x, width, this.feel.input.edgePanFraction));
      return;
    }
    if (e.pointerId === this.holdPointer) {
      const { width } = this.host.designSize();
      this.host.aim(p.x, p.y, true);
      // Only a weapon's own hold edge-pans; the Settings hold just aims.
      if (!this.repeating)
        this.pan.setEdgeDirection(edgeDirection(p.x, width, this.feel.input.edgePanFraction));
      return;
    }
    const dx = this.gestures.move(e.pointerId, p.x, p.y, e.timeStamp);
    if (dx !== 0) this.pan.drag(dx);
  }

  private onUp(e: PointerEvent): void {
    if (this.pendingHold?.id === e.pointerId) this.pendingHold = null; // lifted first: a tap
    if (this.ignored.delete(e.pointerId)) return;
    if (e.pointerId === this.holdPointer) {
      this.endHold(e.pointerId);
      if (e.pointerType !== 'mouse') {
        this.pan.setEdgeDirection(0);
        if (this.gestures.activePointers === 0) this.host.fingerDown(false);
      }
      return;
    }
    if (!this.enabled || e.pointerType === 'mouse') return;
    const p = this.toDesign(e.clientX, e.clientY);
    const end = this.gestures.up(e.pointerId, p.x, p.y, e.timeStamp);
    if (this.gestures.activePointers === 0) this.host.fingerDown(false);
    switch (end.kind) {
      case 'tap':
        if (this.host.isOnBelt(end.x, end.y)) this.host.queue({ t: 'reload' });
        else if (this.host.isOnGadget(end.x, end.y)) this.host.queue({ t: 'gadget' });
        else if (this.host.itemAt(end.x, end.y) !== null) {
          const slot = this.host.itemAt(end.x, end.y);
          if (slot !== null) this.host.queue({ t: 'consumable', slot });
        } else {
          this.host.aim(end.x, end.y, true);
          this.fireAt(end.x, end.y);
        }
        return;
      case 'flickDown':
        this.host.queue({ t: 'reload' });
        return;
      case 'dragEnd':
        this.pan.release(end.vx);
        return;
      case 'none':
        return;
    }
  }

  private onCancel(e: PointerEvent): void {
    if (this.pendingHold?.id === e.pointerId) this.pendingHold = null;
    this.ignored.delete(e.pointerId);
    if (e.pointerId === this.holdPointer) {
      this.endHold(e.pointerId);
      this.pan.setEdgeDirection(0);
    }
    this.gestures.cancel(e.pointerId);
    if (this.gestures.activePointers === 0) this.host.fingerDown(false);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.code === 'F1') {
      e.preventDefault();
      if (down && !e.repeat) this.host.toggleDebug();
      return;
    }
    if (!this.enabled) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (down && !e.repeat) this.host.pause();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (down && !e.repeat) this.host.queue({ t: 'reload' });
      return;
    }
    // Season Run: 1, 2 use the consumables, 3 the rented crate weapon.
    const digit = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (digit >= 0) {
      e.preventDefault();
      if (down && !e.repeat) this.host.queue({ t: 'consumable', slot: digit });
      return;
    }
    if (e.code === 'KeyQ') {
      e.preventDefault();
      if (down && !e.repeat) this.host.queue({ t: 'gadget' });
      return;
    }
    const dir: Record<string, number> = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1 };
    if (dir[e.code] === undefined) return;
    e.preventDefault();
    if (down) this.keysDown.add(e.code);
    else this.keysDown.delete(e.code);
    let sum = 0;
    for (const k of this.keysDown) sum += dir[k] ?? 0;
    this.pan.setKeyDirection(sum);
  }
}
