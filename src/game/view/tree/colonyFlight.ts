// 1.9.4 (D-057, art bible §4.3b) Life round a sociable-weaver colony, as pure functions of the
// sim tick and the hunt's seed: weavers dart out of the entrance holes under the nest, loop near
// the tree, perch on the branches and the thatch roof, hop and peck on the ground below, and go
// back in; a pygmy falcon perches at the nest now and then; in Namibië a pair of rosy-faced
// lovebirds sits on a branch. A near shot (or the nest shot: a weaver burst) scatters them; they
// trickle back a few seconds later. Rendering only: nothing here feeds back into the sim.
// Coordinates are px relative to the nest tree's prop position on its layer.
import type { Feel } from '../../../content/schemas';
import { TICKS_PER_SECOND } from '../../../sim/clock';
import { lifeHash } from './baobabResidents';
import type { ColonyFrame } from './colonySheet';

export type ColonyTuning = Feel['treeLife']['colony'];
type P = readonly [number, number];

/** The colony as the view sees it. */
export interface ColonyNest {
  /** The nest part's ellipse (content secret.part.shape), relative to the prop. */
  readonly ox: number;
  readonly oy: number;
  readonly rx: number;
  readonly ry: number;
  /** Ground y under the tree, relative to the prop. */
  readonly foot: number;
  /** The plane's scale (motion sizes and the birds' size scale with it). */
  readonly scale: number;
  /** How many weavers live round it (the plane's count; reduce motion halves it). */
  readonly birds: number;
  /** Namibië: the lovebird pair. */
  readonly lovebirds: boolean;
  /** A per-nest number mixed into the seed (two colonies never move alike). */
  readonly salt: number;
  /** Where the pygmy falcon perches (its feet, prop px): a branch against the sky. */
  readonly falcon?: P;
}

/**
 * Review R5: the pygmy falcon's perch on each nest tree's art (prop px; tools/art/camelthorn.ts
 * draws these trees from fixed seeds): a branch with open sky behind it, clear of the thatch.
 */
export const COLONY_FALCON_PERCH: Readonly<Record<string, P>> = {
  'kalahari/weaver_camelthorn': [176, -127],
  'namibie/nest_camelthorn': [282, -205],
};

/** A scatter: a near shot (or the nest shot) at `start`; the colony stays away until `end`. */
export interface Scatter {
  readonly start: number;
  readonly end: number;
}

export interface ColonyPose {
  readonly frame: ColonyFrame;
  readonly x: number;
  readonly y: number;
  readonly flip: boolean;
  readonly alpha: number;
}

const S = TICKS_PER_SECOND;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Entrance hole `k` of 6 in the nest's flat underside. */
export function entrance(n: ColonyNest, k: number): P {
  const u = ((k % 6) + 0.5) / 6 - 0.5;
  return [n.ox + u * n.rx * 1.5, n.oy + n.ry * (0.62 + 0.12 * Math.sin(k * 2.1))];
}

/** Perches: along the thatch roof, on the branches either side, under the nest. */
export function perches(n: ColonyNest): P[] {
  const out: P[] = [];
  for (const f of [-0.7, -0.35, 0, 0.35, 0.7]) out.push([n.ox + f * n.rx, n.oy - n.ry * 0.95]);
  for (const s of [-1, 1]) {
    out.push([n.ox + s * n.rx * 1.12, n.oy - n.ry * 0.35]);
    out.push([n.ox + s * n.rx * 0.95, n.oy + n.ry * 0.95]);
  }
  return out;
}

type Activity = 'inside' | 'perch' | 'ground' | 'loop';

/** One bird's cycle `c`: its length (s), start (s), activity and where it goes. */
function cycle(t: ColonyTuning, n: ColonyNest, seed: number, i: number, c: number) {
  const h = (k: number): number => lifeHash(seed ^ n.salt, 60 + i, c, k);
  const len = lerp(t.cycleSeconds[0], t.cycleSeconds[1], h(1));
  const r = h(2);
  const out = 1 - t.insideShare;
  const act: Activity =
    r < t.insideShare
      ? 'inside'
      : r < t.insideShare + out * t.perchShare
        ? 'perch'
        : r < t.insideShare + out * (t.perchShare + t.groundShare)
          ? 'ground'
          : 'loop';
  const hole = entrance(n, Math.floor(h(3) * 6));
  const ps = perches(n);
  const perch = ps[Math.floor(h(4) * ps.length)] ?? hole;
  const ground: P = [n.ox + (h(5) - 0.5) * n.rx * 2.2, n.foot];
  const fly = lerp(t.flightSeconds[0], t.flightSeconds[1], h(6));
  const dir = h(7) < 0.5 ? -1 : 1;
  // Review R4: loops in the open sky under the nest, either side of the trunk(s).
  const sky: P = [n.ox + dir * n.rx * lerp(0.75, 1.4, h(9)), n.oy + n.ry * lerp(1.8, 4.4, h(10))];
  const loopR = n.ry * lerp(0.55, 0.9, h(11));
  return { len, act, hole, perch, ground, fly, dir, v: h(8), sky, loopR };
}

/** The tick bird `i`'s cycles are laid from: a seeded offset so the colony is never in step. */
function phase(t: ColonyTuning, n: ColonyNest, seed: number, i: number): number {
  return lifeHash(seed ^ n.salt, 50, i, 1) * t.cycleSeconds[1];
}

/** Which cycle bird `i` is in at `secs`, and how far into it. Cycles are laid end to end. */
function cycleAt(t: ColonyTuning, n: ColonyNest, seed: number, i: number, secs: number) {
  // Cycles vary in length; walk them from a known anchor every 16 cycles (bounded work).
  const avg = (t.cycleSeconds[0] + t.cycleSeconds[1]) / 2;
  const s = secs + phase(t, n, seed, i);
  const block = Math.floor(s / (avg * 16));
  let start = block * avg * 16;
  let c = block * 16;
  for (;;) {
    const cy = cycle(t, n, seed, i, c);
    // The last cycle of a block stretches or shrinks to end on the next anchor.
    const len = c % 16 === 15 ? (block + 1) * avg * 16 - start : cy.len;
    if (s < start + len || len <= 0) return { cy, u: s - start, len: Math.max(len, 0.01) };
    start += len;
    c++;
  }
}

function flyFrame(tick: number, every: number, glide: boolean): ColonyFrame {
  if (glide) return 'weaver_glide';
  return Math.floor(tick / every) % 2 === 0 ? 'weaver_fly_a' : 'weaver_fly_b';
}

/** A dart from `a` to `b` over k ∈ [0, 1]: out of the hole downward first, an optional loop. */
function dart(a: P, b: P, k: number, loopR: number, drop: number): P {
  const e = ease(k);
  const x = lerp(a[0], b[0], e);
  const y = lerp(a[1], b[1], e) + Math.sin(Math.PI * k) * drop;
  if (loopR === 0) return [x, y];
  const w = Math.sin(Math.PI * k);
  return [
    x + Math.sin(k * Math.PI * 2) * loopR * w,
    y - (1 - Math.cos(k * Math.PI * 2)) * loopR * 0.6 * w,
  ];
}

/** Weaver `i` at `tick` (null: inside the nest or away). */
export function weaverAt(
  t: ColonyTuning,
  n: ColonyNest,
  seed: number,
  i: number,
  tick: number,
  scatter: Scatter | null,
  reduced: boolean,
): ColonyPose | null {
  if (i >= n.birds) return null;
  const slow = reduced ? t.reducedSlowMul : 1;
  if (scatter !== null && tick >= scatter.start) {
    const back = scatter.end + lifeHash(seed ^ n.salt, 70, i, 1) * t.trickleSeconds * S;
    if (tick < back + S) {
      const was = weaverAt(t, n, seed, i, scatter.start, null, reduced);
      // Away from the nest, from wherever it was (a bird inside comes out of its hole).
      const from: P = was === null ? entrance(n, i) : [was.x, was.y];
      const side =
        from[0] === n.ox ? (lifeHash(seed, 71, i, 1) < 0.5 ? -1 : 1) : Math.sign(from[0] - n.ox);
      const away: P = [
        from[0] + side * (n.rx * 0.8 + 260 * n.scale),
        Math.min(from[1], n.oy) - n.ry - (120 + lifeHash(seed, 71, i, 2) * 160) * n.scale,
      ];
      const k = (tick - scatter.start) / (t.flightSeconds[1] * S);
      if (was !== null && k < 1) {
        const p = dart([was.x, was.y], away, k, 0, 0);
        return {
          frame: flyFrame(tick, 2, false),
          x: p[0],
          y: p[1],
          flip: away[0] < was.x,
          alpha: k > 0.7 ? (1 - k) / 0.3 : 1,
        };
      }
      // Trickling back: from away into a hole.
      if (tick >= back) {
        const hole = entrance(n, i);
        const kb = (tick - back) / S;
        const p = dart(away, hole, kb, 0, -20 * n.scale);
        return {
          frame: flyFrame(tick, 3, kb > 0.7),
          x: p[0],
          y: p[1],
          flip: hole[0] < away[0],
          alpha: Math.min(1, kb * 4),
        };
      }
      return null;
    }
  }
  const { cy, u, len } = cycleAt(t, n, seed, i, tick / S / slow);
  if (cy.act === 'inside') return null;
  const fly = cy.fly;
  const hold = len - fly * 2;
  if (hold <= 0) return null;
  const target: P = cy.act === 'perch' ? cy.perch : cy.act === 'ground' ? cy.ground : cy.sky;
  const loopR = cy.act === 'loop' ? 34 * n.scale : cy.v < 0.3 ? 16 * n.scale : 0;
  if (u < fly) {
    const p = dart(cy.hole, target, u / fly, loopR, 18 * n.scale);
    return {
      frame: flyFrame(tick, 3, u / fly > 0.75),
      x: p[0],
      y: p[1],
      flip: target[0] < cy.hole[0],
      alpha: 1,
    };
  }
  if (u > len - fly) {
    const k = (u - (len - fly)) / fly;
    const p = dart(target, cy.hole, k, loopR * 0.6, 12 * n.scale);
    return {
      frame: flyFrame(tick, 3, k > 0.8),
      x: p[0],
      y: p[1],
      flip: cy.hole[0] < target[0],
      alpha: 1,
    };
  }
  const h = u - fly;
  if (cy.act === 'loop') {
    // Loops round and round against the open sky (a whole number of turns, ~2.4 s each, so it
    // leaves where it came in).
    const turns = Math.max(1, Math.round(hold / 2.4));
    const a = (h / hold) * turns * Math.PI * 2;
    const r = cy.loopR;
    // Each bird on its own phase of the loop (never a column of birds in step); the loop
    // passes through `target`, where it came in and leaves.
    const a0 = cy.v * Math.PI * 2;
    const p: P = [
      target[0] + (Math.sin(a + a0) - Math.sin(a0)) * r * cy.dir,
      target[1] - (Math.cos(a0) - Math.cos(a + a0)) * r * 0.6,
    ];
    return {
      frame: flyFrame(tick, 3, Math.cos(a) > 0.6),
      x: p[0],
      y: p[1],
      flip: Math.cos(a) * cy.dir < 0,
      alpha: 1,
    };
  }
  if (cy.act === 'ground') {
    // Hops along the sand, pecking now and then.
    const step = Math.floor(h / 0.45);
    const hopK = (h % 0.45) / 0.45;
    const dir = lifeHash(seed, 72, i, step) < 0.5 ? -1 : 1;
    let x = target[0];
    for (let k = 0; k < step; k++) x += (lifeHash(seed, 72, i, k) < 0.5 ? -1 : 1) * 7 * n.scale;
    const pecking = lifeHash(seed, 73, i, step) < 0.35;
    if (pecking) return { frame: 'weaver_peck', x, y: target[1], flip: dir < 0, alpha: 1 };
    const y = target[1] - Math.sin(Math.PI * hopK) * 6 * n.scale;
    return {
      frame: hopK > 0.1 && hopK < 0.9 ? 'weaver_hop' : 'weaver_perch',
      x: x + dir * 7 * n.scale * hopK,
      y,
      flip: dir < 0,
      alpha: 1,
    };
  }
  // Perched: turns now and then.
  const turn = Math.floor(h / 1.3) % 2 === 0;
  return { frame: 'weaver_perch', x: target[0], y: target[1], flip: turn !== cy.dir < 0, alpha: 1 };
}

/** The pygmy falcon: now and then, perched at an entrance or on a branch, looking round. */
export function falconAt(
  t: ColonyTuning,
  n: ColonyNest,
  seed: number,
  tick: number,
  scatter: Scatter | null,
  forced = false,
): ColonyPose | null {
  const f = t.falcon;
  const out = Math.round(f.outSeconds * S);
  const slotTicks = forced ? out + S : Math.max(out + S, Math.round(f.slotSeconds * S));
  const slot = Math.floor(tick / slotTicks);
  if (!forced && lifeHash(seed ^ n.salt, 80, slot, 1) >= f.chance) return null;
  const start =
    slot * slotTicks +
    (forced ? 0 : Math.floor(lifeHash(seed ^ n.salt, 80, slot, 2) * (slotTicks - out)));
  if (tick < start || tick >= start + out) return null;
  const ps = perches(n);
  // Review R5: on its tree's branch against the sky (COLONY_FALCON_PERCH), else a side branch.
  const spot: P = n.falcon ?? ps[5] ?? entrance(n, 2);
  const from: P = [spot[0] + 200 * n.scale, spot[1] - 140 * n.scale];
  const to: P = [spot[0] - 220 * n.scale, spot[1] - 120 * n.scale];
  const u = (tick - start) / S;
  const fly = 1.2;
  // Wings beat while it climbs away or comes in; spread (b) as it glides the last stretch.
  const flapping = (k: number): ColonyFrame =>
    k < 0.8 && Math.floor(tick / 4) % 2 === 0 ? 'falcon_fly_a' : 'falcon_fly_b';
  if (scatter !== null && scatter.start >= start && tick >= scatter.start) {
    const k = (tick - scatter.start) / (1.4 * S);
    if (k >= 1) return null;
    const at = falconAt(t, n, seed, scatter.start, null, forced);
    if (at === null) return null;
    const p = dart([at.x, at.y], to, k, 0, 0);
    return { frame: flapping(k), x: p[0], y: p[1], flip: true, alpha: k > 0.7 ? (1 - k) / 0.3 : 1 };
  }
  // The test build's preview (?treeLife=falcon) keeps it on its perch the whole visit.
  if (u < fly && !forced) {
    const p = dart(from, spot, u / fly, 0, 0);
    return { frame: flapping(u / fly), x: p[0], y: p[1], flip: true, alpha: Math.min(1, u * 4) };
  }
  if (u > out / S - fly && !forced) {
    const k = (u - (out / S - fly)) / fly;
    const p = dart(spot, to, k, 0, 0);
    return { frame: flapping(k), x: p[0], y: p[1], flip: true, alpha: k > 0.8 ? (1 - k) / 0.2 : 1 };
  }
  const look = Math.floor(Math.max(0, u - fly) / 1.4) % 3;
  return {
    frame: look === 1 ? 'falcon_look' : 'falcon_perch',
    x: spot[0],
    y: spot[1],
    flip: look === 2,
    alpha: 1,
  };
}

/** Namibië: the lovebird pair on its branch; now and then they fly a round together. */
export function lovebirdsAt(
  t: ColonyTuning,
  n: ColonyNest,
  seed: number,
  tick: number,
  scatter: Scatter | null,
): ColonyPose[] {
  if (!n.lovebirds) return [];
  const branch: P = [n.ox - n.rx * 1.12, n.oy - n.ry * 0.35];
  const l = t.lovebirds;
  const slotTicks = Math.round(l.slotSeconds * S);
  // A seeded offset: the pair's rounds never start on the hunt's first tick.
  const at = tick + Math.floor(lifeHash(seed ^ n.salt, 90, 0, 1) * slotTicks);
  const u = (at % slotTicks) / S;
  const out: ColonyPose[] = [];
  const gone =
    scatter !== null && tick >= scatter.start && tick < scatter.end + t.trickleSeconds * S
      ? scatter
      : null;
  for (const k of [0, 1]) {
    const seat: P = [branch[0] + (k === 0 ? -8 : 8) * n.scale, branch[1]];
    if (gone !== null) {
      const kk = (tick - gone.start) / (1.2 * S);
      if (kk >= 1) continue;
      const p = dart(seat, [seat[0] - 240 * n.scale, seat[1] - 160 * n.scale], kk, 0, 0);
      out.push({
        frame: Math.floor(tick / 3 + k) % 2 === 0 ? 'lovebird_fly_a' : 'lovebird_fly_b',
        x: p[0],
        y: p[1],
        flip: true,
        alpha: 1 - Math.max(0, kk - 0.7) / 0.3,
      });
      continue;
    }
    if (u < l.flySeconds) {
      // A round together: out from the branch and back.
      const a = (u / l.flySeconds) * Math.PI * 2;
      const r = 70 * n.scale;
      const p: P = [
        seat[0] - Math.sin(a) * r * 1.4,
        seat[1] - (1 - Math.cos(a)) * r * 0.5 - k * 6 * n.scale,
      ];
      out.push({
        frame: Math.floor(tick / 3 + k) % 2 === 0 ? 'lovebird_fly_a' : 'lovebird_fly_b',
        x: p[0],
        y: p[1],
        flip: Math.cos(a) > 0,
        alpha: 1,
      });
      continue;
    }
    // Perched side by side, facing each other now and then.
    const facing = Math.floor(u / 2.2 + k) % 2 === 0;
    out.push({
      frame: 'lovebird_perch',
      x: seat[0],
      y: seat[1],
      flip: k === 0 ? !facing : facing,
      alpha: 1,
    });
  }
  return out;
}
