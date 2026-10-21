// Which §3.4 clip a bird plays for its sim motion and phase (rendering only, M10). Pure; the
// mapping and the fallbacks are listed for artists in docs/06-ASSET-DELIVERY.md.
import type { BirdMotion, BirdPhase } from '../../sim/types';
import type { BirdClip } from './assetIndex';

/** Ticks a foraging bird spends on each walk/peck spell (render only). */
const FORAGE_SPELL_TICKS = 90;

/** The clip a bird should play now. `id` and `tick` only vary foraging between walk and peck. */
export function clipFor(motion: BirdMotion, phase: BirdPhase, id: number, tick: number): BirdClip {
  switch (motion) {
    case 'flyover':
      return 'flap';
    case 'popup':
      return 'peek';
    case 'perch':
      return phase === 'perch' ? 'alert' : 'flap';
    case 'hop':
    case 'boss':
      if (phase === 'flap') return 'flap';
      if (phase === 'hop') return 'takeoff';
      if (phase === 'peek' || phase === 'hidden') return 'peek';
      if (phase === 'run' || phase === 'land') return 'run';
      return 'forage_walk';
    case 'flock':
      switch (phase) {
        case 'walk':
          // Every third spell is a peck spell, staggered by bird id.
          return (Math.floor(tick / FORAGE_SPELL_TICKS) + id) % 3 === 0 ? 'peck' : 'forage_walk';
        case 'alert':
          return 'alert';
        case 'run':
          return 'run';
        case 'launch':
          return 'takeoff';
        case 'glide':
          return 'glide';
        case 'land':
          return 'land';
        default:
          return 'flap';
      }
  }
}

/**
 * When a delivery lacks a clip, the next one to try (then the next…). A bird whose chain runs out
 * is drawn with its placeholder frames instead.
 */
export const CLIP_FALLBACK: Readonly<Record<BirdClip, BirdClip | null>> = {
  peck: 'forage_walk',
  alert: 'forage_walk',
  run: 'forage_walk',
  land: 'run',
  peek: 'alert',
  takeoff: 'flap',
  glide: 'flap',
  tumble: 'hit_poof',
  forage_walk: null,
  flap: null,
  hit_poof: null,
};

/** The first clip in `want`'s fallback chain that `has` delivered, or null. */
export function resolveClip(want: BirdClip, has: (c: BirdClip) => boolean): BirdClip | null {
  let c: BirdClip | null = want;
  for (let guard = 0; c !== null && guard < 8; guard++) {
    if (has(c)) return c;
    c = CLIP_FALLBACK[c];
  }
  return null;
}
