// e2e/dev only (v1.17b, D-080, the sizes screenshots): standing guineafowl drawn as yardsticks
// beside a subject. A lazy module (HuntScene imports it on the first __TM_RULERS__ call), so the
// first download carries none of it. View only: the BirdView draws them; never in the sim.
import type { PlaneId } from '../../sim/types';
import type { DrawBird } from './interpolate';

export interface Ruler {
  readonly plane: PlaneId;
  /** Its feet on screen (design px). */
  readonly sx: number;
  readonly sy: number;
  readonly facing: 1 | -1;
}

/** A layer root's screen transform (ParallaxView's plane node). */
export interface RootXf {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** The yardsticks as birds (screen point → the plane's layer coords; standing alert, never
 *  hittable, ids below every sim id). */
export function rulerBirds(
  rulers: readonly Ruler[],
  rootOf: (plane: PlaneId) => RootXf,
): DrawBird[] {
  return rulers.map((r, i) => {
    const root = rootOf(r.plane);
    const x = (r.sx - root.x) / root.scaleX;
    const y = (r.sy - root.y) / root.scaleY;
    return {
      x,
      y,
      view: {
        id: -1000 - i,
        creature: 'tarentaal',
        kind: 'target',
        plane: r.plane,
        x,
        y,
        facing: r.facing,
        motion: 'flock',
        phase: 'alert',
        behaviour: 'alert',
        hittable: false,
        flockId: null,
        ground: null,
        armored: false,
      },
    };
  });
}

/** Installs window.__TM_RULERS__ (test builds): `set` takes the draw list maker (null: none). */
export function registerRulers(
  set: (draw: (() => DrawBird[]) | null) => void,
  rootOf: (plane: PlaneId) => RootXf,
): void {
  (
    window as {
      __TM_RULERS__?: (
        r: readonly { plane: PlaneId; sx: number; sy: number; facing?: 1 | -1 }[],
      ) => void;
    }
  ).__TM_RULERS__ = (r) => {
    const list = r.map((x) => ({ ...x, facing: x.facing ?? 1 }));
    set(list.length === 0 ? null : () => rulerBirds(list, rootOf));
  };
}
