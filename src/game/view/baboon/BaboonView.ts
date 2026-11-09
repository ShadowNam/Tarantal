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
import { setFootOrigin } from '../footOrigin';
import type * as Phaser from 'phaser';
import type { BaboonTuning } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { BaboonView as SimBaboon, PlaneId, RaiderView, SimState } from '../../../sim/types';
import type { AudioDirector, Synth } from '../../audio/AudioDirector';
import { designSize } from '../../layout';
import type { ParallaxView } from '../ParallaxView';
import { riseOf } from '../../../sim/baboons/baboons';
import { secondsToTicks } from '../../../sim/clock';
import {
  BABOON_FRAMES,
  BABOON_SHEET,
  RAIDER_H,
  RIDGE_H,
  baboonFrames,
  baboonTexelsPerPx,
  type BaboonFrame,
} from './baboonSheet';
import { BaboonCalls } from './baboonCalls';
import {
  BABOON_CALLS,
  BABOON_SOUNDS,
  BABOON_SYNTH,
  RAID_SOUND,
  type BaboonCall,
} from './baboonSounds';

/** A call with no synth stand-in: silent until its recording arrives. */
const SILENT: Synth = () => 0;

/** Ticks per frame: walking, running, a peek's look round, the bark, an action's swap. */
const WALK_TICKS = 8;
const RUN_TICKS = 5;
const LOOK_TICKS = 70;
const BARK_TICKS = 6;
const ACT_TICKS = 18;
/** v1.16 (D-078): a ridge member's feet (a bust's cut) sit this far below the ridge's edge (ridge
 *  px at a male's size), so no sky shows under it where the skyline dips a little. */
const EDGE_SINK = 3;
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
  /** v1.16 (D-078) a ridge member: how far up over the edge (0 hidden behind it … 1 all the way
   *  up); 1 for everything else. */
  readonly rise: number;
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
  /** Texture rows shown from the frame's top (-1: not cropped). */
  crop: number;
  hook: BaboonHook;
}

/** What BaboonView needs of the AssetManifest (the late sheet may arrive mid-hunt). */
export interface BaboonSheetSource {
  delivered(textures: Phaser.Textures.TextureManager, key: string): boolean;
  upgrade(textures: Phaser.Textures.TextureManager, prefix: string): string[];
}

const SHEET_POLL_FRAMES = 30;
/** v1.18 (D-081): ticks per step scrambling down the koppie. */
const CLIMB_TICKS = 9;

const alt = (t: number, every: number): boolean => Math.floor(t / every) % 2 === 0;

/** The ridge frame for a member's pose (null: behind the ridge, not drawn). A peek looks round
 *  (a ↔ b every LOOK_TICKS); a duck shows the bust going down. */
export function ridgeFrame(m: SimBaboon): BaboonFrame | null {
  const mother = m.role === 'mother';
  switch (m.pose) {
    case 'hide':
    case 'out':
      return null;
    case 'peek':
    case 'down':
      if (mother) return 'r_mother_peek';
      return m.pose === 'peek' && !alt(m.t, LOOK_TICKS) ? 'r_peek_b' : 'r_peek_a';
    case 'sentinel':
      return mother ? 'r_mother_peek' : 'r_sentinel';
    case 'bark':
      if (mother) return 'r_mother_peek';
      return alt(m.t, BARK_TICKS) ? 'r_bark_a' : 'r_bark_b';
  }
}

/** The raider frame for its phase and action. */
export function raiderFrame(r: RaiderView, tumbleTicks: number): BaboonFrame {
  switch (r.phase) {
    case 'approach': {
      // v1.18 (D-081): a raid that came down in sight dashes in for the rows.
      if (r.dash) return alt(r.t, RUN_TICKS) ? 'run_a' : 'run_b';
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
  /** v1.8b (review): each troop's rock outcrop, if it has one. */
  private readonly rocks = new Map<string, Slot>();
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
  /** v1.16 (D-078): each ridge member's pose last frame (a look starting: maybe a grunt). */
  private readonly lastPose = new Map<number, string>();
  private readonly calls: BaboonCalls;
  /** Milliseconds the last update took (perf.spec: baboonMs). */
  lastMs = 0;
  private readonly tumbleTicks: number;
  private readonly riseTicks: number;

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
    this.riseTicks = secondsToTicks(tuning.troop.riseSeconds);
    // The calls' timing draws: view only (sounds never touch the sim).
    this.calls = new BaboonCalls(tuning.calls, Math.random);
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
      // The crop is in texture rows: cut again at the new size.
      s.crop = -1;
      s.scale = (s.scale * was) / k;
      this.origin(s);
    }
    this.sheet = tex;
    return true;
  }

  private *all(): Iterable<Slot> {
    yield* this.rocks.values();
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
      crop: -1,
      hook: {
        id,
        role,
        frame: null,
        x: 0,
        y: 0,
        groundY: null,
        visible: false,
        alpha: 0,
        rise: 1,
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
  private hookOf(
    s: Slot,
    show: boolean,
    x: number,
    y: number,
    groundY: number | null,
    rise = 1,
  ): void {
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
      h.groundY !== gy ||
      h.rise !== rise
    )
      s.hook = { ...h, x: hx, y: hy, visible: show, frame: f, alpha: a, groundY: gy, rise };
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
      // Its rock outcrop first (under the troop), drawn at the ridge's own size.
      if (troop.rock !== null) {
        let r = this.rocks.get(troop.id);
        if (r === undefined) {
          const made = this.newSlot(troop.layerId, 'r_rock', -3, 'rock');
          if (made !== null) {
            r = made;
            this.rocks.set(troop.id, r);
          }
        }
        if (r !== undefined) this.place(r, 'r_rock', troop.rock.x, troop.rock.y, 1, false, 1);
      }
      const base = (troop.scale * T.heightPx) / RIDGE_H;
      for (const m of troop.members) {
        let s = this.members.get(m.id);
        if (s === undefined) {
          const made = this.newSlot(troop.layerId, 'r_peek_a', m.id, m.role);
          if (made === null) continue;
          s = made;
          this.members.set(m.id, s);
        }
        s.seen = true;
        const frame = ridgeFrame(m);
        const scale =
          base *
          (m.role === 'mother' ? T.motherScale : m.role === 'juvenile' ? T.juvenileScale : 1);
        // v1.16 (D-078): over the ridge's edge only as far as it has risen; the rest of it is
        // below the edge line, behind the ridge (cut off, so the ridge's art shows there).
        const rise = riseOf(m, this.riseTicks);
        const box = frame === null ? null : BABOON_FRAMES[frame];
        const drop = box === null ? 0 : (1 - rise) * box.oy * scale + EDGE_SINK * base;
        const rows = box === null ? 0 : Math.floor((box.oy * scale - drop) * (this.k / scale));
        const y = m.y + drop;
        const show = this.place(s, rows > 0 ? frame : null, m.x, y, scale, m.facing === -1, 1);
        if (show && box !== null && rows !== s.crop) {
          s.img.setCrop(0, 0, box.w * this.k, rows);
          s.crop = rows;
        }
        this.hookOf(s, show, m.x, m.y, null, rise);
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
    // v1.18 (D-081): raiders on their way down in sight: scrambling down the koppie (the ridge's
    // size), then running across the veld (a raider's frames at the far plane's size). Same slots
    // as the raiders (one id is on its way down or at its spot, never both).
    for (const d of b.descenders) {
      let s = this.raiders.get(d.id);
      if (s === undefined || s.layerId !== d.layerId) {
        s?.img.destroy();
        const made = this.newSlot(d.layerId, 'r_climb_a', d.id, 'descender');
        if (made === null) continue;
        s = made;
        this.raiders.set(d.id, s);
      }
      s.seen = true;
      const climb = d.pose === 'climb';
      const frame: BaboonFrame = climb
        ? alt(d.t, CLIMB_TICKS)
          ? 'r_climb_a'
          : 'r_climb_b'
        : alt(d.t, RUN_TICKS)
          ? 'run_a'
          : 'run_b';
      const scale = (d.scale * T.heightPx) / (climb ? RIDGE_H : RAIDER_H);
      const show = this.place(s, frame, d.x, d.y, scale, d.facing === -1, 1);
      this.hookOf(s, show, d.x, d.y, d.y);
      if (this.hooks) this.hookList[n++] = s.hook;
    }
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

  /** The baboons' sounds: the troop's own calls (v1.16, D-078: baboonCalls.ts, rate-limited —
   *  the echoing wa-hoo, the aimed bark, grunts and squeals, a scared raider's scream), the raid's
   *  own sound when a raider gets to work, the thump of a bagged one. `aim`: the crosshair on
   *  screen (design px), or null when it isn't up. */
  handle(
    events: readonly SimEvent[],
    state: SimState,
    audio: AudioDirector,
    width: number,
    aim: { readonly x: number; readonly y: number } | null = null,
  ): void {
    const tick = state.tick;
    const troops = state.baboons?.troops ?? [];
    for (const e of events) {
      if (e.type === 'baboonRaidWarned') {
        const troop = troops.find((t) => t.id === e.troopId);
        const m = troop?.members.find((b) => b.id === e.baboonId);
        if (troop !== undefined && m !== undefined) {
          this.calls.warn(tick);
          this.call('wahoo', troop.plane, m.x, audio, width);
        }
      } else if (e.type === 'baboonHit') {
        if (e.role === 'raider' && e.hitsLeft > 0) {
          // Hit once and running for it: the scream.
          this.calls.scream();
          this.call('scream', e.plane, e.x, audio, width);
        } else if (e.role !== 'raider') {
          this.calls.warn(tick);
          this.call('wahoo', e.plane, e.x, audio, width);
        }
      } else if (e.type === 'baboonBagged') {
        audio.playExtra(
          BABOON_SOUNDS.thump,
          this.pan(e.plane, e.x, width),
          BABOON_SYNTH.thump,
          1,
          this.levelDb(e.plane),
        );
      } else if (e.type === 'phase2Entered' && e.kind === 'baboon') {
        // v1.18 (D-081): a Phase 2 baboon comes at the Harvest's fence calling.
        this.calls.warn(tick);
        this.call('wahoo', e.plane, e.x, audio, width);
      } else if (e.type === 'troopFled' && e.cause === 'loud') {
        this.calls.warn(tick);
        this.call('wahoo', e.plane, e.x, audio, width);
      }
    }
    for (const troop of troops) {
      let caller: SimBaboon | null = null;
      for (const m of troop.members) {
        const was = this.lastPose.get(m.id);
        if (was !== m.pose) this.lastPose.set(m.id, m.pose);
        const up = m.pose === 'peek' || m.pose === 'sentinel';
        if (up && was === 'hide') {
          const c = this.calls.cameUp(tick, m.role === 'juvenile');
          if (c !== null) this.call(c, troop.plane, m.x, audio, width);
        }
        if (caller === null && (m.role === 'lookout' || m.role === 'male')) caller = m;
        // The aim comes near one looking over the edge: it barks at the gun.
        if (up && aim !== null && this.nearAim(troop.layerId, m.x, m.y, aim)) {
          if (this.calls.aimed(tick)) this.call('bark', troop.plane, m.x, audio, width);
        }
      }
      // The idle wa-hoo from behind the ridge (a male's place), while the troop is there.
      if (caller !== null && this.calls.wahoo(tick, !troop.fled))
        this.call('wahoo', troop.plane, caller.x, audio, width);
    }
    // A raider getting to work: its action's sound (once per raider).
    for (const r of state.baboons?.raiders ?? [])
      if (r.phase === 'act' && !this.actHeard.has(r.id)) {
        this.actHeard.add(r.id);
        const sound = RAID_SOUND[r.action];
        audio.playExtra(
          BABOON_SOUNDS[sound],
          this.pan(r.plane, r.x, width),
          BABOON_SYNTH[sound],
          1,
          this.levelDb(r.plane),
        );
      }
  }

  /** A troop call from layer x on a plane: its recording (else the old synth), at its distance. */
  private call(
    c: BaboonCall | 'bark',
    plane: PlaneId,
    x: number,
    audio: AudioDirector,
    width: number,
  ): void {
    const key = c === 'bark' ? BABOON_SOUNDS.bark : BABOON_CALLS[c];
    const synth = c === 'scream' ? BABOON_SYNTH.screech : BABOON_SYNTH.bark;
    const far = plane === 'far' || plane === 'ver';
    audio.playExtra(
      key,
      this.pan(plane, x, width),
      c === 'grunt' || c === 'squeal' ? SILENT : synth,
      1,
      this.levelDb(plane),
      far ? this.tuning.calls.farLowpassHz : 0,
    );
  }

  private levelDb(plane: PlaneId): number {
    return this.tuning.calls.levelDb + this.tuning.calls.planeDb[plane];
  }

  /** The aim (screen design px) within aimNearPx of a ridge member's head and shoulders. */
  private nearAim(
    layerId: string,
    x: number,
    y: number,
    aim: { readonly x: number; readonly y: number },
  ): boolean {
    const layer = this.parallax.layer(layerId);
    if (layer === undefined) return false;
    const sx = layer.root.x + x * layer.root.scaleX;
    const sy = layer.root.y + y * layer.root.scaleY;
    const r = this.tuning.calls.aimNearPx;
    const dx = aim.x - sx;
    const dy = aim.y - sy;
    return dx * dx + dy * dy <= r * r;
  }

  /** e2e: the troop's calls so far (the rate limit). */
  get callCounts(): Readonly<BaboonCalls['counts']> {
    return this.calls.counts;
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
    this.rocks.clear();
    this.raiders.clear();
    this.fruit = null;
    this.water = null;
  }
}
