// Pure decisions behind the M10 juice moments (GDD §17), so they're unit-tested apart from Phaser.

/** The Stampede sky tint's target alpha: off outside it, dimmed by "reduce flashes". */
export function stampedeTintAlpha(
  on: boolean,
  tintAlpha: number,
  reduceFlashes: boolean,
  reducedFlashAlpha: number,
): number {
  if (!on) return 0;
  return tintAlpha * (reduceFlashes ? reducedFlashAlpha : 1);
}

export interface RumbleInput {
  readonly on: boolean;
  /** Settings → screen shake (and, in capture mode, normal speed). */
  readonly shakeAllowed: boolean;
  readonly rumblePx: number;
  readonly shakeScale: number;
  readonly nowMs: number;
  readonly nextAtMs: number;
  readonly everyMs: number;
}

/** A Stampede rumble due now: the shake in design px and when the next one is due; else null. */
export function rumbleDue(i: RumbleInput): { px: number; nextAtMs: number } | null {
  if (!i.on || !i.shakeAllowed || i.rumblePx <= 0 || i.nowMs < i.nextAtMs) return null;
  const px = i.rumblePx * i.shakeScale;
  return px > 0 ? { px, nextAtMs: i.nowMs + i.everyMs } : null;
}
