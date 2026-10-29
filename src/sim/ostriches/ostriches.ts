// v1.7d (D-059, GDD §11.3c, Tech §3.12b) Namibië's ostriches: a black-and-white male and a
// grey-brown female, most maps with their nest (a scrape with 8–15 cream eggs). Non-targets like
// the meerkats: never hurt, a hit costs the penalty with a cooldown, a nearby shot (or a loud
// gun) sends them running and they come back after a few seconds. On a nest one bird sits (the
// female by day) while the other stands guard; now and then they swap, and the male fans his
// wings in display. Pure and deterministic: every random draw comes from the hunt's 'ostriches'
// stream, in family then bird order; every number comes from birds.json `ostriches`.
import type { OstrichFamily, OstrichTuning } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth } from '../world';

/**
 * sit (on the nest; `look` turns the head) · stand (tall, still) · look (tall, turning the head)
 * · walk · peck · display (the male fans his wings) · run (full speed, wings half out) · hiss
 * (shot: wings up, neck low, hissing; then it runs).
 */
export type OstrichPose = 'sit' | 'stand' | 'look' | 'walk' | 'peck' | 'display' | 'run' | 'hiss';

/** What a walking or running bird does when it gets there. */
type Then = 'sit' | 'choose' | 'watch';

export interface Ostrich {
  readonly id: number;
  readonly male: boolean;
  x: number;
  facing: 1 | -1;
  pose: OstrichPose;
  /** Ticks in this pose, and how long it lasts (0 = until something ends it). */
  t: number;
  dur: number;
  /** Head turn for sit / look: −1 left, 0 ahead, +1 right. */
  look: -1 | 0 | 1;
  goalX: number;
  then: Then;
  /** The bird whose turn it is on the nest (the other guards). */
  sitter: boolean;
}

export interface OstrichFamilyState {
  readonly id: string;
  readonly layerId: string;
  readonly plane: PlaneId;
  readonly scrollFactor: number;
  readonly scale: number;
  readonly ground: number;
  /** The nest scrape (layer px), or null for a pair without one. */
  readonly nest: { readonly x: number; readonly eggs: number; readonly id: number } | null;
  /** Wandering bounds (layer px). */
  readonly left: number;
  readonly right: number;
  readonly birds: Ostrich[];
  /** Ticks to the next nest swap (nest families). */
  swapIn: number;
  /** Ticks of the penalty cooldown. */
  cooldown: number;
  /** Ticks until the family settles after a scare (0 = calm). */
  scared: number;
}

/** Things the module reports; Sim.ts turns them into SimEvents. */
export type OstrichNote =
  | { readonly kind: 'display'; readonly bird: Ostrich }
  | { readonly kind: 'swap'; readonly bird: Ostrich }
  | { readonly kind: 'back'; readonly bird: Ostrich };

export interface OstrichCtx {
  readonly tuning: OstrichTuning;
  readonly rng: RandomStream;
}

const ticks = (r: RandomStream, [a, b]: readonly [number, number]): number =>
  Math.max(1, secondsToTicks(r.range(a, b)));

/** The two hit shapes of a pose (null: none, e.g. never — every pose can be hit). */
export function shapesOf(
  pose: OstrichPose,
  T: OstrichTuning,
): readonly { rx: number; ry: number; ox: number; oy: number }[] {
  const h = pose === 'sit' ? T.hitboxes.sit : T.hitboxes.stand;
  return [h.body, h.neck];
}

function setPose(b: Ostrich, pose: OstrichPose, dur: number): void {
  b.pose = pose;
  b.t = 0;
  b.dur = dur;
}

function walkTo(b: Ostrich, x: number, then: Then, run = false): void {
  b.goalX = x;
  b.then = then;
  b.facing = x >= b.x ? 1 : -1;
  setPose(b, run ? 'run' : 'walk', 0);
}

/** Sets up a family at hunt start. */
export function createFamily(
  def: OstrichFamily,
  layer: { readonly id: string; readonly scrollFactor: number; readonly plane: PlaneId },
  scale: number,
  T: OstrichTuning,
  rng: RandomStream,
  nextId: () => number,
): OstrichFamilyState {
  const w = coreWidth(layer.scrollFactor);
  const cx = def.u * w;
  const reach = def.rangePx * scale;
  const left = Math.max(0, cx - reach);
  const right = Math.min(w, cx + reach);
  const nest = def.nest ? { x: cx, eggs: rng.int(T.eggs[0], T.eggs[1]), id: nextId() } : null;
  const f: OstrichFamilyState = {
    id: def.id,
    layerId: layer.id,
    plane: layer.plane,
    scrollFactor: layer.scrollFactor,
    scale,
    ground: def.y,
    nest,
    left,
    right,
    birds: [],
    swapIn: nest === null ? 0 : ticks(rng, T.swapSeconds),
    cooldown: 0,
    scared: 0,
  };
  for (const male of [true, false]) {
    // The female sits first (by day); the male guards a little way off.
    const sitter = nest !== null && !male;
    const gap = T.guardRadiusPx * scale * rng.range(0.4, 1);
    const x = sitter ? cx : Math.min(right, Math.max(left, cx + (rng.chance(0.5) ? gap : -gap)));
    const b: Ostrich = {
      id: nextId(),
      male,
      x,
      facing: rng.chance(0.5) ? 1 : -1,
      pose: sitter ? 'sit' : 'stand',
      t: 0,
      dur: sitter ? ticks(rng, T.sitLookSeconds) : ticks(rng, T.activitySeconds.stand),
      look: 0,
      goalX: x,
      then: 'choose',
      sitter,
    };
    f.birds.push(b);
  }
  return f;
}

/** A guard's next activity: wander, peck, look round, stand, or (the male) display. */
function choose(f: OstrichFamilyState, b: Ostrich, ctx: OstrichCtx): void {
  const T = ctx.tuning;
  const r = ctx.rng;
  const a = T.activities;
  const weights = [a.walk, a.peck, a.look, a.stand, b.male ? a.display : 0];
  const i = r.weightedIndex(weights);
  // Guards stay near the nest; a pair without one roams its whole range.
  const home = f.nest?.x ?? (f.left + f.right) / 2;
  const radius = f.nest === null ? (f.right - f.left) / 2 : T.guardRadiusPx * f.scale;
  if (i === 0) {
    const x = Math.min(f.right, Math.max(f.left, home + r.range(-radius, radius)));
    walkTo(b, x, 'choose');
  } else if (i === 1) setPose(b, 'peck', ticks(r, T.activitySeconds.peck));
  else if (i === 2) {
    setPose(b, 'look', ticks(r, T.activitySeconds.look));
    b.look = r.chance(0.5) ? 1 : -1;
  } else if (i === 3) setPose(b, 'stand', ticks(r, T.activitySeconds.stand));
  else setPose(b, 'display', ticks(r, T.activitySeconds.display));
}

/** Arrived where it was walking (or running) to. */
function arrive(f: OstrichFamilyState, b: Ostrich, ctx: OstrichCtx, notes: OstrichNote[]): void {
  const T = ctx.tuning;
  if (b.then === 'sit' && f.nest !== null) {
    const other = f.birds.find((o) => o !== b);
    b.x = f.nest.x;
    b.look = 0;
    if (!b.sitter && other !== undefined && other.sitter) {
      // Change of shift: the sitter stands up and goes off to guard.
      other.sitter = false;
      b.sitter = true;
      setPose(other, 'stand', ticks(ctx.rng, T.activitySeconds.stand));
      other.then = 'choose';
      f.swapIn = ticks(ctx.rng, T.swapSeconds);
      setPose(b, 'sit', ticks(ctx.rng, T.sitLookSeconds));
      notes.push({ kind: 'swap', bird: b });
      return;
    }
    setPose(b, 'sit', ticks(ctx.rng, T.sitLookSeconds));
    notes.push({ kind: 'back', bird: b });
    return;
  }
  if (b.then === 'watch') {
    setPose(b, 'look', ticks(ctx.rng, T.scare.watchSeconds));
    b.look = ctx.rng.chance(0.5) ? 1 : -1;
    return;
  }
  choose(f, b, ctx);
}

/** One tick of a family. */
export function stepFamily(f: OstrichFamilyState, ctx: OstrichCtx): OstrichNote[] {
  const T = ctx.tuning;
  const notes: OstrichNote[] = [];
  if (f.cooldown > 0) f.cooldown--;
  if (f.scared > 0) f.scared--;
  // The swap: when it is time, the guard walks to the nest (the change happens on arrival).
  if (f.nest !== null && f.scared === 0) {
    if (f.swapIn > 0) f.swapIn--;
    const sitter = f.birds.find((b) => b.sitter);
    const guard = f.birds.find((b) => !b.sitter);
    const heading = guard !== undefined && guard.then === 'sit' && guard.pose === 'walk';
    if (f.swapIn === 0 && sitter?.pose === 'sit' && guard !== undefined && !heading)
      walkTo(guard, f.nest.x, 'sit');
  }
  for (const b of f.birds) {
    b.t++;
    if (b.pose === 'walk' || b.pose === 'run') {
      const speed = (b.pose === 'run' ? T.runPxPerSec : T.walkPxPerSec) * f.scale;
      const step = speed / 60;
      const d = b.goalX - b.x;
      if (Math.abs(d) <= step) {
        b.x = b.goalX;
        arrive(f, b, ctx, notes);
      } else b.x += d > 0 ? step : -step;
      continue;
    }
    if (b.dur === 0 || b.t < b.dur) continue;
    // A timed pose is over.
    if (b.pose === 'sit') {
      // Sitting: turn the head now and then.
      b.look = b.look === 0 ? (ctx.rng.chance(0.5) ? 1 : -1) : 0;
      setPose(b, 'sit', ticks(ctx.rng, T.sitLookSeconds));
      continue;
    }
    if (b.pose === 'hiss') {
      // After the hiss it runs off (scareFamily set its goal).
      setPose(b, 'run', 0);
      continue;
    }
    if (b.pose === 'look' && b.then === 'watch') {
      // Settled after a scare: back to the nest (its sitter) or to guarding.
      b.then = 'choose';
      if (b.sitter && f.nest !== null) walkTo(b, f.nest.x, 'sit');
      else choose(f, b, ctx);
      continue;
    }
    const wasDisplay = b.pose === 'display';
    choose(f, b, ctx);
    if (b.pose === 'display' && !wasDisplay) notes.push({ kind: 'display', bird: b });
  }
  return notes;
}

/**
 * Sends a family running from x (layer px): each bird runs a short way at full speed away from
 * it, watches, then comes back. `hit` is the bird that was shot (it hisses first), if any.
 */
export function scareFamily(
  f: OstrichFamilyState,
  fromX: number,
  ctx: OstrichCtx,
  hit: Ostrich | null,
): void {
  const T = ctx.tuning;
  const r = ctx.rng;
  for (const b of f.birds) {
    const away: 1 | -1 = b.x === fromX ? (r.chance(0.5) ? 1 : -1) : b.x > fromX ? 1 : -1;
    const dist = T.runPxPerSec * f.scale * r.range(T.scare.runSeconds[0], T.scare.runSeconds[1]);
    let goal = b.x + away * dist;
    // Hemmed in at the edge of its range: run the other way.
    if (goal < f.left || goal > f.right) goal = b.x - away * dist;
    goal = Math.min(f.right, Math.max(f.left, goal));
    walkTo(b, goal, 'watch', true);
    if (b === hit) {
      setPose(b, 'hiss', secondsToTicks(T.hit.hissSeconds));
      b.facing = goal >= b.x ? 1 : -1;
    }
  }
  f.scared = secondsToTicks(T.scare.runSeconds[1] + T.scare.watchSeconds[1]);
}

/** The nest's hit shape centre and radii (layer px), or null. */
export function nestShape(
  f: OstrichFamilyState,
  T: OstrichTuning,
): { x: number; y: number; rx: number; ry: number } | null {
  if (f.nest === null) return null;
  const n = T.hitboxes.nest;
  return {
    x: f.nest.x + n.ox * f.scale,
    y: f.ground + n.oy * f.scale,
    rx: n.rx * f.scale,
    ry: n.ry * f.scale,
  };
}
