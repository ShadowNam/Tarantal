// Builders for the scheduled world events that place something in the world (Tech §3.6): the
// perching kwêvoël, the boss appearance and dust devils. Everything comes from the biome entry
// (perchProps, stayMs, roamPx, plane, radiusPx, lifeSeconds, speedPxPerSec) and the creature —
// no event or prop is known here by id.
import type { Biome, Scoring } from '../../content/schemas';
import type { Bird, BirdCreature } from '../birds/Bird';
import {
  createBossBird,
  createHopperBird,
  createPerchBird,
  createSkyPassBird,
  type HopSpec,
  type PeekStop,
} from '../birds/scripted';
import { planeCentreX } from '../camera';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import { spawnDustDevil, type DustDevil } from '../omen/dustDevil';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth, LAYER_BLEED_PX, MAX_HALF_VIEW_WIDTH } from '../world';

export type BiomeEvent = Biome['events'][number];

// Structure, not tuning: a perching bird starts this far (plane px at mid, beyond the widest
// screen) from its perch, so it flies in from off screen.
const PERCH_APPROACH_PX = MAX_HALF_VIEW_WIDTH + 200;

export interface WorldDeps {
  readonly biome: Biome;
  readonly planes: Scoring['planes'];
  readonly creatures: ReadonlyMap<string, BirdCreature>;
  /** Take-off angle for birds leaving (radians), from flockDefaults.flushAngleDeg. */
  readonly leaveAngle: number;
}

interface PerchPoint {
  readonly plane: PlaneId;
  readonly scrollFactor: number;
  readonly x: number;
  readonly y: number;
}

/** One of the event's perch props (picked with rng), as a point on its plane. */
function perchPoint(deps: WorldDeps, event: BiomeEvent, rng: RandomStream): PerchPoint | null {
  const ids = event.perchProps ?? [];
  const id = ids[rng.int(0, Math.max(0, ids.length - 1))];
  const prop = deps.biome.props.find((p) => p.id === id);
  const layer = deps.biome.layers.find((l) => l.id === prop?.layer);
  if (prop?.perch === undefined || layer?.plane === undefined) return null;
  return {
    plane: layer.plane,
    scrollFactor: layer.scrollFactor,
    x: prop.u * coreWidth(layer.scrollFactor) + prop.perch.ox,
    y: prop.y + prop.perch.oy,
  };
}

/** Every perch prop of the event on one plane, as points (props order). */
function allPerchPoints(deps: WorldDeps, event: BiomeEvent): PerchPoint[] {
  const out: PerchPoint[] = [];
  for (const id of event.perchProps ?? []) {
    const prop = deps.biome.props.find((p) => p.id === id);
    const layer = deps.biome.layers.find((l) => l.id === prop?.layer);
    if (prop?.perch === undefined || layer?.plane === undefined) continue;
    out.push({
      plane: layer.plane,
      scrollFactor: layer.scrollFactor,
      x: prop.u * coreWidth(layer.scrollFactor) + prop.perch.ox,
      y: prop.y + prop.perch.oy,
    });
  }
  return out;
}

/**
 * A peeking boss's whole route (Ou Grys, peekFromCover): from a random cover point to another
 * one each time, hiding `hideMs` on the way and peeking `peekMs`, until the stay is used up.
 * Drawn once from the boss stream so updates need no randomness.
 */
function peekRoute(
  points: readonly PerchPoint[],
  first: number,
  stayTicks: number,
  peekMs: readonly [number, number],
  hideMs: readonly [number, number],
  rng: RandomStream,
): PeekStop[] {
  const stops: PeekStop[] = [];
  let at = first;
  for (let used = 0; used < stayTicks;) {
    const p = points[at];
    if (p === undefined) break;
    const hideTicks = Math.max(1, msToTicks(rng.range(hideMs[0], hideMs[1])));
    const peekTicks = Math.max(1, msToTicks(rng.range(peekMs[0], peekMs[1])));
    stops.push({ x: p.x, y: p.y, hideTicks, peekTicks });
    used += hideTicks + peekTicks;
    if (points.length > 1) {
      const step = rng.int(1, points.length - 1);
      at = (at + step) % points.length;
    }
  }
  return stops;
}

/** A peek route over the event's covers on the bird's plane, starting at `at` (and visible hops
 *  between them when the event gives hopMs/hopPx). */
function coverRoute(
  deps: WorldDeps,
  event: BiomeEvent,
  at: PerchPoint,
  stayTicks: number,
  ratio: number,
  rng: RandomStream,
): { peekStops?: PeekStop[]; hop?: HopSpec } {
  if (event.peekMs === undefined || event.hideMs === undefined) return {};
  const covers = allPerchPoints(deps, event).filter((p) => p.plane === at.plane);
  const first = Math.max(
    0,
    covers.findIndex((p) => p.x === at.x && p.y === at.y),
  );
  if (event.hopMs === undefined || event.hopPx === undefined || event.hopPxPerSec === undefined)
    return { peekStops: peekRoute(covers, first, stayTicks, event.peekMs, event.hideMs, rng) };
  const hop = { px: event.hopPx * ratio };
  const pxPerTick = (event.hopPxPerSec * ratio) / TICKS_PER_SECOND;
  const peekStops = hopRoute(covers, first, stayTicks, event, pxPerTick, rng);
  return { peekStops, hop };
}

/**
 * A hopping bird's route (kuifkop, Kuifkop Koning): from cover to an adjacent cover (by x; turning
 * back at the ends), each hop as long as its distance needs at hopPxPerSec but never shorter than
 * hopMs, so a hop can be followed and hit (D-025 review fix: any-cover hops crossed the panorama
 * in half a second).
 */
function hopRoute(
  points: readonly PerchPoint[],
  first: number,
  stayTicks: number,
  event: BiomeEvent,
  pxPerTick: number,
  rng: RandomStream,
): PeekStop[] {
  const { peekMs, hideMs, hopMs } = event;
  if (peekMs === undefined || hideMs === undefined || hopMs === undefined) return [];
  const order = points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.x - b.p.x || a.i - b.i)
    .map((x) => x.p);
  const start = points[first];
  let at = Math.max(
    0,
    order.findIndex((p) => p === start),
  );
  let dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  const stops: PeekStop[] = [];
  let hopTicks = 0;
  for (let used = 0; used < stayTicks;) {
    const p = order[at];
    if (p === undefined) break;
    const hideTicks = Math.max(1, msToTicks(rng.range(hideMs[0], hideMs[1])));
    const peekTicks = Math.max(1, msToTicks(rng.range(peekMs[0], peekMs[1])));
    stops.push({ x: p.x, y: p.y, hideTicks, peekTicks, hopTicks: Math.max(1, hopTicks) });
    used += hideTicks + peekTicks + hopTicks;
    if (order.length < 2) break;
    if (at + dir < 0 || at + dir >= order.length) dir = dir > 0 ? -1 : 1;
    const next = order[at + dir];
    if (next === undefined) break;
    const minTicks = msToTicks(rng.range(hopMs[0], hopMs[1]));
    hopTicks = Math.max(minTicks, Math.ceil(Math.abs(next.x - p.x) / Math.max(1e-6, pxPerTick)));
    at += dir;
  }
  return stops;
}

/** A hopping target (kuifkop): hides in one of the event's covers, peeks, hops to another. */
export function buildHopperBird(
  deps: WorldDeps,
  event: BiomeEvent,
  id: number,
  rng: RandomStream,
): Bird | null {
  const c = event.creature === undefined ? undefined : deps.creatures.get(event.creature);
  const stay = event.stayMs;
  if (c === undefined || c.kind === 'nonTarget' || stay === undefined) return null;
  const at = perchPoint(deps, event, rng);
  if (at === null) return null;
  const scale = deps.planes[at.plane].scale;
  const ratio = scale / deps.planes.mid.scale;
  const stayTicks = Math.max(1, msToTicks(rng.range(stay[0], stay[1])));
  const route = coverRoute(deps, event, at, stayTicks, ratio, rng);
  return createHopperBird({
    ...route,
    id,
    creature: c,
    plane: at.plane,
    scrollFactor: at.scrollFactor,
    planeScale: scale,
    coreWidth: coreWidth(at.scrollFactor),
    homeX: at.x,
    homeY: at.y,
    stayTicks,
    ...speedsPerTick(c, ratio),
    leaveAngle: deps.leaveAngle,
    dir: rng.chance(0.5) ? 1 : -1,
    startX: at.x,
    startY: at.y,
    roamPx: 0,
    armorLeft: 0,
    hitsLeft: c.kind === 'boss' ? c.hitsToBag : 1,
  });
}

function speedsPerTick(c: BirdCreature, ratio: number): { walk: number; run: number; fly: number } {
  const s = c.speeds ?? {};
  const t = (v: number | undefined): number => ((v ?? 0) * ratio) / TICKS_PER_SECOND;
  return { walk: t(s.walk), run: t(s.run), fly: t(s.fly) };
}

/** The kwêvoël (or any perchHigh creature): flies in to a perch prop. */
export function buildPerchBird(
  deps: WorldDeps,
  event: BiomeEvent,
  id: number,
  rng: RandomStream,
): Bird | null {
  const c = event.creature === undefined ? undefined : deps.creatures.get(event.creature);
  const stay = event.stayMs;
  if (c === undefined || stay === undefined) return null;
  const at = perchPoint(deps, event, rng);
  if (at === null) return null;
  const scale = deps.planes[at.plane].scale;
  const ratio = scale / deps.planes.mid.scale;
  const sky = deps.biome.lanes[at.plane]?.skyY;
  const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  return createPerchBird({
    id,
    creature: c,
    plane: at.plane,
    scrollFactor: at.scrollFactor,
    planeScale: scale,
    coreWidth: coreWidth(at.scrollFactor),
    homeX: at.x,
    homeY: at.y,
    stayTicks: Math.max(1, msToTicks(rng.range(stay[0], stay[1]))),
    ...speedsPerTick(c, ratio),
    leaveAngle: deps.leaveAngle,
    dir,
    startX: at.x - dir * PERCH_APPROACH_PX * ratio,
    startY: sky?.[0] ?? at.y,
    roamPx: 0,
    armorLeft: 0,
    hitsLeft: 1,
  });
}

/**
 * One pass of a sky boss (Die Stormvoël) across `plane`'s sky lane, entering beyond the panorama
 * edge on the side it comes from. `passes` are the passes still to come after this one.
 */
export function buildSkyPass(
  deps: WorldDeps,
  c: BirdCreature,
  plane: PlaneId,
  dir: 1 | -1,
  hitsLeft: number,
  passes: readonly PlaneId[],
  id: number,
): Bird | null {
  const layer = deps.biome.layers.find((l) => l.plane === plane);
  const sky = deps.biome.lanes[plane]?.skyY;
  if (layer === undefined || sky === undefined) return null;
  const scale = deps.planes[plane].scale;
  const ratio = scale / deps.planes.mid.scale;
  const width = coreWidth(layer.scrollFactor);
  const margin = (c.hitbox.body.rx + Math.abs(c.hitbox.body.ox)) * scale + LAYER_BLEED_PX;
  return createSkyPassBird({
    id,
    creature: c,
    plane,
    scrollFactor: layer.scrollFactor,
    planeScale: scale,
    coreWidth: width,
    homeX: width / 2,
    homeY: (sky[0] + sky[1]) / 2,
    stayTicks: 1,
    ...speedsPerTick(c, ratio),
    leaveAngle: deps.leaveAngle,
    dir,
    startX: dir > 0 ? -margin : width + margin,
    startY: (sky[0] + sky[1]) / 2,
    roamPx: 0,
    armorLeft: 0,
    hitsLeft,
    passes,
  });
}

/** A boss appearing at a perch prop (the Generaal at the bakkie). */
export function buildBossBird(
  deps: WorldDeps,
  event: BiomeEvent,
  id: number,
  rng: RandomStream,
): Bird | null {
  const c = event.creature === undefined ? undefined : deps.creatures.get(event.creature);
  // Die Stormvoël crosses the sky (its passes, e.g. far then mid) instead of standing anywhere.
  if (c?.kind === 'boss' && event.passes !== undefined) {
    const [first, ...rest] = event.passes;
    if (first === undefined) return null;
    return buildSkyPass(deps, c, first, rng.chance(0.5) ? 1 : -1, c.hitsToBag, rest, id);
  }
  const stay = event.stayMs;
  if (c?.kind !== 'boss' || stay === undefined) return null;
  const at = perchPoint(deps, event, rng);
  if (at === null) return null;
  const scale = deps.planes[at.plane].scale;
  const ratio = scale / deps.planes.mid.scale;
  const stayTicks = Math.max(1, msToTicks(rng.range(stay[0], stay[1])));
  // Ou Grys peeks from cover; Kuifkop Koning hops between reeds (validated timings).
  const route =
    c.behaviours.includes('peekFromCover') || c.behaviours.includes('hop')
      ? coverRoute(deps, event, at, stayTicks, ratio, rng)
      : {};
  return createBossBird({
    ...route,
    id,
    creature: c,
    plane: at.plane,
    scrollFactor: at.scrollFactor,
    planeScale: scale,
    coreWidth: coreWidth(at.scrollFactor),
    homeX: at.x,
    homeY: at.y,
    stayTicks,
    ...speedsPerTick(c, ratio),
    leaveAngle: deps.leaveAngle,
    dir: rng.chance(0.5) ? 1 : -1,
    startX: at.x,
    startY: at.y,
    roamPx: (event.roamPx ?? 0) * ratio,
    armorLeft: c.armorHits ?? 0,
    hitsLeft: c.hitsToBag,
  });
}

/** A dust devil crossing its plane in view, downwind (or a random way without wind). */
export function buildDustDevil(
  deps: WorldDeps,
  event: BiomeEvent,
  id: number,
  cameraX: number,
  windDir: 1 | -1 | null,
  rng: RandomStream,
): DustDevil | null {
  const { plane, radiusPx, lifeSeconds, speedPxPerSec } = event;
  if (
    plane === undefined ||
    radiusPx === undefined ||
    lifeSeconds === undefined ||
    speedPxPerSec === undefined
  )
    return null;
  const ground = deps.biome.lanes[plane]?.groundY;
  if (ground === undefined) return null;
  const p = deps.planes[plane];
  const dir: 1 | -1 = windDir ?? (rng.chance(0.5) ? 1 : -1);
  return spawnDustDevil(
    {
      id,
      plane,
      centreX: planeCentreX(cameraX, p.scrollFactor),
      y: (ground[0] + ground[1]) / 2,
      ratio: p.scale / deps.planes.mid.scale,
      dir,
      speedPxPerSec,
      radiusPx,
      lifeSeconds,
      flushes: event.flushOnContact !== false,
    },
    rng,
  );
}
