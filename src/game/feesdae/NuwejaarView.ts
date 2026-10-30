// D-065: how the New Year countdown looks and sounds in the hunt — the warm dusk deepening to blue
// hour over the hunt (a wash over the sky layer) with the stars coming out, small fireworks low
// over the far horizon (on the sky layer, behind the far ridge: a few at a time, more in the
// countdown), and guineafowl in small striped party hats. Phone-cheap: a fixed pool of sprites
// made once (pool × sparks + a rocket each), no allocation per frame, properties set only when
// they change; everything runs on sim time (a held frame holds it); never a large flash: each
// burst is a few small sparks, at most fireworks.maxPerSecond (≤ 3) start a second, fewer on the
// low tier, and with "reduce flashes" they only twinkle, dimmer than the sky.
// Part of the lazy feesdae chunk; the art is the "feesdae-newyear" group's sheet (Standard in
// HD); until it arrives a tiny stand-in (the spark and the star only) keeps the fireworks and
// stars, and no hats are drawn.
import * as Phaser from 'phaser';
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
} from './newyearAssets';
import anchorsJson from './hatAnchors.json';
import { nyKeyIn, nyMasterOf } from './newyearKeys';
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

/** A stable 0..1 hash of an integer and a salt. */
export function hash01(n: number, salt: number): number {
  let h = Math.imul(n ^ Math.imul(salt, 0x27d4eb2d), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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
  return {
    start: slot * slotTicks + Math.floor(hash01(slot, 2) * slotTicks * 0.5),
    across: hash01(slot, 3) * 1.7 - 0.85,
    y: fw.y[0] + hash01(slot, 4) * (fw.y[1] - fw.y[0]),
    radius: fw.radius[0] + hash01(slot, 5) * (fw.radius[1] - fw.radius[0]),
    colour: colours[Math.floor(hash01(slot, 6) * colours.length) % colours.length] ?? 0xffffff,
    slot,
  };
}

interface Burst {
  readonly sparks: Phaser.GameObjects.Image[];
  readonly rocket: Phaser.GameObjects.Image;
  /** The small bright core at the centre as it opens. */
  readonly core: Phaser.GameObjects.Image;
  plan: BurstPlan | null;
  /** Layer x of its centre (fixed when it starts: it stays put on the sky as the view pans). */
  x: number;
  popped: boolean;
  shown: boolean;
}

interface Star {
  readonly img: Phaser.GameObjects.Image;
  readonly phase: number;
  readonly bright: number;
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
  private readonly stars: Star[] = [];
  private readonly wash: Phaser.GameObjects.Rectangle | null;
  private readonly fireworksOn: boolean;
  private readonly reduceFlashes: boolean;
  private readonly lowTier: boolean;
  private readonly maxFireworks: boolean;
  private readonly sparkScale: number;
  private last: FeesdagState | null = null;
  private lastSlot = -1;
  private washAlpha = -1;
  private starAlpha = -1;
  private hidden = false;
  private readonly starts: number[] = [];
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
    // Stars: made once, spread over the sky (any aspect ratio), a fixed pattern from the index.
    if (d.decorations.includes('stars') && sky !== undefined) {
      const st = d.look.stars;
      for (let i = 0; i < st.count; i++) {
        const x = -1200 + hash01(i, 11) * (width + 2400);
        const y = st.y[0] + hash01(i, 12) * (st.y[1] - st.y[0]);
        const img = d.scene.add.image(x, y, this.key, 'star').setAlpha(0);
        img.setScale((0.6 + hash01(i, 13) * 0.7) * this.sparkScale);
        sky.fixtures.add(img);
        this.stars.push({ img, phase: hash01(i, 14), bright: 0.5 + hash01(i, 15) * 0.5 });
      }
    }
    // The fireworks' pool: made once (pool × sparks images and a rocket each), hidden until used.
    this.fireworksOn = d.decorations.includes('fireworks') && sky !== undefined;
    if (this.fireworksOn && sky !== undefined) {
      const fw = d.look.fireworks;
      for (let b = 0; b < fw.pool; b++) {
        // Streaks along their rays (glowing: added light), or plain dots that only twinkle with
        // "reduce flashes".
        const frame = this.reduceFlashes ? 'spark' : 'streak';
        const blend = this.reduceFlashes ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD;
        const sparks: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < fw.sparks; i++) {
          const img = d.scene.add
            .image(0, 0, this.key, frame)
            .setVisible(false)
            .setBlendMode(blend);
          originOf(img, frame);
          sky.fixtures.add(img);
          sparks.push(img);
        }
        const rocket = d.scene.add.image(0, 0, this.key, 'streak').setVisible(false);
        originOf(rocket, 'streak');
        rocket.setRotation(-Math.PI / 2);
        const core = d.scene.add
          .image(0, 0, this.key, 'spark')
          .setVisible(false)
          .setBlendMode(blend);
        sky.fixtures.add(rocket);
        sky.fixtures.add(core);
        this.bursts.push({ sparks, rocket, core, plan: null, x: 0, popped: false, shown: false });
      }
    }
    if (d.hooks === true)
      (window as { __TM_NY_HIDE__?: (on: boolean) => void }).__TM_NY_HIDE__ = (on) => {
        this.hidden = on;
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
    for (const s of this.stars) s.img.setTexture(key, 'star').setScale(s.img.scaleX * ratio);
    for (const b of this.bursts) {
      for (const sp of b.sparks) sp.setTexture(key, sp.frame.name);
      b.rocket.setTexture(key, 'streak');
      b.core.setTexture(key, 'spark');
    }
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
    if (this.wash !== null && wa !== this.washAlpha) {
      this.washAlpha = wa;
      this.wash.setAlpha(wa);
    }
    // Stars: out over the hunt, each twinkling slowly on its own phase.
    const st = this.look.stars;
    const sa = this.hidden ? 0 : st.alpha * ramp(p, st.from, st.to);
    this.starAlpha = sa;
    const per = st.twinkleSeconds * TICKS_PER_SECOND;
    for (const s of this.stars) {
      const tw = 0.65 + 0.35 * Math.sin(((tick / per + s.phase) % 1) * Math.PI * 2);
      const a = Math.round(sa * s.bright * tw * 50) / 50;
      if (s.img.alpha !== a) s.img.setAlpha(a);
      const vis = a > 0;
      if (s.img.visible !== vis) s.img.setVisible(vis);
    }
    if (this.fireworksOn) this.updateFireworks(state, tick);
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
      if (plan === null) continue;
      const free = this.bursts.find(
        (b) => b.plan === null || tick - b.plan.start >= durTicks + riseTicks,
      );
      if (free === undefined) continue;
      free.plan = plan;
      free.popped = false;
      // Fixed on the sky where the view is now (it stays put as the view pans).
      const k = sky?.root.scaleX ?? 1;
      const half = designSize().width / 2;
      const centre = sky === undefined ? 0 : (half - sky.root.x) / k;
      free.x = centre + (plan.across * half * 0.92) / k;
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
        b.core.setVisible(false);
        for (const s of b.sparks) s.setVisible(false);
      }
      return;
    }
    b.shown = true;
    const sc = this.sparkScale;
    // The rocket: a dim short streak climbing to the burst's height.
    if (age < riseTicks) {
      const k = age / Math.max(1, riseTicks);
      if (!b.rocket.visible) b.rocket.setVisible(true).setTint(plan.colour);
      b.rocket
        .setPosition(b.x, plan.y + fw.rise * (1 - k))
        .setAlpha(fw.alpha * 0.55)
        .setScale(0.5 * sc, 0.6 * sc);
      for (const s of b.sparks) if (s.visible) s.setVisible(false);
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
    const n = b.sparks.length;
    if (this.reduceFlashes) {
      // Only a twinkle where the burst hangs: no growth, no core, dim (never brighter than the sky).
      if (b.core.visible) b.core.setVisible(false);
      const a = fw.twinkleAlpha * Math.sin(t * Math.PI);
      for (let i = 0; i < n; i++) {
        const s = b.sparks[i];
        if (s === undefined) continue;
        const ang = (i / n) * Math.PI * 2;
        if (!s.visible)
          s.setVisible(true)
            .setTint(plan.colour)
            .setScale(0.35 * sc);
        s.setPosition(
          b.x + Math.cos(ang) * plan.radius * 0.5,
          plan.y + Math.sin(ang) * plan.radius * 0.5,
        ).setAlpha(a * (0.6 + 0.4 * hash01(i + plan.slot, 7)));
      }
      return;
    }
    // The core: a small bright puff at the centre as it opens (local: core.px across).
    const ct = t / fw.core.until;
    if (ct < 1) {
      if (!b.core.visible) b.core.setVisible(true).setTint(0xfff4d8);
      b.core
        .setPosition(b.x, plan.y)
        .setScale((fw.core.px / 16) * (0.6 + 0.4 * ct) * sc)
        .setAlpha(fw.core.alpha * (1 - ct));
    } else if (b.core.visible) b.core.setVisible(false);
    // The sparks: each on its own ray at its own speed, fast out then slowing (a streak that
    // shortens as it slows), drifting down, fading; in the second half they fall faster and
    // flicker like glitter. Every whiteEvery-th spark is white.
    const out = 1 - (1 - t) * (1 - t) * (1 - t);
    const speedNow = 3 * (1 - t) * (1 - t);
    const glitter = t > fw.glitterFrom;
    const gt = glitter ? (t - fw.glitterFrom) / (1 - fw.glitterFrom) : 0;
    const flick = Math.floor(tick / 3);
    for (let i = 0; i < n; i++) {
      const s = b.sparks[i];
      if (s === undefined) continue;
      const k = 0.55 + 0.45 * hash01(i * 31 + plan.slot, 8);
      const ang = (i / n) * Math.PI * 2 + plan.slot * 0.37 + (hash01(i, plan.slot) - 0.5) * 0.3;
      const r = plan.radius * k * out;
      const drop = plan.radius * (0.3 * t * t + 0.5 * gt * gt) * k;
      if (!s.visible) {
        const white = (i + plan.slot) % fw.whiteEvery === 0;
        s.setVisible(true).setTint(white ? 0xffffff : plan.colour);
      }
      // Along its ray while it flies; turning downward as it falls.
      const dx = Math.cos(ang) * speedNow;
      const dy = Math.sin(ang) * speedNow + 0.6 * t;
      const len = Math.min(1, Math.hypot(dx, dy) / 3) * (fw.trail / 34) * k + 0.25;
      let a = fw.alpha * (1 - t) ** 1.2;
      if (glitter && hash01(flick + i * 7, plan.slot) < 0.35) a *= 0.25;
      s.setPosition(b.x + Math.cos(ang) * r, plan.y + Math.sin(ang) * r + drop)
        .setRotation(Math.atan2(dy, dx))
        .setScale(len * sc, (1.3 - 0.5 * t) * sc)
        .setAlpha(a);
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
      stars: this.stars.length,
      starAlpha: Math.round(this.starAlpha * 100) / 100,
      bursts: this.bursts.flatMap((b) => {
        if (!b.shown || b.plan === null) return [];
        const s = b.sparks[0];
        if (s?.visible !== true) return [];
        return [
          {
            x: Math.round(ox + b.x * k),
            y: Math.round(oy + b.plan.y * k),
            r: Math.round(b.plan.radius * k),
            alpha: Math.round(s.alpha * 100) / 100,
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
      for (const s of b.sparks) s.destroy();
    }
    this.bursts.length = 0;
    for (const s of this.stars) s.img.destroy();
    this.stars.length = 0;
    this.wash?.destroy();
  }
}

/** The sheet's size (design px), for the HD texture memory notes. */
export const NY_SHEET_PX = { w: NY_SHEET_W, h: NY_SHEET_H } as const;
