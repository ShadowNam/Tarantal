// v1.8b (D-062, GDD §11.3d, Tech §3.12d) Bobbejane: chacma baboon troops. A troop of 5–10 sits on
// a far ridge: the big male on lookout, mothers with a baby on the back, youngsters playing, males
// grooming and dozing. They are never targets up there (a hit on a mother costs points; any hit,
// or the Langloop's shot, sends the troop over the ridge and it comes back later). Every so often
// the lookout barks and one or two males climb down to raid a spot on the mid or near plane
// (steal Oupa's hat off the bakkie, raid a fruit tree, knock the tap, throw fruit at a flock…).
// A raider is a target: `hitsToBag` hits bag it. Pure and deterministic: every random draw comes
// from the hunt's 'baboons' stream in a fixed order; every number from birds.json `baboons`.
import type {
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
 * On the ridge: sit · groom (the neighbour) · look (round, tall) · play (youngsters) · walk (to
 * another seat) · bark (the lookout's "wahoo") · down (climbing down to raid, or over the ridge)
 * · up (climbing back) · out (raiding, or away over the ridge: not drawn, not hittable).
 */
export type RidgePose = 'sit' | 'groom' | 'look' | 'play' | 'walk' | 'bark' | 'down' | 'up' | 'out';

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
  /** Walking: where to (layer px), and from where. */
  fromX: number;
  fromY: number;
  goalX: number;
  goalY: number;
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
  const out: BaboonRole[] = ['lookout'];
  for (let i = 0; i < males; i++) out.push('male');
  for (let i = 0; i < mothers; i++) out.push('mother');
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
    fled: false,
    awayLeft: 0,
    cooldown: 0,
  };
  for (const role of roles(n, T, rng)) {
    let seat = def.lookout;
    if (role !== 'lookout') {
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
      pose: role === 'lookout' ? 'look' : 'sit',
      t: 0,
      dur: ticks(rng, T.troop.activitySeconds),
      fromX: at.x,
      fromY: at.y,
      goalX: at.x,
      goalY: at.y,
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
    nextRaidIn: ticks(ctx.rng, T.raids.firstAfterSeconds),
    returning: [],
    raids: 0,
  };
}

function setPose(b: Baboon, pose: RidgePose, dur: number): void {
  b.pose = pose;
  b.t = 0;
  b.dur = dur;
}

const onRidge = (b: Baboon): boolean => !b.gone && b.pose !== 'out';

/** Whether a member can be hit now (it is on the ridge, drawn). */
export const memberPresent = (b: Baboon): boolean => onRidge(b);

/** The hit stance of a ridge pose. */
export function ridgeStance(pose: RidgePose): 'sit' | 'walk' | 'stand' {
  return pose === 'walk' || pose === 'down' || pose === 'up'
    ? 'walk'
    : pose === 'bark' || pose === 'look'
      ? 'stand'
      : 'sit';
}

/** The hit stance of a raider. */
export function raiderStance(r: Raider, action: RaidAction): 'sit' | 'walk' | 'stand' | null {
  if (r.phase === 'tumble') return null;
  if (r.phase !== 'act') return 'walk';
  return action === 'throw' || action === 'tap' || action === 'chase' ? 'stand' : 'sit';
}

/** A ridge member's next idle activity. */
function choose(troop: TroopState, b: Baboon, ctx: BaboonCtx): void {
  const T = ctx.tuning;
  const r = ctx.rng;
  const a = T.troop.activities;
  const look = b.role === 'lookout' ? a.look * 3 : a.look;
  const weights = [
    a.sit,
    b.role === 'lookout' ? 0 : a.groom,
    look,
    b.role === 'juvenile' ? a.play : 0,
    b.role === 'lookout' ? 0 : a.walk,
  ];
  const i = r.weightedIndex(weights);
  const dur = ticks(r, T.troop.activitySeconds);
  if (i === 4) {
    const taken = new Set(troop.members.filter((m) => !m.gone).map((m) => m.seat));
    const free = troop.seats.map((_, k) => k).filter((k) => !taken.has(k));
    if (free.length > 0) {
      const seat = free[r.int(0, free.length - 1)] ?? b.seat;
      const to = troop.seats[seat] ?? { x: b.x, y: b.y };
      b.seat = seat;
      b.fromX = b.x;
      b.fromY = b.y;
      b.goalX = to.x;
      b.goalY = to.y;
      b.facing = to.x >= b.x ? 1 : -1;
      setPose(b, 'walk', 0);
      return;
    }
  }
  const pose: RidgePose = i === 1 ? 'groom' : i === 2 ? 'look' : i === 3 ? 'play' : 'sit';
  if (pose === 'groom') {
    // Turn to the nearest neighbour.
    let best: Baboon | null = null;
    for (const m of troop.members)
      if (m !== b && onRidge(m) && (best === null || Math.abs(m.x - b.x) < Math.abs(best.x - b.x)))
        best = m;
    if (best !== null && best.x !== b.x) b.facing = best.x > b.x ? 1 : -1;
  } else if (pose === 'look' && r.chance(0.5)) b.facing = b.facing === 1 ? -1 : 1;
  setPose(b, pose, dur);
}

function stepMember(troop: TroopState, b: Baboon, ctx: BaboonCtx): void {
  if (b.gone) return;
  b.t++;
  if (b.pose === 'walk') {
    const step = (ctx.tuning.troop.walkPxPerSec * troop.scale) / 60;
    const total = Math.abs(b.goalX - b.fromX);
    const d = b.goalX - b.x;
    if (Math.abs(d) <= step || total === 0) {
      b.x = b.goalX;
      b.y = b.goalY;
      choose(troop, b, ctx);
      return;
    }
    b.x += d > 0 ? step : -step;
    b.y = b.fromY + ((b.goalY - b.fromY) * Math.abs(b.x - b.fromX)) / total;
    return;
  }
  // Raiding and fleeing members are timed by the raid and the troop.
  if (b.pose === 'out' || b.pose === 'down' || b.pose === 'bark') return;
  if (b.t < b.dur) return;
  if (b.pose === 'up') {
    setPose(b, 'sit', ticks(ctx.rng, ctx.tuning.troop.activitySeconds));
    return;
  }
  choose(troop, b, ctx);
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
    // Over the ridge: away from the troop's middle (the lookout last).
    b.facing = b.x >= troop.cx ? 1 : -1;
    setPose(b, 'down', secondsToTicks(T.troop.climbSeconds));
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
  const males = troop.members.filter((m) => m.role === 'male' && onRidge(m) && m.pose !== 'walk');
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
  };
  s.raid = raid;
  for (const m of troop.members)
    if (raid.memberIds.includes(m.id)) setPose(m, 'look', raid.dur + 1);
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
    if (raid.phase === 'warn') {
      raid.phase = 'climb';
      raid.dur = Math.max(1, secondsToTicks(T.raids.climbSeconds));
      for (const m of troop?.members ?? []) {
        if (m.role === 'lookout' && m.pose === 'bark')
          setPose(m, 'look', ticks(ctx.rng, T.troop.activitySeconds));
        if (!raid.memberIds.includes(m.id)) continue;
        m.facing = m.x >= (troop?.cx ?? m.x) ? 1 : -1;
        setPose(m, 'down', raid.dur);
      }
    } else if (raid.phase === 'climb') {
      raid.phase = 'travel';
      raid.dur = ticks(ctx.rng, T.raids.travelSeconds);
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
      notes.push({ kind: 'start', raid });
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
    const step = ((run ? T.raids.runPxPerSec : T.raids.walkPxPerSec) * sp.scale) / 60;
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
        const climb = Math.max(1, secondsToTicks(T.troop.climbSeconds));
        for (const b of troop.members) {
          if (b.gone || raiding.includes(b.id) || s.returning.some((x) => x.id === b.id)) continue;
          const seat = troop.seats[b.seat] ?? { x: b.x, y: b.y };
          b.x = seat.x;
          b.y = seat.y;
          setPose(b, 'up', climb);
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
    setPose(b, 'up', Math.max(1, secondsToTicks(T.troop.climbSeconds)));
  }
  // The gaps run from one raid's warning to the next (so raids come at the content rate); a raid
  // that is due while one is still on waits for it to end.
  if (s.nextRaidIn > 0) s.nextRaidIn--;
  if (s.raid !== null) stepRaid(s, s.raid, ctx, notes);
  else if (s.nextRaidIn <= 0) {
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
