// Halloween's twist rule, the Spookjag (D-048, GDD §15 Feesdae): bats are a fast, erratic bonus target,
// the spotted eagle-owl is protected, and shooting every pumpkin lantern of the day pays once.
// Pure and deterministic: everything is drawn at hunt start or on spawn from the 'feesdag'
// stream (no other system's sequence moves), and every number comes from feesdae.json.
import type { Biome, Feesdag, Scoring } from '../../content/schemas';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import type { RandomStream } from '../rng';
import type { PlaneId } from '../types';
import { coreWidth, LAYER_BLEED_PX } from '../world';

export type SpookTwist = Feesdag['twist'];

/** Spookjag ids start here, clear of bird ids (an owl's penaltyApplied carries its id). */
export const SPOOK_ID_BASE = 1_000_000;
export type SpookKind = 'bat' | 'owl' | 'lantern';
type FlyerCfg = SpookTwist['bats'];

export interface SpookThing {
  readonly id: number;
  readonly kind: SpookKind;
  readonly plane: PlaneId;
  x: number;
  y: number;
  /** Flyers: px per tick (sign = direction). Lanterns: 0. */
  vx: number;
  readonly facing: 1 | -1;
  /** Flyers: the lane height and the swerve under way (offsets from the lane, start/end tick). */
  readonly laneY: number;
  swerveFrom: number;
  swerveTo: number;
  swerveStart: number;
  swerveEnd: number;
  /** Lanterns: shot out. */
  dark: boolean;
  /** Lanterns: what it stands on (render only). Flyers: 'bare'. */
  readonly base: LanternBase;
}

export type LanternBase = 'bare' | 'rock' | 'post';

interface LanternPlace {
  readonly i: number;
  /** A prop top (placed first). */
  readonly first: boolean;
  readonly plane: 'mid' | 'far';
  readonly x: number;
  readonly ground: number;
  readonly lift: number;
  readonly base: LanternBase;
}

interface Due {
  readonly tick: number;
  readonly kind: 'bat' | 'owl';
}

export interface Spookjag {
  readonly twist: SpookTwist;
  readonly due: Due[];
  cursor: number;
  readonly things: SpookThing[];
  readonly lanternsTotal: number;
  /** Swerve lengths in ticks (converted once, at hunt start). */
  readonly swerveTicks: Readonly<Record<'bat' | 'owl', readonly [number, number]>>;
  allOutPaid: boolean;
  nextId: number;
}

export interface SpookDeps {
  readonly twist: SpookTwist;
  readonly biome: Biome;
  readonly planes: Scoring['planes'];
  readonly durationTicks: number;
  readonly rng: RandomStream;
}

/** Draws the hunt's flyer times and lights the day's lanterns. */
export function startSpookjag(d: SpookDeps): Spookjag {
  const { twist, rng, durationTicks } = d;
  const due: Due[] = [];
  const plan = (kind: 'bat' | 'owl', cfg: FlyerCfg): void => {
    const n = rng.int(cfg.perHunt[0], cfg.perHunt[1]);
    for (let i = 0; i < n; i++)
      due.push({ tick: Math.floor(rng.range(cfg.window[0], cfg.window[1]) * durationTicks), kind });
  };
  plan('bat', twist.bats);
  plan('owl', twist.owls);
  // Stable order: by tick, bats before owls on the same tick (they were drawn first).
  due.sort((a, b) => a.tick - b.tick || (a.kind === b.kind ? 0 : a.kind === 'bat' ? -1 : 1));

  // Lanterns: `count` spots without repeats — prop tops of this map first, then ground spots
  // on planes the map has a ground line for.
  const lt = twist.lanterns;
  const layerPlane = new Map(
    d.biome.layers.flatMap((l) =>
      l.plane === 'mid' || l.plane === 'far' ? [[l.id, l] as const] : [],
    ),
  );
  const places: LanternPlace[] = [];
  lt.spots.forEach((s, i) => {
    if ('prop' in s) {
      const prop = d.biome.props.find((p) => p.id === s.prop);
      const layer = prop === undefined ? undefined : layerPlane.get(prop.layer);
      const o = prop?.occluder;
      if (prop === undefined || layer?.plane === undefined || o === undefined) return;
      const plane = layer.plane as 'mid' | 'far';
      // The occluder's top at dx from its centre (an ellipse curves down to its sides).
      const half =
        o.type === 'rect'
          ? o.h / 2
          : o.ry * Math.sqrt(Math.max(0, 1 - (s.dx / o.rx) * (s.dx / o.rx)));
      places.push({
        i,
        first: true,
        plane,
        x: prop.u * coreWidth(layer.scrollFactor) + o.ox + s.dx,
        ground: prop.y + o.oy - half,
        lift: lt.liftBare,
        base: 'bare',
      });
      return;
    }
    const band = d.biome.lanes[s.plane]?.groundY;
    if (band === undefined) return;
    places.push({
      i,
      first: false,
      plane: s.plane,
      x: s.u * coreWidth(d.planes[s.plane].scrollFactor),
      ground: band[1] + lt.front * d.planes[s.plane].scale,
      lift: lt.lift,
      base: s.base,
    });
  });
  const want = Math.min(places.length, rng.int(lt.count[0], lt.count[1]));
  const picked: LanternPlace[] = [];
  for (const first of [true, false]) {
    const pool = places.filter((p) => p.first === first);
    while (picked.length < want && pool.length > 0) {
      const [p] = pool.splice(rng.int(0, pool.length - 1), 1);
      if (p !== undefined) picked.push(p);
    }
  }
  picked.sort((a, b) => a.i - b.i);
  let nextId = SPOOK_ID_BASE;
  const things: SpookThing[] = picked.map((p) => ({
    id: nextId++,
    kind: 'lantern',
    plane: p.plane,
    x: p.x,
    y: p.ground - p.lift * d.planes[p.plane].scale,
    vx: 0,
    facing: 1,
    laneY: p.ground,
    swerveFrom: 0,
    swerveTo: 0,
    swerveStart: 0,
    swerveEnd: 0,
    dark: false,
    base: p.base,
  }));
  return {
    twist,
    due,
    cursor: 0,
    things,
    lanternsTotal: things.length,
    swerveTicks: {
      bat: [msToTicks(twist.bats.swerveMs[0]), msToTicks(twist.bats.swerveMs[1])],
      owl: [msToTicks(twist.owls.swerveMs[0]), msToTicks(twist.owls.swerveMs[1])],
    },
    allOutPaid: false,
    nextId,
  };
}

function cfgOf(s: Spookjag, kind: 'bat' | 'owl'): FlyerCfg {
  return kind === 'bat' ? s.twist.bats : s.twist.owls;
}

/** Smoothstep from 0 to 1 (no transcendental maths). */
function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

function newSwerve(
  s: Spookjag,
  f: SpookThing,
  ratio: number,
  tick: number,
  rng: RandomStream,
): void {
  if (f.kind === 'lantern') return;
  const cfg = cfgOf(s, f.kind);
  const [a, b] = s.swerveTicks[f.kind];
  f.swerveFrom = f.swerveTo;
  f.swerveTo = rng.range(-cfg.swerve, cfg.swerve) * ratio;
  f.swerveStart = tick;
  f.swerveEnd = tick + Math.max(1, Math.round(rng.range(a, b)));
}

export interface SpookStep {
  readonly spawned: readonly SpookThing[];
  readonly gone: readonly SpookThing[];
}

/** One tick: due flyers enter at a plane edge, flyers move and swerve, ones past the far edge go. */
export function stepSpookjag(
  s: Spookjag,
  d: Omit<SpookDeps, 'twist' | 'durationTicks'>,
  tick: number,
): SpookStep {
  const { rng, planes, biome } = d;
  const spawned: SpookThing[] = [];
  while (s.cursor < s.due.length && (s.due[s.cursor]?.tick ?? Infinity) <= tick) {
    const due = s.due[s.cursor++];
    if (due === undefined) break;
    const cfg = cfgOf(s, due.kind);
    const lanes = cfg.planes.filter((p) => biome.lanes[p]?.skyY !== undefined);
    const plane = lanes[rng.int(0, Math.max(0, lanes.length - 1))];
    const sky = plane === undefined ? undefined : biome.lanes[plane]?.skyY;
    if (plane === undefined || sky === undefined) continue;
    const p = planes[plane];
    const ratio = p.scale / planes.mid.scale;
    const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    const margin = cfg.rx * 2 * p.scale;
    const f: SpookThing = {
      id: s.nextId++,
      kind: due.kind,
      plane,
      x: dir > 0 ? -LAYER_BLEED_PX - margin : coreWidth(p.scrollFactor) + LAYER_BLEED_PX + margin,
      y: 0,
      vx: (dir * cfg.speed * ratio) / TICKS_PER_SECOND,
      facing: dir,
      laneY: rng.range(sky[0], sky[1]),
      swerveFrom: 0,
      swerveTo: 0,
      swerveStart: tick,
      swerveEnd: tick,
      dark: false,
      base: 'bare',
    };
    newSwerve(s, f, ratio, tick, rng);
    f.y = f.laneY;
    s.things.push(f);
    spawned.push(f);
  }
  const gone: SpookThing[] = [];
  for (const f of s.things) {
    if (f.kind === 'lantern') continue;
    const cfg = cfgOf(s, f.kind);
    const p = planes[f.plane];
    const ratio = p.scale / planes.mid.scale;
    if (tick >= f.swerveEnd) newSwerve(s, f, ratio, tick, rng);
    const k = ease((tick - f.swerveStart) / Math.max(1, f.swerveEnd - f.swerveStart));
    f.x += f.vx;
    f.y = f.laneY + f.swerveFrom + (f.swerveTo - f.swerveFrom) * k;
    const margin = cfg.rx * 2 * p.scale;
    const out =
      f.vx > 0
        ? f.x > coreWidth(p.scrollFactor) + LAYER_BLEED_PX + margin
        : f.x < -LAYER_BLEED_PX - margin;
    if (out) gone.push(f);
  }
  if (gone.length > 0)
    removeThings(
      s,
      gone.map((g) => g.id),
    );
  return { spawned, gone };
}

export function removeThings(s: Spookjag, ids: readonly number[]): void {
  for (let i = s.things.length - 1; i >= 0; i--) {
    const t = s.things[i];
    if (t !== undefined && ids.includes(t.id)) s.things.splice(i, 1);
  }
}

/** Hit ellipse of a thing (plane coords, already scaled by the plane); dark lanterns have none. */
export function spookShape(
  s: Spookjag,
  t: SpookThing,
  planes: Scoring['planes'],
): { rx: number; ry: number } | null {
  if (t.kind === 'lantern' && t.dark) return null;
  const k = planes[t.plane].scale;
  const c = t.kind === 'lantern' ? s.twist.lanterns : cfgOf(s, t.kind);
  return { rx: c.rx * k, ry: c.ry * k };
}

/** Lanterns still lit. */
export function lanternsLit(s: Spookjag): number {
  return s.things.filter((t) => t.kind === 'lantern' && !t.dark).length;
}
