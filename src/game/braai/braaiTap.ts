// v1.11 (D-068): what a tap on the braai tally does. Phaser's own input is off in this game (all
// input is Pointer Events on the canvas, main.ts), so the tally listens to the DOM like Menu does
// and asks this pure rule: a tap on a button drawn on this slate is the button's (never a skip);
// anywhere else it skips the count-up and the story — unless an ad covers the game, or the story
// is already all told. Each tap is recorded in the hook (`braai.taps`) with the branch it took.
import { rectContains, type Rect } from '../ui/hudLayout';

export type TapOutcome = 'button' | 'skip' | `skip-ignored:${'blocked' | 'done'}`;

export interface BraaiTap {
  readonly x: number;
  readonly y: number;
  readonly outcome: TapOutcome;
}

/** How many taps the hook keeps (the last ones). */
export const TAPS_KEPT = 6;

export function classifyTap(
  p: { readonly x: number; readonly y: number },
  buttons: readonly Rect[],
  state: { readonly blocked: boolean; readonly done: boolean },
): TapOutcome {
  if (buttons.some((b) => rectContains(b, p.x, p.y))) return 'button';
  if (state.blocked) return 'skip-ignored:blocked';
  if (state.done) return 'skip-ignored:done';
  return 'skip';
}

/** Appends a tap, keeping the last TAPS_KEPT. */
export function recordTap(taps: BraaiTap[], tap: BraaiTap): void {
  taps.push({ x: Math.round(tap.x), y: Math.round(tap.y), outcome: tap.outcome });
  if (taps.length > TAPS_KEPT) taps.splice(0, taps.length - TAPS_KEPT);
}
