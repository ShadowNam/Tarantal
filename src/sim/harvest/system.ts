// v1.8c (D-063, GDD §12.2, Tech §3.12e) Die Oes: the Harvest as a sim system the hunt plugs in —
// the intro (a warthog family barges through the fence), the 30-s rush (warthogs trotting in to
// dig in the rows, the farm workers mending the gap), the crop meter, and the outro (the gap
// closes, the animals run off, the crop bonus). It lives in the lazy systems chunk like the
// baboons; the sim talks to it through HarvestHost only. Pure and deterministic like the rest of
// src/sim: its own stream `harvest`, ticks, no allocations a tick beyond the actors it spawns.
import type {
  BaboonTuning,
  Biome,
  ContentBundle,
  HarvestMap,
  HarvestSetup,
} from '../../content/schemas';
import { createPhase2, mielieSpots, type Phase2Plane, type Phase2System } from './phase2';
import { secondsToTicks } from '../clock';
import type { BonusId, SimEvent } from '../events';
import type { RandomStream } from '../rng';
import type {
  HarvestPhase,
  HarvestView,
  PigletView,
  PlaneId,
  WarthogPhase,
  WarthogView,
  WorkerPhase,
  WorkerView,
} from '../types';
import { pointInOccluder, type HitExtra } from '../weapons/hitTest';
import { coreWidth } from '../world';

/** What the hunt gives the Harvest. */
export interface HarvestHost {
  readonly tick: () => number;
  emit(e: SimEvent): void;
  /** An event bonus (× Frenzy); returns what it paid. */
  awardBonus(bonus: BonusId, base: number): number;
  /** A guineafowl's base points on a plane. */
  basePoints(plane: PlaneId): number;
  /** Points off (a penalty, negative) counted in the hunt's stats. */
  penalty(points: number): void;
  /** Points on (the crop bonus) without any multiplier. */
  addScore(points: number): void;
  /** Guineafowl foraging in the field now (they eat the crop). */
  eatingBirds(): number;
  /** Baboon raiders at their mielies now. */
  eatingRaiders(): number;
  /** Flocks on a plane now (the gap's flocks wait while there are maxGapFlocks). */
  flocksOn(plane: PlaneId): number;
  /** A guineafowl flock comes in at layer x of the plane and runs in the direction `dir` (into
   *  the rows); false: no room for it (the bird or flock caps). */
  gapFlock(plane: PlaneId, x: number, size: number, dir: 1 | -1): boolean;
  /** The rush is over: every flock runs off. */
  scatterFlocks(): void;
  /** v1.18 (D-081): the hunt's score now (Phase 2's unlock). */
  score(): number;
  /** v1.18 (D-081): the hunt runs this many ticks longer (Phase 2 unlocked). */
  extendBy(ticks: number): void;
  /** v1.18 (D-081): the hunt ends at this tick (Phase 2 over early, or a test-build start). */
  endAt(tick: number): void;
  /** v1.18 (D-081): Phase 2's own stream (`harvestPhase2`). */
  readonly phase2Rng: RandomStream;
  /** v1.18 (D-081): the baboons' tuning (Phase 2's baboons are raiders). */
  readonly baboonTuning: BaboonTuning;
}

export interface HarvestSystem {
  /** The hunt's extra ticks around the 30 s: the intro before, the outro after. */
  readonly introTicks: number;
  readonly outroTicks: number;
  /** A fire command now: 'skip' ends the intro (the shot isn't fired), 'block' (the outro)
   *  drops it, 'fire' lets it through. Returns the ticks the hunt got shorter by (a skip). */
  fireGate(): { readonly gate: 'fire' | 'skip' | 'block'; readonly shortenBy: number };
  extras(add: (layerId: string, e: HitExtra) => void): void;
  plane(id: number): PlaneId | null;
  /**
   * A shot's hits on the Harvest's actors. `hitTarget`: the shot hit a target elsewhere (a bird, a
   * raider) — a worker or piglet behind it was not what the player aimed at.
   */
  shot(
    shotId: number,
    hits: readonly number[],
    hitTarget: boolean,
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
  ): void;
  step(): void;
  view(): HarvestView;
  /** v1.18 (D-081): every shot fired (Phase 2: a piglet near where it landed runs out). */
  landed(aimOn: (layerId: string) => { readonly x: number; readonly y: number }): void;
}

export type HarvestSystemFactory = (
  biome: Biome,
  content: ContentBundle,
  planeScale: Readonly<Record<PlaneId, number>>,
  minHitRadius: Readonly<Record<PlaneId, number>>,
  /** The rush's length (the mode's huntSeconds; a test build may shorten it). */
  rushSeconds: number,
  rng: RandomStream,
  host: HarvestHost,
) => HarvestSystem | null;

interface DigSpot {
  readonly plane: 'near' | 'mid';
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** Where an arrival for this spot comes in from (layer px) — off the view or behind the gap. */
  readonly fromX: number;
  readonly fromY: number;
  /** v1.18 (D-081): its index in the map's dig spots (a hole arrival's spot is a copy). */
  readonly index: number;
  /** v1.18 (D-081): the arrival squeezes through the small hole. */
  readonly viaHole: boolean;
}

interface Warthog {
  readonly id: number;
  readonly spot: DigSpot;
  /** v1.18 (D-081): a yearling (through the small hole): smaller, fewer hits. */
  readonly young: boolean;
  /** Its size on its plane (the spot's scale, × youngScale for a yearling). */
  readonly scale: number;
  /** v1.18 (D-081): where it runs out to (the way it came; the gap once the hole is patched). */
  exitX: number;
  exitY: number;
  x: number;
  y: number;
  facing: 1 | -1;
  phase: WarthogPhase;
  t: number;
  /** Ticks left digging before it shuffles along the row. */
  digLeft: number;
  hits: number;
  gone: boolean;
  /** Its piglets (ids into piglets). */
  readonly piglets: number[];
}

interface Piglet {
  readonly id: number;
  readonly motherId: number;
  readonly index: number;
  readonly spot: DigSpot;
  x: number;
  y: number;
  facing: 1 | -1;
  running: boolean;
  /** v1.18 (D-081): where it runs out to (its mother's way). */
  exitX: number;
  exitY: number;
  t: number;
  cooldown: number;
  gone: boolean;
}

interface Worker {
  readonly id: number;
  readonly look: number;
  readonly layerId: string;
  readonly plane: PlaneId;
  readonly scale: number;
  readonly homeX: number;
  readonly y: number;
  readonly from: 1 | -1;
  x: number;
  facing: 1 | -1;
  phase: WorkerPhase;
  t: number;
  duckLeft: number;
  /** v1.18 (D-081): gone to the farmhouse (Phase 2): not drawn, not hittable. */
  away: boolean;
  cooldown: number;
}

/** Warthog arrivals per minute at a point of the rush (0..1), lerped between keyframes. */
export function rushRate(
  keys: HarvestSetup['rush']['keyframes'],
  f: number,
  what: 'warthogsPerMin' | 'gapFlocksPerMin' = 'warthogsPerMin',
): number {
  const first = keys[0];
  if (first === undefined) return 0;
  if (f <= first.t) return first[what];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (a === undefined || b === undefined) break;
    if (f <= b.t) return a[what] + ((f - a.t) / (b.t - a.t)) * (b[what] - a[what]);
  }
  return keys[keys.length - 1]?.[what] ?? 0;
}

/** The side of the gap the workers mend it from (+1 right, −1 left). */
export function workerSide(map: HarvestMap): 1 | -1 {
  return map.workers.reduce((t, w) => t + w.dx, 0) >= 0 ? 1 : -1;
}

/** Where a flock through the gap starts: just past the gap's post on the side away from the
 *  workers (it spreads round that point and runs on into the rows, never toward the workers). */
export function gapFlockX(map: HarvestMap, gapLayerWidth: number, side: 1 | -1): number {
  return map.gap.u * gapLayerWidth - side * (map.gap.halfWidthPx + 150);
}

/** The crop lost in one tick (percent) for what is eating now. */
export function cropDrainPerTick(
  drain: HarvestSetup['crop']['drainPerSecond'],
  birds: number,
  warthogs: number,
  raiders: number,
): number {
  return (birds * drain.guineafowl + warthogs * drain.warthog + raiders * drain.baboon) / 60;
}

/** The crop bonus for what was saved (percent, rounded down to whole percent). */
export function cropBonus(crop: number, bonusPerPercent: number): number {
  return Math.floor(Math.max(0, crop)) * bonusPerPercent;
}

function digSpots(
  biome: Biome,
  map: HarvestMap,
  planeScale: Readonly<Record<PlaneId, number>>,
  entryPx: number,
): DigSpot[] {
  const gapLayer = biome.layers.find((l) => l.id === map.gap.layer);
  const gapW = gapLayer === undefined ? 0 : coreWidth(gapLayer.scrollFactor);
  const gapX = map.gap.u * gapW;
  const out: DigSpot[] = [];
  for (const [index, d] of map.digSpots.entries()) {
    const layer = biome.layers.find((l) => l.id === d.layer);
    if (layer === undefined) continue;
    const w = coreWidth(layer.scrollFactor);
    const scale = planeScale[d.plane];
    const x = d.u * w;
    const off = entryPx * scale;
    // Mid spots on the gap's side come through the gap; the rest round the panorama's ends.
    const viaGap = d.layer === map.gap.layer && x < gapX;
    out.push({
      plane: d.plane,
      layerId: d.layer,
      x,
      y: d.y,
      scale,
      fromX: viaGap ? gapX : x < w / 2 ? -off : w + off,
      fromY: viaGap ? map.gap.y - 4 : d.y,
      index,
      viaHole: false,
    });
  }
  return out;
}

/** v1.18 (D-081): the small hole's x on the gap's layer (null: the map has none). */
export function holeX(map: HarvestMap, gapLayerWidth: number): number | null {
  return map.hole === undefined ? null : map.hole.u * gapLayerWidth;
}

/** v1.18 (D-081): the dig spots a yearling through the hole goes for: the gap-side spots on the
 *  gap's layer (the hole's side of the field), as copies that come in from the hole. */
export function holeSpots(
  spots: readonly DigSpot[],
  map: HarvestMap,
  gapLayerWidth: number,
): DigSpot[] {
  const hx = holeX(map, gapLayerWidth);
  if (hx === null || map.hole === undefined) return [];
  const y = map.hole.y - 4;
  const gapX = map.gap.u * gapLayerWidth;
  return spots
    .filter((s) => s.layerId === map.gap.layer && s.fromX === gapX)
    .map((s) => ({ ...s, fromX: hx, fromY: y, viaHole: true }));
}

/** The Harvest on its map (null: this biome has no Harvest geometry). */
export const createHarvestSystem: HarvestSystemFactory = (
  biome,
  content,
  planeScale,
  minHitRadius,
  rushSeconds,
  rng,
  host,
) => {
  const mapOrNone = biome.harvest;
  if (mapOrNone === undefined) return null;
  const map: HarvestMap = mapOrNone;
  const H = content.modes.modes.harvest;
  const W = H.warthogs;
  const introTicks = secondsToTicks(H.intro.seconds);
  const outroTicks = secondsToTicks(H.outroSeconds);
  const rushTicks = secondsToTicks(rushSeconds);
  const breakTick = Math.round(introTicks * H.intro.breakAt);
  const tumbleTicks = secondsToTicks(W.tumbleSeconds);
  const workerCooldown = secondsToTicks(H.workers.cooldownSeconds);
  const duckTicks = secondsToTicks(H.workers.duckSeconds);
  const gapLayer = biome.layers.find((l) => l.id === map.gap.layer);
  if (gapLayer === undefined) throw new Error(`harvest gap layer ${map.gap.layer} missing`);
  const gapW = coreWidth(gapLayer.scrollFactor);
  const gapX = map.gap.u * gapW;
  const gapScale = planeScale[map.gap.plane];
  const spots = digSpots(biome, map, planeScale, W.entryPx);
  const spotsBy = (plane: 'near' | 'mid'): DigSpot[] => spots.filter((s) => s.plane === plane);
  const midSpots = spotsBy('mid');
  const nearSpots = spotsBy('near');
  // v1.18 (D-081): the small hole and the spots its yearlings go for.
  const Hh = H.hole;
  const hx = holeX(map, gapW);
  const viaHoleSpots = holeSpots(spots, map, gapW);
  const patchFrac = Hh.patchAt;
  let holeOpen = hx !== null;
  // The first yearling at firstAfterSeconds, then one every 60 / youngPerMin seconds.
  let holeAcc = 1 - (Hh.firstAfterSeconds * Hh.youngPerMin) / 60;
  // The intro family's spot: the gap-side mid spot nearest the gap.
  const introSpot =
    midSpots
      .filter((s) => s.fromX === gapX)
      .sort((a, b) => Math.abs(a.x - gapX) - Math.abs(b.x - gapX))[0] ?? spots[0];
  if (introSpot === undefined) throw new Error('harvest needs dig spots');
  const familySpot: DigSpot = introSpot;

  let nextId = 1;
  let phase: HarvestPhase = 'intro';
  let introEnd = introTicks;
  let rushEnd = introTicks + rushTicks;
  let crop = 100;
  let warned = false;
  let acc = 0;
  let flockAcc = 0;
  let bagged = 0;
  let bonus = 0;
  let bystanderPenalty = 0;
  let broken = false;
  const warthogs: Warthog[] = [];
  const piglets: Piglet[] = [];
  const workers: Worker[] = map.workers.map((w, i) => {
    const homeX = gapX + w.dx;
    const start = homeX + w.from * (H.workers.runPxPerSec * gapScale * H.intro.seconds * 0.8);
    return {
      id: nextId++,
      look: i,
      layerId: map.gap.layer,
      plane: map.gap.plane,
      scale: gapScale,
      homeX,
      y: w.y,
      from: w.from,
      x: start,
      facing: w.from === 1 ? -1 : 1,
      phase: 'run',
      t: 0,
      duckLeft: 0,
      cooldown: 0,
      away: false,
    };
  });
  // v1.18 (D-081): Phase 2 (made when it unlocks).
  const P2 = H.phase2;
  const bannerTicks = secondsToTicks(P2.bannerSeconds);
  const phase2Ticks = secondsToTicks(P2.seconds);
  let p2: Phase2System | null = null;
  let bannerEnd = -1;
  /** Phase 2 started straight away (test builds: ?harvestPhase2=1). */
  let direct = P2.direct === true;

  const speed = (pxPerSec: number, scale: number): number => (pxPerSec * scale) / 60;
  const live = (): number => warthogs.filter((w) => !w.gone && w.phase !== 'tumble').length;

  function spawn(spot: DigSpot, pigletCount: number, young = false): void {
    const id = nextId++;
    const w: Warthog = {
      id,
      spot,
      young,
      scale: spot.scale * (young ? Hh.youngScale : 1),
      exitX: spot.fromX,
      exitY: spot.fromY,
      x: spot.fromX,
      y: spot.fromY,
      facing: spot.x >= spot.fromX ? 1 : -1,
      phase: 'trot',
      t: 0,
      digLeft: secondsToTicks(rng.range(W.digSeconds[0], W.digSeconds[1])),
      hits: 0,
      gone: false,
      piglets: [],
    };
    for (let i = 0; i < pigletCount; i++) {
      const p: Piglet = {
        id: nextId++,
        motherId: id,
        index: i,
        spot,
        // They come in where she does and fall in behind her as she goes (never ahead of the
        // entry, so never towards the workers beside the gap).
        x: w.x,
        y: w.y,
        facing: w.facing,
        running: false,
        exitX: spot.fromX,
        exitY: spot.fromY,
        t: 0,
        cooldown: 0,
        gone: false,
      };
      piglets.push(p);
      w.piglets.push(p.id);
    }
    warthogs.push(w);
    host.emit({
      type: 'warthogEntered',
      tick: host.tick(),
      warthogId: id,
      plane: spot.plane,
      piglets: pigletCount,
      young,
    });
  }

  function pickSpot(): DigSpot | null {
    const near = nearSpots.length > 0 && rng.chance(H.rush.nearShare);
    const pool = near ? nearSpots : midSpots;
    const free = pool.filter((s) => !taken(s));
    if (free.length === 0) return null;
    return free[rng.int(0, free.length - 1)] ?? null;
  }

  /** A spot some warthog in the field is on (or on its way to). */
  function taken(s: DigSpot): boolean {
    return warthogs.some((w) => !w.gone && w.spot.index === s.index);
  }

  /** v1.18 (D-081): a yearling (and maybe a piglet) squeezes through the small hole. */
  function holeArrival(): void {
    const free = viaHoleSpots.filter((s) => !taken(s));
    if (free.length === 0 || hx === null) return;
    // The spot nearest the hole (the yearlings stay on the hole's side).
    let best = free[0];
    for (const s of free)
      if (best === undefined || Math.abs(s.x - hx) < Math.abs(best.x - hx)) best = s;
    if (best === undefined) return;
    spawn(best, rng.chance(Hh.pigletChance) ? 1 : 0, true);
  }

  /** v1.18 (D-081): the workers patch the hole; anyone who came in by it runs out by the gap. */
  function patchHole(): void {
    holeOpen = false;
    for (const w of warthogs)
      if (w.spot.viaHole) {
        w.exitX = gapX;
        w.exitY = map.gap.y - 4;
      }
    for (const p of piglets)
      if (p.spot.viaHole) {
        p.exitX = gapX;
        p.exitY = map.gap.y - 4;
      }
    host.emit({ type: 'harvestHolePatched', tick: host.tick() });
  }

  /** v1.18 (D-081): in the small hole now (squeezing: slow, drawn low). */
  function inHole(o: { readonly x: number; readonly y: number }, spot: DigSpot): boolean {
    if (!spot.viaHole || hx === null || map.hole === undefined) return false;
    return (
      Math.abs(o.x - hx) <= map.hole.halfWidthPx && o.y <= map.hole.y + Hh.squeezePx * spot.scale
    );
  }

  function runOff(w: Warthog): void {
    if (w.phase === 'tumble' || w.gone) return;
    w.phase = 'run';
    w.t = 0;
    w.facing = w.exitX >= w.x ? 1 : -1;
    for (const id of w.piglets) {
      const p = piglets.find((x) => x.id === id);
      if (p !== undefined && !p.gone) p.running = true;
    }
  }

  function moveTo(o: { x: number; y: number }, tx: number, ty: number, v: number): boolean {
    const dx = tx - o.x;
    const dy = ty - o.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= v) {
      o.x = tx;
      o.y = ty;
      return true;
    }
    o.x += (dx / d) * v;
    o.y += (dy / d) * v;
    return false;
  }

  function stepWarthog(w: Warthog): void {
    w.t++;
    const s = w.spot;
    if (w.phase === 'tumble') {
      if (w.t >= tumbleTicks) w.gone = true;
      return;
    }
    if (w.phase === 'trot') {
      w.facing = s.x >= w.x ? 1 : -1;
      const squeeze = inHole(w, s) ? Hh.squeezeMul : 1;
      if (moveTo(w, s.x, s.y, speed(W.trotPxPerSec, w.scale) * squeeze)) {
        w.phase = 'dig';
        w.t = 0;
      }
      return;
    }
    if (w.phase === 'dig') {
      if (--w.digLeft <= 0) {
        // Shuffle along the row a little and dig again (it never leaves on its own).
        w.digLeft = secondsToTicks(rng.range(W.digSeconds[0], W.digSeconds[1]));
        w.facing = w.facing === 1 ? -1 : 1;
      }
      return;
    }
    // run: back the way it came, out of the field.
    if (moveTo(w, w.exitX, w.exitY, speed(W.runPxPerSec, w.scale))) {
      w.gone = true;
      host.emit({ type: 'warthogLeft', tick: host.tick(), warthogId: w.id });
    }
  }

  function stepPiglet(p: Piglet): void {
    p.t++;
    if (p.cooldown > 0) p.cooldown--;
    const m = warthogs.find((w) => w.id === p.motherId);
    const s = p.spot;
    if (p.running || m === undefined || m.gone || m.phase === 'tumble' || m.phase === 'run') {
      p.running = true;
      p.facing = p.exitX >= p.x ? 1 : -1;
      if (moveTo(p, p.exitX, p.exitY, speed(W.runPxPerSec, s.scale))) p.gone = true;
      return;
    }
    // Trail the mother (never alone in range): a gap behind her, rooting when she digs.
    const gap = W.pigletGapPx * s.scale * (p.index + 1);
    const tx = m.x - m.facing * gap;
    const ty = m.y + (p.index % 2 === 0 ? 6 : -4) * s.scale;
    // Only ever towards where she is going: a piglet never walks back the way they came.
    if ((tx - p.x) * m.facing <= 0) return;
    p.facing = tx >= p.x ? 1 : -1;
    const squeeze = inHole(p, s) ? Hh.squeezeMul : 1;
    moveTo(p, tx, ty, speed(W.trotPxPerSec * 1.15, s.scale) * squeeze);
  }

  function stepWorker(w: Worker): void {
    w.t++;
    if (w.cooldown > 0) w.cooldown--;
    if (w.phase === 'leave') {
      // Off to the farmhouse along the fence, away from the field (the gap's far side).
      w.facing = 1;
      const o = { x: w.x, y: w.y };
      if (moveTo(o, gapX + H.workers.leavePx * w.scale, w.y, speed(H.workers.runPxPerSec, w.scale)))
        w.away = true;
      w.x = o.x;
      return;
    }
    if (w.phase === 'run') {
      w.facing = w.homeX >= w.x ? 1 : -1;
      const o = { x: w.x, y: w.y };
      const done = moveTo(o, w.homeX, w.y, speed(H.workers.runPxPerSec, w.scale));
      w.x = o.x;
      if (done) {
        w.phase = 'work';
        w.t = 0;
        // Face the gap.
        w.facing = gapX >= w.x ? 1 : -1;
      }
      return;
    }
    if (w.phase === 'duck' && --w.duckLeft <= 0) {
      w.phase = 'work';
      w.t = 0;
    }
  }

  function startRush(skipped: boolean): void {
    phase = 'rush';
    introEnd = host.tick();
    rushEnd = introEnd + rushTicks;
    if (!broken) breakFence();
    // A skip puts the workers at the gap at once.
    for (const w of workers) {
      if (w.phase !== 'run') continue;
      w.x = w.homeX;
      w.phase = 'work';
      w.t = 0;
      w.facing = gapX >= w.x ? 1 : -1;
    }
    host.emit({ type: 'harvestIntroEnded', tick: introEnd, skipped, rushEndTick: rushEnd });
  }

  function breakFence(): void {
    broken = true;
    host.emit({ type: 'harvestFenceBroken', tick: host.tick() });
    spawn(familySpot, H.intro.piglets);
  }

  function closeFence(): void {
    phase = 'outro';
    for (const w of warthogs) runOff(w);
    host.scatterFlocks();
    bonus = cropBonus(crop, H.crop.bonusPerPercent);
    if (bonus > 0) host.addScore(bonus);
    host.emit({ type: 'harvestFenceClosed', tick: host.tick(), crop, bonus });
    // v1.18 (D-081): a good enough rush unlocks Phase 2.
    const score = host.score();
    if (score >= P2.unlockScore) {
      host.extendBy(bannerTicks + phase2Ticks);
      unlockPhase2(score);
    }
  }

  /** v1.18 (D-081): the banner: the fence whole, the hole patched, the workers off to the farm. */
  function unlockPhase2(score: number): void {
    phase = 'banner';
    bannerEnd = host.tick() + bannerTicks;
    if (holeOpen) holeOpen = false;
    for (const w of workers) {
      w.phase = 'leave';
      w.t = 0;
    }
    p2 = createPhase2(H, host.baboonTuning, phase2Geometry(), host.phase2Rng, host, () => nextId++);
    host.emit({ type: 'phase2Unlocked', tick: host.tick(), score });
  }

  function phase2Geometry() {
    const plane = (layerId: string, id: 'mid' | 'near'): Phase2Plane | null => {
      const l = biome.layers.find((x) => x.id === layerId);
      if (l === undefined) return null;
      const width = coreWidth(l.scrollFactor);
      const digs = spots.filter((s) => s.layerId === layerId).map((s) => ({ x: s.x, y: s.y }));
      return {
        layerId,
        plane: id,
        width,
        scale: planeScale[id],
        minHitRadius: minHitRadius[id],
        digSpots: digs,
        mielies: mielieSpots(biome.baboons?.spots ?? [], layerId, width),
      };
    };
    const mid = plane(map.gap.layer, 'mid');
    if (mid === null) throw new Error('harvest phase 2: no mid layer');
    const nearLayer = biome.layers.find((l) => l.plane === 'near');
    return {
      fenceY: map.gap.y,
      postPx: H.fence.postPx,
      mid,
      near: nearLayer === undefined ? null : plane(nearLayer.id, 'near'),
    };
  }

  /** v1.18 (D-081): Phase 2 is over: its bonuses, the rest run off, the outro. */
  function endPhase2(reason: 'clear' | 'time' | 'eaten'): void {
    if (p2 === null) return;
    const r = p2.finish(reason, crop);
    const paid = r.cropBonus + r.perfectBonus + r.clearBonus;
    if (paid > 0) host.addScore(paid);
    phase = 'outro';
    host.endAt(host.tick() + outroTicks);
  }

  function step(): void {
    const tick = host.tick();
    if (direct) {
      // Test builds: straight into Phase 2's banner (the fence never breaks; the crop is whole).
      direct = false;
      introEnd = tick;
      rushEnd = tick;
      for (const w of workers) w.away = true;
      unlockPhase2(host.score());
      host.endAt(tick + bannerTicks + phase2Ticks + outroTicks);
    }
    if (phase === 'banner') {
      if (tick >= bannerEnd && p2 !== null) {
        phase = 'defend';
        p2.start(crop);
      }
    } else if (phase === 'defend' && p2 !== null) {
      crop = Math.max(0, crop - p2.drainPerTick());
      if (!warned && crop < H.crop.warnBelow) {
        warned = true;
        host.emit({ type: 'cropWarning', tick, crop });
      }
      if (crop <= 0) endPhase2('eaten');
      else if (p2.cleared()) endPhase2('clear');
      else if (p2.timeUp()) endPhase2('time');
    }
    p2?.step();
    if (phase === 'intro') {
      if (!broken && tick >= breakTick) breakFence();
      if (tick >= introEnd) startRush(false);
    } else if (phase === 'rush') {
      const f = Math.min(1, (tick - introEnd) / rushTicks);
      acc += rushRate(H.rush.keyframes, f) / 3600;
      if (acc >= 1) {
        if (live() < H.rush.maxWarthogs) {
          const spot = pickSpot();
          if (spot !== null) {
            const sow = rng.chance(W.sowChance);
            spawn(spot, sow ? rng.int(W.piglets[0], W.piglets[1]) : 0);
          }
        }
        acc -= 1;
      }
      // v1.18 (D-081): yearlings squeeze through the small hole until the workers patch it.
      if (holeOpen) {
        if (f >= patchFrac) patchHole();
        else {
          holeAcc += Hh.youngPerMin / 3600;
          if (holeAcc >= 1) {
            holeAcc -= 1;
            if (live() < H.rush.maxWarthogs) holeArrival();
          }
        }
      }
      // Guineafowl flocks pour in through the gap and run into the rows (away from the workers).
      flockAcc += rushRate(H.rush.keyframes, f, 'gapFlocksPerMin') / 3600;
      if (flockAcc >= 1) {
        flockAcc -= 1;
        if (host.flocksOn(map.gap.plane) < H.rush.maxGapFlocks) {
          const size = rng.int(H.rush.gapFlockSize[0], H.rush.gapFlockSize[1]);
          const side = workerSide(map);
          host.gapFlock(map.gap.plane, gapFlockX(map, gapW, side), size, side === 1 ? -1 : 1);
        }
      }
      const digging = warthogs.filter((w) => !w.gone && w.phase === 'dig').length;
      crop = Math.max(
        0,
        crop -
          cropDrainPerTick(
            H.crop.drainPerSecond,
            host.eatingBirds(),
            digging,
            host.eatingRaiders(),
          ),
      );
      if (!warned && crop < H.crop.warnBelow) {
        warned = true;
        host.emit({ type: 'cropWarning', tick, crop });
      }
      if (tick >= rushEnd) closeFence();
    }
    for (const w of warthogs) if (!w.gone) stepWarthog(w);
    for (const p of piglets) if (!p.gone) stepPiglet(p);
    for (const w of workers) stepWorker(w);
    // Drop the finished (stable order: filter keeps spawn order).
    if (warthogs.some((w) => w.gone)) {
      const keep = warthogs.filter((w) => !w.gone);
      warthogs.length = 0;
      warthogs.push(...keep);
    }
    if (piglets.some((p) => p.gone)) {
      const keep = piglets.filter((p) => !p.gone);
      piglets.length = 0;
      piglets.push(...keep);
    }
  }

  function fireGate(): { gate: 'fire' | 'skip' | 'block'; shortenBy: number } {
    if (phase === 'outro' || phase === 'banner') return { gate: 'block', shortenBy: 0 };
    if (phase === 'rush' || phase === 'defend') return { gate: 'fire', shortenBy: 0 };
    if (direct) return { gate: 'block', shortenBy: 0 };
    const shortenBy = Math.max(0, introEnd - host.tick());
    startRush(true);
    return { gate: 'skip', shortenBy };
  }

  type Box = HarvestSetup['warthogs']['hitboxes']['trot'];
  function shapes(box: Box, x: number, y: number, k: number, facing: 1 | -1, floor: number) {
    return [box.body, box.head].map((sh, i) => ({
      x: x + sh.ox * k * facing,
      y: y + sh.oy * k,
      shape: {
        type: 'ellipse' as const,
        rx: Math.max(sh.rx * k, i === 0 ? floor : 0),
        ry: Math.max(sh.ry * k, i === 0 ? floor : 0),
      },
    }));
  }
  const workerShapes = (w: Worker) =>
    shapes(
      w.phase === 'duck' ? H.workers.hitboxes.duck : H.workers.hitboxes.work,
      w.x,
      w.y,
      w.scale,
      w.facing,
      0,
    );
  const pigletShapes = (p: Piglet) =>
    shapes(W.hitboxes.trot, p.x, p.y, p.spot.scale * W.pigletScale, p.facing, 0);
  const warthogShapes = (w: Warthog) =>
    shapes(
      w.phase === 'dig' ? W.hitboxes.dig : W.hitboxes.trot,
      w.x,
      w.y,
      w.scale,
      w.facing,
      minHitRadius[w.spot.plane],
    );

  function extras(add: (layerId: string, e: HitExtra) => void): void {
    // Front to back within a layer is insertion order: the targets first, then the bystanders.
    for (const w of warthogs) {
      if (w.gone || w.phase === 'tumble') continue;
      for (const sh of warthogShapes(w))
        add(w.spot.layerId, { kind: 'harvest', harvestId: w.id, ...sh });
    }
    for (const p of piglets) {
      if (p.gone) continue;
      for (const sh of pigletShapes(p))
        add(p.spot.layerId, { kind: 'harvest', harvestId: p.id, ...sh });
    }
    for (const w of workers) {
      if (w.away) continue;
      for (const sh of workerShapes(w)) add(w.layerId, { kind: 'harvest', harvestId: w.id, ...sh });
    }
    p2?.extras(add);
  }

  function plane(id: number): PlaneId | null {
    const w = warthogs.find((x) => x.id === id);
    if (w !== undefined) return w.spot.plane;
    const p = piglets.find((x) => x.id === id);
    if (p !== undefined) return p.spot.plane;
    const k = workers.find((x) => x.id === id);
    if (k !== undefined) return k.plane;
    return p2?.plane(id) ?? null;
  }

  const aimedAt = (
    list: readonly { x: number; y: number; shape: { type: 'ellipse'; rx: number; ry: number } }[],
    a: { readonly x: number; readonly y: number },
  ): boolean => list.some((sh) => pointInOccluder(a.x, a.y, { propId: '', ...sh }));

  function shot(
    shotId: number,
    hits: readonly number[],
    hitTarget: boolean,
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
  ): void {
    const tick = host.tick();
    // v1.18 (D-081): Phase 2's animals.
    if (p2 !== null) {
      const mine = hits.filter((id) => p2?.owns(id) === true);
      if (mine.length > 0) {
        const other = hits.some((id) => p2?.owns(id) !== true);
        p2.shot(shotId, mine, hitTarget || other, aimOn);
      }
    }
    // Did the shot hit a warthog? Then a bystander behind it wasn't what it was aimed at.
    const hitWarthog = hits.some((id) => warthogs.some((w) => w.id === id && !w.gone));
    for (const id of hits) {
      const w = warthogs.find((x) => x.id === id);
      if (w !== undefined) {
        if (w.gone || w.phase === 'tumble') continue;
        w.hits++;
        const left = Math.max(0, (w.young ? Hh.youngHitsToBag : W.hitsToBag) - w.hits);
        host.emit({
          type: 'warthogHit',
          tick,
          shotId,
          warthogId: w.id,
          hitsLeft: left,
          plane: w.spot.plane,
          x: w.x,
          y: w.y,
        });
        if (left > 0) {
          runOff(w);
          continue;
        }
        w.phase = 'tumble';
        w.t = 0;
        for (const pid of w.piglets) {
          const p = piglets.find((x) => x.id === pid);
          if (p !== undefined) p.running = true;
        }
        bagged++;
        const points = host.awardBonus(
          'warthog',
          Math.round(host.basePoints(w.spot.plane) * (w.young ? Hh.youngPointsMul : W.pointsMul)),
        );
        host.emit({
          type: 'warthogBagged',
          tick,
          shotId,
          warthogId: w.id,
          plane: w.spot.plane,
          x: w.x,
          y: w.y,
          points,
        });
        continue;
      }
      const p = piglets.find((x) => x.id === id);
      if (p !== undefined) {
        if (p.gone) continue;
        const aimed = !hitTarget && !hitWarthog && aimedAt(pigletShapes(p), aimOn(p.spot.layerId));
        let points = 0;
        if (aimed && p.cooldown === 0) {
          points = -W.pigletPenalty;
          p.cooldown = workerCooldown;
          host.penalty(points);
          bystanderPenalty -= points;
        }
        p.running = true;
        host.emit({
          type: 'harvestBystanderHit',
          tick,
          shotId,
          who: 'piglet',
          id: p.id,
          aimed,
          plane: p.spot.plane,
          x: p.x,
          y: p.y,
          points,
        });
        continue;
      }
      const k = workers.find((x) => x.id === id);
      if (k === undefined) continue;
      const aimed = !hitTarget && !hitWarthog && aimedAt(workerShapes(k), aimOn(k.layerId));
      let points = 0;
      if (aimed && k.cooldown === 0) {
        points = -H.workers.penalty;
        k.cooldown = workerCooldown;
        host.penalty(points);
        bystanderPenalty -= points;
      }
      if (k.phase !== 'run') {
        k.phase = 'duck';
        k.t = 0;
        k.duckLeft = duckTicks;
      }
      host.emit({
        type: 'harvestBystanderHit',
        tick,
        shotId,
        who: 'worker',
        id: k.id,
        aimed,
        plane: k.plane,
        x: k.x,
        y: k.y,
        points,
      });
    }
  }

  function view(): HarvestView {
    const tick = host.tick();
    const wv: WarthogView[] = warthogs.map((w) => ({
      id: w.id,
      layerId: w.spot.layerId,
      plane: w.spot.plane,
      scale: w.scale,
      x: w.x,
      y: w.y,
      facing: w.facing,
      t: w.t,
      phase: w.phase,
      hits: w.hits,
      young: w.young,
      squeeze: inHole(w, w.spot),
    }));
    const pv: PigletView[] = piglets.map((p) => ({
      id: p.id,
      layerId: p.spot.layerId,
      plane: p.spot.plane,
      scale: p.spot.scale * W.pigletScale,
      x: p.x,
      y: p.y,
      facing: p.facing,
      t: p.t,
      motherId: p.motherId,
      running: p.running,
      squeeze: inHole(p, p.spot),
    }));
    const kv: WorkerView[] = workers
      .filter((k) => !k.away)
      .map((k) => ({
        id: k.id,
        layerId: k.layerId,
        plane: k.plane,
        scale: k.scale,
        x: k.x,
        y: k.y,
        facing: k.facing,
        t: k.t,
        look: k.look,
        phase: k.phase,
      }));
    return {
      phase,
      t: phase === 'intro' ? tick : tick - introEnd,
      introTicks: introEnd,
      breakTick,
      crop,
      repair: p2 !== null ? 1 : phase === 'intro' ? 0 : Math.min(1, (tick - introEnd) / rushTicks),
      clockTicksLeft:
        p2 !== null ? p2.ticksLeft() : phase === 'intro' ? rushTicks : Math.max(0, rushEnd - tick),
      gap: { layerId: map.gap.layer, x: gapX, y: map.gap.y, halfWidth: map.gap.halfWidthPx },
      hole:
        hx === null || map.hole === undefined ? null : { x: hx, y: map.hole.y, patched: !holeOpen },
      warthogs: wv,
      piglets: pv,
      workers: kv,
      warthogsBagged: bagged,
      cropBonus: bonus,
      bystanderPenalty,
      phase2:
        p2 === null
          ? null
          : {
              total: p2.total,
              left: p2.left(),
              bagged: p2.result()?.bagged ?? 0,
              ticksLeft: p2.ticksLeft(),
              cropAtStart: p2.result()?.cropAtStart ?? crop,
              animals: p2.view(),
              result: p2.result(),
            },
    };
  }

  function landed(aimOn: (layerId: string) => { readonly x: number; readonly y: number }): void {
    if (phase === 'defend') p2?.landed(aimOn);
  }

  return { introTicks, outroTicks, fireGate, extras, plane, shot, step, view, landed };
};
