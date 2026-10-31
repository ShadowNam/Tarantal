// D-065: how the New Year countdown looks and sounds in the hunt — the warm dusk deepening to blue
// hour over the hunt (a wash over the sky layer) with the stars coming out, small fireworks low
// over the far horizon (on the sky layer, behind the far ridge: a few at a time, more in the
// countdown), and guineafowl in small striped party hats. Phone-cheap: a fixed pool made once;
// each burst is baked frame by frame into the sheet (fireworkMath.ts, tools/art/newyear.ts), so a
// burst is two images (coloured sparks, tinted; white sparks and the core) that change frame and
// alpha, plus its rocket; the stars twinkle as four groups (an alpha a group). No allocation per
// frame, properties set only when they change, nothing on a frame whose tick has not moved;
// everything runs on sim time (a held frame holds it); never a large flash: at most
// fireworks.maxPerSecond (≤ 3) bursts start a second, fewer on the low tier, and with "reduce
// flashes" they only twinkle, dimmer than the sky.
// Part of the lazy feesdae chunk; the art is the "feesdae-newyear" group's sheet (Standard in
// HD); until it arrives a tiny stand-in keeps the stars, and no fireworks or hats are drawn.
import type * as Phaser from 'phaser';
import type { Feesdag, NewYearLook } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { FeesdagView as FeesdagState, PlaneId } from '../../sim/types';
import { coreWidth } from '../../sim/world';
import type { AudioDirector, Synth } from '../audio/AudioDirector';
import type { HatSource } from '../view/BirdView';
import type { ParallaxView } from '../view/ParallaxView';
import {
  NEWYEAR_SHEET,
  NY_SHEET_H,
  NY_SHEET_W,
  NY_SOUNDS,
  nyFrames,
  partyHatFrame,
  type NySound,
  FW_FRAMES,
  type NyFrame,
} from './newyearAssets';
import anchorsJson from './hatAnchors.json';
import { nyKeyIn, nyMasterOf } from './newyearKeys';
import {
  BURST_CELL,
  BURST_R,
  BURST_T,
  burstAlpha,
  burstFrameAt,
  FW_STRIPS,
  hash01,
} from './fireworkMath';
import { designSize } from '../layout';

type Anchor = readonly [number, number, number, number];
/** The guineafowl's head in every frame of every clip (tools/art/hatAnchors.ts): the party hats
 *  sit where the witch and Santa hats do. */
const HAT_ANCHORS = anchorsJson as unknown as {
  readonly placeholder: Anchor;
  readonly clips: Readonly<Record<string, readonly Anchor[]>>;
};

/** The stand-in's texture key (the spark and the star only; the sheet takes NEWYEAR_SHEET). */
export const NY_STANDIN = `${NEWYEAR_SHEET}#standin`;
const TICKS_PER_SECOND = 60;
/** The sky layer the wash, the stars and the fireworks live on (every biome has one). */
const SKY = 'sky';

const ORIGINS = new Map(nyFrames().map((f) => [f.name, f]));
/** Phaser.BlendModes.NORMAL and ADD (the numbers, so the module needs no Phaser at run time). */
const BLEND_NORMAL = 0;
const BLEND_ADD = 1;
/** One turn of a sine in 64 steps (the stars' twinkle: no Math.sin per star per frame). */
const STAR_GROUPS = 4;
const SINE64 = Float32Array.from({ length: 64 }, (_, i) => Math.sin((i / 64) * Math.PI * 2));
/** The ground's blue hour moves in this many steps over its ramp (a 30-s hunt: one ~every 0.8 s). */
const GROUND_STEPS = 32;

/** Sets an image's origin from the frame table (the streak's head is its origin). */
function originOf(img: Phaser.GameObjects.Image, frame: 'spark' | 'streak'): void {
  const f = ORIGINS.get(frame);
  if (f !== undefined) img.setOrigin(f.ox / f.w, f.oy / f.h);
}

/** Adds the frame table to a texture (texture px = design px × its master). */
export function addNyFrames(tex: Phaser.Textures.Texture, master: number): void {
  for (const f of nyFrames()) {
    if (tex.has(f.name)) continue;
    tex.add(f.name, 0, f.x * master, f.y * master, f.w * master, f.h * master);
  }
}

/**
 * The delivered sheet when it is in (Standard in HD too: one key), else the sheet already
 * loaded, else the stand-in: a 32 × 16 canvas with the spark and the star (drawn once per page).
 */
export function ensureNyTexture(scene: Phaser.Scene, sheet: HTMLImageElement | null): string {
  const textures = scene.textures;
  if (sheet !== null && !textures.exists(NEWYEAR_SHEET)) {
    const tex = textures.addImage(NEWYEAR_SHEET, sheet);
    if (tex !== null) addNyFrames(tex, nyMasterOf(sheet.width));
  }
  const have = nyKeyIn(textures);
  if (have !== null) return have;
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 28;
  const g = canvas.getContext('2d');
  if (g !== null) {
    const dot = (cx: number, cy: number, r: number): void => {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    dot(8, 8, 7.5);
    dot(22, 6, 4);
    // The streak: a fading tail to a bright head (at x 34).
    const tail = g.createLinearGradient(2, 0, 34, 0);
    tail.addColorStop(0, 'rgba(255,255,255,0)');
    tail.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = tail;
    g.fillRect(2, 20, 32, 3);
    dot(34, 21.5, 4.4);
  }
  const tex = textures.addCanvas(NY_STANDIN, canvas);
  if (tex !== null) {
    tex.add('spark', 0, 0, 0, 16, 16);
    tex.add('star', 0, 16, 0, 12, 12);
    tex.add('streak', 0, 0, 16, 40, 10);
  }
  return NY_STANDIN;
}

// --- sounds ----------------------------------------------------------------------------------

function note(
  ctx: AudioContext,
  out: AudioNode,
  f: number,
  at: number,
  len: number,
  peak: number,
): void {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 0.94, t0);
  o.frequency.exponentialRampToValueAtTime(f, t0 + 0.035);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** "Auld Lang Syne" (traditional; public domain): its first line, in D. */
const AULD: readonly (readonly [number, number])[] = [
  [69, 1],
  [74, 1.5],
  [74, 0.5],
  [74, 1],
  [78, 1],
  [76, 1.5],
  [74, 0.5],
  [76, 1],
  [78, 1],
];

/** Stand-ins until the recordings arrive: the same tune on a plain whistle tone, a soft thump. */
const SYNTH: Record<NySound, Synth> = {
  sting: (ctx, out) => {
    let t = 0;
    for (const [m, b] of AULD) {
      note(ctx, out, mtof(m), t * 0.27, b * 0.27 * 0.95, 0.22);
      t += b;
    }
    return t * 0.27 + 0.3;
  },
  tally: (ctx, out) => {
    let t = 0;
    for (const [m, b] of [...AULD.slice(0, 8), [74, 3] as const]) {
      note(ctx, out, mtof(m), t * 0.32, b * 0.32 * 0.95, 0.2);
      t += b;
    }
    return t * 0.32 + 0.3;
  },
  pop: (ctx, out, noise) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    s.connect(f).connect(g).connect(out);
    s.start(t0);
    s.stop(t0 + 0.32);
    return 0.4;
  },
  tick: (ctx, out) => {
    note(ctx, out, 1760, 0, 0.06, 0.15);
    return 0.1;
  },
};

export function playNySound(audio: AudioDirector, id: NySound, pan: number): void {
  audio.playExtra(NY_SOUNDS[id], Math.max(-1, Math.min(1, pan)), SYNTH[id]);
}

// --- fireworks (pure: the schedule from the tick) ----------------------------------------------

export { hash01 } from './fireworkMath';
const colourCache = new Map<readonly string[], readonly number[]>();
function coloursOf(list: readonly string[]): readonly number[] {
  let c = colourCache.get(list);
  if (c === undefined) {
    c = list.map((x) => parseInt(x.slice(1), 16));
    colourCache.set(list, c);
  }
  return c;
}

/** 0 … 1 across [from, to] of the hunt fraction p. */
function ramp(p: number, from: number, to: number): number {
  return to <= from ? (p >= to ? 1 : 0) : Math.max(0, Math.min(1, (p - from) / (to - from)));
}

export interface BurstPlan {
  /** The tick the rocket leaves (the burst opens at start + riseTicks). */
  readonly start: number;
  /** Where across the view (−1 … 1 of half its width), the burst's height (design px), size. */
  readonly across: number;
  readonly y: number;
  readonly radius: number;
  readonly colour: number;
  /** Which of fireworks.colours (its baked strip, FW_FRAMES). */
  readonly colourIndex: number;
  readonly slot: number;
}

/**
 * The bursts a slot starts (at most one: a slot is 1/maxPerSecond s, so never more than
 * maxPerSecond a second), from the slot number alone. `rate` is bursts a second wanted now.
 */
export function burstInSlot(
  slot: number,
  fw: NewYearLook['fireworks'],
  rate: number,
): BurstPlan | null {
  const slotTicks = Math.max(1, Math.round(TICKS_PER_SECOND / fw.maxPerSecond));
  const chance = Math.min(1, rate / fw.maxPerSecond);
  if (hash01(slot, 1) >= chance) return null;
  const colours = coloursOf(fw.colours);
  const colourIndex = Math.floor(hash01(slot, 6) * colours.length) % colours.length;
  return {
    start: slot * slotTicks + Math.floor(hash01(slot, 2) * slotTicks * 0.5),
    across: hash01(slot, 3) * 1.7 - 0.85,
    y: fw.y[0] + hash01(slot, 4) * (fw.y[1] - fw.y[0]),
    radius: fw.radius[0] + hash01(slot, 5) * (fw.radius[1] - fw.radius[0]),
    colour: colours[colourIndex] ?? 0xffffff,
    colourIndex,
    slot,
  };
}

/**
 * The flash rule by construction (≤ maxPerSecond bursts start in any second): a burst may start
 * only if it starts at least TICKS_PER_SECOND after the start maxPerSecond launches back. Pure:
 * it sees the starts in launch order (they rise with the slots) and keeps only the last few.
 */
export class BurstSpacer {
  private readonly recent: number[] = [];

  constructor(private readonly perSecond: number) {}

  /** Whether a burst starting at `start` keeps every second to ≤ perSecond starts. */
  allows(start: number): boolean {
    const n = Math.max(1, Math.floor(this.perSecond));
    if (this.recent.length < n) return true;
    return start - (this.recent[this.recent.length - n] ?? -Infinity) >= TICKS_PER_SECOND;
  }

  /** A burst started at `start` (call only for bursts that really launch). */
  record(start: number): void {
    this.recent.push(start);
    if (this.recent.length > 8) this.recent.shift();
  }
}

interface Burst {
  /** The baked burst (fireworkMath.ts): one image showing its colour's strip (its sparks, the
   *  white ones, the core and the fade baked in), the frame shown now; reduce flashes: the
   *  twinkle frame (tinted) and its alpha. */
  readonly img: Phaser.GameObjects.Image;
  readonly rocket: Phaser.GameObjects.Image;
  /** The strip (FW_FRAMES row) of the plan now, the frame shown, the twinkle's alpha. */
  strip: readonly NyFrame[];
  frame: number;
  alpha: number;
  /** The rocket's tint now (set only when a burst of another colour reuses it). */
  rocketTint: number;
  plan: BurstPlan | null;
  /** Layer x of its centre (fixed when it starts: it stays put on the sky as the view pans). */
  x: number;
  popped: boolean;
  shown: boolean;
}

/** The stars, in groups twinkling each on its own slow phase (one alpha a group a frame). */
interface StarGroup {
  readonly box: Phaser.GameObjects.Container;
  readonly phase: number;
  alpha: number;
}

/** A stable 0..1 hash of a bird id (which guineafowl wear hats). */
function share(id: number): number {
  return hash01(id, 2027);
}

export interface NuwejaarDeps {
  readonly scene: Phaser.Scene;
  readonly parallax: ParallaxView;
  readonly look: NewYearLook;
  readonly special: Feesdag;
  readonly planeScale: Readonly<Record<PlaneId, number>>;
  readonly decorations: readonly string[];
  readonly sheet: HTMLImageElement | null;
  /** "Reduce flashes": the fireworks only twinkle, dimmer than the sky. */
  readonly reduceFlashes: boolean;
  /** The low quality tier: fewer bursts (fireworks.lowTierScale). */
  readonly lowTier: boolean;
  /** e2e/screenshot builds only (`?fireworks=max`): a burst in every slot. */
  readonly maxFireworks?: boolean;
  /** The e2e hooks are on: `__TM_NY_HIDE__(true)` hides the fireworks and stars, so a spec can
   *  grab the same held tick with and without them (the drawn pixels, not only hook flags). */
  readonly hooks?: boolean;
}

export interface NewYearHook {
  sheet: 'standard' | 'standin';
  blueHour: number;
  stars: number;
  starAlpha: number;
  /** Bursts drawn now: screen design px, radius, alpha (reduce flashes: twinkle). */
  bursts: { x: number; y: number; r: number; alpha: number; slot: number }[];
  /** Start ticks of every burst shown this hunt (the flash rule: ≤ 3 in any second). */
  starts: number[];
  twinkle: boolean;
  countdown: { atTick: number; active: boolean; mult: number } | null;
}

export class NuwejaarSceneView {
  private key: string;
  private readonly scene: Phaser.Scene;
  private readonly parallax: ParallaxView;
  private readonly look: NewYearLook;
  private readonly lastSeconds: number;
  private readonly bursts: Burst[] = [];
  private readonly stars: StarGroup[] = [];
  private starCount = 0;
  private readonly wash: Phaser.GameObjects.Rectangle | null;
  private readonly fireworksOn: boolean;
  private readonly reduceFlashes: boolean;
  private readonly lowTier: boolean;
  private readonly maxFireworks: boolean;
  private readonly sparkScale: number;
  private last: FeesdagState | null = null;
  private lastSlot = -1;
  private washAlpha = -1;
  /** D-065: the ground's blue-hour step applied (dimGround), and ms spent on the ground dim. */
  private groundK = -1;
  dimMs = 0;
  /** D-065 (perf): ms on the fireworks and on the stars (perf.spec reports them). */
  fxMs = 0;
  starsMs = 0;
  /** Which of the stars (1) or the fireworks (0) this frame updates. */
  private turn = 0;
  /** The tick (and hide state) the stars and fireworks were last drawn for. */
  private drawnTick = -1;
  private drawnHidden = false;
  /** D-065: each layer's extra blue-hour tint now (dimGround). */
  private readonly groundTint = new Map<string, number>();
  private starAlpha = -1;
  private hidden = false;
  private readonly starts: number[] = [];
  /** ≤ maxPerSecond burst starts in any second, by construction. */
  private readonly spacer: BurstSpacer;
  /** Pops to play (screen x), gathered in update and played in handle (it has the audio). */
  private readonly pops: number[] = [];
  /** The rifle zoom the world is drawn at (1 = no sight up). */
  viewZoom = 1;
  /** Party hats for the BirdView (cosmetic: picked by bird id; only with the delivered sheet). */
  readonly hats: HatSource;

  constructor(d: NuwejaarDeps) {
    this.scene = d.scene;
    this.parallax = d.parallax;
    this.look = d.look;
    this.reduceFlashes = d.reduceFlashes;
    this.lowTier = d.lowTier;
    this.maxFireworks = d.maxFireworks === true;
    this.spacer = new BurstSpacer(d.look.fireworks.maxPerSecond);
    this.lastSeconds =
      d.special.twist.rule === 'nuwejaar' ? d.special.twist.countdown.lastSeconds : 0;
    this.key = ensureNyTexture(d.scene, d.sheet);
    this.sparkScale = 1 / nyMasterOf(d.scene.textures.get(this.key).getSourceImage().width);
    const sky = d.parallax.layer(SKY);
    const width = sky === undefined ? 0 : coreWidth(sky.scrollFactor);
    // Blue hour: one rectangle over the sky's art (its alpha grows over the hunt).
    const bh = d.look.blueHour;
    this.wash =
      sky === undefined
        ? null
        : d.scene.add
            .rectangle(-2400, 0, width + 4800, bh.bottom, parseInt(bh.color.slice(1), 16), 1)
            .setOrigin(0, 0)
            .setAlpha(0);
    if (this.wash !== null) sky?.fixtures.add(this.wash);
    // Stars: made once, spread over the sky (any aspect ratio), a fixed pattern from the index,
    // in STAR_GROUPS containers that each twinkle on their own phase (an alpha a group a frame).
    if (d.decorations.includes('stars') && sky !== undefined) {
      const st = d.look.stars;
      for (let gi = 0; gi < STAR_GROUPS; gi++) {
        const box = d.scene.add.container(0, 0).setAlpha(0);
        sky.fixtures.add(box);
        this.stars.push({ box, phase: gi / STAR_GROUPS, alpha: 0 });
      }
      for (let i = 0; i < st.count; i++) {
        const x = -1200 + hash01(i, 11) * (width + 2400);
        const y = st.y[0] + hash01(i, 12) * (st.y[1] - st.y[0]);
        const img = d.scene.add.image(x, y, this.key, 'star');
        img.setScale((0.6 + hash01(i, 13) * 0.7) * this.sparkScale);
        img.setAlpha(0.5 + hash01(i, 15) * 0.5);
        this.stars[i % STAR_GROUPS]?.box.add(img);
      }
      this.starCount = st.count;
    }
    // The fireworks' pool: made once (pool × a coloured and a white frame-strip image and a
    // rocket), hidden until used; the strips need the delivered sheet (build()).
    this.fireworksOn = d.decorations.includes('fireworks') && sky !== undefined;
    this.buildFireworks();
    if (d.hooks === true)
      (window as { __TM_NY_HIDE__?: (on: boolean) => void }).__TM_NY_HIDE__ = (on) => {
        this.setHidden(on);
      };
    const hatsOn = d.decorations.includes('partyHats');
    this.hats = {
      frameFor: (w) => {
        const frame = partyHatFrame(w);
        const f = ORIGINS.get(frame);
        return {
          key: this.key,
          frame,
          ox: f === undefined ? 0.5 : f.ox / f.w,
          oy: f === undefined ? 0.9 : f.oy / f.h,
        };
      },
      wears: (id, creature) =>
        hatsOn && this.final && creature.startsWith('tarentaal') && share(id) < this.look.hatShare,
      head: (clip, n) => {
        const frames = clip === null ? undefined : HAT_ANCHORS.clips[clip];
        const a = frames === undefined ? HAT_ANCHORS.placeholder : (frames[n] ?? frames[0]);
        return a ?? HAT_ANCHORS.placeholder;
      },
      widthPerHeadR: d.look.hat.widthPerHeadR,
      tilt: d.look.hat.tilt,
    };
  }

  /** The fireworks' pool (once the delivered sheet with the baked frames is in). */
  private buildFireworks(): void {
    const sky = this.parallax.layer(SKY);
    if (!this.fireworksOn || !this.final || sky === undefined || this.bursts.length > 0) return;
    const fw = this.look.fireworks;
    const blend = this.reduceFlashes ? BLEND_NORMAL : BLEND_ADD;
    for (let b = 0; b < fw.pool; b++) {
      const strip = FW_FRAMES[0] ?? [];
      const img = this.scene.add
        .image(0, 0, this.key, this.reduceFlashes ? 'fw_twinkle' : (strip[0] ?? 'fw_0_0'))
        .setOrigin(BURST_CELL.ox / BURST_CELL.w, BURST_CELL.oy / BURST_CELL.h)
        .setVisible(false)
        .setBlendMode(blend);
      const rocket = this.scene.add.image(0, 0, this.key, 'streak').setVisible(false);
      originOf(rocket, 'streak');
      rocket
        .setRotation(-Math.PI / 2)
        .setAlpha(fw.alpha * 0.55)
        .setScale(0.5 * this.sparkScale, 0.6 * this.sparkScale);
      sky.fixtures.add(rocket);
      sky.fixtures.add(img);
      this.bursts.push({
        img,
        rocket,
        strip,
        frame: -1,
        alpha: -1,
        rocketTint: -1,
        plan: null,
        x: 0,
        popped: false,
        shown: false,
      });
    }
  }

  /**
   * e2e only: hides (or shows) the fireworks and stars at once — on a held frame too, whichever
   * of them that frame's turn would have updated — so a spec can grab the same held tick with and
   * without them.
   */
  private setHidden(on: boolean): void {
    this.hidden = on;
    const state = this.last;
    if (state === null) return;
    this.drawnHidden = on;
    this.updateStars(on ? 0 : this.starAlpha, this.drawnTick);
    if (this.fireworksOn) this.updateFireworks(state, this.drawnTick);
  }

  /** Nothing screen-fixed to fit. */
  layout(): void {
    // The view has no screen-fixed parts.
  }

  /** The delivered sheet arrived: the sparks and stars move over to it. */
  useSheet(img: HTMLImageElement): void {
    const key = ensureNyTexture(this.scene, img);
    if (key === this.key || key === NY_STANDIN) return;
    const k = nyMasterOf(this.scene.textures.get(key).getSourceImage().width);
    const ratio = this.sparkScale * k;
    this.key = key;
    for (const gr of this.stars)
      for (const c of gr.box.list as Phaser.GameObjects.Image[])
        c.setTexture(key, 'star').setScale(c.scaleX * ratio);
    this.buildFireworks();
  }

  /** Whether the delivered sheet (not the stand-in) is drawn. */
  get final(): boolean {
    return this.key === NEWYEAR_SHEET;
  }

  /** The hunt's length in ticks (the countdown starts lastSeconds before its end). */
  private durationOf(state: FeesdagState): number {
    const c = state.countdown;
    return c === undefined ? 1 : c.atTick + this.lastSeconds * TICKS_PER_SECOND;
  }

  /** One frame: the wash, the stars, the fireworks (sim time). */
  update(
    state: FeesdagState | undefined,
    _prev: FeesdagState | undefined,
    _alpha: number,
    tick: number,
  ): void {
    if (state === undefined) return;
    this.last = state;
    const p = Math.max(0, Math.min(1, tick / this.durationOf(state)));
    // Blue hour, in steps of 1 % (set only when it changes).
    const bh = this.look.blueHour;
    const wa = Math.round(bh.alpha * ramp(p, bh.from, bh.to) * 100) / 100;
    if (wa !== this.washAlpha) {
      this.washAlpha = wa;
      this.wash?.setAlpha(wa);
    }
    // The rest of the scene goes to blue hour with it (its art, props and far animals), in
    // 1/GROUND_STEPS steps of the same ramp (a slow ramp: no visible stepping), one changed
    // layer a frame.
    const d0 = performance.now();
    const gk = Math.round(ramp(p, bh.from, bh.to) * GROUND_STEPS) / GROUND_STEPS;
    if (gk !== this.groundK) {
      this.groundK = gk;
      this.dimGround(gk);
    }
    this.parallax.stepDim();
    this.dimMs += performance.now() - d0;
    // Stars: out over the hunt, each twinkling slowly on its own phase.
    const st = this.look.stars;
    this.starAlpha = st.alpha * ramp(p, st.from, st.to);
    const sa = this.hidden ? 0 : this.starAlpha;
    // Nothing below moves unless the sim tick (or a hide) moved: a held or repeated frame is free.
    if (tick === this.drawnTick && this.hidden === this.drawnHidden) return;
    // The stars and the fireworks take turns, a frame each (30 Hz at 60 fps: a burst's frame
    // lasts several render frames anyway); a hide or show updates both at once.
    const both = this.hidden !== this.drawnHidden;
    this.drawnTick = tick;
    this.drawnHidden = this.hidden;
    this.turn ^= 1;
    const s0 = performance.now();
    if (both || this.turn === 1) this.updateStars(sa, tick);
    const s1 = performance.now();
    this.starsMs += s1 - s0;
    if (this.fireworksOn && (both || this.turn === 0)) this.updateFireworks(state, tick);
    this.fxMs += performance.now() - s1;
  }

  /** The star groups' alphas (each its own slow phase), set only when they change. */
  private updateStars(sa: number, tick: number): void {
    const st = this.look.stars;
    const per = st.twinkleSeconds * TICKS_PER_SECOND;
    for (const gr of this.stars) {
      const tw = 0.65 + 0.35 * (SINE64[Math.floor(((tick / per + gr.phase) % 1) * 64) & 63] ?? 0);
      const a = Math.round(sa * tw * 64) / 64;
      if (a !== gr.alpha) {
        gr.alpha = a;
        gr.box.setAlpha(a);
        const vis = a > 0;
        if (gr.box.visible !== vis) gr.box.setVisible(vis);
      }
    }
  }

  /** Every listed layer's extra tint at blue-hour progress k (0 … 1); reused map, no garbage. */
  private dimGround(k: number): void {
    const g = this.look.blueHour.ground;
    const c = parseInt(g.color.slice(1), 16);
    for (const [id, f] of Object.entries(g.layers)) {
      const m = k * f;
      const ch = (shift: number): number => {
        const v = (c >> shift) & 0xff;
        return Math.round(255 + (v - 255) * m);
      };
      this.groundTint.set(id, (ch(16) << 16) | (ch(8) << 8) | ch(0));
    }
    this.parallax.dimLayers(this.groundTint);
  }

  /** The fireworks: new bursts from the slots passed since the last frame, then each burst. */
  private updateFireworks(state: FeesdagState, tick: number): void {
    const fw = this.look.fireworks;
    const slotTicks = Math.max(1, Math.round(TICKS_PER_SECOND / fw.maxPerSecond));
    const durTicks = Math.max(1, Math.round(fw.seconds * TICKS_PER_SECOND));
    const riseTicks = this.reduceFlashes ? 0 : Math.round(durTicks * 0.25);
    const counting = state.countdown?.active === true;
    let rate = counting ? fw.countdownPerSecond : fw.perSecond;
    if (this.lowTier) rate *= fw.lowTierScale;
    if (this.maxFireworks) rate = fw.maxPerSecond;
    const slot = Math.floor(tick / slotTicks);
    // A jump (a resumed hunt, the first frame) starts at the current slot.
    if (this.lastSlot < 0 || slot - this.lastSlot > 4) this.lastSlot = slot - 1;
    const sky = this.parallax.layer(SKY);
    for (let s = this.lastSlot + 1; s <= slot; s++) {
      const plan = burstInSlot(s, fw, rate);
      if (plan === null || !this.spacer.allows(plan.start)) continue;
      const free = this.bursts.find(
        (b) => b.plan === null || tick - b.plan.start >= durTicks + riseTicks,
      );
      if (free === undefined) continue;
      this.spacer.record(plan.start);
      free.plan = plan;
      free.popped = false;
      // Fixed on the sky where the view is now (it stays put as the view pans).
      const k = sky?.root.scaleX ?? 1;
      const half = designSize().width / 2;
      const centre = sky === undefined ? 0 : (half - sky.root.x) / k;
      free.x = centre + (plan.across * half * 0.92) / k;
      // A little variety: mirrored or not (a negative x scale), a slight turn, its own size and
      // colour (its strip): three calls.
      const scale = (plan.radius / BURST_R / BURST_CELL.scale) * this.sparkScale;
      const flip = hash01(plan.slot, 10) < 0.5 ? -1 : 1;
      free.img
        .setPosition(free.x, plan.y)
        .setScale(scale * flip, scale)
        .setRotation((hash01(plan.slot, 9) - 0.5) * 0.3);
      if (this.reduceFlashes) free.img.setTint(plan.colour);
      free.strip = FW_FRAMES[plan.colourIndex % FW_STRIPS] ?? free.strip;
      free.frame = -1;
      free.alpha = -1;
      this.starts.push(plan.start);
      if (this.starts.length > 400) this.starts.shift();
    }
    if (slot > this.lastSlot) this.lastSlot = slot;
    for (const b of this.bursts) this.drawBurst(b, tick, durTicks, riseTicks);
  }

  private drawBurst(b: Burst, tick: number, durTicks: number, riseTicks: number): void {
    const fw = this.look.fireworks;
    const plan = b.plan;
    const age = plan === null ? -1 : tick - plan.start;
    const live = plan !== null && age >= 0 && age < riseTicks + durTicks && !this.hidden;
    if (!live) {
      if (b.shown) {
        b.shown = false;
        b.rocket.setVisible(false);
        b.img.setVisible(false);
      }
      return;
    }
    b.shown = true;
    // The rocket: a dim short streak climbing to the burst's height (its tint only when the
    // colour changes).
    if (age < riseTicks) {
      const k = age / Math.max(1, riseTicks);
      if (!b.rocket.visible) {
        b.rocket.setVisible(true);
        if (b.rocketTint !== plan.colour) {
          b.rocketTint = plan.colour;
          b.rocket.setTint(plan.colour);
        }
      }
      b.rocket.setPosition(b.x, plan.y + fw.rise * (1 - k));
      return;
    }
    if (b.rocket.visible) b.rocket.setVisible(false);
    if (!b.popped) {
      b.popped = true;
      const sky = this.parallax.layer(SKY);
      if (!this.reduceFlashes && sky !== undefined)
        this.pops.push(sky.root.x + b.x * sky.root.scaleX);
    }
    const t = (age - riseTicks) / durTicks;
    if (!b.img.visible) b.img.setVisible(true);
    if (this.reduceFlashes) {
      // Only a twinkle where the burst hangs: no growth, no core, dim (never brighter than the sky).
      const a = Math.round(fw.twinkleAlpha * Math.sin(t * Math.PI) * 64) / 64;
      if (a !== b.alpha) {
        b.alpha = a;
        b.img.alpha = a;
      }
      return;
    }
    // The baked burst: its frame for this age (fireworkMath BURST_T), the fade baked in.
    const f = burstFrameAt(t);
    if (f !== b.frame) {
      b.frame = f;
      b.img.setFrame(b.strip[f] ?? 'fw_0_0');
    }
  }

  /** The sting at the start; the distant pops. */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    for (const e of events) if (e.type === 'feesdagStarted') playNySound(audio, 'sting', 0);
    const half = width / 2;
    for (const x of this.pops) playNySound(audio, 'pop', ((x - half) / half) * 0.3);
    this.pops.length = 0;
  }

  /** e2e hook: the specials' things (none on New Year). */
  spots(): { id: number; kind: string; x: number; y: number; dark: boolean }[] {
    return [];
  }

  /** e2e hook: the look as drawn now. */
  newYear(): NewYearHook {
    const sky = this.parallax.layer(SKY);
    const k = sky?.root.scaleX ?? 1;
    const ox = sky?.root.x ?? 0;
    const oy = sky?.root.y ?? 0;
    return {
      sheet: this.final ? 'standard' : 'standin',
      blueHour: Math.max(0, this.washAlpha),
      stars: this.starCount,
      starAlpha: Math.round(this.starAlpha * 100) / 100,
      bursts: this.bursts.flatMap((b) => {
        // Only a burst really drawn: the delivered sheet's baked frame (past the rocket), shown,
        // not nearly faded.
        if (!this.final || !b.shown || b.plan === null) return [];
        const s = b.img;
        if (!s.visible || (!this.reduceFlashes && b.frame < 0)) return [];
        // The alpha it is drawn at: the twinkle's, or the burst's fade baked into its frame.
        const alpha = this.reduceFlashes
          ? s.alpha
          : burstAlpha(this.look.fireworks, BURST_T[b.frame] ?? 0);
        if (alpha < 0.3 && !this.reduceFlashes) return [];
        return [
          {
            x: Math.round(ox + b.x * k),
            y: Math.round(oy + b.plan.y * k),
            r: Math.round(b.plan.radius * k),
            alpha: Math.round(alpha * 100) / 100,
            slot: b.plan.slot,
          },
        ];
      }),
      starts: [...this.starts],
      twinkle: this.reduceFlashes,
      countdown: this.last?.countdown ?? null,
    };
  }

  clear(): void {
    for (const b of this.bursts) {
      b.rocket.destroy();
      b.img.destroy();
    }
    this.bursts.length = 0;
    for (const gr of this.stars) gr.box.destroy();
    this.stars.length = 0;
    this.wash?.destroy();
  }
}

/** The sheet's size (design px), for the HD texture memory notes. */
export const NY_SHEET_PX = { w: NY_SHEET_W, h: NY_SHEET_H } as const;
