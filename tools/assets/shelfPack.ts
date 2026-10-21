// Shelf packing for atlas pages (M10). Bird frames come in a few fixed sizes per clip, so rows of
// equal-height cells waste little space and the result is easy to check by eye. Pure.

export interface PackRect {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface Placed extends PackRect {
  readonly x: number;
  readonly y: number;
}

export interface PackResult {
  readonly width: number;
  readonly height: number;
  readonly placed: readonly Placed[];
}

/** Rounds up to a power of two (GPU-friendly page sizes). */
export function pow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Packs rects into one page no wider than maxSize, `padding` px apart (stops bleeding between
 * frames under filtering). Throws if they don't fit in maxSize × maxSize: split the atlas then.
 */
export function shelfPack(rects: readonly PackRect[], maxSize: number, padding = 2): PackResult {
  // Tallest first keeps shelves tight; ties by id so the layout is deterministic.
  const order = [...rects].sort((a, b) => b.height - a.height || (a.id < b.id ? -1 : 1));
  const placed: Placed[] = [];
  let x = padding;
  let y = padding;
  let shelf = 0;
  let usedW = 0;
  for (const r of order) {
    if (r.width + padding * 2 > maxSize) throw new Error(`${r.id} is wider than ${maxSize} px`);
    if (x + r.width + padding > maxSize) {
      x = padding;
      y += shelf + padding;
      shelf = 0;
    }
    placed.push({ ...r, x, y });
    x += r.width + padding;
    shelf = Math.max(shelf, r.height);
    usedW = Math.max(usedW, x);
  }
  const height = pow2(y + shelf + padding);
  if (height > maxSize) throw new Error(`atlas needs more than ${maxSize}² px: split it`);
  return { width: pow2(usedW), height, placed };
}

/**
 * Packs rects onto as many maxSize pages as needed (Phaser multi-atlas), filling each page in
 * shelf order before starting the next. Throws only if one rect can't fit on an empty page.
 */
export function shelfPackPages(
  rects: readonly PackRect[],
  maxSize: number,
  padding = 2,
): PackResult[] {
  const order = [...rects].sort((a, b) => b.height - a.height || (a.id < b.id ? -1 : 1));
  const pages: PackResult[] = [];
  let rest = order;
  while (rest.length > 0) {
    // Grow the page's share until the next rect no longer fits.
    let lo = 1;
    let hi = rest.length;
    let best: PackResult | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      try {
        best = shelfPack(rest.slice(0, mid), maxSize, padding);
        lo = mid + 1;
      } catch {
        hi = mid - 1;
      }
    }
    if (best === null) shelfPack(rest.slice(0, 1), maxSize, padding); // throws the real reason
    if (best === null) break;
    pages.push(best);
    rest = rest.slice(best.placed.length);
  }
  return pages;
}
