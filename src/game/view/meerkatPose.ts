// v1.7 (D-044): which sheet frame a meerkat shows, from its snapshot pose, head turn and the
// ticks it has been in that pose (sim time, so held frames hold). Pure.
import type { MeerkatView } from '../../sim/types';
import type { MeerkatFrame } from '../assets/desertAssets';

/** Ticks per frame of the run cycle and of digging. */
export const RUN_TICKS = 4;
export const DIG_TICKS = 8;

const look = (l: -1 | 0 | 1): MeerkatFrame => (l < 0 ? 'stand_l' : l > 0 ? 'stand_r' : 'stand_c');

/** The frame to show, or null when the meerkat is out of sight in its burrow. */
export function meerkatFrame(
  m: Pick<MeerkatView, 'pose' | 'look' | 'poseTicks' | 'pup'>,
  barking = false,
): MeerkatFrame | null {
  const t = m.poseTicks;
  if (m.pup) {
    switch (m.pose) {
      case 'hidden':
        return null;
      case 'run':
        return Math.floor(t / RUN_TICKS) % 2 === 0 ? 'pup_run_a' : 'pup_run_b';
      case 'photo':
        return 'front';
      case 'peek':
      case 'emerge':
      case 'dive':
      case 'tumble':
      case 'scold':
        return meerkatFrame({ ...m, pup: false });
      default:
        return 'pup_sit';
    }
  }
  switch (m.pose) {
    case 'hidden':
      return null;
    case 'peek':
      return m.look < 0 ? 'peek_l' : 'peek_r';
    case 'emerge':
      return 'emerge';
    case 'sit':
      return 'sit';
    case 'sentinel':
      return barking ? 'bark' : look(m.look);
    case 'stand':
      return look(m.look);
    case 'forage':
      return Math.floor(t / DIG_TICKS) % 2 === 0 ? 'dig_a' : 'dig_b';
    case 'sunbathe':
      return 'sunbathe';
    case 'run': {
      const frames: readonly MeerkatFrame[] = ['run_0', 'run_1', 'run_2', 'run_3'];
      return frames[Math.floor(t / RUN_TICKS) % frames.length] ?? 'run_0';
    }
    case 'dive':
      return t < 6 ? 'dive_a' : 'dive_b';
    case 'tumble':
      return 'tumble';
    case 'scold':
      return 'scold';
    case 'photo':
      return 'front';
  }
}
