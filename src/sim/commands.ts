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
    default:
      return cmd;
  }
}
