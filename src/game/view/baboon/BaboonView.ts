// v1.8b (D-062, GDD §11.3d, art bible §5.3) The baboons on screen (a lazy chunk: not in the first
// download). Each troop member is one sprite on its ridge layer, each raider one sprite on its
// spot's layer (above the props, below the birds), plus the fruit a thrower throws and the water
// of a knocked tap: at most ~14 images a map. Everything follows the sim's snapshot on sim time
// (held frames hold): the ridge poses, climbing down over the ridge (sliding down and fading) and
// back up, a raider's walk cycle, its action, running off, the tumble when bagged and lying
// still while it fades. Phone rules (D-059): properties set only when they change, no per-frame
// allocations, sprites off screen hidden, and its own timer (baboonMs) for the perf test. The
// sheet loads with the late group: until the delivered file is under the key nothing is drawn
// (review R11 of v1.7e) and the view looks for it every 30 frames.
import type * as Phaser from 'phaser';
import type { BaboonTuning } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { BaboonView as SimBaboon, PlaneId, RaiderView, SimState } from '../../../sim/types';
import type { AudioDirector } from '../../audio/AudioDirector';
import { designSize } from '../../layout';
import type { ParallaxView } from '../ParallaxView';
import {
  BABOON_SHEET,
  RAIDER_H,
  RIDGE_H,
  baboonFrames,
  baboonTexelsPerPx,
  type BaboonFrame,
} from './baboonSheet';
import { BABOON_SOUNDS, BABOON_SYNTH, RAID_SOUND, type BaboonSound } from './baboonSounds';

/** Ticks per frame: walking, running, the ridge's walk and play, the bark, an action's swap. */
const WALK_TICKS = 8;
const RUN_TICKS = 5;
const RIDGE_WALK_TICKS = 9;
const PLAY_TICKS = 10;
const BARK_TICKS = 6;
const ACT_TICKS = 18;
/** Climbing over the ridge: how far it slides down (ridge px at a male's size). */
const CLIMB_DROP = 22;
/** The tumble shows this share of its time, then it lies still and fades. */
const TUMBLE_SHARE = 0.45;
/** The thrower's fruit flies for the act's last FLIGHT_TICKS ticks. */
const FLIGHT_TICKS = 20;
/** A raider fades in over its first steps toward its spot. */
const FADE_IN_TICKS = 20;
/** Off-screen margin (design px) before a sprite is hidden. */
const CULL_PX = 160;

/** e2e: one baboon on screen and what it shows. */
export interface BaboonHook {
  readonly id: number;
  /** lookout · male · mother · juvenile on the ridge, or raider. */
  readonly role: string;
  readonly frame: string | null;
  /** Feet on screen (design px). */
  readonly x: number;
  readonly y: number;
  /** A raider: its spot's ground line on screen (design px), to check its feet stand on it. */
  readonly groundY: number | null;
  readonly visible: boolean;
  readonly alpha: number;
}

interface Slot {
  readonly img: Phaser.GameObjects.Image;
  layerId: string;
  frame: string;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  flip: boolean;
  shown: boolean;
  seen: boolean;
  hook: BaboonHook;
}

/** What BaboonView needs of the AssetManifest (the late sheet may arrive mid-hunt). */
export interface BaboonSheetSource {
  delivered(textures: Phaser.Textures.TextureManager, key: string): boolean;
  upgrade(textures: Phaser.Textures.TextureManager, prefix: string): string[];
}

const SHEET_POLL_FRAMES = 30;

const alt = (t: number, every: number): boolean => Math.floor(t / every) % 2 === 0;

/** The ridge frame for a member's pose. */
export function ridgeFrame(m: SimBaboon): BaboonFrame | null {
  const mother = m.role === 'mother';
  switch (m.pose) {
    case 'out':
      return null;
    case 'walk':
      if (mother) return alt(m.t, RIDGE_WALK_TICKS) ? 'r_mother_walk_a' : 'r_mother_walk_b';
      return alt(m.t, RIDGE_WALK_TICKS) ? 'r_walk_a' : 'r_walk_b';
    case 'down':
      return mother ? 'r_mother_walk_a' : 'r_down';
    case 'up':
      return mother ? 'r_mother_walk_b' : 'r_up';
    case 'bark':
      if (mother) return 'r_mother_sit';
      return alt(m.t, BARK_TICKS) ? 'r_bark_a' : 'r_bark_b';
    case 'play':
      if (mother) return 'r_mother_sit';
      return alt(m.t, PLAY_TICKS) ? 'r_play_a' : 'r_play_b';
    case 'look':
      return mother ? 'r_mother_sit' : 'r_look';
    case 'groom':
      return mother ? 'r_mother_sit' : 'r_groom';
    case 'sit':
      return mother ? 'r_mother_sit' : 'r_sit';
  }
}

/** The raider frame for its phase and action. */
export function raiderFrame(r: RaiderView, tumbleTicks: number): BaboonFrame {
  switch (r.phase) {
    case 'approach': {
      const i = Math.floor(r.t / WALK_TICKS) % 4;
      return i === 0 ? 'walk_a' : i === 1 ? 'walk_b' : i === 2 ? 'walk_c' : 'walk_d';
    }
    case 'leave':
    case 'flee':
      return alt(r.t, RUN_TICKS) ? 'run_a' : 'run_b';
    case 'tumble':
      return r.t < tumbleTicks * TUMBLE_SHARE ? 'tumble' : 'down';
    case 'act':
      switch (r.action) {
        case 'hat':
          return alt(r.t, ACT_TICKS) ? 'hat_a' : 'hat_b';
        case 'fruit':
          return alt(r.t, ACT_TICKS) ? 'fruit_a' : 'fruit_b';
        case 'mielie':
          return alt(r.t, ACT_TICKS) ? 'mielie_a' : 'mielie_b';
        case 'tap':
          return 'tap_a';
        case 'throw':
          return r.t >= r.dur - FLIGHT_TICKS ? 'throw_b' : 'throw_a';
        case 'moon':
          return 'moon_a';
        case 'chase':
          return alt(r.t, RUN_TICKS) ? 'run_a' : 'run_b';
      }
  }
}

export class BaboonView {
  private readonly members = new Map<number, Slot>();
  private readonly raiders = new Map<number, Slot>();
  private fruit: Slot | null = null;
  private water: Slot | null = null;
  private sheet: Phaser.Textures.Texture | null = null;
  /** Texture px per design px of the sheet under the key (2: the 2× master). */
  private k = 2;
  private waitFrames = 0;
  private hookList: BaboonHook[] = [];
  /** Raiders whose action's sound has played (cleared when they go). */
  private readonly actHeard = new Set<number>();
  /** Milliseconds the last update took (perf.spec: baboonMs). */
  lastMs = 0;
  private readonly tumbleTicks: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly now: () => number,
    private readonly manifest: BaboonSheetSource,
    private readonly tuning: BaboonTuning,
    /** The e2e hooks are on (else no hook entries are made). */
    private readonly hooks = false,
  ) {
    this.tumbleTicks = Math.max(1, Math.round(tuning.hit.tumbleSeconds * 60));
  }

  /** True once the delivered sheet (Standard or its HD twin) is under the key. */
  sheetReady(): boolean {
    const tx = this.scene.textures;
    if (!this.manifest.delivered(tx, BABOON_SHEET)) {
      if (this.waitFrames++ % SHEET_POLL_FRAMES !== 0) return false;
      this.manifest.upgrade(tx, BABOON_SHEET);
      if (!this.manifest.delivered(tx, BABOON_SHEET)) return false;
    }
    return this.ensureSheet();
  }

  /** The sheet as last cut: cut again (every sprite rescaled) after a Standard ↔ HD swap. */
  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(BABOON_SHEET)) return false;
    const tex = this.scene.textures.get(BABOON_SHEET);
    if (tex === this.sheet) return true;
    const k = baboonTexelsPerPx(tex.getSourceImage().width);
    for (const f of baboonFrames()) {
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
      s.img.setTexture(BABOON_SHEET, s.frame);
      s.img.setScale((s.scale * was) / k);
      s.scale = (s.scale * was) / k;
      this.origin(s);
    }
    this.sheet = tex;
    return true;
  }

  private *all(): Iterable<Slot> {
    yield* this.members.values();
    yield* this.raiders.values();
    if (this.fruit !== null) yield this.fruit;
    if (this.water !== null) yield this.water;
  }

  private newSlot(layerId: string, frame: BaboonFrame, id: number, role: string): Slot | null {
    const layer = this.parallax.layer(layerId);
    if (layer === undefined) return null;
    const img = this.scene.add.image(0, 0, BABOON_SHEET, frame).setVisible(false);
    const tint = this.parallax.layerTint(layerId);
    if (tint !== 0xffffff) img.setTint(tint);
    layer.fixtures.add(img);
    return {
      img,
      layerId,
      frame,
      x: 0,
      y: 0,
      scale: 1,
      alpha: 1,
      flip: false,
      shown: false,
      seen: false,
      hook: { id, role, frame: null, x: 0, y: 0, groundY: null, visible: false, alpha: 0 },
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
    frame: BaboonFrame | null,
    x: number,
    y: number,
    scale: number,
    flip: boolean,
    alpha: number,
  ): boolean {
    const layer = this.parallax.layer(s.layerId);
    let show = frame !== null && alpha > 0 && layer !== undefined;
    if (show && layer !== undefined) {
      // Hidden off screen (each layer pans on its own).
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
    return true;
  }

  /** The test hook's entry (only with the hooks on: no allocations otherwise). Its position is
   *  the baboon's place from the snapshot, culled or not (review of v1.8b). */
  private hookOf(s: Slot, show: boolean, x: number, y: number, groundY: number | null): void {
    if (!this.hooks) return;
    const layer = this.parallax.layer(s.layerId);
    if (layer === undefined) return;
    const hx = Math.round(layer.root.x + x * layer.root.scaleX);
    const hy = Math.round(layer.root.y + y * layer.root.scaleY);
    const gy = groundY === null ? null : Math.round(layer.root.y + groundY * layer.root.scaleY);
    const h = s.hook;
    const f = show ? s.frame : null;
    const a = show ? s.alpha : 0;
    if (
      h.x !== hx ||
      h.y !== hy ||
      h.visible !== show ||
      h.frame !== f ||
      h.alpha !== a ||
      h.groundY !== gy
    )
      s.hook = { ...h, x: hx, y: hy, visible: show, frame: f, alpha: a, groundY: gy };
  }

  /** Draws the baboons at this tick. */
  update(state: SimState): void {
    const t0 = this.now();
    const b = state.baboons;
    if (b === null || !this.sheetReady()) {
      // Not delivered yet (or no troop): nothing drawn, and the hook says so.
      for (const s of this.all())
        if (s.shown) {
          s.img.setVisible(false);
          s.shown = false;
        }
      if (this.hookList.length > 0) this.hookList = [];
      this.lastMs = this.now() - t0;
      return;
    }
    const T = this.tuning;
    let n = 0;
    for (const s of this.members.values()) s.seen = false;
    for (const troop of b.troops) {
      const base = (troop.scale * T.heightPx) / RIDGE_H;
      for (const m of troop.members) {
        let s = this.members.get(m.id);
        if (s === undefined) {
          const made = this.newSlot(troop.layerId, 'r_sit', m.id, m.role);
          if (made === null) continue;
          s = made;
          this.members.set(m.id, s);
        }
        s.seen = true;
        const frame = ridgeFrame(m);
        const k = base * (m.role === 'mother' ? 1 : m.role === 'juvenile' ? T.juvenileScale : 1);
        const scale = m.role === 'mother' ? base * T.motherScale : k;
        let y = m.y;
        let alpha = 1;
        if ((m.pose === 'down' || m.pose === 'up') && m.dur > 0) {
          // Over the ridge: sliding down behind it and fading (back up: the reverse).
          const p = Math.min(1, m.t / m.dur);
          const away = m.pose === 'down' ? p : 1 - p;
          y += away * CLIMB_DROP * base;
          alpha = 1 - away;
        }
        const show = this.place(s, frame, m.x, y, scale, m.facing === -1, alpha);
        this.hookOf(s, show, m.x, y, null);
        if (this.hooks) this.hookList[n++] = s.hook;
      }
    }
    // Members bagged on a raid leave the snapshot: hide theirs.
    for (const s of this.members.values())
      if (!s.seen && s.shown) {
        s.img.setVisible(false);
        s.shown = false;
      }
    for (const s of this.raiders.values()) s.seen = false;
    let fruitAt: { x: number; y: number; layerId: string; scale: number } | null = null;
    let waterAt: { x: number; y: number; layerId: string; scale: number; flip: boolean } | null =
      null;
    for (const r of b.raiders) {
      let s = this.raiders.get(r.id);
      if (s === undefined || s.layerId !== r.layerId) {
        s?.img.destroy();
        const made = this.newSlot(r.layerId, 'walk_a', r.id, 'raider');
        if (made === null) continue;
        s = made;
        this.raiders.set(r.id, s);
      }
      s.seen = true;
      const scale = (r.scale * T.heightPx) / RAIDER_H;
      const frame = raiderFrame(r, this.tumbleTicks);
      let alpha = 1;
      let y = r.y;
      if (r.phase === 'tumble') {
        const p = r.t / Math.max(1, r.dur);
        // A small hop up, then down, then lying still as it fades away.
        if (p < TUMBLE_SHARE) y -= Math.sin((p / TUMBLE_SHARE) * Math.PI) * 18 * scale;
        else alpha = Math.max(0, 1 - (p - TUMBLE_SHARE) / (1 - TUMBLE_SHARE));
      }
      if (r.phase === 'act' && r.action === 'moon') y -= Math.abs(Math.sin(r.t / 7)) * 2 * scale;
      // It walks in from beside its spot: fade in over its first steps (review of v1.8b).
      if (r.phase === 'approach' && r.t < FADE_IN_TICKS) alpha = r.t / FADE_IN_TICKS;
      const show = this.place(s, frame, r.x, y, scale, r.facing === -1, alpha);
      this.hookOf(s, show, r.x, y, r.y);
      if (this.hooks) this.hookList[n++] = s.hook;
      if (r.phase === 'act' && r.action === 'throw' && r.t >= r.dur - FLIGHT_TICKS) {
        const ft = r.t - (r.dur - FLIGHT_TICKS);
        fruitAt = {
          x: r.x + r.facing * (0.44 * RAIDER_H + ft * 9) * scale,
          y: r.y + (-0.96 * RAIDER_H - ft * 5 + ft * ft * 0.4) * scale,
          layerId: r.layerId,
          scale,
        };
      }
      if (r.phase === 'act' && r.action === 'tap' && r.t >= r.dur * 0.3)
        waterAt = {
          x: r.x + r.facing * 0.36 * RAIDER_H * scale,
          y: r.y - 0.9 * RAIDER_H * scale,
          layerId: r.layerId,
          scale,
          flip: r.facing === -1,
        };
    }
    for (const [id, s] of this.raiders)
      if (!s.seen) {
        s.img.destroy();
        this.raiders.delete(id);
        this.actHeard.delete(id);
      }
    if (fruitAt !== null) {
      if (this.fruit === null || this.fruit.layerId !== fruitAt.layerId) {
        this.fruit?.img.destroy();
        this.fruit = this.newSlot(fruitAt.layerId, 'fx_fruit', -1, 'fruit');
      }
      if (this.fruit !== null)
        this.place(this.fruit, 'fx_fruit', fruitAt.x, fruitAt.y, fruitAt.scale, false, 1);
    } else if (this.fruit?.shown === true) {
      this.fruit.img.setVisible(false);
      this.fruit.shown = false;
    }
    if (waterAt !== null) {
      if (this.water === null || this.water.layerId !== waterAt.layerId) {
        this.water?.img.destroy();
        this.water = this.newSlot(waterAt.layerId, 'fx_water', -2, 'water');
      }
      if (this.water !== null)
        this.place(this.water, 'fx_water', waterAt.x, waterAt.y, waterAt.scale, waterAt.flip, 0.9);
    } else if (this.water?.shown === true) {
      this.water.img.setVisible(false);
      this.water.shown = false;
    }
    if (this.hookList.length !== n) this.hookList.length = n;
    this.lastMs = this.now() - t0;
  }

  /** The baboons' sounds: the lookout's bark, a hit raider's screech, the raid's own sound when
   *  a raider gets to work, the thump of a bagged one. */
  handle(events: readonly SimEvent[], state: SimState, audio: AudioDirector, width: number): void {
    for (const e of events) {
      let sound: BaboonSound | null = null;
      let plane: PlaneId | null = null;
      let x = 0;
      if (e.type === 'baboonRaidWarned') {
        const troop = state.baboons?.troops.find((t) => t.id === e.troopId);
        const m = troop?.members.find((b) => b.id === e.baboonId);
        if (troop !== undefined && m !== undefined) {
          sound = 'bark';
          plane = troop.plane;
          x = m.x;
        }
      } else if (e.type === 'baboonHit') {
        sound =
          e.role === 'raider' && e.hitsLeft > 0 ? 'screech' : e.role === 'raider' ? null : 'bark';
        plane = e.plane;
        x = e.x;
      } else if (e.type === 'baboonBagged') {
        sound = 'thump';
        plane = e.plane;
        x = e.x;
      } else if (e.type === 'troopFled' && e.cause === 'loud') {
        sound = 'bark';
        plane = e.plane;
        x = e.x;
      }
      if (sound !== null && plane !== null)
        audio.playExtra(BABOON_SOUNDS[sound], this.pan(plane, x, width), BABOON_SYNTH[sound]);
    }
    // A raider getting to work: its action's sound (once per raider).
    for (const r of state.baboons?.raiders ?? [])
      if (r.phase === 'act' && !this.actHeard.has(r.id)) {
        this.actHeard.add(r.id);
        const sound = RAID_SOUND[r.action];
        audio.playExtra(BABOON_SOUNDS[sound], this.pan(r.plane, r.x, width), BABOON_SYNTH[sound]);
      }
  }

  private pan(plane: PlaneId, x: number, width: number): number {
    const sx = this.parallax.screenX(plane, x);
    return Math.max(-1, Math.min(1, (sx - width / 2) / (width / 2)));
  }

  /** e2e: every baboon of the hunt drawn this frame (shown or culled). */
  get baboons(): readonly BaboonHook[] {
    return this.hookList;
  }

  destroy(): void {
    for (const s of this.all()) s.img.destroy();
    this.members.clear();
    this.raiders.clear();
    this.fruit = null;
    this.water = null;
  }
}
