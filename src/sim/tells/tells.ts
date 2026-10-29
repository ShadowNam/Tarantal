// v1.7e (D-061, GDD §6.5, Tech §3.12c) The secrets' tell animals: the cue that replaced the hint
// glint. One small, unique creature lives at each secret (the biome file names it under the
// secret's `tell`) and does its small action every few seconds, so a sharp eye learns "where the
// agama nods, there's something". A non-target: a hit costs nothing (no points, no Frenzy change);
// it is gone for a few seconds and comes back. While its secret is spent it stays away. Pure and
// deterministic: every random draw comes from the hunt's 'tells' stream, in tell order; every
// number comes from birds.json `tells`.
import type { Biome, TellTuning } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { RandomStream } from '../rng';
import type { TellView } from '../types';
import { coreWidth } from '../world';

/** rest (still) · act (its small action) · gone (fled after a hit, or its secret is spent). */
export type TellPhase = 'rest' | 'act' | 'gone';

export interface TellState {
  readonly id: number;
  readonly propId: string;
  readonly layerId: string;
  readonly species: string;
  /** Feet on the layer (layer px). Props don't move during a hunt. */
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  /** The hit shape round the feet (layer px; ox mirrored with facing). */
  readonly hit: {
    readonly rx: number;
    readonly ry: number;
    readonly ox: number;
    readonly oy: number;
  };
  phase: TellPhase;
  /** Ticks in this phase, and how long it lasts. */
  t: number;
  dur: number;
  /** Gone because its secret is spent: never comes back this hunt. */
  left: boolean;
}

/** One tell as the hunt places it (from the map's props). */
export interface TellPlacement {
  readonly propId: string;
  readonly layerId: string;
  readonly species: string;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
}

const ticks = (r: RandomStream, [a, b]: readonly [number, number]): number =>
  Math.max(1, secondsToTicks(r.range(a, b)));

/** The hunt's tells, in placement order (one draw each: when it first acts). */
export function createTells(
  placements: readonly TellPlacement[],
  T: TellTuning,
  rng: RandomStream,
  nextId: () => number,
): TellState[] {
  const out: TellState[] = [];
  for (const p of placements) {
    const sp = T.species.find((s) => s.id === p.species);
    if (sp === undefined) continue;
    out.push({
      id: nextId(),
      propId: p.propId,
      layerId: p.layerId,
      species: p.species,
      x: p.x,
      y: p.y,
      facing: p.facing,
      hit: sp.hit,
      phase: 'rest',
      t: 0,
      dur: ticks(rng, T.actEverySeconds),
      left: false,
    });
  }
  return out;
}

/** Whether a pellet can strike the tell now (it is there). */
export const tellPresent = (t: TellState): boolean => t.phase !== 'gone';

/** The hit ellipse's centre (layer px). */
export function tellHitCentre(t: TellState): { x: number; y: number } {
  return { x: t.x + t.hit.ox * t.facing, y: t.y + t.hit.oy };
}

/**
 * One tick. `spent`: its secret has paid out for the hunt (it leaves and stays away). `ready`:
 * the secret can be set off now (a cooling-down secret's tell rests without acting).
 * Returns 'back' on the tick it comes back after a hit.
 */
export function stepTell(
  t: TellState,
  T: TellTuning,
  rng: RandomStream,
  spent: boolean,
  ready: boolean,
): 'back' | null {
  if (spent) {
    if (!t.left) {
      t.left = true;
      t.phase = 'gone';
      t.t = 0;
      t.dur = 0;
    }
    t.t++;
    return null;
  }
  t.t++;
  if (t.phase === 'gone') {
    if (t.t < t.dur) return null;
    t.phase = 'rest';
    t.t = 0;
    t.dur = ticks(rng, T.actEverySeconds);
    return 'back';
  }
  if (t.t < t.dur) return null;
  if (t.phase === 'rest' && ready) {
    t.phase = 'act';
    t.t = 0;
    t.dur = Math.max(1, secondsToTicks(T.actSeconds));
  } else {
    t.phase = 'rest';
    t.t = 0;
    t.dur = ticks(rng, T.actEverySeconds);
  }
  return null;
}

/** A pellet struck it: gone for goneSeconds (no cost). */
export function spookTell(t: TellState, T: TellTuning, rng: RandomStream): void {
  t.phase = 'gone';
  t.t = 0;
  t.dur = ticks(rng, T.goneSeconds);
}

/** The map's tells: one per secret that names one (in prop order), feet on the prop's layer. */
export function tellPlacements(biome: Biome): TellPlacement[] {
  const layers = new Map(biome.layers.map((l) => [l.id, l]));
  const out: TellPlacement[] = [];
  for (const prop of biome.props) {
    const tell = prop.secret?.tell;
    const layer = layers.get(prop.layer);
    if (tell === undefined || layer === undefined) continue;
    out.push({
      propId: prop.id,
      layerId: layer.id,
      species: tell.species,
      x: prop.u * coreWidth(layer.scrollFactor) + tell.ox,
      y: prop.y + tell.oy,
      facing: tell.facing ?? 1,
    });
  }
  return out;
}

export function tellView(t: TellState): TellView {
  return {
    id: t.id,
    propId: t.propId,
    layerId: t.layerId,
    species: t.species,
    x: t.x,
    y: t.y,
    facing: t.facing,
    phase: t.phase,
    t: t.t,
    left: t.left,
  };
}
