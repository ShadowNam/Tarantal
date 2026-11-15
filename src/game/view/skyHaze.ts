// Soft sky haze using small, batchable rectangles: no new textures or filters. Sampling this
// same profile in the readability audit keeps its contrast numbers faithful to the renderer.
import type { Light } from '../../content/schemas';
import { DESIGN_HEIGHT } from '../../sim/world';

type Haze = NonNullable<Light['haze']>[number];
const STEPS = 32;

/** Opacity of the strip containing y; whole-sky haze retains its original uniform opacity. */
export function skyHazeAlpha(haze: Haze, y: number): number {
  const top = haze.top ?? 0;
  const bottom = haze.bottom ?? DESIGN_HEIGHT;
  if (bottom <= top || y < top || y >= bottom) return 0;
  const step = (bottom - top) / STEPS;
  const centre = top + (Math.floor((y - top) / step) + 0.5) * step;
  // Feather the outer quarter of a bounded band; don't fade at the screen's own edges.
  const feather = (bottom - top) / 4;
  const t = Math.max(
    0,
    Math.min(
      1,
      top > 0 ? (centre - top) / feather : 1,
      bottom < DESIGN_HEIGHT ? (bottom - centre) / feather : 1,
    ),
  );
  return haze.alpha * t * t * (3 - 2 * t);
}

export function skyHazeBands(haze: Haze): { top: number; bottom: number; alpha: number }[] {
  const top = haze.top ?? 0;
  const bottom = haze.bottom ?? DESIGN_HEIGHT;
  if (bottom <= top || haze.alpha === 0) return [];
  const count = top <= 0 && bottom >= DESIGN_HEIGHT ? 1 : STEPS;
  const step = (bottom - top) / count;
  return Array.from({ length: count }, (_, i) => ({
    top: top + i * step,
    bottom: top + (i + 1) * step,
    alpha: skyHazeAlpha(haze, top + (i + 0.5) * step),
  }));
}
