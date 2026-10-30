// v1.8c (D-063, GDD §12.2, art bible §5.4) Die Oes on screen (a lazy chunk: not in the first
// download): one sprite per warthog, piglet and farm worker on its layer, the fence gap's panel
// (whole, broken in the intro, mended in stages over the rush, whole again at the end) and the
// "Oes" sign that swings when the fence breaks. Everything follows the sim's snapshot on sim time
// (held frames hold). Phone rules (D-059, v1.8b): properties set only when they change, no
// per-frame allocations beyond a new actor's slot, sprites off screen hidden, its own timer
// (harvestMs) for the perf test. The sheet is in the map's own lazy group: until the delivered
// file is under the key nothing is drawn, and the view looks for it every 30 frames.
import type * as Phaser from 'phaser';
import type { HarvestSetup } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type {
  HarvestActorView,
  HarvestView as SimHarvest,
  PlaneId,
  SimState,
} from '../../../sim/types';
import type { AudioDirector } from '../../audio/AudioDirector';
import { designSize } from '../../layout';
import type { ParallaxView } from '../ParallaxView';
import {
  HARVEST_SHEET,
  PIGLET_H,
  WARTHOG_H,
  WORKER_H,
  harvestFrames,
  harvestTexelsPerPx,
  type HarvestFrame,
} from './harvestSheet';
import { HARVEST_SOUNDS, HARVEST_SYNTH, type HarvestSound } from './harvestSounds';

/** Ticks per frame: trotting, running, digging, working, a worker's run. */
const TROT_TICKS = 7;
const RUN_TICKS = 4;
const DIG_TICKS = 14;
const WORK_TICKS = 12;
const WORKER_RUN_TICKS = 8;
/** The tumble shows this share of its time, then it lies still and fades. */
const TUMBLE_SHARE = 0.45;
/** Off-screen margin (design px) before a sprite is hidden. */
const CULL_PX = 200;
/** How often (frames) the view looks for the delivered sheet. */
const SHEET_POLL_FRAMES = 30;
/** The sign's swing after the break: start angle (rad), period (ticks), decay per tick. */
const SIGN_SWING = 0.5;
const SIGN_PERIOD = 50;
const SIGN_DECAY = 0.985;
/** The workers hammer every this many ticks of the rush (a sound, sim time). */
const HAMMER_TICKS = 100;

/** e2e: one Harvest actor on screen. */
export interface HarvestHook {
  readonly id: number;
  /** warthog · piglet · worker · gap · sign */
  readonly role: string;
  readonly frame: string | null;
  /** Feet on screen (design px). */
  readonly x: number;
  readonly y: number;
  /** Its ground line on screen (design px): the feet must stand on it. */
  readonly groundY: number;
  readonly visible: boolean;
  /** Review round 2: the body's hit ellipse on screen (design px: centre and radii), as the sim
   *  tests a shot against it (workers and warthogs; null for the rest). */
  readonly body: {
    readonly x: number;
    readonly y: number;
    readonly rx: number;
    readonly ry: number;
  } | null;
}

/** The sheet as the view needs it from the manifest. */
export interface HarvestSheetSource {
  delivered(textures: Phaser.Textures.TextureManager, key: string): boolean;
  upgrade(textures: Phaser.Textures.TextureManager, key: string): void;
}

interface Slot {
  readonly img: Phaser.GameObjects.Image;
  readonly layerId: string;
  readonly role: string;
  frame: HarvestFrame;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  rot: number;
  flip: boolean;
  shown: boolean;
  seen: boolean;
  hook: HarvestHook;
}

const alt = (t: number, every: number): boolean => Math.floor(t / every) % 2 === 0;
const TROT: readonly HarvestFrame[] = ['wh_trot_a', 'wh_trot_b', 'wh_trot_c', 'wh_trot_d'];

export class HarvestView {
  private readonly slots = new Map<number, Slot>();
  private gap: Slot | null = null;
  private sign: Slot | null = null;
  private sheet: Phaser.Textures.Texture | null = null;
  /** Texture px per design px of the sheet under the key (2: the 2× master). */
  private k = 2;
  private waitFrames = 0;
  private hookList: HarvestHook[] = [];
  /** Milliseconds the last update took (perf.spec: harvestMs). */
  lastMs = 0;
  private readonly tumbleTicks: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly now: () => number,
    private readonly manifest: HarvestSheetSource,
    private readonly tuning: HarvestSetup,
    /** The e2e hooks are on (else no hook entries are made). */
    private readonly hooks = false,
  ) {
    this.tumbleTicks = Math.max(1, Math.round(tuning.warthogs.tumbleSeconds * 60));
  }

  /** The e2e hook's entries (empty without hooks). */
  get actors(): readonly HarvestHook[] {
    return this.hookList;
  }

  /** True once the delivered sheet (Standard or its HD twin) is under the key. */
  sheetReady(): boolean {
    const tx = this.scene.textures;
    if (!this.manifest.delivered(tx, HARVEST_SHEET)) {
      if (this.waitFrames++ % SHEET_POLL_FRAMES !== 0) return false;
      this.manifest.upgrade(tx, HARVEST_SHEET);
      if (!this.manifest.delivered(tx, HARVEST_SHEET)) return false;
    }
    return this.ensureSheet();
  }

  /** The sheet as last cut: cut again (every sprite rescaled) after a Standard ↔ HD swap. */
  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(HARVEST_SHEET)) return false;
    const tex = this.scene.textures.get(HARVEST_SHEET);
    if (tex === this.sheet) return true;
    const k = harvestTexelsPerPx(tex.getSourceImage().width);
    for (const f of harvestFrames()) {
      const fr = tex.has(f.name)
        ? tex.get(f.name)
        : tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
      if (fr === null) continue;
      fr.customPivot = true;
      fr.pivotX = f.ox / f.w;
      fr.pivotY = f.oy / f.h;
    }
    const was = this.k;
    this.k = k;
    for (const s of this.all()) {
      s.img.setTexture(HARVEST_SHEET, s.frame);
      s.img.setScale((s.scale * was) / k);
      s.scale = (s.scale * was) / k;
      this.origin(s);
    }
    this.sheet = tex;
    return true;
  }

  private *all(): Iterable<Slot> {
    yield* this.slots.values();
    if (this.gap !== null) yield this.gap;
    if (this.sign !== null) yield this.sign;
  }

  private newSlot(layerId: string, frame: HarvestFrame, id: number, role: string): Slot | null {
    const layer = this.parallax.layer(layerId);
    if (layer === undefined) return null;
    const img = this.scene.add.image(0, 0, HARVEST_SHEET, frame).setVisible(false);
    const tint = this.parallax.layerTint(layerId);
    if (tint !== 0xffffff) img.setTint(tint);
    layer.fixtures.add(img);
    return {
      img,
      layerId,
      role,
      frame,
      x: 0,
      y: 0,
      scale: 1,
      alpha: 1,
      rot: 0,
      flip: false,
      shown: false,
      seen: false,
      hook: { id, role, frame: null, x: 0, y: 0, groundY: 0, visible: false, body: null },
    };
  }

  /** Phaser flips round the frame's centre: a mirrored frame keeps its feet by mirroring the
   *  origin too. */
  private origin(s: Slot): void {
    const f = s.img.frame;
    s.img.setOrigin(s.flip ? 1 - f.pivotX : f.pivotX, f.pivotY);
  }

  /** Puts a slot at (x, y) on its layer with `frame` (null: hidden); returns whether shown. */
  private place(
    s: Slot,
    frame: HarvestFrame | null,
    x: number,
    y: number,
    scale: number,
    flip: boolean,
    alpha: number,
    rot = 0,
  ): boolean {
    const layer = this.parallax.layer(s.layerId);
    let show = frame !== null && alpha > 0 && layer !== undefined;
    if (show && layer !== undefined) {
      const sx = layer.root.x + x * layer.root.scaleX;
      const w = designSize().width;
      if (sx < -CULL_PX || sx > w + CULL_PX) show = false;
    }
    if (show !== s.shown) {
      s.img.setVisible(show);
      s.shown = show;
    }
    if (!show || frame === null) return false;
    if (frame !== s.frame) {
      s.img.setFrame(frame);
      s.frame = frame;
      this.origin(s);
    }
    if (flip !== s.flip) {
      s.img.setFlipX(flip);
      s.flip = flip;
      this.origin(s);
    }
    const sc = scale / this.k;
    if (sc !== s.scale) {
      s.img.setScale(sc);
      s.scale = sc;
    }
    if (x !== s.x || y !== s.y) {
      s.img.setPosition(x, y);
      s.x = x;
      s.y = y;
    }
    if (alpha !== s.alpha) {
      s.img.setAlpha(alpha);
      s.alpha = alpha;
    }
    if (rot !== s.rot) {
      s.img.setRotation(rot);
      s.rot = rot;
    }
    return true;
  }

  private hookOf(
    s: Slot,
    show: boolean,
    x: number,
    y: number,
    groundY: number,
    /** The body ellipse on the layer (layer px), or null. */
    body: { x: number; y: number; rx: number; ry: number } | null = null,
  ): void {
    if (!this.hooks) return;
    const layer = this.parallax.layer(s.layerId);
    if (layer === undefined) return;
    const r = layer.root;
    const hx = Math.round(r.x + x * r.scaleX);
    const hy = Math.round(r.y + y * r.scaleY);
    const gy = Math.round(r.y + groundY * r.scaleY);
    const h = s.hook;
    const f = show ? s.frame : null;
    const b =
      body === null
        ? null
        : {
            x: r.x + body.x * r.scaleX,
            y: r.y + body.y * r.scaleY,
            rx: body.rx * r.scaleX,
            ry: body.ry * r.scaleY,
          };
    const same =
      (h.body === null && b === null) ||
      (h.body !== null && b !== null && h.body.x === b.x && h.body.y === b.y && h.body.rx === b.rx);
    if (
      h.x !== hx ||
      h.y !== hy ||
      h.visible !== show ||
      h.frame !== f ||
      h.groundY !== gy ||
      !same
    )
      s.hook = { ...h, x: hx, y: hy, visible: show, frame: f, groundY: gy, body: b };
  }

  /** A hit box's body ellipse on its layer (as the sim builds it: × scale, mirrored by facing). */
  private bodyOf(
    box: { readonly body: { rx: number; ry: number; ox: number; oy: number } },
    a: HarvestActorView,
  ): { x: number; y: number; rx: number; ry: number } | null {
    if (!this.hooks) return null;
    const b = box.body;
    return {
      x: a.x + b.ox * a.scale * a.facing,
      y: a.y + b.oy * a.scale,
      rx: b.rx * a.scale,
      ry: b.ry * a.scale,
    };
  }

  private slotFor(a: HarvestActorView, role: string, frame: HarvestFrame): Slot | null {
    let s = this.slots.get(a.id);
    if (s === undefined) {
      const made = this.newSlot(a.layerId, frame, a.id, role);
      if (made === null) return null;
      this.slots.set(a.id, made);
      s = made;
    }
    s.seen = true;
    return s;
  }

  private warthogFrame(phase: string, t: number): { frame: HarvestFrame; alpha: number } {
    switch (phase) {
      case 'dig':
        return { frame: alt(t, DIG_TICKS) ? 'wh_dig_a' : 'wh_dig_b', alpha: 1 };
      case 'run':
        return { frame: alt(t, RUN_TICKS) ? 'wh_run_a' : 'wh_run_b', alpha: 1 };
      case 'tumble': {
        const f = t / this.tumbleTicks;
        if (f < TUMBLE_SHARE) return { frame: 'wh_tumble', alpha: 1 };
        return {
          frame: 'wh_down',
          alpha: Math.max(0, 1 - (f - TUMBLE_SHARE) / (1 - TUMBLE_SHARE)),
        };
      }
      default:
        return { frame: TROT[Math.floor(t / TROT_TICKS) % TROT.length] ?? 'wh_trot_a', alpha: 1 };
    }
  }

  /** The gap's panel at this point of the hunt: whole before the break, then broken, mended in
   *  stages as the repair bar fills, whole again at the end. */
  private gapFrame(h: SimHarvest, tick: number): HarvestFrame {
    if (h.phase === 'intro') return tick < h.breakTick ? 'gap_4' : 'gap_0';
    if (h.phase === 'outro' || h.repair >= 1) return 'gap_4';
    if (h.repair < 0.25) return 'gap_0';
    if (h.repair < 0.5) return 'gap_1';
    if (h.repair < 0.75) return 'gap_2';
    return 'gap_3';
  }

  /** Draws the Harvest at this tick. */
  update(state: SimState): void {
    const t0 = this.now();
    const h = state.harvest;
    if (h === null || !this.sheetReady()) {
      for (const s of this.all())
        if (s.shown) {
          s.img.setVisible(false);
          s.shown = false;
        }
      this.lastMs = this.now() - t0;
      return;
    }
    for (const s of this.slots.values()) s.seen = false;
    const W = this.tuning.warthogs;
    for (const w of h.warthogs) {
      const { frame, alpha } = this.warthogFrame(w.phase, w.t);
      const s = this.slotFor(w, 'warthog', frame);
      if (s === null) continue;
      const shown = this.place(
        s,
        frame,
        w.x,
        w.y,
        (W.heightPx * w.scale) / WARTHOG_H,
        w.facing < 0,
        alpha,
      );
      this.hookOf(
        s,
        shown,
        w.x,
        w.y,
        w.y,
        this.bodyOf(w.phase === 'dig' ? W.hitboxes.dig : W.hitboxes.trot, w),
      );
    }
    for (const p of h.piglets) {
      const frame: HarvestFrame = p.running
        ? 'pg_run'
        : alt(p.t, TROT_TICKS)
          ? 'pg_trot_a'
          : 'pg_trot_b';
      const s = this.slotFor(p, 'piglet', frame);
      if (s === null) continue;
      const shown = this.place(
        s,
        frame,
        p.x,
        p.y,
        (W.heightPx * p.scale) / PIGLET_H,
        p.facing < 0,
        1,
      );
      this.hookOf(s, shown, p.x, p.y, p.y);
    }
    const K = this.tuning.workers;
    for (const k of h.workers) {
      const look = k.look % 3;
      const frame = (
        k.phase === 'duck'
          ? `wk${look}_duck`
          : k.phase === 'run'
            ? `wk${look}_run_${alt(k.t, WORKER_RUN_TICKS) ? 'a' : 'b'}`
            : `wk${look}_work_${alt(k.t, WORK_TICKS) ? 'a' : 'b'}`
      ) as HarvestFrame;
      const s = this.slotFor(k, 'worker', frame);
      if (s === null) continue;
      const shown = this.place(
        s,
        frame,
        k.x,
        k.y,
        (K.heightPx * k.scale) / WORKER_H,
        k.facing < 0,
        1,
      );
      this.hookOf(
        s,
        shown,
        k.x,
        k.y,
        k.y,
        this.bodyOf(k.phase === 'duck' ? K.hitboxes.duck : K.hitboxes.work, k),
      );
    }
    // Gone actors: their slots go too.
    for (const [id, s] of this.slots)
      if (!s.seen) {
        s.img.destroy();
        this.slots.delete(id);
      }
    // The gap's panel (drawn 1:1 on its layer) and the sign hanging in it.
    this.gap ??= this.newSlot(h.gap.layerId, 'gap_4', -1, 'gap');
    if (this.gap !== null) {
      const shown = this.place(
        this.gap,
        this.gapFrame(h, state.tick),
        h.gap.x,
        h.gap.y,
        1,
        false,
        1,
      );
      this.hookOf(this.gap, shown, h.gap.x, h.gap.y, h.gap.y);
    }
    this.sign ??= this.newSlot(h.gap.layerId, 'sign_oes', -2, 'sign');
    if (this.sign !== null) {
      const since = state.tick - h.breakTick;
      const swing =
        h.phase === 'intro' && since < 0
          ? 0
          : h.phase === 'outro' || since > 600
            ? 0
            : SIGN_SWING *
              Math.pow(SIGN_DECAY, since) *
              Math.cos((since / SIGN_PERIOD) * Math.PI * 2);
      // The sign hangs from the gap's top wire (a little above the fence's middle).
      const sy = h.gap.y - 70;
      const shown = this.place(
        this.sign,
        'sign_oes',
        h.gap.x,
        sy,
        1,
        false,
        1,
        Math.round(swing * 100) / 100,
      );
      this.hookOf(this.sign, shown, h.gap.x, sy, h.gap.y);
    }
    if (this.hooks) {
      const list: HarvestHook[] = [];
      for (const s of this.all()) list.push(s.hook);
      this.hookList = list;
    }
    this.lastMs = this.now() - t0;
  }

  /** Baboon raiders bagged this hunt (for the tally; the sim counts the warthogs). */
  baboonsBagged = 0;
  /** The last sim tick the workers' hammering played. */
  private hammerTick = -1;

  /** The Harvest's events: counts for the tally and the sounds (a recording under the key wins,
   *  else the small synths). The workers hammer every HAMMER_TICKS of the rush. */
  handle(events: readonly SimEvent[], state: SimState, audio: AudioDirector, width: number): void {
    const h = state.harvest;
    const play = (sound: HarvestSound, plane: PlaneId | null, x: number): void => {
      audio.playExtra(
        HARVEST_SOUNDS[sound],
        plane === null ? 0 : this.pan(plane, x, width),
        HARVEST_SYNTH[sound],
      );
    };
    for (const e of events) {
      if (e.type === 'baboonBagged') this.baboonsBagged++;
      else if (e.type === 'harvestFenceBroken' && h !== null) play('snap', 'mid', h.gap.x);
      else if (e.type === 'warthogEntered') {
        const w = h?.warthogs.find((x) => x.id === e.warthogId);
        if (w !== undefined) play('grunt', w.plane, w.x);
      } else if (e.type === 'warthogHit' && e.hitsLeft > 0) play('grunt', e.plane, e.x);
      else if (e.type === 'warthogBagged') play('thump', e.plane, e.x);
      else if (e.type === 'harvestBystanderHit' && e.who === 'piglet') play('squeal', e.plane, e.x);
      else if (e.type === 'cropWarning') play('warn', null, 0);
      else if (e.type === 'harvestFenceClosed') play('jingle', null, 0);
    }
    if (h !== null && h.phase === 'rush' && state.tick - this.hammerTick >= HAMMER_TICKS) {
      const k = h.workers.find((w) => w.phase === 'work');
      if (k !== undefined) {
        this.hammerTick = state.tick;
        play('hammer', k.plane, k.x);
      }
    }
  }

  private pan(plane: PlaneId, x: number, width: number): number {
    const sx = this.parallax.screenX(plane, x);
    return Math.max(-1, Math.min(1, (sx - width / 2) / (width / 2)));
  }

  destroy(): void {
    for (const s of this.all()) s.img.destroy();
    this.slots.clear();
    this.gap = null;
    this.sign = null;
  }
}
