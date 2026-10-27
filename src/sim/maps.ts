// Day-of-week maps and bonus maps (v1.2, GDD §11.5, Tech §3.11, D-033). A map is a biome with
// overrides applied: the layout of a weekday (light, prop positions, feeding spots, fly-over
// routes, weather, pacing, meerkat colonies), then optionally a bonus map (Verder) on top. Pure: the same
// (biome, layout, bonus) always gives the same map, so the map id in a replay or a challenge
// link is all a client needs. No layout (replays before v1.2, Season Run, FTUE) = the biome as
// it is.
import type { Biome, BonusMap, Fence, Layout } from '../content/schemas';
import { PLANES, type PlaneId } from './types';

/** How the map sets the biome weather against the mode's default. */
export type MapWeather = 'calm' | 'default' | 'omen';

export interface ResolvedMap {
  /** The biome with the map's prop positions, lanes, spots, routes, pacing and wind. */
  readonly biome: Biome;
  readonly layout: Layout | null;
  readonly bonus: BonusMap | null;
  /** The bonus map's weather wins over the layout's; 'default' = the mode decides. */
  readonly weather: MapWeather;
  /** Multiplies every bird's base points (1 = unchanged). */
  readonly pointsMul: number;
  /** v1.4 B: per-plane points multipliers (the layout's × the bonus map's); absent = 1. */
  readonly planePointsMul: Readonly<Partial<Record<PlaneId, number>>>;
  /** v1.3 (D-036): the map opens the Ver plane (its layer is in `biome.layers`). */
  readonly ver: boolean;
  /** v1.8 (D-050): the day's fence with its tin cans, on the plane the bonus map moves it to
   *  (null: none; the plain biome, the Season Run and the FTUE have none). */
  readonly fence: Fence | null;
}

/** v1.8 (D-050): the layout's fence, moved to the bonus map's plane for it. */
export function mapFence(layout: Layout | null, bonus: BonusMap | null): Fence | null {
  const f = layout?.fence;
  if (f === undefined) return null;
  const plane = bonus?.fencePlane?.[f.plane] ?? f.plane;
  return plane === f.plane ? f : { ...f, plane };
}

/**
 * v1.3: a biome's Ver layer belongs only to maps that open it. Every other map (and the plain
 * biome) leaves it out, so its slices, spawns and art are exactly as before v1.3.
 */
function withoutVer(biome: Biome): Biome {
  if (!biome.layers.some((l) => l.plane === 'ver')) return biome;
  // v1.4 B (D-039): a biome whose own pacing has Ver flocks (Namibië) drops them too on a map
  // without the plane. The season biomes have none, so their maps are exactly as before.
  const hasVerFlocks = biome.pacing.keyframes.some((k) => k.flocks.ver !== undefined);
  const pacing = !hasVerFlocks
    ? biome.pacing
    : {
        ...biome.pacing,
        keyframes: biome.pacing.keyframes.map((k) => ({
          ...k,
          flocks: Object.fromEntries(Object.entries(k.flocks).filter(([p]) => p !== 'ver')),
        })),
      };
  return { ...biome, pacing, layers: biome.layers.filter((l) => l.plane !== 'ver') };
}

type Override = Omit<BonusMap, 'id' | 'nameKey'>;

/** Applies one override (a layout or a bonus map) to a biome. Multipliers compound. */
function applyOverride(biome: Biome, o: Override): Biome {
  const moved = new Map((o.props ?? []).map((p) => [p.id, p]));
  const props =
    moved.size === 0
      ? biome.props
      : biome.props.map((p) => {
          const m = moved.get(p.id);
          return m === undefined ? p : { ...p, u: m.u, y: m.y ?? p.y };
        });

  let lanes = biome.lanes;
  if (o.lanes !== undefined) {
    const next: { -readonly [K in PlaneId]?: Biome['lanes'][K] } = { ...biome.lanes };
    for (const plane of ['near', 'mid', 'far', 'ver'] as const) {
      const over = o.lanes[plane];
      if (over === undefined) continue;
      // $comment is carried over harmlessly (content comments are ignored everywhere).
      next[plane] = { ...(biome.lanes[plane] ?? {}), ...over };
    }
    lanes = next;
  }

  const p = o.pacing;
  const pacing =
    p === undefined
      ? biome.pacing
      : {
          ...biome.pacing,
          keyframes: biome.pacing.keyframes.map((k) => ({
            ...k,
            flocks: p.flocks ?? k.flocks,
            flyoversPerMin: k.flyoversPerMin * (p.flyoversMul ?? 1),
            popupsPerMin: k.popupsPerMin * (p.popupsMul ?? 1),
          })),
        };

  const wind = biome.omen.wind;
  const omen =
    o.windMul === undefined || wind === undefined
      ? biome.omen
      : {
          ...biome.omen,
          wind: {
            ...wind,
            strength: [wind.strength[0] * o.windMul, wind.strength[1] * o.windMul] as [
              number,
              number,
            ],
          },
        };

  const twist =
    o.flushAsRunChance === undefined
      ? biome.twist
      : { ...(biome.twist ?? {}), flushAsRunChance: o.flushAsRunChance };

  return {
    ...biome,
    props,
    lanes,
    pacing,
    omen,
    ...(twist === undefined ? {} : { twist }),
    ...(o.feedingSpots === undefined ? {} : { feedingSpots: o.feedingSpots }),
    ...(o.cameraStartU === undefined ? {} : { cameraStartU: o.cameraStartU }),
    // v1.7 (D-044): a map's colonies replace the biome's (a bonus map keeps its layout's).
    ...(o.colonies === undefined ? {} : { colonies: o.colonies }),
    ...(o.flyovers === undefined ? {} : { flyovers: { ...biome.flyovers, ...o.flyovers } }),
  };
}

export function findLayout(biome: Biome, layoutId: string): Layout | undefined {
  return biome.layouts.find((l) => l.id === layoutId);
}

export function findBonusMap(biome: Biome, bonusId: string): BonusMap | undefined {
  return biome.bonusMaps.find((b) => b.id === bonusId);
}

/**
 * The map a hunt plays. Throws on an id the biome doesn't have (a replay or link naming content
 * this build lacks is rejected before it gets here). A bonus map needs a layout: it is "the same
 * place, seen from further back".
 */
export function resolveMap(
  biome: Biome,
  layoutId: string | undefined,
  bonusId: string | undefined,
  /** v1.3x (D-037): keep the Ver plane open whatever the map says (the Skietbaan). */
  openVer = false,
): ResolvedMap {
  const hasVer = biome.layers.some((l) => l.plane === 'ver');
  if (layoutId === undefined) {
    if (bonusId !== undefined) throw new Error(`bonus map ${bonusId} needs a layout`);
    return {
      biome: openVer ? biome : withoutVer(biome),
      layout: null,
      bonus: null,
      weather: 'default',
      pointsMul: 1,
      planePointsMul: {},
      ver: openVer && hasVer,
      fence: null,
    };
  }
  const layout = findLayout(biome, layoutId);
  if (layout === undefined) throw new Error(`biome ${biome.id} has no layout ${layoutId}`);
  const bonus = bonusId === undefined ? null : (findBonusMap(biome, bonusId) ?? null);
  if (bonusId !== undefined && bonus === null)
    throw new Error(`biome ${biome.id} has no bonus map ${bonusId}`);
  let resolved = applyOverride(biome, layout);
  if (bonus !== null) resolved = applyOverride(resolved, bonus);
  const ver = (openVer || (bonus?.ver ?? layout.ver ?? false)) && hasVer;
  if (!ver) resolved = withoutVer(resolved);
  const bonusWeather = bonus?.weather;
  return {
    biome: resolved,
    ver,
    layout,
    bonus,
    weather:
      bonusWeather !== undefined && bonusWeather !== 'default' ? bonusWeather : layout.weather,
    pointsMul: (layout.pointsMul ?? 1) * (bonus?.pointsMul ?? 1),
    planePointsMul: combinePlaneMul(layout.planePointsMul, bonus?.planePointsMul),
    fence: mapFence(layout, bonus),
  };
}

/** Per-plane multipliers of a layout and a bonus map, multiplied together. */
function combinePlaneMul(
  a: Readonly<Partial<Record<PlaneId, number | undefined>>> | undefined,
  b: Readonly<Partial<Record<PlaneId, number | undefined>>> | undefined,
): Partial<Record<PlaneId, number>> {
  const out: Partial<Record<PlaneId, number>> = {};
  for (const p of PLANES) {
    const v = (a?.[p] ?? 1) * (b?.[p] ?? 1);
    if (v !== 1) out[p] = v;
  }
  return out;
}

/** Light preset ids of a map, drawn in order (the layout's, then the bonus map's). */
export function mapLights(map: Pick<ResolvedMap, 'layout' | 'bonus'>): string[] {
  const out: string[] = [];
  if (map.layout !== null) out.push(map.layout.light);
  if (map.bonus?.light !== undefined) out.push(map.bonus.light);
  return out;
}

/** The omen (biome weather) of a hunt: an explicit mode setting wins, then the map, then the
 *  mode's default. */
export function mapOmen(
  weather: MapWeather,
  modeOmen: boolean | undefined,
  fallback: boolean,
): boolean {
  if (modeOmen !== undefined) return modeOmen;
  if (weather === 'calm') return false;
  if (weather === 'omen') return true;
  return fallback;
}
