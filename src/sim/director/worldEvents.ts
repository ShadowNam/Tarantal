// Builders for the scheduled world events that place something in the world (Tech §3.6): the
// perching kwêvoël, the boss appearance and dust devils. Everything comes from the biome entry
// (perchProps, stayMs, roamPx, plane, radiusPx, lifeSeconds, speedPxPerSec) and the creature —
// no event or prop is known here by id.
import type { Biome, Scoring } from '../../content/schemas';
import type { Bird, BirdCreature } from '../birds/Bird';
import { createBossBird, createPerchBird } from '../birds/scripted';
import { planeCentreX } from '../camera';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import { spawnDustDevil, type DustDevil } from '../omen/dustDevil';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth, MAX_HALF_VIEW_WIDTH } from '../world';

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

/** A boss appearing at a perch prop (the Generaal at the bakkie). */
export function buildBossBird(
  deps: WorldDeps,
  event: BiomeEvent,
  id: number,
  rng: RandomStream,
): Bird | null {
  const c = event.creature === undefined ? undefined : deps.creatures.get(event.creature);
  const stay = event.stayMs;
  if (c?.kind !== 'boss' || stay === undefined) return null;
  const at = perchPoint(deps, event, rng);
  if (at === null) return null;
  const scale = deps.planes[at.plane].scale;
  const ratio = scale / deps.planes.mid.scale;
  return createBossBird({
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
