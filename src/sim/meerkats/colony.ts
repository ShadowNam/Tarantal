// v1.7 (D-044): meerkat colonies on the desert maps (GDD §11, Tech §3.12). Non-target ground
// animals: a family of 4–8 (sometimes with a pup) living in 3–5 burrows on low sand mounds. Each
// meerkat runs a small state machine (hidden → peek → emerge → sit / sentinel / forage /
// sunbathe / dash / dive); the colony reacts to nearby shots, alarms and hits, and lines up for
// the Familiefoto. Pure and deterministic: every random draw comes from the hunt's 'meerkats'
// stream, in colony then meerkat-id order; every number comes from birds.json `meerkats`.
import type { Biome, Colony as ColonyDef, MeerkatTuning } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth } from '../world';

/** The propId a Familiefoto's secretTriggered carries (it has no prop): the Bird Book key. */
export const FAMILIEFOTO_SECRET = 'familiefoto';

/** A biome with meerkat colonies on any of its maps (it has the Familiefoto secret). */
export function hasColonies(b: Pick<Biome, 'colonies' | 'layouts'>): boolean {
  return (b.colonies ?? []).length > 0 || b.layouts.some((l) => (l.colonies ?? []).length > 0);
}

/**
 * hidden (in a burrow) · peek (head out, looking left and right) · emerge (climbing out) · sit ·
 * sentinel (standing tall on the highest mound, turning its head) · forage (digging) · sunbathe
 * (belly to the sun) · run (to a spot, a sentinel post, another burrow or a hole) · stand (a
 * dash's halfway stop, standing to look) · dive (into a hole) · tumble (shot: rolls into the
 * nearest hole) · scold (head out of the hole, scolding) · photo (the Familiefoto row).
 */
export type MeerkatPose =
  | 'hidden'
  | 'peek'
  | 'emerge'
  | 'sit'
  | 'sentinel'
  | 'forage'
  | 'sunbathe'
  | 'run'
  | 'stand'
  | 'dive'
  | 'tumble'
  | 'scold'
  | 'photo';

/** Which hit shape a pose uses (null = can't be hit: underground, diving, tumbling, scolding). */
export type MeerkatShape = 'tall' | 'low' | 'peek';

export function shapeOf(pose: MeerkatPose): MeerkatShape | null {
  switch (pose) {
    case 'peek':
      return 'peek';
    case 'sentinel':
    case 'stand':
    case 'photo':
    case 'emerge':
      return 'tall';
    case 'sit':
    case 'forage':
    case 'sunbathe':
    case 'run':
      return 'low';
    default:
      return null;
  }
}

/** Above ground (counts for "the whole family is out"). */
export function isOut(pose: MeerkatPose): boolean {
  const s = shapeOf(pose);
  return s !== null && s !== 'peek' && pose !== 'emerge';
}

/** What a running meerkat does when it gets there. */
type Then = 'sit' | 'sentinel' | 'forage' | 'sunbathe' | 'dive' | 'photo';

export interface Meerkat {
  readonly id: number;
  readonly pup: boolean;
  /** A pup's mother (an adult of the colony), else null. */
  readonly mother: number | null;
  /** The burrow it lives at now (index into the colony's burrows). */
  burrow: number;
  x: number;
  y: number;
  facing: 1 | -1;
  pose: MeerkatPose;
  /** Ticks in this pose, and how long the pose lasts (0 = until something ends it). */
  t: number;
  dur: number;
  /** Head turn: −1 left, 0 at the camera, +1 right (peek, sentinel, stand). */
  look: -1 | 0 | 1;
  /** Running: where to, what next, and (a dash) where to stop and look on the way. */
  goalX: number;
  then: Then;
  pauseX: number | null;
  /** Coming back after a scare: the next peek always ends with it coming out. */
  cautious: boolean;
  /** Shot: tumbling, then scolding; the colony's hiding doesn't hold it back. */
  shot: boolean;
}

export interface Burrow {
  /** Hole position on the colony's layer (design px). */
  readonly x: number;
  readonly y: number;
  readonly mound: number;
}

export type ColonyPhase = 'normal' | 'hiding' | 'scouting' | 'lineUp' | 'photo';

export interface ColonyState {
  readonly id: string;
  readonly layerId: string;
  readonly plane: PlaneId;
  readonly scrollFactor: number;
  /** The plane's scale (sizes, speeds). */
  readonly scale: number;
  /** Ground line of the mounds. */
  readonly ground: number;
  readonly burrows: readonly Burrow[];
  /** Index of the highest mound (the sentinel's post). */
  readonly post: number;
  /** Centre of the colony on its layer (mean of the holes). */
  readonly cx: number;
  readonly meerkats: Meerkat[];
  phase: ColonyPhase;
  /** Ticks left in the phase (hiding; line-up timeout; photo pose). */
  phaseTicks: number;
  /** The scout coming back first after a scare. */
  scout: number | null;
  sentinel: number | null;
  /** Ticks of the penalty cooldown. */
  cooldown: number;
  /** Ticks the player has held fire with this colony on screen. */
  hold: number;
  /** Fly-overs (bird ids) that have already set off an alarm here. */
  readonly alarmedBy: number[];
}

/** Events the colony module raises; Sim.ts turns them into SimEvents. */
export type ColonyNote =
  { readonly kind: 'scold'; readonly meerkat: Meerkat } | { readonly kind: 'photo' };

export interface ColonyCtx {
  readonly tuning: MeerkatTuning;
  readonly rng: RandomStream;
  /** The map's light allows sunbathing (an early-light layout). */
  readonly sunbathe: boolean;
  /** No shot for calmSeconds: the hidden come out sooner, and every peek ends outside. */
  readonly calm: boolean;
}

const ticks = (r: RandomStream, [a, b]: readonly [number, number]): number =>
  Math.max(1, secondsToTicks(r.range(a, b)));

/** Sets up a colony and its family (hunt start). */
export function createColony(
  def: ColonyDef,
  layer: { readonly id: string; readonly scrollFactor: number; readonly plane: PlaneId },
  scale: number,
  tuning: MeerkatTuning,
  rng: RandomStream,
  nextId: () => number,
  sunbathe: boolean,
): ColonyState {
  const ux = def.u * coreWidth(layer.scrollFactor);
  const burrows = def.burrows.map((b) => ({ x: ux + b.dx, y: def.y - b.mound, mound: b.mound }));
  let post = 0;
  burrows.forEach((b, i) => {
    if (b.mound > (burrows[post]?.mound ?? 0)) post = i;
  });
  const cx = burrows.reduce((s, b) => s + b.x, 0) / burrows.length;
  const c: ColonyState = {
    id: def.id,
    layerId: layer.id,
    plane: layer.plane,
    scrollFactor: layer.scrollFactor,
    scale,
    ground: def.y,
    burrows,
    post,
    cx,
    meerkats: [],
    phase: 'normal',
    phaseTicks: 0,
    scout: null,
    sentinel: null,
    cooldown: 0,
    hold: 0,
    alarmedBy: [],
  };
  const adults = rng.int(def.family[0], def.family[1]);
  const pup = rng.chance(tuning.pupChance);
  const ctx: ColonyCtx = { tuning, rng, sunbathe, calm: false };
  for (let i = 0; i < adults; i++) {
    const burrow = i % burrows.length;
    const hole = burrows[burrow] ?? { x: cx, y: def.y, mound: 0 };
    const m: Meerkat = {
      id: nextId(),
      pup: false,
      mother: null,
      burrow,
      x: hole.x,
      y: hole.y,
      facing: rng.chance(0.5) ? 1 : -1,
      pose: 'hidden',
      t: 0,
      dur: ticks(rng, tuning.hiddenSeconds),
      look: 0,
      goalX: hole.x,
      then: 'sit',
      pauseX: null,
      cautious: false,
      shot: false,
    };
    c.meerkats.push(m);
    if (rng.chance(tuning.startOutShare)) {
      const spot = hole.x + rng.range(-1, 1) * tuning.forageRadiusPx * scale;
      m.x = spacedSpot(c, m, spot, tuning);
      m.y = def.y;
      choose(c, m, ctx, ['sit', 'forage', 'sunbathe']);
    }
  }
  const mother = c.meerkats[0];
  if (pup && mother !== undefined) {
    c.meerkats.push({
      ...mother,
      id: nextId(),
      pup: true,
      mother: mother.id,
      x: mother.x - mother.facing * tuning.pupGapPx * scale,
      pose: mother.pose === 'hidden' ? 'hidden' : 'sit',
      dur: mother.pose === 'hidden' ? mother.dur + secondsToTicks(tuning.pup.startDelaySeconds) : 0,
      look: 0,
      cautious: false,
      shot: false,
    });
  }
  return c;
}

const holeOf = (c: ColonyState, m: Meerkat): Burrow =>
  c.burrows[m.burrow] ?? { x: c.cx, y: c.ground, mound: 0 };

/** The burrow nearest a layer x. */
export function nearestBurrow(c: ColonyState, x: number): number {
  let best = 0;
  c.burrows.forEach((b, i) => {
    if (Math.abs(b.x - x) < Math.abs((c.burrows[best]?.x ?? 0) - x)) best = i;
  });
  return best;
}

function setPose(m: Meerkat, pose: MeerkatPose, dur: number): void {
  m.pose = pose;
  m.t = 0;
  m.dur = dur;
  if (pose !== 'peek' && pose !== 'sentinel' && pose !== 'stand') m.look = 0;
}

/**
 * The nearest spot to `x` that keeps spacingBodyMul body widths from every other adult that is
 * out (where it stands, or where a runner will next stand: its dash's halfway stop, else its
 * goal); `x` itself when nothing is that close, or when no such spot is found. Pups keep to their
 * mothers and are left out.
 */
export function spacedSpot(c: ColonyState, m: Meerkat, x: number, T: MeerkatTuning): number {
  const min = T.bodyWidthPx * T.spacingBodyMul * c.scale;
  const taken: number[] = [];
  for (const o of c.meerkats) {
    if (o === m || o.pup || o.shot) continue;
    if (o.pose === 'hidden' || o.pose === 'peek' || o.pose === 'dive' || o.pose === 'tumble')
      continue;
    if (o.pose === 'run' && o.then === 'dive') continue;
    taken.push(o.pose === 'run' ? (o.pauseX ?? o.goalX) : o.x);
  }
  // A small epsilon: a spot exactly `min` away counts as clear.
  const clear = (p: number): boolean => taken.every((t) => Math.abs(p - t) >= min - 1e-6);
  if (clear(x)) return x;
  let best: number | null = null;
  for (const t of taken) {
    for (const p of [t - min, t + min]) {
      if (clear(p) && (best === null || Math.abs(p - x) < Math.abs(best - x))) best = p;
    }
  }
  return best ?? x;
}

/** The sentinel takes the highest mound: adults settled too close to it step aside (around
 *  it, not under it), and one standing there in a dash runs on. */
function makeRoom(c: ColonyState, sentinel: Meerkat, x: number, T: MeerkatTuning): void {
  const min = T.bodyWidthPx * T.spacingBodyMul * c.scale;
  const near = (p: number): boolean => Math.abs(p - x) < min - 1e-6;
  for (const o of c.meerkats) {
    if (o === sentinel || o.pup || o.shot) continue;
    if (o.pose === 'run') {
      // On the way to a place by the post: a halfway stop or a goal elsewhere.
      if (o.pauseX !== null && near(o.pauseX)) o.pauseX = spacedSpot(c, o, o.pauseX, T);
      else if (o.then !== 'dive' && o.then !== 'sentinel' && near(o.goalX))
        o.goalX = spacedSpot(c, o, o.goalX, T);
      continue;
    }
    if (!near(o.x)) continue;
    if (o.pose === 'sit' || o.pose === 'forage' || o.pose === 'sunbathe') {
      runTo(o, spacedSpot(c, o, o.x, T), o.pose);
    } else if (o.pose === 'stand') o.t = o.dur;
  }
}

function runTo(m: Meerkat, x: number, then: Then, pauseX: number | null = null): void {
  m.goalX = x;
  m.then = then;
  m.pauseX = pauseX;
  if (Math.abs(x - m.x) > 0.5) m.facing = x > m.x ? 1 : -1;
  setPose(m, 'run', 0);
}

/** Starts what a running meerkat was running to (or an activity in place). */
function arrive(c: ColonyState, m: Meerkat, ctx: ColonyCtx, then: Then): void {
  const T = ctx.tuning;
  // Settling down (sit, forage, sunbathe) too close to another adult: a step aside first. The
  // spot is clear of every other's place and goal, so this ends there.
  if (!m.pup && (then === 'sit' || then === 'forage' || then === 'sunbathe')) {
    const spot = spacedSpot(c, m, m.x, T);
    if (Math.abs(spot - m.x) > 0.5) {
      runTo(m, spot, then);
      return;
    }
    // D-049: a spot under half a px away is taken exactly (smaller meerkats on the mid plane
    // could otherwise sit a fraction inside the spacing rule).
    m.x = spot;
  }
  switch (then) {
    case 'dive':
      m.burrow = nearestBurrow(c, m.x);
      m.x = holeOf(c, m).x;
      m.y = holeOf(c, m).y;
      setPose(m, 'dive', Math.max(1, secondsToTicks(T.diveSeconds)));
      return;
    case 'sentinel': {
      const post = c.burrows[c.post] ?? holeOf(c, m);
      m.x = post.x;
      m.y = post.y;
      setPose(m, 'sentinel', ticks(ctx.rng, T.activitySeconds.sentinel));
      m.look = 0;
      return;
    }
    case 'photo':
      m.y = c.ground;
      m.facing = 1;
      setPose(m, 'photo', 0);
      return;
    case 'forage':
      m.y = c.ground;
      setPose(m, 'forage', ticks(ctx.rng, T.activitySeconds.forage));
      return;
    case 'sunbathe':
      m.y = c.ground;
      setPose(m, 'sunbathe', ticks(ctx.rng, T.activitySeconds.sunbathe));
      return;
    case 'sit':
      m.y = c.ground;
      setPose(m, 'sit', ticks(ctx.rng, T.activitySeconds.sit));
      return;
  }
}

type Activity = 'sit' | 'sentinel' | 'forage' | 'sunbathe' | 'dash' | 'dive';
const ACTIVITIES: readonly Activity[] = ['sit', 'sentinel', 'forage', 'sunbathe', 'dash', 'dive'];

/** An adult above ground picks what to do next (weights from content). */
function choose(
  c: ColonyState,
  m: Meerkat,
  ctx: ColonyCtx,
  only: readonly Activity[] = ACTIVITIES,
): void {
  const T = ctx.tuning;
  const allowed = only.filter(
    (a) =>
      !(a === 'sentinel' && c.sentinel !== null) &&
      !(a === 'sunbathe' && !ctx.sunbathe) &&
      T.activities[a] > 0,
  );
  const total = allowed.reduce((s, a) => s + T.activities[a], 0);
  let pick: Activity = 'sit';
  if (total > 0) {
    let r = ctx.rng.range(0, total);
    for (const a of allowed) {
      r -= T.activities[a];
      pick = a;
      if (r < 0) break;
    }
  }
  const hole = holeOf(c, m);
  switch (pick) {
    case 'sit':
    case 'sunbathe':
      arrive(c, m, ctx, pick);
      return;
    case 'forage':
      runTo(
        m,
        spacedSpot(c, m, hole.x + ctx.rng.range(-1, 1) * T.forageRadiusPx * c.scale, T),
        'forage',
      );
      return;
    case 'sentinel': {
      c.sentinel = m.id;
      const post = c.burrows[c.post] ?? hole;
      runTo(m, post.x, 'sentinel');
      makeRoom(c, m, post.x, T);
      return;
    }
    case 'dive':
      runTo(m, hole.x, 'dive');
      return;
    case 'dash':
      dash(c, m, ctx);
      return;
  }
}

/** 1–4 (the leader and calm neighbours) run in a file to another burrow, tails up, about a body
 *  length apart, stopping halfway to stand and look (exported for its test). */
export function dash(c: ColonyState, leader: Meerkat, ctx: ColonyCtx): void {
  const T = ctx.tuning;
  const others = c.burrows.map((_, i) => i).filter((i) => i !== leader.burrow);
  const to = others[ctx.rng.int(0, others.length - 1)] ?? leader.burrow;
  const target = c.burrows[to];
  if (target === undefined) {
    arrive(c, leader, ctx, 'sit');
    return;
  }
  const want = ctx.rng.int(T.dash.group[0], T.dash.group[1]);
  const calmNow = c.meerkats.filter(
    (o) =>
      o.id !== leader.id &&
      !o.pup &&
      o.id !== c.sentinel &&
      (o.pose === 'sit' || o.pose === 'forage' || o.pose === 'sunbathe'),
  );
  // The line: the leader, then the nearest calm ones.
  calmNow.sort((a, b) => Math.abs(a.x - leader.x) - Math.abs(b.x - leader.x) || a.id - b.id);
  const line = [leader, ...calmNow.slice(0, want - 1)];
  const dir = target.x >= leader.x ? 1 : -1;
  // Nose to tail: about one body length apart.
  const gap = T.bodyWidthPx * T.dash.gapBodyMul * c.scale;
  const mid = (leader.x + target.x) / 2;
  line.forEach((m, i) => {
    m.burrow = to;
    runTo(m, target.x - dir * gap * i, 'sit', mid - dir * gap * i);
    m.facing = dir;
  });
  // The halfway stop is a place to stand: clear of the others standing (the file's own stops are
  // a body length apart already).
  for (const m of line) if (m.pauseX !== null) m.pauseX = spacedSpot(c, m, m.pauseX, T);
}

/** A pup follows its mother: out when she is out, down when she goes down. */
function stepPup(c: ColonyState, p: Meerkat, ctx: ColonyCtx): void {
  const mum = c.meerkats.find((m) => m.id === p.mother);
  if (mum === undefined || p.shot) return;
  const T = ctx.tuning;
  const mumOut = isOut(mum.pose);
  if (c.phase === 'photo' || c.phase === 'lineUp') return;
  if (!mumOut) {
    if (p.pose === 'hidden' || p.pose === 'dive') return;
    if (p.pose === 'run' && p.then === 'dive') return;
    p.burrow = nearestBurrow(c, p.x);
    runTo(p, holeOf(c, p).x, 'dive');
    return;
  }
  if (p.pose === 'hidden') {
    // Comes up a moment after its mother, at her burrow.
    if (p.t < secondsToTicks(T.pup.emergeDelaySeconds)) return;
    p.burrow = mum.burrow;
    p.x = holeOf(c, p).x;
    p.y = holeOf(c, p).y;
    setPose(p, 'emerge', Math.max(1, secondsToTicks(T.emergeSeconds)));
    return;
  }
  if (p.pose === 'emerge' || p.pose === 'dive') return;
  const want = mum.x - mum.facing * T.pupGapPx * c.scale;
  // Close by, but never inside her outline.
  const tooClose = Math.abs(mum.x - p.x) < T.bodyWidthPx * T.pup.minGapBodyMul * c.scale;
  if (tooClose || Math.abs(want - p.x) > T.pupGapPx * c.scale * T.pup.followSlack) {
    if (p.pose !== 'run' || Math.abs(p.goalX - want) > 2) runTo(p, want, 'sit');
  } else if (p.pose === 'run' && Math.abs(p.goalX - p.x) <= 1) {
    arrive(c, p, ctx, 'sit');
  }
}

/** Moves a running meerkat one tick: still going, there, or at its dash's halfway stop. */
function stepRun(
  c: ColonyState,
  m: Meerkat,
  T: MeerkatTuning,
  speedMul: number,
): 'going' | 'there' | 'halfway' {
  const v = (T.runPxPerSec * c.scale * (m.pup ? T.pupScale : 1) * speedMul) / 60;
  const d = m.goalX - m.x;
  const stop = m.pauseX;
  if (stop !== null && Math.abs(stop - m.x) <= v && Math.sign(stop - m.x) !== -Math.sign(d)) {
    m.x = stop;
    m.pauseX = null;
    return 'halfway';
  }
  if (Math.abs(d) <= v) {
    m.x = m.goalX;
    return 'there';
  }
  m.x += Math.sign(d) * v;
  m.facing = d > 0 ? 1 : -1;
  return 'going';
}

/** One creature tick of a colony (Boeretroos slows it like the birds). */
export function stepColony(c: ColonyState, ctx: ColonyCtx): ColonyNote[] {
  const T = ctx.tuning;
  const notes: ColonyNote[] = [];
  if (c.phase === 'hiding') {
    const busy = c.meerkats.some((m) => m.pose !== 'hidden' && !m.shot);
    if (c.phaseTicks > 0) c.phaseTicks--;
    else if (!busy) {
      // One head first: the lowest-id adult that is home peeks, looking left and right.
      const scout = c.meerkats.find((m) => !m.pup && m.pose === 'hidden' && !m.shot);
      if (scout !== undefined) {
        c.phase = 'scouting';
        c.scout = scout.id;
        scout.cautious = true;
        setPose(scout, 'peek', ticks(ctx.rng, T.peekSeconds));
      }
    }
  }
  for (const m of c.meerkats) {
    m.t++;
    // A shot pup tumbles into a hole and scolds like an adult, then follows its mother again.
    if (m.pup && m.shot) {
      stepAdult(c, m, ctx, notes);
      continue;
    }
    if (m.pup) {
      if (m.pose === 'run' && stepRun(c, m, T, 1) === 'there') arrive(c, m, ctx, m.then);
      else if (m.pose === 'dive' && m.t >= m.dur) setPose(m, 'hidden', 0);
      else if (m.pose === 'emerge' && m.t >= m.dur) arrive(c, m, ctx, 'sit');
      stepPup(c, m, ctx);
      continue;
    }
    stepAdult(c, m, ctx, notes);
  }
  if (c.phase === 'lineUp') {
    const ready = c.meerkats.every((m) => m.pose === 'photo');
    if (c.phaseTicks > 0) c.phaseTicks--;
    if (ready || c.phaseTicks <= 0) {
      for (const m of c.meerkats) {
        m.x = m.goalX;
        m.y = c.ground;
        m.facing = 1;
        setPose(m, 'photo', 0);
      }
      c.phase = 'photo';
      c.phaseTicks = Math.max(1, secondsToTicks(T.familiefoto.poseSeconds));
      notes.push({ kind: 'photo' });
    }
  } else if (c.phase === 'photo') {
    if (c.phaseTicks > 0) c.phaseTicks--;
    else {
      c.phase = 'normal';
      for (const m of c.meerkats) {
        m.burrow = nearestBurrow(c, m.x);
        if (!m.pup) arrive(c, m, ctx, 'sit');
        else setPose(m, 'sit', 0);
      }
    }
  }
  return notes;
}

function stepAdult(c: ColonyState, m: Meerkat, ctx: ColonyCtx, notes: ColonyNote[]): void {
  const T = ctx.tuning;
  const hole = holeOf(c, m);
  switch (m.pose) {
    case 'hidden': {
      if (m.shot) {
        if (m.t >= m.dur) {
          m.x = hole.x;
          m.y = hole.y;
          setPose(m, 'scold', Math.max(1, secondsToTicks(T.hit.scoldSeconds)));
          notes.push({ kind: 'scold', meerkat: m });
        }
        return;
      }
      if (c.phase !== 'normal') return;
      const due = ctx.calm ? Math.min(m.dur, secondsToTicks(T.hiddenSeconds[0])) : m.dur;
      if (m.t < due) return;
      m.x = hole.x;
      m.y = hole.y;
      setPose(m, 'peek', ticks(ctx.rng, T.peekSeconds));
      return;
    }
    case 'peek': {
      // Looks left, then right, then decides.
      m.look = m.t < m.dur / 2 ? -1 : 1;
      if (m.t < m.dur) return;
      const out = m.cautious || ctx.calm || ctx.rng.chance(T.emergeChance);
      if (out) {
        setPose(m, 'emerge', Math.max(1, secondsToTicks(T.emergeSeconds)));
        if (c.phase === 'scouting' && c.scout === m.id) comeBack(c, ctx);
      } else setPose(m, 'hidden', ticks(ctx.rng, T.hiddenSeconds));
      m.cautious = false;
      return;
    }
    case 'emerge':
      if (m.t >= m.dur) {
        m.y = c.ground;
        choose(c, m, ctx);
      }
      return;
    case 'run': {
      if (c.phase === 'lineUp' && m.then !== 'photo') return;
      const r = stepRun(c, m, T, m.then === 'dive' ? T.diveRunMul : 1);
      if (r === 'there') arrive(c, m, ctx, m.then);
      // A dash stops halfway: stand tall and look round before running on.
      else if (r === 'halfway') setPose(m, 'stand', ticks(ctx.rng, T.dash.pauseSeconds));
      return;
    }
    case 'stand':
      m.look = m.t < m.dur / 3 ? -1 : m.t < (2 * m.dur) / 3 ? 0 : 1;
      if (m.t >= m.dur) {
        m.facing = m.goalX >= m.x ? 1 : -1;
        setPose(m, 'run', 0);
      }
      return;
    case 'sentinel': {
      // Head turns: left, the camera, right, the camera …
      const turn = Math.max(1, secondsToTicks(T.lookSeconds));
      const step = Math.floor(m.t / turn) % 4;
      m.look = step === 0 ? -1 : step === 2 ? 1 : 0;
      if (m.t >= m.dur) {
        c.sentinel = null;
        choose(c, m, ctx, ['sit', 'forage', 'sunbathe', 'dash', 'dive']);
      }
      return;
    }
    case 'sit':
    case 'forage':
    case 'sunbathe':
      if (m.dur > 0 && m.t >= m.dur) choose(c, m, ctx);
      return;
    case 'dive':
      if (m.t >= m.dur) setPose(m, 'hidden', ticks(ctx.rng, T.hiddenSeconds));
      return;
    case 'tumble':
      // Rolls into the nearest hole.
      m.x += (hole.x - m.x) * Math.min(1, 1 / Math.max(1, m.dur - m.t));
      if (m.t >= m.dur) {
        m.x = hole.x;
        m.y = hole.y;
        setPose(m, 'hidden', Math.max(1, secondsToTicks(T.hit.scoldDelaySeconds)));
      }
      return;
    case 'scold':
      if (m.t >= m.dur) {
        m.shot = false;
        setPose(m, 'hidden', ticks(ctx.rng, T.hiddenSeconds));
      }
      return;
    case 'photo':
      return;
  }
}

/** The scout came out: the rest follow, a head at a time (staggered). */
function comeBack(c: ColonyState, ctx: ColonyCtx): void {
  c.phase = 'normal';
  c.scout = null;
  for (const m of c.meerkats) {
    if (m.pup || m.pose !== 'hidden' || m.shot) continue;
    m.cautious = true;
    const [a, b] = ctx.tuning.shotDive.staggerSeconds;
    setPose(m, 'hidden', Math.max(1, secondsToTicks(ctx.rng.range(a, b))));
  }
}

/** The colony dives: everyone above ground dashes for the nearest hole, and stays down for
 *  returnSeconds before a scout comes back. False when nobody was up to see it. */
export function diveColony(c: ColonyState, ctx: ColonyCtx): boolean {
  const T = ctx.tuning;
  let any = false;
  for (const m of c.meerkats) {
    if (m.shot) continue;
    if (m.pose === 'hidden' || m.pose === 'dive') {
      m.cautious = false;
      continue;
    }
    if (m.pose === 'run' && m.then === 'dive') {
      any = true;
      continue;
    }
    any = true;
    m.burrow = nearestBurrow(c, m.x);
    if (m.pose === 'peek' || m.pose === 'emerge' || m.pose === 'scold') {
      setPose(m, 'dive', Math.max(1, secondsToTicks(T.diveSeconds)));
    } else runTo(m, holeOf(c, m).x, 'dive');
  }
  c.sentinel = null;
  c.scout = null;
  c.hold = 0;
  const back = ticks(ctx.rng, T.shotDive.returnSeconds);
  c.phaseTicks = c.phase === 'hiding' ? Math.max(c.phaseTicks, back) : back;
  c.phase = 'hiding';
  return any;
}

/** A meerkat was shot: it tumbles into the nearest hole, then scolds (never hurt). */
export function hitMeerkat(c: ColonyState, m: Meerkat, T: MeerkatTuning): void {
  m.shot = true;
  m.burrow = nearestBurrow(c, m.x);
  if (c.sentinel === m.id) c.sentinel = null;
  setPose(m, 'tumble', Math.max(1, secondsToTicks(T.hit.tumbleSeconds)));
}

/** The whole family is above ground (a pup included). */
export function familyOut(c: ColonyState): boolean {
  return c.meerkats.every((m) => isOut(m.pose) && !m.shot);
}

/** The Familiefoto: everyone runs into a row facing the camera (the click comes when they
 *  stand in it, or after lineUpSeconds). */
export function lineUp(c: ColonyState, T: MeerkatTuning): void {
  const row = [...c.meerkats].sort((a, b) => Number(a.pup) - Number(b.pup) || a.id - b.id);
  const gap = T.familiefoto.rowGapPx * c.scale;
  row.forEach((m, i) => {
    runTo(m, c.cx + (i - (row.length - 1) / 2) * gap, 'photo');
  });
  c.sentinel = null;
  c.phase = 'lineUp';
  c.phaseTicks = Math.max(1, secondsToTicks(T.familiefoto.lineUpSeconds));
}
