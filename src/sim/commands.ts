// One gate for every command entering the sim or a replay log. Non-finite values are dropped;
// positions are quantised to 0.5 and clamped to what a screen can produce, so whatever the sim
// accepts is exactly what an InputLog can encode (and replays identically).
import { clampCameraX, quantiseHalf } from './camera';
import type { Command } from './types';
import { DESIGN_HEIGHT, MAX_HALF_VIEW_WIDTH } from './world';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The command as the sim will apply it, or null if the sim ignores it. */
export function sanitiseCommand(cmd: Command): Command | null {
  switch (cmd.t) {
    case 'fire':
    case 'fireHoldStart':
    case 'fireHoldMove':
      if (!Number.isFinite(cmd.dx) || !Number.isFinite(cmd.sy)) return null;
      return {
        t: cmd.t,
        dx: quantiseHalf(clamp(cmd.dx, -MAX_HALF_VIEW_WIDTH, MAX_HALF_VIEW_WIDTH)),
        sy: quantiseHalf(clamp(cmd.sy, 0, DESIGN_HEIGHT)),
      };
    case 'cameraTarget':
      return Number.isFinite(cmd.cx) ? { t: 'cameraTarget', cx: clampCameraX(cmd.cx) } : null;
    case 'consumable':
      return Number.isFinite(cmd.slot) && cmd.slot >= 0 && cmd.slot < 16
        ? { t: 'consumable', slot: Math.trunc(cmd.slot) }
        : null;
    case 'charmOrder':
      return isPermutation(cmd.order) ? { t: 'charmOrder', order: [...cmd.order] } : null;
    default:
      return cmd;
  }
}

/** Most charm slots a reorder can name (content has 5; room to grow). */
export const MAX_CHARM_SLOTS = 16;

/** A reorder must be a permutation of 0..n-1 (new slot i holds old slot order[i]). */
function isPermutation(order: readonly number[]): boolean {
  if (order.length === 0 || order.length > MAX_CHARM_SLOTS) return false;
  const seen = new Set<number>();
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= order.length || seen.has(i)) return false;
    seen.add(i);
  }
  return true;
}
