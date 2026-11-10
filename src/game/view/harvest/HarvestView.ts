// v1.8c (D-063, GDD §12.2, art bible §5.4) Die Oes on screen (a lazy chunk: not in the first
// download): one sprite per warthog, piglet and farm worker on its layer, the fence gap's panel
// (whole, broken in the intro, mended in stages over the rush, whole again at the end) and the
// "Oes" sign that swings when the fence breaks. Everything follows the sim's snapshot on sim time
// (held frames hold). Phone rules (D-059, v1.8b): properties set only when they change, no
// per-frame allocations beyond a new actor's slot, sprites off screen hidden, its own timer
// (harvestMs) for the perf test. The sheet is in the map's own lazy group: until the delivered
// file is under the key nothing is drawn, and the view looks for it every 30 frames.
// v1.18 perf (D-081): a gone actor's sprite goes back to its layer's pool (reused, raised to the
// top of its layer like a new one) instead of being destroyed; each slot keeps its layer node,
// frame lookups are constant tables (harvestFrameLookup.ts) and the e2e hook entries are updated
// in place (the list rebuilt only when the slots change).
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
import type { LayerNode, ParallaxView } from '../ParallaxView';
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
  HARVEST2_SHEET,
  harvest2Frames,
  harvest2TexelsPerPx,
  type Harvest2Frame,
} from './harvest2Sheet';
import { BABOON_SHEET, BABOON_SHEET_W } from '../baboon/baboonKeys';
import type { Phase2AnimalView } from '../../../sim/types';
import { texOf, workerFrame, type AnyFrame, type BorrowedFrame } from './harvestFrameLookup';

/** v1.18 (D-081): ticks per climbing step (back arrivals fade in over phase2.backFadeSeconds). */
const CLIMB_TICKS = 10;

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
  readonly phase?: string | undefined;
}

/** The sheet as the view needs it from the manifest. */
export interface HarvestSheetSource {
  delivered(textures: Phaser.Textures.TextureManager, key: string): boolean;
  upgrade(textures: Phaser.Textures.TextureManager, key: string): void;
}

/** A hook entry as the view keeps it (updated in place; read by the e2e specs). */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type SlotHook = Mutable<HarvestHook>;
type Body = { x: number; y: number; rx: number; ry: number };

interface Slot {
  readonly img: Phaser.GameObjects.Image;
  readonly layerId: string;
  /** v1.18 perf: the layer node (the parallax layers are built once, with the view). */
  readonly layer: LayerNode;
  /** The actor it draws now (a pooled slot is reused for the next one on its layer). */
  id: number;
  role: string;
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
  /** The update (frame number) that last drew it. */
  seen: number;
  readonly hook: SlotHook;
  /** The hook's body ellipse (reused; hook.body is it or null). */
  readonly body: Body;
}

const alt = (t: number, every: number): boolean => (Math.floor(t / every) & 1) === 0;

/** A tumble's alpha: whole while it tumbles, then it lies still and fades out. */
const tumbleAlpha = (t: number, tumbleTicks: number): number => {
  const f = t / tumbleTicks;
  return f < TUMBLE_SHARE ? 1 : Math.max(0, 1 - (f - TUMBLE_SHARE) / (1 - TUMBLE_SHARE));
};

/** A Phase 2 baboon's frame (phase2BaboonFrame's, without the object). */
function baboonFrame(
  phase: Phase2AnimalView['phase'],
  t: number,
  ready2: boolean,
  tumbleTicks: number,
): Harvest2Frame | BorrowedFrame {
  const run: BorrowedFrame = alt(t, RUN_TICKS) ? 'run_a' : 'run_b';
  switch (phase) {
    case 'climb':
      return ready2 ? (alt(t, CLIMB_TICKS) ? 'bb_climb_a' : 'bb_climb_b') : run;
    case 'drop':
      return ready2 ? 'bb_drop' : run;
    case 'eat':
      return alt(t, DIG_TICKS) ? 'mielie_a' : 'mielie_b';
    case 'tumble':
      return t / tumbleTicks < TUMBLE_SHARE ? 'tumble' : 'down';
    default:
      return run;
  }
}

/**
 * v1.18 (D-081): a Phase 2 baboon's frame and alpha for what it is doing. Review: until the lazy
 * Phase 2 sheet is in (`ready2`), a climb or a drop borrows a run frame from the baboon sheet
 * (never an invisible baboon the sim can hit).
 */
export function phase2BaboonFrame(
  phase: Phase2AnimalView['phase'],
  t: number,
  ready2: boolean,
  tumbleTicks: number,
): { readonly frame: Harvest2Frame | BorrowedFrame; readonly alpha: number } {
  return {
    frame: baboonFrame(phase, t, ready2, tumbleTicks),
    alpha: phase === 'tumble' ? tumbleAlpha(t, tumbleTicks) : 1,
  };
}

interface Ellipse {
  readonly rx: number;
  readonly ry: number;
  readonly ox: number;
  readonly oy: number;
}
const TROT: readonly HarvestFrame[] = ['wh_trot_a', 'wh_trot_b', 'wh_trot_c', 'wh_trot_d'];
/** A Phase 2 animal's hook role. */
const P2_ROLE: Readonly<Record<Phase2AnimalView['kind'], string>> = {
  warthog: 'p2-warthog',
  piglet: 'p2-piglet',
  baboon: 'p2-baboon',
};

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
  /** v1.18 perf: the hook list wants rebuilding (a slot came or went). */
  private listDirty = true;
  /** v1.18 perf: hidden slots of gone actors, per layer id, for the next actor on that layer. */
  private readonly pool = new Map<string, Slot[]>();
  /** v1.18 perf: this update's number (a slot drawn in it has `seen` set to it). */
  private frameNo = 0;
  /** v1.18 perf: this update's design width (the cull test) and the baboon sheet, if loaded,
   *  with its texture px per design px (Phase 2's borrowed frames). */
  private cullW = 0;
  private babTex: Phaser.Textures.Texture | null = null;
  private kBab = 0;
  /** v1.18 perf: images made with the view (hidden, on no layer), for the first slots: a burst
   *  of arrivals takes these instead of building new game objects mid-hunt. */
  private readonly spares: Phaser.GameObjects.Image[] = [];
  /** v1.18 perf: warthogFrame's result (no object per call). */
  private wfAlpha = 1;
  /** Milliseconds the last update took (perf.spec: harvestMs). */
  lastMs = 0;
  private readonly tumbleTicks: number;
  /** Review (D-081): a back arrival fades in over this many ticks (the sim holds its hits). */
  private readonly fadeTicks: number;
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
    this.fadeTicks = Math.max(1, Math.round(tuning.phase2.backFadeSeconds * 60));
    // v1.18 perf: prewarm the images for the rush's warthogs at their most and Phase 2's whole
    // wave list (more are made as needed).
    const prewarm = tuning.rush.maxWarthogs + tuning.phase2.waves.length;
    // (Phaser's blank texture until a slot sets its own; the creator reads `key` off the config.)
    const blank: Phaser.Types.GameObjects.GameObjectConfig & { key: string } = {
      key: '__DEFAULT',
      visible: false,
    };
    for (let i = 0; i < prewarm; i++) this.spares.push(scene.make.image(blank, false));
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
    // v1.18 perf: the texture last cut is still the one under the key (a swap puts a new one
    // there), so it is still the delivered file.
    if (this.sheet !== null && tx.exists(HARVEST_SHEET) && tx.get(HARVEST_SHEET) === this.sheet)
      return true;
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

  /** Texture px per design px of a frame's sheet `tex` now (0: not drawable yet). */
  private kOf(frame: AnyFrame, tex: string): number {
    if (tex === HARVEST_SHEET) return this.k;
    if (tex === HARVEST2_SHEET) return this.sheet2 === null ? 0 : this.k2;
    const t = this.babTex;
    // BaboonView cuts the raider frames on the baboon sheet (custom pivots at the feet).
    if (t === null || !t.has(frame)) return 0;
    return this.kBab;
  }

  /** Every slot, the pooled ones too (a sheet swap rescales them; destroy frees them). */
  private *all(): Iterable<Slot> {
    yield* this.slots.values();
    for (const p of this.pool.values()) yield* p;
    if (this.gap !== null) yield this.gap;
    if (this.sign !== null) yield this.sign;
    if (this.hole !== null) yield this.hole;
  }

  /** A new slot on a layer, its image showing `want` if that frame can be drawn now (else a
   *  Harvest sheet frame until place() sets one): a prewarmed image if any is left. */
  private newSlot(layerId: string, want: AnyFrame, id: number, role: string): Slot | null {
    const layer = this.parallax.layer(layerId);
    if (layer === undefined) return null;
    const wantTex = texOf(want);
    const ok = this.kOf(want, wantTex) > 0;
    const tex = ok ? wantTex : HARVEST_SHEET;
    const frame: AnyFrame = ok ? want : 'wh_trot_a';
    const spare = this.spares.pop();
    const img =
      spare === undefined
        ? this.scene.add.image(0, 0, tex, frame).setVisible(false)
        : spare.setTexture(tex, frame);
    const tint = this.parallax.layerTint(layerId);
    if (tint !== 0xffffff) img.setTint(tint);
    layer.fixtures.add(img);
    this.listDirty = true;
    return {
      img,
      layerId,
      layer,
      id,
      role,
      frame,
      tex,
      x: 0,
      y: 0,
      scale: 1,
      alpha: 1,
      rot: 0,
      flip: false,
      shown: false,
      seen: 0,
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
        // Present from the start, so every hook entry keeps one shape.
        phase: undefined,
      },
      body: { x: 0, y: 0, rx: 0, ry: 0 },
    };
  }

  /** v1.18 perf: a gone actor's slot: hidden and kept for the next actor on its layer. */
  private release(s: Slot): void {
    if (s.shown) {
      s.img.setVisible(false);
      s.shown = false;
    }
    this.slots.delete(s.id);
    let p = this.pool.get(s.layerId);
    if (p === undefined) {
      p = [];
      this.pool.set(s.layerId, p);
    }
    p.push(s);
    this.listDirty = true;
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
    let show = false;
    let k = 0;
    let tex = s.tex;
    if (frame !== null && alpha > 0) {
      const r = s.layer.root;
      const sx = r.x + x * r.scaleX;
      if (sx >= -CULL_PX && sx <= this.cullW + CULL_PX) {
        if (frame !== s.frame) tex = texOf(frame);
        k = this.kOf(frame, tex);
        show = k > 0;
      }
    }
    if (show !== s.shown) {
      s.img.setVisible(show);
      s.shown = show;
    }
    if (!show || frame === null) return false;
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
    /** The hit box whose body ellipse the hook shows (on actor `a`), or null. */
    box: { readonly body: Ellipse } | null = null,
    a: Pick<HarvestActorView, 'x' | 'y' | 'scale' | 'facing'> | null = null,
    phase?: string,
  ): void {
    if (!this.hooks) return;
    const r = s.layer.root;
    const h = s.hook;
    h.x = Math.round(r.x + x * r.scaleX);
    h.y = Math.round(r.y + y * r.scaleY);
    h.groundY = Math.round(r.y + groundY * r.scaleY);
    h.visible = show;
    h.frame = show ? s.frame : null;
    h.facing = s.flip ? -1 : 1;
    h.phase = phase;
    if (box === null || a === null) h.body = null;
    else {
      // The body ellipse on its layer as the sim builds it (× scale, mirrored by facing), then
      // on screen.
      const e = box.body;
      const b = s.body;
      b.x = r.x + (a.x + e.ox * a.scale * a.facing) * r.scaleX;
      b.y = r.y + (a.y + e.oy * a.scale) * r.scaleY;
      b.rx = e.rx * a.scale * r.scaleX;
      b.ry = e.ry * a.scale * r.scaleY;
      h.body = b;
    }
  }

  private slotFor(
    a: Pick<HarvestActorView, 'id' | 'layerId'>,
    role: string,
    frame: AnyFrame,
  ): Slot | null {
    let s = this.slots.get(a.id);
    if (s === undefined) {
      // v1.18 perf: a pooled slot on the same layer first, raised to the top of its layer (where
      // a new image goes).
      const p = this.pool.get(a.layerId);
      const reuse = p === undefined ? undefined : p.pop();
      if (reuse !== undefined) {
        reuse.id = a.id;
        reuse.role = role;
        reuse.hook.id = a.id;
        reuse.hook.role = role;
        reuse.layer.fixtures.bringToTop(reuse.img);
        this.listDirty = true;
        s = reuse;
      } else {
        const made = this.newSlot(a.layerId, frame, a.id, role);
        if (made === null) return null;
        s = made;
      }
      this.slots.set(a.id, s);
    }
    s.seen = this.frameNo;
    return s;
  }

  /** A warthog's frame for what it is doing (its alpha in wfAlpha: no object per call). */
  private warthogFrame(phase: string, t: number): HarvestFrame {
    this.wfAlpha = 1;
    switch (phase) {
      case 'dig':
        return alt(t, DIG_TICKS) ? 'wh_dig_a' : 'wh_dig_b';
      case 'run':
        return alt(t, RUN_TICKS) ? 'wh_run_a' : 'wh_run_b';
      case 'tumble':
        this.wfAlpha = tumbleAlpha(t, this.tumbleTicks);
        return t / this.tumbleTicks < TUMBLE_SHARE ? 'wh_tumble' : 'wh_down';
      default:
        return TROT[Math.floor(t / TROT_TICKS) % TROT.length] ?? 'wh_trot_a';
    }
  }

  /** v1.18 perf: the baboon sheet for Phase 2's borrowed frames, looked up once per update. */
  private baboonSheet(): void {
    const tx = this.scene.textures;
    if (!tx.exists(BABOON_SHEET)) {
      this.babTex = null;
      return;
    }
    const t = tx.get(BABOON_SHEET);
    if (t !== this.babTex) {
      this.babTex = t;
      this.kBab = Math.max(1, Math.round(t.getSourceImage().width / BABOON_SHEET_W));
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
    const no = ++this.frameNo;
    this.cullW = designSize().width;
    if (h.phase2 !== null) this.baboonSheet();
    const W = this.tuning.warthogs;
    for (const w of h.warthogs) {
      const wf = this.warthogFrame(w.phase, w.t);
      const alpha = this.wfAlpha;
      // v1.18 (D-081): head down, pushing through the small hole.
      const frame: AnyFrame = w.squeeze && this.sheet2Ready() ? 'wh_squeeze' : wf;
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
      this.hookOf(s, shown, w.x, w.y, w.y, w.phase === 'dig' ? W.hitboxes.dig : W.hitboxes.trot, w);
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
      const frame = workerFrame(k.look, k.phase, k.t, WORKER_RUN_TICKS, WORK_TICKS);
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
        k.phase === 'duck' ? K.hitboxes.duck : K.hitboxes.work,
        k,
      );
    }
    // v1.18 (D-081): Phase 2's animals.
    if (h.phase2 !== null) for (const a of h.phase2.animals) this.drawPhase2(a);
    // Gone actors: their slots go back to the pool.
    for (const s of this.slots.values()) if (s.seen !== no) this.release(s);
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
    // The hook entries are updated in place: the list changes only when the slots do.
    if (this.hooks && this.listDirty) {
      const list: HarvestHook[] = [];
      for (const s of this.slots.values()) list.push(s.hook);
      if (this.gap !== null) list.push(this.gap.hook);
      if (this.sign !== null) list.push(this.sign.hook);
      if (this.hole !== null) list.push(this.hole.hook);
      this.hookList = list;
      this.listDirty = false;
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
        frame = this.warthogFrame(p, a.t);
        alpha = this.wfAlpha;
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
      frame = baboonFrame(a.phase, a.t, ready2, this.tumbleTicks);
      if (a.phase === 'tumble') alpha = tumbleAlpha(a.t, this.tumbleTicks);
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
      alpha = Math.min(alpha, Math.min(1, a.t / this.fadeTicks));
    const s = this.slotFor(a, P2_ROLE[a.kind], frame);
    if (s === null) return;
    const shown = this.place(s, frame, a.x, a.y, (height * a.scale) / drawn, a.facing < 0, alpha);
    this.hookOf(
      s,
      shown,
      a.x,
      a.y,
      a.phase === 'jump' || a.phase === 'climb' || a.phase === 'drop' ? a.y : a.y,
      a.kind === 'piglet' ? null : box,
      a,
      a.phase,
    );
  }

  /** Baboon raiders bagged this hunt (for the tally; the sim counts the warthogs). */
  baboonsBagged = 0;
  /** v1.18 (D-081): warthogs bagged this hunt, the rush's and Phase 2's. */
  warthogsBagged = 0;

  /** v1.18 (D-081): the tally's Phase 2 lines (label, value), none without Phase 2. */
  phase2Rows(h: SimHarvest | null, text: (key: string) => string): [string, string][] {
    const r = h?.phase2?.result ?? null;
    if (r === null) return [];
    const rows: [string, string][] = [
      [text('guide.harvest2.tally_stopped'), `${String(r.stopped)} / ${String(r.total)}`],
      [text('guide.harvest2.tally_crop'), `${String(Math.floor(r.crop))} %`],
      [text('guide.harvest2.tally_bonus'), `+${String(r.cropBonus)}`],
    ];
    if (r.perfectBonus > 0)
      rows.push([text('guide.harvest2.perfect'), `+${String(r.perfectBonus)}`]);
    if (r.clearBonus > 0) rows.push([text('guide.harvest2.clear'), `+${String(r.clearBonus)}`]);
    if (r.reason === 'eaten') rows.push([text('guide.harvest2.eaten'), '0 %']);
    return rows;
  }
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
      else if (e.type === 'warthogBagged') {
        this.warthogsBagged++;
        play('thump', e.plane, e.x);
      } else if (e.type === 'phase2Entered') {
        // v1.18 (D-081): each comes at the field with its call (the baboons' from BaboonView).
        const a = h?.phase2?.animals.find((x) => x.id === e.animalId);
        if (a !== undefined && e.kind !== 'baboon')
          play(e.kind === 'piglet' ? 'squeal' : 'grunt', a.plane, a.x);
      } else if (e.type === 'harvestHolePatched' && h !== null && h.hole !== null)
        play('hammer', 'mid', h.hole.x);
      else if (e.type === 'harvestFenceBroken' && h !== null) play('snap', 'mid', h.gap.x);
      else if (e.type === 'warthogEntered') {
        const w = h?.warthogs.find((x) => x.id === e.warthogId);
        if (w !== undefined) play('grunt', w.plane, w.x);
      } else if (e.type === 'warthogHit' && e.hitsLeft > 0) play('grunt', e.plane, e.x);
      else if (e.type === 'harvestBystanderHit' && e.who === 'piglet') play('squeal', e.plane, e.x);
      else if (e.type === 'cropWarning') play('warn', null, 0);
      else if (e.type === 'harvestFenceClosed' || e.type === 'phase2Ended') play('jingle', null, 0);
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
    this.pool.clear();
    for (const img of this.spares) img.destroy();
    this.spares.length = 0;
    this.gap = null;
    this.sign = null;
    this.hole = null;
  }
}
