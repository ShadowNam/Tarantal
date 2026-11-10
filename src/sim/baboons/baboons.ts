// v1.8b (D-062, GDD §11.3d, Tech §3.12d) Bobbejane: chacma baboon troops. A troop of 5–10 keeps
// to a far ridge; since v1.16 (D-078) mostly out of sight behind the skyline and its rocks, one or
// two at a time peeking over the edge or a male sitting up on top as the sentinel. They are never
// targets up there (a hit on a mother costs points; any hit,
// or the Langloop's shot, sends the troop over the ridge and it comes back later). Every so often
// the lookout barks and one or two males climb down to raid a spot on the mid or near plane
// (steal Oupa's hat off the bakkie, raid a fruit tree, knock the tap, throw fruit at a flock…).
// A raider is a target: `hitsToBag` hits bag it. Pure and deterministic: every random draw comes
// from the hunt's 'baboons' stream in a fixed order; every number from birds.json `baboons`.
import type {
  BaboonDescent,
  BaboonMap,
  BaboonTuning,
  Biome,
  RaidAction,
  RaidSpot,
  Troop,
} from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth } from '../world';

export type BaboonRole = 'lookout' | 'male' | 'mother' | 'juvenile';

/**
 * v1.16 (D-078): on the ridge the troop keeps out of sight behind the skyline and its rocks (hide:
 * not drawn, not hittable), and one at a time a member rises to look over the edge (peek: head and
 * shoulders over the ridge, looking round, then ducking back) or a male climbs up to sit on top as
 * the sentinel for a while. bark: the lookout's "wa-hoo" before a raid (up on the edge) · down
 * (ducking over the ridge: to raid, or fleeing) · out (raiding, or away: not drawn, not hittable).
 */
export type RidgePose = 'hide' | 'peek' | 'sentinel' | 'bark' | 'down' | 'out';

export interface Baboon {
  readonly id: number;
  readonly role: BaboonRole;
  seat: number;
  x: number;
  y: number;
  facing: 1 | -1;
  pose: RidgePose;
  /** Ticks in this pose, and how long it lasts. */
  t: number;
  dur: number;
  /** Bagged on a raid: gone for the hunt. */
  gone: boolean;
}

/**
 * A raider's phase: approach (walking in) · act (doing its mischief) · leave (going back the way
 * it came) · flee (hit once, or scared: running off) · tumble (bagged: the fall, then gone).
 */
export type RaiderPhase = 'approach' | 'act' | 'leave' | 'flee' | 'tumble';

export interface Raider {
  readonly id: number;
  readonly troopId: string;
  x: number;
  readonly y: number;
  facing: 1 | -1;
  phase: RaiderPhase;
  t: number;
  dur: number;
  goalX: number;
  hits: number;
  /** Off the edge of the spot's reach (left or bagged): the raid lets it go. */
  done: boolean;
}

/** A raid spot as the hunt places it. */
export interface PlacedSpot {
  readonly id: string;
  readonly action: RaidAction;
  readonly layerId: string;
  readonly plane: PlaneId;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
  readonly from: 1 | -1;
  /** v1.18 (D-081): its layer's core width (for u). */
  readonly layerW: number;
}

/** warn (the lookout barks) · climb (the raiders climb down) · travel · on (raiders at the spot). */
export type RaidPhase = 'warn' | 'climb' | 'travel' | 'on';

export interface Raid {
  readonly id: number;
  readonly troopId: string;
  readonly spot: PlacedSpot;
  /** The members who go (their ridge selves are `out` from the climb on). */
  readonly memberIds: readonly number[];
  phase: RaidPhase;
  t: number;
  dur: number;
  raiders: Raider[];
  /** The mischief got done (the first raider finished its act). */
  completed: boolean;
  /** v1.18 (D-081): the map's raids come down in sight (`descent`): the raiders dash in. */
  readonly dash: boolean;
}

export interface TroopState {
  readonly id: string;
  readonly layerId: string;
  readonly plane: PlaneId;
  readonly scrollFactor: number;
  readonly scale: number;
  readonly cx: number;
  readonly seats: readonly { readonly x: number; readonly y: number }[];
  readonly members: Baboon[];
  /** The rock outcrop drawn under the troop (layer px: its middle and base), or null. */
  readonly rock: { readonly x: number; readonly y: number } | null;
  /** calm, or fled over the ridge (`awayLeft` ticks until it comes back). */
  fled: boolean;
  awayLeft: number;
  /** Ticks of the mother penalty's cooldown. */
  cooldown: number;
}

export interface BaboonsState {
  readonly troops: TroopState[];
  readonly spots: readonly PlacedSpot[];
  /** Raids per minute on this map. */
  readonly rate: number;
  raid: Raid | null;
  /** Ticks to the next raid's warning. */
  nextRaidIn: number;
  /** Raiders from finished raids, counting down to climbing back (member id → ticks). */
  readonly returning: { id: number; troopId: string; left: number }[];
  /** Raids so far (the next raid's id). */
  raids: number;
  /** v1.18 (D-081): the raids come down in sight (null: they climb down out of sight). */
  readonly descent: PlacedDescent | null;
  /** v1.18 (D-081, review): no more raids (the Harvest's Phase 2 has the field): see holdRaids. */
  held: boolean;
}

/** v1.18 (D-081): the map's descent with its layers' widths. */
export interface PlacedDescent {
  readonly cfg: BaboonDescent;
  readonly veldLayerId: string;
  readonly veldW: number;
}

/** v1.18 (D-081): a raider on its way down: on the troop's layer (climb) or the veld (run). */
export interface DescentPose {
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly pose: 'climb' | 'run';
}

/** Things the module reports; Sim.ts turns them into SimEvents. */
export type BaboonNote =
  | {
      readonly kind: 'warn';
      readonly troop: TroopState;
      readonly lookout: Baboon;
      readonly raid: Raid;
    }
  | { readonly kind: 'start'; readonly raid: Raid }
  | { readonly kind: 'done'; readonly raid: Raid; readonly raider: Raider }
  | { readonly kind: 'gone'; readonly raider: Raider };

export interface BaboonCtx {
  readonly tuning: BaboonTuning;
  readonly rng: RandomStream;
}

const ticks = (r: RandomStream, [a, b]: readonly [number, number]): number =>
  Math.max(1, secondsToTicks(r.range(a, b)));

/** A member's size against an adult male's. */
export function roleScale(role: BaboonRole, T: BaboonTuning): number {
  return role === 'mother' ? T.motherScale : role === 'juvenile' ? T.juvenileScale : 1;
}

type Layer = { readonly id: string; readonly scrollFactor: number };

/** The map's raid spots on their layers. `clear(s)`: the spot is usable on this map (not blocked
 *  by a secret, tell, colony or ostrich pair: spotClear.ts). */
export function placeSpots(
  biome: Biome,
  map: BaboonMap,
  planeScale: Readonly<Record<PlaneId, number>>,
  clear: (s: RaidSpot) => boolean = () => true,
): PlacedSpot[] {
  const out: PlacedSpot[] = [];
  for (const s of map.spots) {
    if (!clear(s)) continue;
    const p = spotPoint(biome, s);
    const layer = biome.layers.find((l) => l.id === s.layer);
    if (p === null || layer?.plane === undefined) continue;
    out.push({
      id: s.id,
      action: s.action,
      layerId: s.layer,
      plane: layer.plane,
      scale: planeScale[layer.plane],
      x: p.x,
      y: p.y,
      from: s.from,
      layerW: coreWidth(layer.scrollFactor),
    });
  }
  return out;
}

/** Where a spot is on its layer (null: its prop or layer is missing). */
export function spotPoint(biome: Biome, s: RaidSpot): { x: number; y: number } | null {
  const layer = biome.layers.find((l) => l.id === s.layer);
  if (layer === undefined) return null;
  const w = coreWidth(layer.scrollFactor);
  if (s.prop !== undefined) {
    const prop = biome.props.find((p) => p.id === s.prop);
    if (prop === undefined) return null;
    return { x: prop.u * w + s.ox, y: prop.y + s.y };
  }
  return { x: (s.u ?? 0.5) * w + s.ox, y: s.y };
}

/** The roles of a troop of n (the lookout first), from the content's ranges. */
function roles(n: number, T: BaboonTuning, rng: RandomStream): BaboonRole[] {
  let mothers = rng.int(T.troop.mothers[0], T.troop.mothers[1]);
  let juveniles = rng.int(T.troop.juveniles[0], T.troop.juveniles[1]);
  // At least one male besides the lookout (the raiders come from them).
  while (1 + mothers + juveniles + 1 > n && juveniles > 0) juveniles--;
  while (1 + mothers + juveniles + 1 > n && mothers > 0) mothers--;
  const males = n - 1 - mothers - juveniles;
  // Mothers choose their seats first (the highest), after the lookout's.
  const out: BaboonRole[] = ['lookout'];
  for (let i = 0; i < mothers; i++) out.push('mother');
  for (let i = 0; i < males; i++) out.push('male');
  for (let i = 0; i < juveniles; i++) out.push('juvenile');
  return out;
}

/** Sets up a troop at hunt start. */
export function createTroop(
  def: Troop,
  layer: Layer,
  scale: number,
  T: BaboonTuning,
  rng: RandomStream,
  nextId: () => number,
): TroopState {
  const cx = def.u * coreWidth(layer.scrollFactor);
  const seats = def.seats.map((s) => ({ x: cx + s.dx, y: s.y }));
  const n = rng.int(T.troop.size[0], Math.min(T.troop.size[1], seats.length));
  const free = seats.map((_, i) => i).filter((i) => i !== def.lookout);
  const troop: TroopState = {
    id: def.id,
    layerId: layer.id,
    plane: def.plane,
    scrollFactor: layer.scrollFactor,
    scale,
    cx,
    seats,
    members: [],
    rock: def.rock === undefined ? null : { x: cx, y: def.rock.y },
    fled: false,
    awayLeft: 0,
    cooldown: 0,
  };
  for (const role of roles(n, T, rng)) {
    let seat = def.lookout;
    if (role === 'mother') {
      // Mothers take the highest seats left (furthest from the far flocks below the ridge, so a
      // near miss at a bird lands on a male, never on a mother) and stay there.
      let k = 0;
      for (let i = 1; i < free.length; i++)
        if ((seats[free[i] ?? 0]?.y ?? 0) < (seats[free[k] ?? 0]?.y ?? 0)) k = i;
      seat = free[k] ?? 0;
      free.splice(k, 1);
    } else if (role !== 'lookout') {
      const k = rng.int(0, free.length - 1);
      seat = free[k] ?? 0;
      free.splice(k, 1);
    }
    const at = seats[seat] ?? { x: cx, y: 0 };
    troop.members.push({
      id: nextId(),
      role,
      seat,
      x: at.x,
      y: at.y,
      facing: rng.chance(0.5) ? 1 : -1,
      pose: 'hide',
      t: 0,
      // Staggered: each comes up for its first look at its own time.
      dur: ticks(rng, T.troop.hideSeconds),
      gone: false,
    });
  }
  return troop;
}

/** The hunt's troops (each drawn against its chance) and raid spots. */
export function createBaboons(
  biome: Biome,
  planeScale: Readonly<Record<PlaneId, number>>,
  ctx: BaboonCtx,
  nextId: () => number,
  clear: (s: RaidSpot) => boolean = () => true,
): BaboonsState | null {
  const map = biome.baboons;
  if (map === undefined) return null;
  const T = ctx.tuning;
  const troops: TroopState[] = [];
  for (const def of map.troops) {
    // One draw per troop, always (so a troop's chance never shifts the rest of the stream).
    const here = ctx.rng.next() < (def.chance ?? 1);
    const layer = biome.layers.find((l) => l.id === def.layer);
    if (!here || layer === undefined) continue;
    troops.push(createTroop(def, layer, planeScale[def.plane], T, ctx.rng, nextId));
  }
  if (troops.length === 0) return null;
  return {
    troops,
    spots: placeSpots(biome, map, planeScale, clear),
    rate: T.raids.perMinute * (map.raidsMul ?? 1),
    raid: null,
    nextRaidIn: ticks(ctx.rng, map.firstAfterSeconds ?? T.raids.firstAfterSeconds),
    returning: [],
    raids: 0,
    descent: placeDescent(biome, map),
    held: false,
  };
}

function placeDescent(biome: Biome, map: BaboonMap): PlacedDescent | null {
  const cfg = map.descent;
  if (cfg === undefined) return null;
  const veld = biome.layers.find((l) => l.id === cfg.veldLayer);
  if (veld === undefined) return null;
  return { cfg, veldLayerId: veld.id, veldW: coreWidth(veld.scrollFactor) };
}

/** v1.18 (D-081): the side of the troop the raid's spot is on (+1: right). */
function descentSide(troop: TroopState, spot: PlacedSpot): 1 | -1 {
  return spot.x / spot.layerW >= troop.cx / coreWidth(troop.scrollFactor) ? 1 : -1;
}

/**
 * v1.18 (D-081): a point on the zig-zag down the koppie at f (0 the seat, 1 the foot): `legs`
 * straight legs between turning points that swing swayPx either side of the line from the seat
 * to the foot (the ends on it). Pure arithmetic (no trig): the same on every engine.
 */
export function zigzag(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  legs: number,
  swayPx: number,
  f: number,
): { x: number; y: number; dx: number } {
  const k = Math.max(0, Math.min(1, f)) * legs;
  const i = Math.min(legs - 1, Math.floor(k));
  const turn = (j: number): { x: number; y: number } => {
    const g = j / legs;
    const off = j === 0 || j === legs ? 0 : j % 2 === 1 ? swayPx : -swayPx;
    return { x: from.x + (to.x - from.x) * g + off, y: from.y + (to.y - from.y) * g };
  };
  const a = turn(i);
  const b = turn(i + 1);
  const u = k - i;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, dx: b.x - a.x };
}

/** v1.18 (D-081): the u where a raid's approach on its spot starts. */
function approachU(spot: PlacedSpot, T: BaboonTuning): number {
  return (spot.x + spot.from * T.raids.approachPx * spot.scale) / spot.layerW;
}

/** v1.18 (D-081): ticks a raid's veld crossing takes (at least a second). */
function veldTicks(d: PlacedDescent, troop: TroopState, spot: PlacedSpot, T: BaboonTuning): number {
  const side = descentSide(troop, spot);
  const footU = (troop.cx + side * d.cfg.footDx) / coreWidth(troop.scrollFactor);
  const dist = Math.abs(approachU(spot, T) - footU) * d.veldW;
  return Math.max(60, secondsToTicks(dist / d.cfg.veldPxPerSec));
}

/**
 * v1.18 (D-081): where raider `index` of a raid that comes down in sight is now (null: not on
 * its way down: before the climb, or at the spot). The second one is pairLag of the way behind.
 */
export function descentPose(
  s: BaboonsState,
  raid: Raid,
  index: number,
  T: BaboonTuning,
): DescentPose | null {
  const d = s.descent;
  if (d === null || (raid.phase !== 'climb' && raid.phase !== 'travel')) return null;
  const troop = s.troops.find((t) => t.id === raid.troopId);
  const id = raid.memberIds[index];
  const m = troop?.members.find((x) => x.id === id);
  if (troop === undefined || m === undefined) return null;
  const lag = index * d.cfg.pairLag;
  const raw = raid.dur > 0 ? raid.t / raid.dur : 1;
  const f = Math.max(0, Math.min(1, (raw - lag) / (1 - lag)));
  const side = descentSide(troop, raid.spot);
  const foot = { x: troop.cx + side * d.cfg.footDx, y: d.cfg.footY };
  if (raid.phase === 'climb') {
    const seat = troop.seats[m.seat] ?? { x: m.x, y: m.y };
    const p = zigzag(seat, foot, d.cfg.legs, d.cfg.swayPx, f);
    return {
      layerId: troop.layerId,
      x: p.x,
      y: p.y,
      facing: p.dx === 0 ? side : p.dx > 0 ? 1 : -1,
      pose: 'climb',
    };
  }
  const x0 = (foot.x / coreWidth(troop.scrollFactor)) * d.veldW;
  const x1 = approachU(raid.spot, T) * d.veldW;
  return {
    layerId: d.veldLayerId,
    x: x0 + (x1 - x0) * f,
    y: d.cfg.veldY[0] + (d.cfg.veldY[1] - d.cfg.veldY[0]) * f,
    facing: x1 >= x0 ? 1 : -1,
    pose: 'run',
  };
}

function setPose(b: Baboon, pose: RidgePose, dur: number): void {
  b.pose = pose;
  b.t = 0;
  b.dur = dur;
}

const onRidge = (b: Baboon): boolean => !b.gone && b.pose !== 'out';

/** Shown over the ridge's edge (rising, up, or ducking back). */
export const memberVisible = (b: Baboon | { readonly pose: RidgePose }): boolean =>
  b.pose === 'peek' || b.pose === 'sentinel' || b.pose === 'bark' || b.pose === 'down';

/** How far up over the edge a member is (0: hidden behind it, 1: all the way up): it rises over
 *  riseTicks, and a peek or a sentinel ducks back over the last riseTicks of its time. */
export function riseOf(
  b: { readonly pose: RidgePose; readonly t: number; readonly dur: number },
  riseTicks: number,
): number {
  const r = Math.max(1, riseTicks);
  switch (b.pose) {
    case 'hide':
    case 'out':
      return 0;
    case 'down':
      return b.dur > 0 ? Math.max(0, 1 - b.t / b.dur) : 0;
    case 'bark':
      return Math.min(1, b.t / r);
    case 'peek':
    case 'sentinel':
      return Math.max(0, Math.min(1, b.t / r, b.dur > 0 ? (b.dur - b.t) / r : 1));
  }
}

/** Whether a member can be hit now: all the way up over the edge (rising, ducking and hidden ones
 *  are behind the ridge). */
export const memberPresent = (b: Baboon, riseTicks: number): boolean =>
  onRidge(b) && b.pose !== 'down' && riseOf(b, riseTicks) >= 1;

/** The hit stance of a ridge pose (a peek: head and shoulders over the edge). */
export function ridgeStance(pose: RidgePose): 'sit' | 'stand' | 'peek' {
  return pose === 'bark' ? 'stand' : pose === 'sentinel' ? 'sit' : 'peek';
}

/** The hit stance of a raider. */
export function raiderStance(r: Raider, action: RaidAction): 'sit' | 'walk' | 'stand' | null {
  if (r.phase === 'tumble') return null;
  if (r.phase !== 'act') return 'walk';
  return action === 'throw' || action === 'tap' || action === 'chase' ? 'stand' : 'sit';
}

/** Ridge members over the edge now (rising, up or ducking). */
export function visibleCount(troop: TroopState): number {
  let n = 0;
  for (const m of troop.members) if (!m.gone && memberVisible(m)) n++;
  return n;
}

/** A hidden member's next turn: up for a look (or, a male, to sit on top as the sentinel) when
 *  fewer than maxVisible are showing; else it stays down a while longer. While hidden it may
 *  creep to another free seat (the lookout and the mothers keep theirs). */
function choose(troop: TroopState, b: Baboon, ctx: BaboonCtx): void {
  const T = ctx.tuning.troop;
  const r = ctx.rng;
  // One draw for the seat and one for the turn, always (a fixed order in the stream).
  const move = r.next();
  const turn = r.next();
  if (b.role !== 'lookout' && b.role !== 'mother' && move < T.moveChance) {
    const free: number[] = [];
    for (let k = 0; k < troop.seats.length; k++)
      if (!troop.members.some((m) => !m.gone && m.seat === k)) free.push(k);
    if (free.length > 0) {
      const seat = free[Math.min(free.length - 1, Math.floor(move * free.length))] ?? b.seat;
      const to = troop.seats[seat] ?? { x: b.x, y: b.y };
      b.seat = seat;
      b.x = to.x;
      b.y = to.y;
    }
  }
  if (visibleCount(troop) >= T.maxVisible) {
    setPose(b, 'hide', ticks(r, T.hideSeconds));
    return;
  }
  const a = T.activities;
  const sentinel =
    b.role === 'lookout' ? a.sentinel * T.lookoutSentinelMul : b.role === 'male' ? a.sentinel : 0;
  const up = turn * (a.peek + sentinel) < sentinel ? 'sentinel' : 'peek';
  b.facing = r.chance(0.5) ? 1 : -1;
  setPose(b, up, ticks(r, up === 'sentinel' ? T.sentinelSeconds : T.peekSeconds));
}

function stepMember(troop: TroopState, b: Baboon, ctx: BaboonCtx): void {
  if (b.gone) return;
  b.t++;
  // Raiding and fleeing members are timed by the raid and the troop.
  if (b.pose === 'out' || b.pose === 'down' || b.pose === 'bark') return;
  if (b.t < b.dur) return;
  if (b.pose === 'hide') choose(troop, b, ctx);
  else setPose(b, 'hide', ticks(ctx.rng, ctx.tuning.troop.hideSeconds));
}

/** Sends a troop over the ridge (a hit, the Langloop, a raider hit). A raid still building up is
 *  called off; raiders already down flee. */
export function scareTroop(s: BaboonsState, troop: TroopState, ctx: BaboonCtx): void {
  const T = ctx.tuning;
  const raid = s.raid;
  if (raid !== null && raid.troopId === troop.id) {
    if (raid.phase === 'on') for (const r of raid.raiders) fleeRaider(r, raid.spot, T);
    else {
      // Called off: the raiders already out of sight come back with the troop later.
      s.raid = null;
      for (const b of troop.members)
        if (raid.memberIds.includes(b.id) && b.pose === 'out')
          s.returning.push({ id: b.id, troopId: troop.id, left: 1 });
    }
  }
  if (troop.fled) {
    troop.awayLeft = ticks(ctx.rng, T.troop.awaySeconds);
    return;
  }
  troop.fled = true;
  troop.awayLeft = ticks(ctx.rng, T.troop.awaySeconds);
  for (const b of troop.members) {
    if (!onRidge(b)) continue;
    // Those up on the edge duck back over it; the hidden ones are already out of sight.
    if (memberVisible(b)) setPose(b, 'down', Math.max(1, secondsToTicks(T.troop.climbSeconds)));
    else setPose(b, 'out', 0);
  }
}

/** A raider runs off toward the side it came from (hit once, or the troop fled). */
export function fleeRaider(r: Raider, spot: PlacedSpot, T: BaboonTuning): void {
  if (r.phase === 'tumble' || r.done) return;
  r.phase = 'flee';
  r.t = 0;
  r.dur = 0;
  r.goalX = spot.x + spot.from * T.raids.approachPx * spot.scale * 1.5;
  r.facing = r.goalX >= r.x ? 1 : -1;
}

/** A raider is bagged: it tumbles, then it is gone (and its ridge self with it). */
export function bagRaider(s: BaboonsState, r: Raider, T: BaboonTuning): void {
  r.phase = 'tumble';
  r.t = 0;
  r.dur = Math.max(1, secondsToTicks(T.hit.tumbleSeconds));
  for (const troop of s.troops) {
    const b = troop.members.find((m) => m.id === r.id);
    if (b !== undefined) b.gone = true;
  }
}

/**
 * v1.18 (D-081, review): no more raids from now on (the Harvest's Phase 2 has the field). The raid
 * in hand ends cleanly: raiders at the field run off now; a raid still out of sight (the bark, an
 * unseen climb or walk) is called off and its raiders go back up the ridge later; raiders already
 * coming down in sight run straight back out when they reach the field (stepRaid).
 */
export function holdRaids(s: BaboonsState, T: BaboonTuning): void {
  s.held = true;
  const raid = s.raid;
  if (raid === null) return;
  if (raid.phase === 'on') for (const r of raid.raiders) fleeRaider(r, raid.spot, T);
  else if (raid.phase === 'travel' && s.descent === null) callOff(s, raid);
}

/** A raid that hasn't reached the field is called off: the raiders out of sight come back later
 *  and a barking lookout stops. */
function callOff(s: BaboonsState, raid: Raid): void {
  s.raid = null;
  const troop = troopOf(s, raid.troopId);
  for (const m of troop?.members ?? []) {
    if (m.pose === 'bark') setPose(m, 'peek', 1);
    if (raid.memberIds.includes(m.id) && (m.pose === 'out' || m.pose === 'down'))
      s.returning.push({ id: m.id, troopId: raid.troopId, left: 1 });
  }
}

/** The raider with this id on the current raid, if any. */
export function findRaider(s: BaboonsState, id: number): Raider | null {
  return s.raid?.raiders.find((r) => r.id === id) ?? null;
}

/** Picks the next raid: a calm troop with a male on the ridge, a spot, one or two raiders. */
function startRaid(s: BaboonsState, ctx: BaboonCtx): BaboonNote | null {
  const T = ctx.tuning;
  const r = ctx.rng;
  const calm = s.troops.filter(
    (t) => !t.fled && t.members.some((m) => m.role === 'male' && m.pose !== 'out' && !m.gone),
  );
  if (calm.length === 0 || s.spots.length === 0) return null;
  const troop = calm[r.int(0, calm.length - 1)] ?? calm[0];
  const spot = s.spots[r.int(0, s.spots.length - 1)] ?? s.spots[0];
  if (troop === undefined || spot === undefined) return null;
  const males = troop.members.filter((m) => m.role === 'male' && onRidge(m) && m.pose !== 'down');
  if (males.length === 0) return null;
  const first = males[r.int(0, males.length - 1)] ?? males[0];
  if (first === undefined) return null;
  const pair = r.chance(T.raids.pairChance) && males.length > 1;
  const second = pair ? males.find((m) => m !== first) : undefined;
  const lookout = troop.members.find((m) => m.role === 'lookout' && onRidge(m));
  const raid: Raid = {
    id: ++s.raids,
    troopId: troop.id,
    spot,
    memberIds: second === undefined ? [first.id] : [first.id, second.id],
    phase: 'warn',
    t: 0,
    dur: Math.max(1, secondsToTicks(T.raids.warnSeconds)),
    raiders: [],
    completed: false,
    dash: s.descent !== null,
  };
  s.raid = raid;
  // The raiders come up over the edge to look down at the spot.
  for (const m of troop.members)
    if (raid.memberIds.includes(m.id)) setPose(m, 'peek', raid.dur + 1);
  const caller = lookout ?? first;
  setPose(caller, 'bark', raid.dur);
  return { kind: 'warn', troop, lookout: caller, raid };
}

function nextGap(s: BaboonsState, ctx: BaboonCtx): number {
  if (s.rate <= 0) return Number.MAX_SAFE_INTEGER;
  const j = ctx.tuning.raids.gapJitter;
  const mean = 60 / s.rate;
  return ticks(ctx.rng, [mean * (1 - j), mean * (1 + j)]);
}

function troopOf(s: BaboonsState, id: string): TroopState | undefined {
  return s.troops.find((t) => t.id === id);
}

function stepRaid(s: BaboonsState, raid: Raid, ctx: BaboonCtx, notes: BaboonNote[]): void {
  const T = ctx.tuning;
  const troop = troopOf(s, raid.troopId);
  raid.t++;
  if (raid.phase !== 'on') {
    if (raid.t < raid.dur) return;
    raid.t = 0;
    const d = s.descent;
    // v1.18 (D-081, review): held (Phase 2): the bark ends with no raid; an unseen climb, too.
    if (s.held && (raid.phase === 'warn' || (raid.phase === 'climb' && d === null))) {
      callOff(s, raid);
      return;
    }
    if (raid.phase === 'warn') {
      raid.phase = 'climb';
      raid.dur = Math.max(1, secondsToTicks(d?.cfg.climbSeconds ?? T.raids.climbSeconds));
      for (const m of troop?.members ?? []) {
        if (m.role === 'lookout' && m.pose === 'bark')
          setPose(m, 'peek', ticks(ctx.rng, T.troop.peekSeconds));
        if (!raid.memberIds.includes(m.id)) continue;
        m.facing = m.x >= (troop?.cx ?? m.x) ? 1 : -1;
        // v1.18 (D-081): coming down in sight, the raider leaves its seat (descentPose draws it).
        setPose(m, d === null ? 'down' : 'out', d === null ? raid.dur : 0);
      }
    } else if (raid.phase === 'climb') {
      raid.phase = 'travel';
      raid.dur =
        d !== null && troop !== undefined
          ? veldTicks(d, troop, raid.spot, T)
          : ticks(ctx.rng, T.raids.travelSeconds);
      for (const m of troop?.members ?? []) if (raid.memberIds.includes(m.id)) setPose(m, 'out', 0);
    } else {
      raid.phase = 'on';
      raid.dur = 0;
      const sp = raid.spot;
      raid.memberIds.forEach((id, i) => {
        const back = i * T.raids.pairGapPx * sp.scale;
        raid.raiders.push({
          id,
          troopId: raid.troopId,
          x: sp.x + sp.from * (T.raids.approachPx * sp.scale + back),
          y: sp.y,
          facing: sp.from === 1 ? -1 : 1,
          phase: 'approach',
          t: 0,
          dur: 0,
          goalX: sp.x + sp.from * back,
          hits: 0,
          done: false,
        });
      });
      // v1.18 (D-081, review): held (Phase 2): down in sight, they turn and run straight out.
      if (s.held) for (const r of raid.raiders) fleeRaider(r, sp, T);
      else notes.push({ kind: 'start', raid });
    }
    return;
  }
  const sp = raid.spot;
  for (const r of raid.raiders) {
    if (r.done) continue;
    r.t++;
    if (r.phase === 'tumble') {
      if (r.t >= r.dur) {
        r.done = true;
        notes.push({ kind: 'gone', raider: r });
      }
      continue;
    }
    if (r.phase === 'act') {
      if (r.t < r.dur) continue;
      if (!raid.completed) {
        raid.completed = true;
        notes.push({ kind: 'done', raid, raider: r });
      }
      r.phase = 'leave';
      r.t = 0;
      r.goalX = sp.x + sp.from * T.raids.approachPx * sp.scale * 1.5;
      r.facing = r.goalX >= r.x ? 1 : -1;
      continue;
    }
    const run = r.phase === 'flee' || r.phase === 'leave';
    // v1.18 (D-081): a raid that came down in sight dashes in for the rows.
    const dash = r.phase === 'approach' && raid.dash ? (s.descent?.cfg.dashMul ?? 1) : 0;
    const step =
      ((dash > 0 ? T.raids.runPxPerSec * dash : run ? T.raids.runPxPerSec : T.raids.walkPxPerSec) *
        sp.scale) /
      60;
    const d = r.goalX - r.x;
    if (Math.abs(d) > step) {
      r.x += d > 0 ? step : -step;
      continue;
    }
    r.x = r.goalX;
    if (r.phase === 'approach') {
      r.phase = 'act';
      r.t = 0;
      r.dur = Math.max(1, secondsToTicks(T.raids.actSeconds[sp.action]));
      continue;
    }
    // Off at the edge: it goes back to the ridge after a while.
    r.done = true;
    s.returning.push({ id: r.id, troopId: r.troopId, left: ticks(ctx.rng, T.raids.backSeconds) });
  }
  if (raid.raiders.every((r) => r.done)) s.raid = null;
}

/** One tick of the map's baboons. */
export function stepBaboons(s: BaboonsState, ctx: BaboonCtx): BaboonNote[] {
  const T = ctx.tuning;
  const notes: BaboonNote[] = [];
  for (const troop of s.troops) {
    if (troop.cooldown > 0) troop.cooldown--;
    if (troop.fled) {
      troop.awayLeft--;
      for (const b of troop.members) {
        if (b.gone) continue;
        b.t++;
        if (b.pose === 'down' && b.t >= b.dur) setPose(b, 'out', 0);
      }
      if (troop.awayLeft <= 0) {
        troop.fled = false;
        const raid = s.raid;
        const raiding = raid !== null && raid.troopId === troop.id ? raid.memberIds : [];
        for (const b of troop.members) {
          if (b.gone || raiding.includes(b.id) || s.returning.some((x) => x.id === b.id)) continue;
          const seat = troop.seats[b.seat] ?? { x: b.x, y: b.y };
          b.x = seat.x;
          b.y = seat.y;
          // Back behind the ridge: they come up to look again one by one.
          setPose(b, 'hide', ticks(ctx.rng, T.troop.hideSeconds));
        }
      }
      continue;
    }
    for (const b of troop.members) stepMember(troop, b, ctx);
  }
  // Raiders back from a raid climb up onto the ridge (once their troop is there).
  for (let i = s.returning.length - 1; i >= 0; i--) {
    const back = s.returning[i];
    if (back === undefined) continue;
    back.left--;
    const troop = troopOf(s, back.troopId);
    if (back.left > 0 || troop === undefined || troop.fled) continue;
    s.returning.splice(i, 1);
    const b = troop.members.find((m) => m.id === back.id);
    if (b === undefined || b.gone) continue;
    const seat = troop.seats[b.seat] ?? { x: b.x, y: b.y };
    b.x = seat.x;
    b.y = seat.y;
    setPose(b, 'hide', ticks(ctx.rng, T.troop.hideSeconds));
  }
  // The gaps run from one raid's warning to the next (so raids come at the content rate); a raid
  // that is due while one is still on waits for it to end.
  if (s.nextRaidIn > 0) s.nextRaidIn--;
  if (s.raid !== null) stepRaid(s, s.raid, ctx, notes);
  else if (s.nextRaidIn <= 0 && !s.held) {
    const note = startRaid(s, ctx);
    if (note !== null) {
      notes.push(note);
      s.nextRaidIn = nextGap(s, ctx);
    }
    // Nobody could go (the troop is away, every male is down): try again in a second.
    else s.nextRaidIn = 60;
  }
  return notes;
}

/** Ridge member and troop by id. */
export function findMember(
  s: BaboonsState,
  id: number,
): { troop: TroopState; member: Baboon } | null {
  for (const troop of s.troops) {
    const member = troop.members.find((m) => m.id === id);
    if (member !== undefined) return { troop, member };
  }
  return null;
}
