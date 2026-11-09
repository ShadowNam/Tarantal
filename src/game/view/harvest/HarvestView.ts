// v1.8c (D-063, GDD §12.2, art bible §5.4) Die Oes on screen (a lazy chunk: not in the first
// download): one sprite per warthog, piglet and farm worker on its layer, the fence gap's panel
// (whole, broken in the intro, mended in stages over the rush, whole again at the end) and the
// "Oes" sign that swings when the fence breaks. Everything follows the sim's snapshot on sim time
// (held frames hold). Phone rules (D-059, v1.8b): properties set only when they change, no
// per-frame allocations beyond a new actor's slot, sprites off screen hidden, its own timer
// (harvestMs) for the perf test. The sheet is in the map's own lazy group: until the delivered
// file is under the key nothing is drawn, and the view looks for it every 30 frames.
import { setFootOrigin } from '../footOrigin';
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
  FENCE_K,
  WORKER_H,
  harvestFrames,
  harvestTexelsPerPx,
  type HarvestFrame,
} from './harvestSheet';
import { HARVEST_SOUNDS, HARVEST_SYNTH, type HarvestSound } from './harvestSounds';
import {
  BABOON2_H,
  HARVEST2_FRAMES,
  HARVEST2_SHEET,
  harvest2Frames,
  harvest2TexelsPerPx,
  type Harvest2Frame,
} from './harvest2Sheet';
import { BABOON_SHEET, BABOON_SHEET_W } from '../baboon/baboonKeys';
import type { Phase2AnimalView } from '../../../sim/types';

/** v1.18 (D-081): the baboon sheet's raider frames Phase 2's baboons borrow (BaboonView cuts
 *  them on the baboon sheet; drawn at BABOON2_H like the raiders). */
const BABOON_BORROWED = ['run_a', 'run_b', 'mielie_a', 'mielie_b', 'tumble', 'down'] as const;
type BorrowedFrame = (typeof BABOON_BORROWED)[number];
/** Any frame a Harvest slot draws: the Harvest sheet's, the Phase 2 sheet's, a borrowed one. */
type AnyFrame = HarvestFrame | Harvest2Frame | BorrowedFrame;
const texOf = (f: AnyFrame): string =>
  f in HARVEST2_FRAMES
    ? HARVEST2_SHEET
    : (BABOON_BORROWED as readonly string[]).includes(f)
      ? BABOON_SHEET
      : HARVEST_SHEET;
/** v1.18 (D-081): ticks per climbing step; back arrivals fade in over this many ticks. */
const CLIMB_TICKS = 10;
const FADE_TICKS = 20;

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
  /** warthog · piglet · worker · gap · sign · hole · p2-warthog · p2-piglet · p2-baboon */
  readonly role: string;
  readonly frame: string | null;
  /** Feet on screen (design px). */
  readonly x: number;
  readonly y: number;
  /** Its ground line on screen (design px): the feet must stand on it. */
  readonly groundY: number;
  readonly visible: boolean;
  /** −1: drawn mirrored (facing left). */
  readonly facing: 1 | -1;
  /** Review round 2: the body's hit ellipse on screen (design px: centre and radii), as the sim
   *  tests a shot against it (workers and warthogs; null for the rest). */
  readonly body: {
    readonly x: number;
    readonly y: number;
    readonly rx: number;
    readonly ry: number;
  } | null;
  /** v1.18 (D-081): Phase 2's animals: what it is doing (approach, jump, climb, eat…). */
  readonly phase?: string;
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
  frame: AnyFrame;
  /** v1.18 (D-081): the texture under the slot's image. */
  tex: string;
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
interface Ellipse {
  readonly rx: number;
  readonly ry: number;
  readonly ox: number;
  readonly oy: number;
}
const TROT: readonly HarvestFrame[] = ['wh_trot_a', 'wh_trot_b', 'wh_trot_c', 'wh_trot_d'];

export class HarvestView {
  private readonly slots = new Map<number, Slot>();
  private gap: Slot | null = null;
  private sign: Slot | null = null;
  /** v1.18 (D-081): the small hole's patch. */
  private hole: Slot | null = null;
  private sheet: Phaser.Textures.Texture | null = null;
  /** v1.18 (D-081): the Phase 2 sheet (null until delivered and cut) and its texels per px. */
  private sheet2: Phaser.Textures.Texture | null = null;
  private k2 = 1;
  private wait2 = 0;
  /** Texture px per design px of the sheet under the key (2: the 2× master). */
  private k = 2;
  private waitFrames = 0;
  private hookList: HarvestHook[] = [];
  /** Milliseconds the last update took (perf.spec: harvestMs). */
  lastMs = 0;
  private readonly tumbleTicks: number;
  /** e2e only: every actor hidden (__TM_HARVEST_HIDE__). */
  private hidden = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly now: () => number,
    private readonly manifest: HarvestSheetSource,
    private readonly tuning: HarvestSetup,
    /** The e2e hooks are on (else no hook entries are made). */
    private readonly hooks = false,
    /** v1.18 (D-081): a sitting male baboon's height (birds.json baboons.heightPx) and hit boxes,
     *  for Phase 2's baboons. */
    private readonly baboon: {
      readonly heightPx: number;
      readonly walk: { readonly body: Ellipse };
      readonly sit: { readonly body: Ellipse };
      readonly stand: { readonly body: Ellipse };
    } | null = null,
  ) {
    this.tumbleTicks = Math.max(1, Math.round(tuning.warthogs.tumbleSeconds * 60));
    // e2e only (test hooks on): hide every Harvest actor, so a spec can grab the same held tick
    // with and without them (review round 3: the drawn art must sit on the hit ellipses).
    if (hooks)
      (window as { __TM_HARVEST_HIDE__?: (on: boolean) => void }).__TM_HARVEST_HIDE__ = (on) => {
        this.hidden = on;
      };
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
      if (s.tex !== HARVEST_SHEET) continue;
      s.img.setTexture(HARVEST_SHEET, s.frame);
      s.img.setScale((s.scale * was) / k);
      s.scale = (s.scale * was) / k;
      this.origin(s);
    }
    this.sheet = tex;
    return true;
  }

  /** v1.18 (D-081): the Phase 2 sheet (its own lazy file in the same group): polled like the
   *  first, cut once delivered. Drawn from its 1× file in Standard and HD alike. */
  private sheet2Ready(): boolean {
    if (this.sheet2 !== null) return true;
    const tx = this.scene.textures;
    if (!this.manifest.delivered(tx, HARVEST2_SHEET)) {
      if (this.wait2++ % SHEET_POLL_FRAMES !== 0) return false;
      this.manifest.upgrade(tx, HARVEST2_SHEET);
      if (!this.manifest.delivered(tx, HARVEST2_SHEET)) return false;
    }
    if (!tx.exists(HARVEST2_SHEET)) return false;
    const tex = tx.get(HARVEST2_SHEET);
    const k = harvest2TexelsPerPx(tex.getSourceImage().width);
    for (const f of harvest2Frames()) {
      const fr = tex.has(f.name)
        ? tex.get(f.name)
        : tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
      if (fr === null) continue;
      fr.customPivot = true;
      fr.pivotX = f.ox / f.w;
      fr.pivotY = f.oy / f.h;
    }
    this.k2 = k;
    this.sheet2 = tex;
    return true;
  }

  /** Texture px per design px of a frame's sheet now (0: not drawable yet). */
  private kOf(frame: AnyFrame): number {
    const tex = texOf(frame);
    if (tex === HARVEST_SHEET) return this.k;
    if (tex === HARVEST2_SHEET) return this.sheet2 === null ? 0 : this.k2;
    const tx = this.scene.textures;
    if (!tx.exists(BABOON_SHEET)) return 0;
    const t = tx.get(BABOON_SHEET);
    // BaboonView cuts the raider frames on the baboon sheet (custom pivots at the feet).
    if (!t.has(frame)) return 0;
    return Math.max(1, Math.round(t.getSourceImage().width / BABOON_SHEET_W));
  }

  private *all(): Iterable<Slot> {
    yield* this.slots.values();
    if (this.gap !== null) yield this.gap;
    if (this.sign !== null) yield this.sign;
    if (this.hole !== null) yield this.hole;
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
      tex: HARVEST_SHEET,
      x: 0,
      y: 0,
      scale: 1,
      alpha: 1,
      rot: 0,
      flip: false,
      shown: false,
      seen: false,
      hook: {
        id,
        role,
        frame: null,
        x: 0,
        y: 0,
        groundY: 0,
        visible: false,
        facing: 1,
        body: null,
      },
    };
  }

  /** The origin at the frame's feet; a custom-pivot frame is mirrored round it (footOrigin.ts). */
  private origin(s: Slot): void {
    setFootOrigin(s.img, s.flip);
  }

  /** Puts a slot at (x, y) on its layer with `frame` (null: hidden); returns whether shown. */
  private place(
    s: Slot,
    frame: AnyFrame | null,
    x: number,
    y: number,
    scale: number,
    flip: boolean,
    alpha: number,
    rot = 0,
  ): boolean {
    const layer = this.parallax.layer(s.layerId);
    const k = frame === null ? 0 : this.kOf(frame);
    let show = frame !== null && alpha > 0 && layer !== undefined && k > 0;
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
    const tex = texOf(frame);
    if (tex !== s.tex) {
      s.img.setTexture(tex, frame);
      s.tex = tex;
      s.frame = frame;
      this.origin(s);
    } else if (frame !== s.frame) {
      s.img.setFrame(frame);
      s.frame = frame;
      this.origin(s);
    }
    if (flip !== s.flip) {
      s.img.setFlipX(flip);
      s.flip = flip;
      this.origin(s);
    }
    const sc = scale / k;
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
    phase?: string,
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
    const facing: 1 | -1 = s.flip ? -1 : 1;
    if (
      h.x !== hx ||
      h.y !== hy ||
      h.visible !== show ||
      h.frame !== f ||
      h.groundY !== gy ||
      h.facing !== facing ||
      h.phase !== phase ||
      !same
    )
      s.hook = {
        ...h,
        x: hx,
        y: hy,
        visible: show,
        frame: f,
        groundY: gy,
        facing,
        body: b,
        ...(phase === undefined ? {} : { phase }),
      };
  }

  /** A hit box's body ellipse on its layer (as the sim builds it: × scale, mirrored by facing). */
  private bodyOf(
    box: { readonly body: { rx: number; ry: number; ox: number; oy: number } },
    a: Pick<HarvestActorView, 'x' | 'y' | 'scale' | 'facing'>,
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

  private slotFor(
    a: Pick<HarvestActorView, 'id' | 'layerId'>,
    role: string,
    frame: HarvestFrame,
  ): Slot | null {
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
      const wf = this.warthogFrame(w.phase, w.t);
      const alpha = wf.alpha;
      // v1.18 (D-081): head down, pushing through the small hole.
      const frame: AnyFrame = w.squeeze && this.sheet2Ready() ? 'wh_squeeze' : wf.frame;
      const s = this.slotFor(w, 'warthog', 'wh_trot_a');
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
      const frame: AnyFrame =
        p.squeeze && this.sheet2Ready()
          ? 'pg_squeeze'
          : p.running
            ? 'pg_run'
            : alt(p.t, TROT_TICKS)
              ? 'pg_trot_a'
              : 'pg_trot_b';
      const s = this.slotFor(p, 'piglet', 'pg_trot_a');
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
          : k.phase === 'run' || k.phase === 'leave'
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
    // v1.18 (D-081): Phase 2's animals.
    if (h.phase2 !== null) for (const a of h.phase2.animals) this.drawPhase2(a);
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
      // The sign hangs from the gap's top wire (a little above the fence's middle); D-080: the
      // true-size fence's, and the sign twice its v1.8c size with it (~0.6 m).
      const sy = h.gap.y - 62 * FENCE_K - 8;
      const shown = this.place(
        this.sign,
        'sign_oes',
        h.gap.x,
        sy,
        2,
        false,
        1,
        Math.round(swing * 100) / 100,
      );
      this.hookOf(this.sign, shown, h.gap.x, sy, h.gap.y);
    }
    // v1.18 (D-081): the small hole's patch, once the workers have mended it.
    if (h.hole !== null) {
      this.hole ??= this.newSlot(h.gap.layerId, 'gap_4', -3, 'hole');
      if (this.hole !== null) {
        const ready = this.sheet2Ready();
        const shown = this.place(
          this.hole,
          h.hole.patched && ready ? 'hole_patch' : null,
          h.hole.x,
          h.hole.y,
          1,
          false,
          1,
        );
        this.hookOf(
          this.hole,
          shown,
          h.hole.x,
          h.hole.y,
          h.hole.y,
          null,
          h.hole.patched ? 'patched' : 'open',
        );
      }
    }
    // (The actors only: the gap's panel and the sign stay, so a with/without pair shows the actors.)
    if (this.hidden)
      for (const s of this.slots.values()) {
        s.img.setVisible(false);
        s.shown = false;
      }
    if (this.hooks) {
      const list: HarvestHook[] = [];
      for (const s of this.all()) list.push(s.hook);
      this.hookList = list;
    }
    this.lastMs = this.now() - t0;
  }

  /** v1.18 (D-081): one Phase 2 animal: its frame for what it is doing, on its layer. */
  private drawPhase2(a: Phase2AnimalView): void {
    const W = this.tuning.warthogs;
    let frame: AnyFrame | null;
    let alpha = 1;
    let height = W.heightPx;
    let drawn = WARTHOG_H;
    let box: { readonly body: Ellipse } | null = null;
    const ready2 = this.sheet2Ready();
    if (a.kind === 'warthog') {
      if (a.phase === 'jump')
        frame = ready2 ? (a.t < a.dur / 2 ? 'wh_jump_a' : 'wh_jump_b') : 'wh_run_a';
      else {
        const p =
          a.phase === 'eat'
            ? 'dig'
            : a.phase === 'flee'
              ? 'run'
              : a.phase === 'tumble'
                ? 'tumble'
                : 'trot';
        const wf = this.warthogFrame(p, a.t);
        frame = wf.frame;
        alpha = wf.alpha;
      }
      box = a.phase === 'eat' ? W.hitboxes.dig : W.hitboxes.trot;
    } else if (a.kind === 'piglet') {
      drawn = PIGLET_H;
      frame =
        a.phase === 'squeeze' && ready2
          ? 'pg_squeeze'
          : a.phase === 'flee'
            ? 'pg_run'
            : a.phase === 'eat' && ready2
              ? alt(a.t, DIG_TICKS)
                ? 'pg_squeeze'
                : 'pg_trot_a'
              : alt(a.t, TROT_TICKS)
                ? 'pg_trot_a'
                : 'pg_trot_b';
    } else {
      height = this.baboon?.heightPx ?? W.heightPx;
      drawn = BABOON2_H;
      switch (a.phase) {
        case 'climb':
          frame = ready2 ? (alt(a.t, CLIMB_TICKS) ? 'bb_climb_a' : 'bb_climb_b') : null;
          break;
        case 'drop':
          frame = ready2 ? 'bb_drop' : null;
          break;
        case 'eat':
          frame = alt(a.t, DIG_TICKS) ? 'mielie_a' : 'mielie_b';
          break;
        case 'tumble': {
          const f = a.t / this.tumbleTicks;
          frame = f < TUMBLE_SHARE ? 'tumble' : 'down';
          if (f >= TUMBLE_SHARE) alpha = Math.max(0, 1 - (f - TUMBLE_SHARE) / (1 - TUMBLE_SHARE));
          break;
        }
        default:
          frame = alt(a.t, RUN_TICKS) ? 'run_a' : 'run_b';
      }
      const bb = this.baboon;
      box =
        bb === null
          ? null
          : a.phase === 'climb' || a.phase === 'drop'
            ? bb.stand
            : a.phase === 'eat'
              ? bb.sit
              : bb.walk;
    }
    // Coming up out of the veld behind the fence: it fades in.
    if (a.from === 'back' && a.phase === 'approach')
      alpha = Math.min(alpha, Math.min(1, a.t / FADE_TICKS));
    const s = this.slotFor(a, `p2-${a.kind}`, 'wh_trot_a');
    if (s === null) return;
    const shown = this.place(s, frame, a.x, a.y, (height * a.scale) / drawn, a.facing < 0, alpha);
    this.hookOf(
      s,
      shown,
      a.x,
      a.y,
      a.phase === 'jump' || a.phase === 'climb' || a.phase === 'drop' ? a.y : a.y,
      box === null || a.kind === 'piglet' ? null : this.bodyOf(box, a),
      a.phase,
    );
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
    this.hole = null;
  }
}
