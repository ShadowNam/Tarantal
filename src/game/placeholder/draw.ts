// Shared canvas primitives for the placeholder art (art bible §1: warm-black ink, flat fills).
// Rendering only.

export const INK = '#1B1410';

/** Small seeded PRNG (mulberry32) for stable placeholder scenery. Rendering only. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}

export function inked(ctx: CanvasRenderingContext2D, fill: string, line: number): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = line;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** Ground fill with a wavy top edge from y0 down to the band bottom. */
export function ground(
  ctx: CanvasRenderingContext2D,
  width: number,
  y0: number,
  bottom: number,
  amp: number,
  fill: string,
  line: number,
  rnd: () => number,
): void {
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  ctx.lineTo(0, y0);
  for (let x = 0; x <= width; x += 120) ctx.lineTo(x, y0 + (rnd() - 0.5) * amp);
  ctx.lineTo(width, bottom);
  ctx.closePath();
  inked(ctx, fill, line);
}

/** A grass tuft: five blades from a base line at y. */
export function tuft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  fill: string,
  line: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x - h * 0.5, y);
  for (let i = 0; i < 5; i++) {
    const bx = x - h * 0.5 + (i + 0.5) * (h / 5);
    ctx.lineTo(bx + (i - 2) * h * 0.12, y - h * (0.7 + (i % 2) * 0.3));
    ctx.lineTo(bx + h * 0.1, y);
  }
  ctx.closePath();
  inked(ctx, fill, line);
}
