// 1.9.4 (D-057, art bible §4.2c) The baobab's residents, as pure functions of the sim tick and the
// hunt's seed: when each one shows itself (a seeded hash per slot, never Math.random), and where
// it is and which frame it shows at a tick. A near shot (BaobabLifeView reads it from the event
// stream) makes one duck back into its hole, or fly off; that is the tick of the shot passed in
// here. Rendering only: nothing feeds back into the sim, so replays and held frames draw the same.
import type { Feel } from '../../../content/schemas';
import { TICKS_PER_SECOND } from '../../../sim/clock';
import { HOLLOWS, STICK_NESTS, squirrelPath, type BPt } from './baobabShape';
import type { ResidentFrame } from './residentSheet';

export type TreeLifeTuning = Feel['treeLife'];
export type ResidentId = Exclude<keyof TreeLifeTuning['residents'], '$comment'>;
export const RESIDENT_IDS: readonly ResidentId[] = [
  'galago',
  'squirrel',
  'owl',
  'hornbill',
  'buffaloWeaver',
];

/** One showing: ticks it starts and ends, and a seeded number for its variant (which nest…). */
export interface Visit {
  readonly id: ResidentId;
  readonly slot: number;
  readonly start: number;
  readonly end: number;
  readonly variant: number;
}

/** One sprite of a resident at a tick (prop px; frames face right, `flip` mirrors). */
export interface ResidentSprite {
  readonly frame: ResidentFrame;
  readonly x: number;
  readonly y: number;
  readonly flip: boolean;
  /** Radians (the squirrel follows its limb). */
  readonly rot: number;
  readonly alpha: number;
}

/** What a resident shows at a tick: its sprites (none: in its hole or away) and where it is (for
 *  a near shot: null when it can't be startled, e.g. inside the nest). */
export interface ResidentPose {
  readonly sprites: readonly ResidentSprite[];
  readonly at: BPt | null;
}

const HIDDEN: ResidentPose = { sprites: [], at: null };
const S = TICKS_PER_SECOND;

/** A small integer hash → [0, 1) (rendering only; never the sim's RNG streams). */
export function lifeHash(seed: number, a: number, b: number, c: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const v of [a, b, c]) {
    h = Math.imul(h ^ (v >>> 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h / 4294967296;
}

/**
 * The visit of resident `id` that covers `tick`, or null. Each slot of slotSeconds holds at most
 * one visit (chance, or duskChance for the bushbaby on dawn, dusk and golden light), placed at a
 * seeded point in its slot. `forced` (the test build's ?treeLife= preview) makes every slot a
 * visit that starts at the slot's start, so the resident is out almost all the time.
 */
export function visitAt(
  t: TreeLifeTuning,
  id: ResidentId,
  seed: number,
  tick: number,
  dusk: boolean,
  forced = false,
): Visit | null {
  const r = t.residents[id];
  const out = Math.round(r.outSeconds * S);
  const slotTicks = forced ? out + S : Math.max(out + S, Math.round(r.slotSeconds * S));
  const slot = Math.floor(Math.max(0, tick) / slotTicks);
  const idx = RESIDENT_IDS.indexOf(id);
  const chance = id === 'galago' && dusk ? t.residents.galago.duskChance : r.chance;
  if (!forced && lifeHash(seed, idx, slot, 1) >= chance) return null;
  const room = slotTicks - out;
  const start = slot * slotTicks + (forced ? 0 : Math.floor(lifeHash(seed, idx, slot, 2) * room));
  const end = start + out;
  if (tick < start || tick >= end) return null;
  return { id, slot, start, end, variant: lifeHash(seed, idx, slot, 3) };
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const flap = (tick: number, every: number): boolean => Math.floor(tick / every) % 2 === 0;

function sprite(frame: ResidentFrame, p: BPt, flip = false, alpha = 1, rot = 0): ResidentSprite {
  return { frame, x: p[0], y: p[1], flip, rot, alpha };
}

/** A flight from `a` to `b` over [0, 1] (a shallow arc), facing its way, wings beating. */
function flight(
  prefix: 'owl_fly' | 'hornbill_fly' | 'buffalo_fly',
  a: BPt,
  b: BPt,
  k: number,
  tick: number,
  alpha = 1,
): ResidentSprite {
  const e = ease(k);
  const lift = Math.sin(Math.PI * k) * -18;
  const p: BPt = [lerp(a[0], b[0], e), lerp(a[1], b[1], e) + lift];
  const frame = flap(tick, prefix === 'buffalo_fly' ? 3 : 6) ? `${prefix}_a` : `${prefix}_b`;
  return sprite(frame as ResidentFrame, p, b[0] < a[0], alpha);
}

// --- each resident's timeline (u: seconds into its visit) ---------------------------------

function galago(u: number, d: number, duck: number | null, dS: number): ResidentPose {
  const at: BPt = [HOLLOWS.galago.x, HOLLOWS.galago.y];
  const peek = (k: number): ResidentFrame =>
    k < 0.25 ? 'galago_ears' : k < 0.5 ? 'galago_eyes' : 'galago_out';
  if (duck !== null && u >= duck) {
    const k = (u - duck) / dS;
    if (k >= 1) return HIDDEN;
    return { sprites: [sprite(k < 0.5 ? 'galago_eyes' : 'galago_ears', at)], at: null };
  }
  const left = d - u;
  let frame: ResidentFrame;
  if (u < 0.5) frame = peek(u);
  else if (left < 0.5) frame = peek(left);
  else frame = Math.floor((u - 0.5) / 1.1) % 2 === 0 ? 'galago_out' : 'galago_look';
  return { sprites: [sprite(frame, at)], at };
}

/** The squirrel's place on its run at path share `s` (0 = its hole) and its heading. */
function onRun(s: number): { p: BPt; rot: number } {
  const path = squirrelPath();
  const f = Math.max(0, Math.min(1, s)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const a = path[i] as BPt;
  const b = path[i + 1] as BPt;
  const k = f - i;
  return {
    p: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)],
    rot: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}

const SQ = { peek: 0.4, up: 2, sit: 1.5, down: 1.8 } as const;

function squirrelShare(u: number): number {
  if (u < SQ.peek) return 0;
  if (u < SQ.peek + SQ.up) return (u - SQ.peek) / SQ.up;
  if (u < SQ.peek + SQ.up + SQ.sit) return 1;
  return Math.max(0, 1 - (u - SQ.peek - SQ.up - SQ.sit) / SQ.down);
}

function squirrel(u: number, d: number, duck: number | null, tick: number): ResidentPose {
  const hole: BPt = [HOLLOWS.squirrel.x, HOLLOWS.squirrel.y];
  const runAt = (s: number, back: boolean): ResidentPose => {
    const r = onRun(s);
    // Frames face right; heading up the limb (to the left) mirrors it.
    const goingLeft = back ? Math.cos(r.rot) > 0 : Math.cos(r.rot) < 0;
    const rot = goingLeft ? r.rot + Math.PI : r.rot;
    const frame: ResidentFrame = flap(tick, 4) ? 'squirrel_run_a' : 'squirrel_run_b';
    return { sprites: [sprite(frame, r.p, goingLeft, 1, rot)], at: r.p };
  };
  if (duck !== null && u >= duck) {
    // Back down the limb at a dash (0.6 s for the whole run), then into the hole.
    const s0 = squirrelShare(duck);
    const s = s0 - (u - duck) / 0.6;
    if (s > 0) return { ...runAt(s, true), at: null };
    return HIDDEN;
  }
  if (u < SQ.peek || u > d - 0.3) return { sprites: [sprite('squirrel_peek', hole)], at: hole };
  const t1 = SQ.peek + SQ.up;
  if (u < t1) return runAt((u - SQ.peek) / SQ.up, false);
  if (u < t1 + SQ.sit) {
    const r = onRun(1);
    const left = Math.cos(r.rot) < 0;
    return { sprites: [sprite('squirrel_sit', r.p, !left, 1, 0)], at: r.p };
  }
  return runAt(squirrelShare(u), true);
}

function owl(u: number, d: number, duck: number | null, tick: number): ResidentPose {
  const at: BPt = [HOLLOWS.owl.x, HOLLOWS.owl.y];
  if (duck !== null && u >= duck) {
    const k = (u - duck) / 1.4;
    if (k >= 1) return HIDDEN;
    const away: BPt = [at[0] - 190, at[1] - 150];
    return {
      sprites: [flight('owl_fly', at, away, k, tick, k > 0.7 ? (1 - k) / 0.3 : 1)],
      at: null,
    };
  }
  const alpha = Math.min(1, u / 0.5, (d - u) / 0.5);
  const c = u % 4.8;
  let frame: ResidentFrame = 'owl_front';
  let flip = false;
  if (c >= 1.2 && c < 2.2) frame = 'owl_left';
  else if (c >= 2.2 && c < 2.4) frame = 'owl_blink';
  else if (c >= 3.6 && c < 4.6) {
    frame = 'owl_left';
    flip = true;
  } else if (c >= 4.6) frame = 'owl_blink';
  return { sprites: [sprite(frame, at, flip, alpha)], at };
}

/** Where the hornbill clings: on the bark right of the slit, its beak reaching across. */
export const HORNBILL_CLING: BPt = [HOLLOWS.slit.x + 14, HOLLOWS.slit.y + 22];
const HB = { fly: 1.6, feed: 0.7, wait: 0.9 } as const;

function hornbill(u: number, d: number, duck: number | null, tick: number): ResidentPose {
  const from: BPt = [HORNBILL_CLING[0] + 200, HORNBILL_CLING[1] - 160];
  const to: BPt = [HORNBILL_CLING[0] + 230, HORNBILL_CLING[1] - 70];
  const slit: BPt = [HOLLOWS.slit.x, HOLLOWS.slit.y];
  const pose = (v: number): { s: ResidentSprite[]; at: BPt } => {
    if (v < HB.fly) {
      const sp = flight('hornbill_fly', from, HORNBILL_CLING, v / HB.fly, tick);
      return { s: [sp], at: [sp.x, sp.y] };
    }
    if (v > d - HB.fly) {
      const sp = flight('hornbill_fly', HORNBILL_CLING, to, (v - (d - HB.fly)) / HB.fly, tick);
      return { s: [sp], at: [sp.x, sp.y] };
    }
    const c = (v - HB.fly) % (HB.wait + HB.feed);
    const feeding = c >= HB.wait;
    const s = [sprite(feeding ? 'hornbill_feed' : 'hornbill_cling', HORNBILL_CLING, true)];
    // The female's beak tip shows in the slit while he feeds her.
    if (feeding) s.unshift(sprite('beak_tip', slit));
    return { s, at: HORNBILL_CLING };
  };
  if (duck !== null && u >= duck) {
    const k = (u - duck) / 1.4;
    if (k >= 1) return HIDDEN;
    const p = pose(duck).at;
    return {
      sprites: [flight('hornbill_fly', p, [p[0] + 210, p[1] - 140], k, tick)],
      at: null,
    };
  }
  const p = pose(u);
  return { sprites: p.s, at: p.at };
}

const BW = { fly: 1.2, perch: 1, inside: 1.4, out: 0.8 } as const;

function buffaloWeaver(
  u: number,
  d: number,
  duck: number | null,
  tick: number,
  variant: number,
): ResidentPose {
  const nest = STICK_NESTS[variant < 0.5 ? 0 : 1] ?? STICK_NESTS[0];
  if (nest === undefined) return HIDDEN;
  const door: BPt = [nest.x + nest.w * 0.12, nest.y + nest.h * 0.3];
  const dir = nest.x < 0 ? -1 : 1;
  const from: BPt = [door[0] + dir * 120, door[1] - 80];
  const to: BPt = [door[0] + dir * 140, door[1] - 40];
  const perched = sprite('buffalo_perch', door, dir > 0);
  const pose = (v: number): ResidentPose => {
    if (v < BW.fly) {
      const sp = flight('buffalo_fly', from, door, v / BW.fly, tick);
      return { sprites: [sp], at: [sp.x, sp.y] };
    }
    if (v < BW.fly + BW.perch) return { sprites: [perched], at: door };
    if (v < BW.fly + BW.perch + BW.inside) return HIDDEN;
    if (v < BW.fly + BW.perch + BW.inside + BW.out) return { sprites: [perched], at: door };
    const k = (v - (d - BW.fly)) / BW.fly;
    if (k < 0) return { sprites: [perched], at: door };
    const sp = flight('buffalo_fly', door, to, Math.min(1, k), tick);
    return { sprites: [sp], at: [sp.x, sp.y] };
  };
  if (duck !== null && u >= duck) {
    const k = (u - duck) / 1;
    const p = pose(duck).at;
    if (k >= 1 || p === null) return HIDDEN;
    return {
      sprites: [flight('buffalo_fly', p, [p[0] + dir * 130, p[1] - 90], k, tick)],
      at: null,
    };
  }
  return pose(u);
}

/**
 * Resident `v.id` at `tick` during its visit `v`; `duckTick` is the tick of a near shot during
 * this visit (null: none).
 */
export function residentPose(
  t: TreeLifeTuning,
  v: Visit,
  tick: number,
  duckTick: number | null,
): ResidentPose {
  const u = (tick - v.start) / S;
  const d = (v.end - v.start) / S;
  const duck = duckTick === null ? null : (duckTick - v.start) / S;
  switch (v.id) {
    case 'galago':
      return galago(u, d, duck, t.duckSeconds);
    case 'squirrel':
      return squirrel(u, d, duck, tick);
    case 'owl':
      return owl(u, d, duck, tick);
    case 'hornbill':
      return hornbill(u, d, duck, tick);
    case 'buffaloWeaver':
      return buffaloWeaver(u, d, duck, tick, v.variant);
  }
}

/**
 * The bees at their crack at `tick`: each on its own swirl (seeded radius, phase and speed);
 * for scatterSeconds after a near shot (`scatterTick`) the swirl opens up scatterMul times wider.
 * Reduce motion: half the bees, at half the speed.
 */
export function beeSprites(
  t: TreeLifeTuning,
  seed: number,
  tick: number,
  scatterTick: number | null,
  reduced: boolean,
): ResidentSprite[] {
  const b = t.bees;
  const crack: BPt = [HOLLOWS.bees.x, HOLLOWS.bees.y];
  const secs = tick / S;
  let wide = 1;
  if (scatterTick !== null) {
    const k = (tick - scatterTick) / S / b.scatterSeconds;
    if (k >= 0 && k < 1) wide = 1 + (b.scatterMul - 1) * Math.sin(Math.PI * Math.sqrt(k));
  }
  const n = reduced ? Math.ceil(b.count / 2) : b.count;
  const hz = b.swirlHz * (reduced ? 0.5 : 1);
  const out: ResidentSprite[] = [];
  for (let i = 0; i < n; i++) {
    const r0 = lifeHash(seed, 40, i, 1);
    const r = lerp(b.radiusPx[0], b.radiusPx[1], r0) * wide;
    const dirn = lifeHash(seed, 40, i, 2) < 0.5 ? -1 : 1;
    const a = lifeHash(seed, 40, i, 3) * Math.PI * 2 + dirn * secs * hz * Math.PI * 2 * (0.7 + r0);
    const wob = Math.sin(secs * 7.3 + i * 1.7) * 1.5;
    out.push(sprite('bee', [crack[0] + Math.cos(a) * r, crack[1] + Math.sin(a) * r * 0.6 + wob]));
  }
  return out;
}
