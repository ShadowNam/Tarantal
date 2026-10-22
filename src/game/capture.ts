// Marketing capture mode (M10, Build plan M10): `?capture=1` hides the hunt HUD and the reticle,
// fixes the seed (feel.json capture.seed unless ?seed= is given), and adds keys for trailers and
// GIFs — S cycles slow motion, F freezes the action, C toggles a slow automatic camera pan.
// Available where the test hooks are (web/dev builds, or a portal build made with
// VITE_TEST_HOOKS=1), never in a shipped portal build; it plays on its own save (tm.capture.*), so
// a capture session never touches a player's bests or streak. Slow-mo and freeze only scale how
// real time feeds the sim runner: the hunt itself stays deterministic.
import type { PlatformId } from '../platform/PlatformAdapter';

export const CAPTURE_NAMESPACE = 'capture.';

export interface CapturePolicyInput {
  readonly platform: PlatformId;
  /** VITE_TEST_HOOKS=1 at build time. */
  readonly testHooksFlag: boolean;
  /** The page URL has ?capture=1. */
  readonly captureParam: boolean;
}

export function captureAllowed(i: CapturePolicyInput): boolean {
  return i.captureParam && (i.platform === 'web' || i.testHooksFlag);
}

export interface CaptureTuning {
  /** Slow-motion steps cycled by S (1 = normal speed first). */
  readonly speeds: readonly number[];
  /** Auto-pan turns around this many reference px before each end of the camera range. */
  readonly panTurnPx: number;
  /** v1.0.1: the key hint shows this long, then fades over hintFadeMs. */
  readonly hintMs: number;
  readonly hintFadeMs: number;
}

/**
 * v1.0.1 (D-028 §5): the key hint's opacity `elapsedMs` after it appeared — 1 for `holdMs`, then
 * down to 0 over `fadeMs` — or null once it has faded (the hint is then destroyed, so no captured
 * frame can show it). Frame time, not game time: slow motion and freeze don't hold it on screen.
 */
export function captureHintAlpha(elapsedMs: number, holdMs: number, fadeMs: number): number | null {
  if (elapsedMs < holdMs) return 1;
  const a = 1 - (elapsedMs - holdMs) / fadeMs;
  return a > 0 ? a : null;
}

export class CaptureState {
  private speedIndex = 0;
  frozen = false;
  panning = false;
  /** Ms the key hint has shown (null = not yet); it shows once per page. */
  hintElapsedMs: number | null = null;
  hintDone = false;
  private panDir = 1;

  constructor(
    private readonly tuning: CaptureTuning,
    /** ?gun=0 also hides the first-person gun. */
    readonly showGun: boolean,
  ) {}

  /** Real-time multiplier for the sim, tweens and animations (0 while frozen). */
  get timeScale(): number {
    return this.frozen ? 0 : (this.tuning.speeds[this.speedIndex] ?? 1);
  }

  /** Handles a capture key; returns true if it was one. */
  key(code: string): boolean {
    if (code === 'KeyS') {
      this.speedIndex = (this.speedIndex + 1) % Math.max(1, this.tuning.speeds.length);
      return true;
    }
    if (code === 'KeyF') {
      this.frozen = !this.frozen;
      return true;
    }
    if (code === 'KeyC') {
      this.panning = !this.panning;
      return true;
    }
    return false;
  }

  /** Auto-pan direction for the camera at `x` in [min, max]: sweeps end to end, or 0 when off. */
  panDirection(x: number, min: number, max: number): number {
    if (!this.panning) return 0;
    if (x >= max - this.tuning.panTurnPx) this.panDir = -1;
    else if (x <= min + this.tuning.panTurnPx) this.panDir = 1;
    return this.panDir;
  }

  /** For the test hook. */
  snapshot(): { speed: number; frozen: boolean; panning: boolean; hint: boolean } {
    return {
      speed: this.timeScale,
      frozen: this.frozen,
      panning: this.panning,
      hint: this.hintElapsedMs !== null && !this.hintDone,
    };
  }
}

/**
 * A capture session plays on its own fresh save (tm.capture.*), which would start with the
 * tutorial hunt — whose prompts capture mode hides. Mark the tutorial done there, so START plays
 * the capture seed's Classic hunt. Pure: returns the save to store.
 */
export function captureSave<T extends { readonly ftue: { readonly done: boolean } }>(data: T): T {
  if (data.ftue.done) return data;
  return { ...data, ftue: { done: true, skipped: true, step: 'capture' } };
}
