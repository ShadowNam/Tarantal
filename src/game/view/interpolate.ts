// Interpolation between the last two sim snapshots (Tech §3.2). Pure; unit-tested.
import type { BirdView, SimState } from '../../sim/types';

export interface DrawBird {
  readonly view: BirdView;
  readonly x: number;
  readonly y: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Birds of `cur` at alpha between prev and cur. Both lists are sorted by id, so one merge walk
 * pairs them. A bird that is new in `cur` is drawn at its `cur` position.
 */
export function interpolateBirds(prev: SimState, cur: SimState, alpha: number): DrawBird[] {
  const out: DrawBird[] = [];
  let j = 0;
  for (const b of cur.birds) {
    while (j < prev.birds.length && (prev.birds[j]?.id ?? Infinity) < b.id) j++;
    const p = prev.birds[j];
    if (p !== undefined && p.id === b.id) {
      out.push({ view: b, x: lerp(p.x, b.x, alpha), y: lerp(p.y, b.y, alpha) });
    } else {
      out.push({ view: b, x: b.x, y: b.y });
    }
  }
  return out;
}

export function interpolateCamera(prev: SimState, cur: SimState, alpha: number): number {
  return lerp(prev.cameraX, cur.cameraX, alpha);
}

/**
 * v1.3: the raised sight at alpha between the last two snapshots (raise progress and sway move
 * smoothly at any frame rate). Null when no sight is up in `cur`.
 */
export function interpolateAim(
  prev: SimState,
  cur: SimState,
  alpha: number,
): { zoom: number; progress: number; dx: number; sy: number } | null {
  const c = cur.aim;
  if (c === null) return null;
  const p = prev.aim;
  const t = p === null ? 1 : alpha;
  const from = p ?? c;
  return {
    zoom: c.zoom,
    progress: lerp(from.progress, c.progress, t),
    // The shot point: where the player aims plus the sway now.
    dx: lerp(from.dx + from.swayDx, c.dx + c.swayDx, t),
    sy: lerp(from.sy + from.swayDy, c.sy + c.swayDy, t),
  };
}
