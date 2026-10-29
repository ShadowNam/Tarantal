// v1.7d (D-059, art bible §4.5f) The hot-air balloons' sheet: three envelopes in warm stripes and
// panels (no brand names or logos), each with its wicker basket, burner frame and two passengers;
// the burner's flame (a small local glow, never a screen flash) and a passenger's raised fist.
// Design px at the far plane (scale 0.15: an envelope 56 × 66), origin at the envelope's middle
// (the sim's position: the hitbox body's centre). Standard 1×, HD 2×. Pure constants.

export const BALLOON_SHEET = 'namibie/balloons';

/** The plane scale the sheet is drawn at (the far plane). */
export const BALLOON_ART_SCALE = 0.15;

export interface BalloonFrameDef {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

export const BALLOON_FRAMES: readonly BalloonFrameDef[] = [
  { name: 'balloon_a', w: 72, h: 112, ox: 36, oy: 40 },
  { name: 'balloon_b', w: 72, h: 112, ox: 36, oy: 40 },
  { name: 'balloon_c', w: 72, h: 112, ox: 36, oy: 40 },
  { name: 'flame', w: 16, h: 24, ox: 8, oy: 22 },
  { name: 'fist', w: 12, h: 14, ox: 4, oy: 13 },
];

/** Where the burner sits and a passenger's shoulder, from the origin (design px at the art). */
export const BURNER = { x: 0, y: 38 } as const;
export const FIST = { x: 4, y: 47 } as const;

export interface BalloonRect extends BalloonFrameDef {
  readonly x: number;
  readonly y: number;
}

export const BALLOON_SHEET_W = 256;
const GAP = 2;

export function balloonFrames(): BalloonRect[] {
  const out: BalloonRect[] = [];
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const f of BALLOON_FRAMES) {
    if (x + f.w + GAP > BALLOON_SHEET_W) {
      x = GAP;
      y += row + GAP;
      row = 0;
    }
    out.push({ ...f, x, y });
    x += f.w + GAP;
    row = Math.max(row, f.h);
  }
  return out;
}

export const BALLOON_SHEET_H = ((): number => {
  const fr = balloonFrames();
  return Math.max(...fr.map((f) => f.y + f.h)) + GAP;
})();

export function balloonTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / BALLOON_SHEET_W));
}

/**
 * The burner's flare for balloon `id` at sim tick `tick`: 0 (off) … 1, a short burst every few
 * seconds (each balloon on its own beat), held on for `hitTicks` after a hit (it roars).
 */
export function burnerAt(id: number, tick: number, hitAt: number | null): number {
  if (hitAt !== null && tick >= hitAt && tick - hitAt < 90) return 1;
  const every = 300 + ((id * 97) % 240);
  const on = 42;
  const p = (tick + id * 131) % every;
  if (p >= on) return 0;
  // Rise and fall over the burst (no flicker: never a flash).
  return Math.sin((Math.PI * p) / on);
}
