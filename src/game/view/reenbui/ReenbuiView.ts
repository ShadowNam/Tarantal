// v1.10 (D-067, GDD §11.3e, art bible §5.6) Reënbui on screen (a lazy chunk: not in the first
// download): storm towers rolling in on the sky layer and the land dimming a little (the
// parallax's chunked LayerDimmer), a small lightning fork far off under the towers (through the
// shared flash limiter: never a screen flash; dimmer with "reduce flashes", none with "reduce
// motion"), the rain as two baked tiles repeated across the screen (each rain layer is one
// container moved once a frame: no particle per drop), dust puffs where the first drops land,
// the ground darkening where it rains and drying after, and the alate columns: a mound and one
// image per column on its plane's layer, cycling the baked rising loop.
// Phone rules (lessons 32–34): a fixed pool made once, properties set only when they change, no
// allocation per frame, the sky and the ground parts on alternate frames, everything on sim time
// (a held frame holds still), and its own timer (reenbuiMs, with its parts) for the perf test.
// The sheet loads with the late group: until the delivered file is under the key nothing is
// drawn and the view looks for it every 30 frames (lesson 14).
import type * as Phaser from 'phaser';
import type { PlaneId, ReenbuiView as SimReenbui, SimState } from '../../../sim/types';
import { FlashGate, type FlashLimiter } from '../flashLimit';
import type { LayerNode, ParallaxView } from '../ParallaxView';
import {
  PUFF_FRAMES,
  RAIN_TILE,
  REENBUI_SHEET,
  columnFrame,
  puffFrame,
  reenbuiFrames,
  reenbuiTexelsPerPx,
  type ReenbuiFrame,
} from './reenbuiSheet';

const TICKS_PER_SECOND = 60;
const SHEET_POLL_FRAMES = 30;
/** Alphas move in 1/16 steps: a fade changes an image's alpha at most 16 times. */
const ALPHA_STEPS = 16;
/** The widest screen the rain must cover (design px; WorldView's rain covers the same). */
const MAX_SCREEN_WIDTH = 2520;
const SCREEN_H = 1080;

/** Rain layers: tile scale, fall speed (screen px/s), alpha at full rain. */
const RAIN = {
  far: { scale: 2.5, speed: 820, alpha: 0.5 },
  near: { scale: 3, speed: 1350, alpha: 0.62 },
} as const;
/** The streaks' slant (x per y, as drawn in the tile). */
const RAIN_SLANT = -0.2;
/** "Reduce motion": the rain falls this much slower. */
const CALM_RAIN = 0.45;

/** The column loop: ticks per frame; its art's scale at plane scale 1. */
const COLUMN_TICKS = 6;
const COLUMN_SCALE = 1.25;
/** The columns rise over this long at the swarm's start and thin out over the easing. */
const COLUMN_RISE_TICKS = 50;
/** Mid-plane design px of a column's cull margin. */
const CULL_PX = 160;

/** Storm towers on the sky layer: count, scale, spread round the view (layer px), base y. */
const CLOUDS = { count: 3, scale: 2.1, spread: 620, baseY: 600, rollPx: 1500, alpha: 0.96 };
/** The land's dim at the storm's darkest (multiplied over each layer's light), and the sky's. */
const DIM_LAND = 0xb4b9c6;
const DIM_SKY = 0x8a92a6;
/** The dim moves in this many steps each way (each step re-tints the layers, chunked). */
const DIM_STEPS = 6;

/** Wet patches per ground plane, their scale, their alpha at the wettest; they dry this long
 *  after the rain. */
const WET = { near: 5, mid: 4, scale: 3.4, alpha: 0.7, dryTicks: 8 * TICKS_PER_SECOND };
/** Dust puffs of the first drops: pool size, ticks per frame. */
const PUFFS = 6;
const PUFF_TICKS = 5;
/** Lightning forks: ticks shown, the gap between forks (ticks), the first one in. */
const FORK = { show: 8, every: 200, first: 70, alpha: 0.95, reducedAlpha: 0.35 };

/** e2e: one alate column as drawn. */
export interface ReenbuiColumnHook {
  readonly id: number;
  readonly plane: string;
  readonly frame: string | null;
  /** Its foot (the mound's mouth) on screen (design px). */
  readonly x: number;
  readonly y: number;
  /** The plane's ground band on screen at its x (design px): the foot must be inside it. */
  readonly groundTop: number;
  readonly groundBottom: number;
  readonly visible: boolean;
  readonly alpha: number;
}

/** e2e: the event as drawn this frame. */
export interface ReenbuiHook {
  readonly phase: string | null;
  readonly sheet: boolean;
  readonly columns: readonly ReenbuiColumnHook[];
  readonly rainNear: number;
  readonly rainFar: number;
  readonly clouds: number;
  readonly wet: number;
  readonly puffs: number;
  /** Lightning forks shown so far this hunt (and how many the limiter refused). */
  readonly forks: number;
  readonly forksRefused: number;
  /** The dim step now (0 = none … DIM_STEPS). */
  readonly dim: number;
}

/** What ReenbuiView needs of the AssetManifest (the late sheet may arrive mid-hunt). */
export interface ReenbuiSheetSource {
  delivered(textures: Phaser.Textures.TextureManager, key: string): boolean;
  upgrade(textures: Phaser.Textures.TextureManager, prefix: string): string[];
}

export interface ReenbuiViewOptions {
  readonly scene: Phaser.Scene;
  readonly parallax: ParallaxView;
  readonly manifest: ReenbuiSheetSource;
  /** The screen-space overlay container (above the world, below the HUD). */
  readonly screen: Phaser.GameObjects.Container;
  readonly planeScale: Readonly<Record<PlaneId, number>>;
  /** The map's ground bands per plane (design px). */
  readonly groundY: Readonly<Partial<Record<PlaneId, readonly [number, number] | undefined>>>;
  readonly flashes: FlashLimiter;
  readonly reduceFlashes: () => boolean;
  readonly reducedMotion: boolean;
  readonly now: () => number;
  readonly hooks: boolean;
}

interface Img {
  readonly img: Phaser.GameObjects.Image;
  shown: boolean;
  alpha: number;
  frame: string;
  x: number;
  y: number;
}

/** Quantised alpha (ALPHA_STEPS). */
const q = (a: number): number =>
  Math.round(Math.max(0, Math.min(1, a)) * ALPHA_STEPS) / ALPHA_STEPS;
/** 0 → 1 over [from, from + len). */
const ramp = (t: number, from: number, len: number): number =>
  len <= 0 ? (t >= from ? 1 : 0) : Math.max(0, Math.min(1, (t - from) / len));
/** A small presentation hash (no Math.random): 0 … 1. */
const hash01 = (n: number): number => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

export class ReenbuiView {
  private sheet: Phaser.Textures.Texture | null = null;
  private k = 1;
  private waitFrames = 0;
  private frames = 0;
  private rainFar: Phaser.GameObjects.Container | null = null;
  private rainNear: Phaser.GameObjects.Container | null = null;
  private rainAlpha = { far: -1, near: -1 };
  private rainShown = { far: false, near: false };
  private readonly clouds: Img[] = [];
  private cloudBase: number | null = null;
  private readonly wet: { s: Img; layer: LayerNode }[] = [];
  private readonly puffs: { s: Img; layer: LayerNode; born: number }[] = [];
  private readonly cols = new Map<number, { col: Img; mound: Img; layer: LayerNode }>();
  private fork: Img | null = null;
  private readonly forkGate: FlashGate;
  private forkOn = false;
  private forks = 0;
  private forksRefused = 0;
  private dimStep = 0;
  private hookCols: ReenbuiColumnHook[] = [];
  private lastTick = -1;
  /** Milliseconds the last update took, and its parts (perf.spec: reenbuiMs). */
  lastMs = 0;
  readonly partMs = { rain: 0, sky: 0, ground: 0, columns: 0 };
  private hookState: ReenbuiHook | null = null;

  constructor(private readonly o: ReenbuiViewOptions) {
    this.forkGate = new FlashGate(o.flashes);
  }

  get hook(): ReenbuiHook | null {
    return this.hookState;
  }

  /** True once the delivered sheet is under the key (looked for every 30 frames until then). */
  private sheetReady(): boolean {
    const tx = this.o.scene.textures;
    if (!this.o.manifest.delivered(tx, REENBUI_SHEET)) {
      if (this.waitFrames++ % SHEET_POLL_FRAMES !== 0) return false;
      this.o.manifest.upgrade(tx, REENBUI_SHEET);
      if (!this.o.manifest.delivered(tx, REENBUI_SHEET)) return false;
    }
    if (!tx.exists(REENBUI_SHEET)) return false;
    const tex = tx.get(REENBUI_SHEET);
    if (tex === this.sheet) return true;
    const k = reenbuiTexelsPerPx(tex.getSourceImage().width);
    for (const f of reenbuiFrames()) {
      const fr = tex.has(f.name)
        ? tex.get(f.name)
        : tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
      if (fr === null) continue;
      fr.customPivot = true;
      fr.pivotX = f.ox / f.w;
      fr.pivotY = f.oy / f.h;
    }
    this.k = k;
    this.sheet = tex;
    return true;
  }

  private image(frame: ReenbuiFrame, parent: Phaser.GameObjects.Container): Img {
    const img = this.o.scene.add.image(0, 0, REENBUI_SHEET, frame).setVisible(false).setAlpha(0);
    parent.add(img);
    return { img, shown: false, alpha: 0, frame, x: 0, y: 0 };
  }

  private show(s: Img, on: boolean): void {
    if (on === s.shown) return;
    s.img.setVisible(on);
    s.shown = on;
  }

  private alpha(s: Img, a: number): void {
    const v = q(a);
    if (v === s.alpha) return;
    s.img.setAlpha(v);
    s.alpha = v;
  }

  private frameOf(s: Img, f: string): void {
    if (f === s.frame) return;
    s.img.setFrame(f);
    s.frame = f;
  }

  private place(s: Img, x: number, y: number): void {
    if (x === s.x && y === s.y) return;
    s.img.setPosition(x, y);
    s.x = x;
    s.y = y;
  }

  private planeLayer(plane: PlaneId): LayerNode | undefined {
    return this.o.parallax.layers.find((l) => l.plane === plane);
  }

  /** The layer x at the screen's centre. */
  private centreOf(layer: LayerNode, width: number): number {
    return (width / 2 - layer.root.x) / (layer.root.scaleX || 1);
  }

  // --- the rain ------------------------------------------------------------------------------

  private makeRain(): void {
    const grid = (which: 'far' | 'near'): Phaser.GameObjects.Container => {
      const r = RAIN[which];
      const c = this.o.scene.add.container(0, 0).setVisible(false).setAlpha(0);
      const w = RAIN_TILE.w * r.scale;
      const h = RAIN_TILE.h * r.scale;
      const cols = Math.ceil(MAX_SCREEN_WIDTH / w) + 1;
      const rows = Math.ceil(SCREEN_H / h) + 1;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const img = this.o.scene.add.image(x * w, y * h, REENBUI_SHEET, `rain_${which}`);
          img.setScale(r.scale / this.k);
          c.add(img);
        }
      this.o.screen.add(c);
      return c;
    };
    this.rainFar = grid('far');
    this.rainNear = grid('near');
  }

  /** Rain alpha per layer for the phase (0 = none). */
  private rainLevels(v: SimReenbui, t: number): { far: number; near: number } {
    if (v.withStorm) return { far: 0, near: 0 };
    const drops = ramp(t, v.dropsTick, v.swarmTick - v.dropsTick);
    const swarm = ramp(t, v.swarmTick, TICKS_PER_SECOND * 2);
    const ease = 1 - ramp(t, v.easingTick, v.endTick - v.easingTick);
    if (t < v.dropsTick || t >= v.endTick) return { far: 0, near: 0 };
    return {
      far: RAIN.far.alpha * swarm * ease,
      near: RAIN.near.alpha * (0.55 * drops + 0.45 * swarm) * ease,
    };
  }

  private updateRain(v: SimReenbui, t: number): void {
    const lv = this.rainLevels(v, t);
    if ((lv.far > 0 || lv.near > 0) && this.rainFar === null) this.makeRain();
    const set = (which: 'far' | 'near', c: Phaser.GameObjects.Container | null): void => {
      if (c === null) return;
      const a = q(lv[which]);
      const on = a > 0;
      if (on !== this.rainShown[which]) {
        c.setVisible(on);
        this.rainShown[which] = on;
      }
      if (a !== this.rainAlpha[which]) {
        c.setAlpha(a);
        this.rainAlpha[which] = a;
      }
      if (!on) return;
      const r = RAIN[which];
      const h = RAIN_TILE.h * r.scale;
      const w = RAIN_TILE.w * r.scale;
      const fall = (t / TICKS_PER_SECOND) * r.speed * (this.o.reducedMotion ? CALM_RAIN : 1);
      const y = (fall % h) - h;
      const x = ((((RAIN_SLANT * fall) % w) + w) % w) - w;
      c.setPosition(x, y);
    };
    set('far', this.rainFar);
    set('near', this.rainNear);
  }

  // --- the sky: towers, dim, forks -------------------------------------------------------------

  private updateSky(v: SimReenbui, t: number, width: number): void {
    const sky = this.o.parallax.layers[0];
    if (sky === undefined) return;
    // How far the storm is in: rolls in over the build-up, out over the easing (+ a little).
    const roll = v.withStorm
      ? 0
      : ramp(t, v.buildupTick, v.dropsTick - v.buildupTick) *
        (1 - ramp(t, v.easingTick, v.endTick - v.easingTick + TICKS_PER_SECOND * 2));
    if (roll > 0 && this.clouds.length === 0)
      for (let i = 0; i < CLOUDS.count; i++) {
        const s = this.image(i % 2 === 0 ? 'cloud_a' : 'cloud_b', sky.fixtures);
        s.img.setScale(CLOUDS.scale / this.k);
        if (i === 2) s.img.setFlipX(true);
        this.clouds.push(s);
      }
    if (roll > 0 && this.cloudBase === null) this.cloudBase = this.centreOf(sky, width);
    if (roll <= 0) this.cloudBase = null;
    for (let i = 0; i < this.clouds.length; i++) {
      const s = this.clouds[i];
      if (s === undefined) continue;
      this.show(s, roll > 0);
      if (roll <= 0) continue;
      const base = this.cloudBase ?? 0;
      const x = base + (i - 1) * CLOUDS.spread + (1 - roll) * CLOUDS.rollPx * (i === 0 ? -1 : 1);
      this.place(s, Math.round(x), CLOUDS.baseY + (i === 1 ? -30 : 0));
      this.alpha(s, roll * CLOUDS.alpha);
    }
    // The dim, in steps (the dimmer re-tints the layers chunked over frames).
    const step = Math.round(roll * DIM_STEPS);
    if (step !== this.dimStep) {
      this.dimStep = step;
      const mix = (c: number): number => {
        const k = step / DIM_STEPS;
        const ch = (sh: number): number => {
          const a = (c >> sh) & 0xff;
          return Math.round(255 + (a - 255) * k) << sh;
        };
        return ch(16) | ch(8) | ch(0);
      };
      const tints = new Map<string, number>();
      this.o.parallax.layers.forEach((l, i) => tints.set(l.id, mix(i === 0 ? DIM_SKY : DIM_LAND)));
      this.o.parallax.dimLayers(tints);
    }
    this.o.parallax.stepDim();
    this.updateFork(v, t, sky, width);
  }

  /** Is a fork due at tick t (the build-up and the swarm, every FORK.every ticks)? */
  private forkWanted(v: SimReenbui, t: number): number | null {
    if (v.withStorm || this.o.reducedMotion) return null;
    if (t < v.buildupTick || t >= v.easingTick) return null;
    const since = t - v.buildupTick - FORK.first;
    if (since < 0) return null;
    const n = Math.floor(since / FORK.every);
    return since - n * FORK.every < FORK.show ? n : null;
  }

  private updateFork(v: SimReenbui, t: number, sky: LayerNode, width: number): void {
    const n = this.forkWanted(v, t);
    const lit = this.forkGate.lit(n !== null, this.o.now());
    if (n !== null && !this.forkOn) {
      if (lit) this.forks++;
      else this.forksRefused++;
    }
    this.forkOn = n !== null;
    if (this.fork === null && n === null) return;
    this.fork ??= this.image('fork_a', sky.fixtures);
    const f = this.fork;
    this.show(f, lit);
    if (!lit || n === null) return;
    this.frameOf(f, n % 2 === 0 ? 'fork_a' : 'fork_b');
    const base = this.cloudBase ?? this.centreOf(sky, width);
    this.place(f, Math.round(base + (hash01(n + 17) * 2 - 1) * CLOUDS.spread), CLOUDS.baseY - 8);
    if (f.img.scaleX !== 1.3 / this.k) f.img.setScale(1.3 / this.k);
    this.alpha(f, this.o.reduceFlashes() ? FORK.reducedAlpha : FORK.alpha);
  }

  // --- the ground: wet patches, puffs ------------------------------------------------------------

  private updateGround(v: SimReenbui, t: number, width: number): void {
    const wetness =
      ramp(t, v.dropsTick, v.swarmTick - v.dropsTick + TICKS_PER_SECOND) *
      (1 - ramp(t, v.endTick, WET.dryTicks));
    if (wetness > 0 && this.wet.length === 0) this.makeWet(width);
    for (const w of this.wet) {
      this.show(w.s, wetness > 0);
      if (wetness > 0) this.alpha(w.s, wetness * WET.alpha);
    }
    // The first drops' puffs (not with the storm: its rain was already falling).
    const puffing = !v.withStorm && t >= v.dropsTick && t < v.swarmTick + TICKS_PER_SECOND;
    if (puffing && this.puffs.length === 0) this.makePuffs();
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (p === undefined) continue;
      if (!puffing) {
        this.show(p.s, false);
        continue;
      }
      const life = PUFF_TICKS * PUFF_FRAMES;
      // Each puff restarts every `life` ticks, staggered, somewhere new on its plane in view.
      const age = (t - v.dropsTick + i * Math.floor(life / PUFFS)) % life;
      const round = Math.floor((t - v.dropsTick + i * Math.floor(life / PUFFS)) / life);
      this.frameOf(p.s, puffFrame(Math.floor(age / PUFF_TICKS)));
      if (age < PUFF_TICKS || p.born < 0) {
        p.born = round;
        const plane = p.layer.plane ?? 'near';
        const band = this.o.groundY[plane] ?? [900, 1000];
        const cx = this.centreOf(p.layer, width);
        const x =
          cx + ((hash01(round * 31 + i) * 2 - 1) * (width / 2)) / (p.layer.root.scaleX || 1);
        const y = band[0] + hash01(round * 57 + i) * (band[1] - band[0]);
        this.place(p.s, Math.round(x), Math.round(y));
      }
      this.show(p.s, true);
    }
  }

  private makeWet(width: number): void {
    for (const plane of ['near', 'mid'] as const) {
      const layer = this.planeLayer(plane);
      const band = this.o.groundY[plane];
      if (layer === undefined || band === undefined) continue;
      const n = WET[plane];
      const sc = (WET.scale * this.o.planeScale[plane]) / this.k;
      const cx = this.centreOf(layer, width);
      for (let i = 0; i < n; i++) {
        const s = this.image('wet', layer.fixtures);
        s.img.setScale(sc * (0.8 + hash01(i * 13 + n) * 0.5), sc);
        const span = (MAX_SCREEN_WIDTH * 1.4) / (layer.root.scaleX || 1);
        const x = cx + ((i + 0.5) / n - 0.5) * span + (hash01(i * 7) - 0.5) * 200;
        const y = band[0] + (0.3 + hash01(i * 3 + 1) * 0.5) * (band[1] - band[0]);
        this.place(s, Math.round(x), Math.round(y));
        this.wet.push({ s, layer });
      }
    }
  }

  private makePuffs(): void {
    for (let i = 0; i < PUFFS; i++) {
      const plane: PlaneId = i % 3 === 2 ? 'mid' : 'near';
      const layer = this.planeLayer(plane);
      if (layer === undefined) continue;
      const s = this.image(puffFrame(0), layer.fixtures);
      s.img.setScale((1.4 * this.o.planeScale[plane]) / this.k);
      s.img.setAlpha(0.9);
      s.alpha = 0.9;
      this.puffs.push({ s, layer, born: -1 });
    }
  }

  // --- the alate columns -----------------------------------------------------------------------

  private updateColumns(v: SimReenbui, t: number, width: number): void {
    const level =
      ramp(t, v.swarmTick, COLUMN_RISE_TICKS) *
      (1 - ramp(t, v.easingTick, v.endTick - v.easingTick));
    const frame = columnFrame(Math.floor((t - v.swarmTick) / COLUMN_TICKS));
    const hooks: ReenbuiColumnHook[] | null = this.o.hooks ? [] : null;
    for (const c of v.columns) {
      let e = this.cols.get(c.id);
      if (e === undefined) {
        const layer = this.planeLayer(c.plane);
        if (layer === undefined) continue;
        const sc = (COLUMN_SCALE * this.o.planeScale[c.plane]) / this.k;
        const mound = this.image('mound', layer.fixtures);
        mound.img.setScale(sc);
        const col = this.image(columnFrame(0), layer.fixtures);
        col.img.setScale(sc);
        this.place(mound, c.x, c.y);
        this.place(col, c.x, c.y);
        e = { col, mound, layer };
        this.cols.set(c.id, e);
      }
      // Hidden off screen (each layer pans on its own).
      const sx = e.layer.root.x + c.x * e.layer.root.scaleX;
      const on = level > 0 && sx > -CULL_PX && sx < width + CULL_PX;
      this.show(e.col, on);
      this.show(e.mound, on);
      if (on) {
        this.frameOf(e.col, frame);
        this.alpha(e.col, level);
        this.alpha(e.mound, Math.min(1, level * 2));
      }
      if (hooks !== null) {
        const band = this.o.groundY[c.plane] ?? [c.y, c.y];
        const sy = (y: number): number => Math.round(e.layer.root.y + y * e.layer.root.scaleY);
        hooks.push({
          id: c.id,
          plane: c.plane,
          frame: on ? e.col.frame : null,
          x: Math.round(sx),
          y: sy(c.y),
          groundTop: sy(band[0]),
          groundBottom: sy(band[1]),
          visible: on,
          alpha: on ? e.col.alpha : 0,
        });
      }
    }
    // Columns gone (the event is over): hidden.
    if (v.columns.length === 0)
      for (const e of this.cols.values()) {
        this.show(e.col, false);
        this.show(e.mound, false);
      }
    if (hooks !== null) this.hookCols = hooks;
  }

  // --- the frame -------------------------------------------------------------------------------

  /** Draws the event at this tick (`width`: the visible design width). */
  update(state: SimState, width: number): void {
    const t0 = this.o.now();
    const v = state.reenbui;
    if (v === null || !this.sheetReady()) {
      this.lastMs = this.o.now() - t0;
      if (this.o.hooks)
        this.hookState = {
          phase: v?.phase ?? null,
          sheet: this.sheet !== null,
          columns: [],
          rainNear: 0,
          rainFar: 0,
          clouds: 0,
          wet: 0,
          puffs: 0,
          forks: this.forks,
          forksRefused: this.forksRefused,
          dim: this.dimStep,
        };
      return;
    }
    const t = state.tick;
    // Nothing moves on a frame whose tick has not moved (a held or paused hunt).
    const moved = t !== this.lastTick;
    this.lastTick = t;
    this.frames++;
    const active = t >= v.buildupTick - 1 && t < v.endTick + WET.dryTicks;
    if (moved && (active || this.dimStep !== 0 || this.rainShown.far || this.rainShown.near)) {
      let a = this.o.now();
      this.updateRain(v, t);
      let b = this.o.now();
      this.partMs.rain += b - a;
      // The sky and the ground on alternate frames (lesson 33).
      if (this.frames % 2 === 0) {
        this.updateSky(v, t, width);
        a = this.o.now();
        this.partMs.sky += a - b;
      } else {
        this.updateGround(v, t, width);
        a = this.o.now();
        this.partMs.ground += a - b;
      }
      this.updateColumns(v, t, width);
      b = this.o.now();
      this.partMs.columns += b - a;
    }
    this.lastMs = this.o.now() - t0;
    if (this.o.hooks)
      this.hookState = {
        phase: v.phase,
        sheet: true,
        columns: this.hookCols,
        rainNear: this.rainShown.near ? this.rainAlpha.near : 0,
        rainFar: this.rainShown.far ? this.rainAlpha.far : 0,
        clouds: this.clouds.filter((c) => c.shown).length,
        wet: this.wet.find((w) => w.s.shown)?.s.alpha ?? 0,
        puffs: this.puffs.filter((p) => p.s.shown).length,
        forks: this.forks,
        forksRefused: this.forksRefused,
        dim: this.dimStep,
      };
  }

  destroy(): void {
    const all: (Phaser.GameObjects.GameObject | null)[] = [
      this.rainFar,
      this.rainNear,
      this.fork?.img ?? null,
      ...this.clouds.map((c) => c.img),
      ...this.wet.map((w) => w.s.img),
      ...this.puffs.map((p) => p.s.img),
      ...[...this.cols.values()].flatMap((e) => [e.col.img, e.mound.img]),
    ];
    for (const o of all) o?.destroy();
    if (this.dimStep !== 0) this.o.parallax.dimLayers(new Map());
    this.cols.clear();
  }
}
