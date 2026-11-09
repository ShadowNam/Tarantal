// v1.12 (D-069) Brakkie's frames from the sim's snapshot, on sim time (a held frame holds): pure,
// so the frame choice is unit-tested and the view only sets what changed.
import type { BrakkieView } from '../../sim/types';
import type { BrakkieFrame } from './brakkieSheet';

/** Ticks per frame: the trot, the run (and the carry), the bark's open mouth, the dig. v1.17
 *  (D-079): 4-frame trot and run cycles (a → c → b → d), quicker per frame: smoother. */
export const TROT_TICKS = 5;
export const RUN_TICKS = 4;
const TROT: readonly BrakkieFrame[] = ['trot_a', 'trot_c', 'trot_b', 'trot_d'];
const RUN: readonly BrakkieFrame[] = ['run_a', 'run_c', 'run_b', 'run_d'];
const cycle = (frames: readonly BrakkieFrame[], t: number, every: number): BrakkieFrame =>
  frames[Math.floor(t / every) % frames.length] ?? 'sit';
export const BARK_CYCLE = 20;
export const BARK_OPEN = 12;
export const DIG_TICKS = 6;
/** v1.17 (D-079): the point's quiver and the proud hop. */
export const POINT_TICKS = 4;
export const PROUD_TICKS = 12;

const alt = (t: number, every: number): boolean => Math.floor(t / every) % 2 === 0;

/** His frame for the snapshot (null: not drawn — away at the bakkie). */
export function dogFrame(v: Pick<BrakkieView, 'present' | 'pose' | 't'>): BrakkieFrame | null {
  if (!v.present) return null;
  switch (v.pose) {
    case 'trot':
      return cycle(TROT, v.t, TROT_TICKS);
    case 'run':
    case 'carry':
      return cycle(RUN, v.t, RUN_TICKS);
    case 'sniff':
      return 'sniff';
    case 'sit':
      return 'sit';
    case 'lie':
      return 'lie';
    case 'bark':
      return v.t % BARK_CYCLE < BARK_OPEN ? 'bark' : 'trot_a';
    case 'dig':
      return alt(v.t, DIG_TICKS) ? 'dig' : 'sniff';
    case 'yelp':
      return 'yelp';
    // v1.17 (D-079): the point quivers (two frames), the proud hop (crouch, up), the head tilt.
    case 'point':
      return alt(v.t, POINT_TICKS) ? 'point_a' : 'point_b';
    case 'proud':
      return alt(v.t, PROUD_TICKS) ? 'proud_a' : 'proud_b';
    case 'tilt':
      return 'tilt';
  }
}

/** The title's wag: tail swishes for `wagMs` after a tap (sit ↔ wag every `swishMs`); "reduce
 *  motion" keeps him calm — one happy frame, no swish. */
export function wagFrame(
  sinceTapMs: number | null,
  wagMs: number,
  swishMs: number,
  reducedMotion: boolean,
): BrakkieFrame {
  if (sinceTapMs === null || sinceTapMs < 0 || sinceTapMs >= wagMs) return 'sit';
  if (reducedMotion) return 'wag_a';
  return Math.floor(sinceTapMs / swishMs) % 2 === 0 ? 'wag_a' : 'sit';
}

/** Eases a plane crossing (0…1): quick away, settling in. */
export const crossEase = (p: number): number => 1 - (1 - p) * (1 - p);
