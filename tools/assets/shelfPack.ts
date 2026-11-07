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
export function shelfPack(
  rects: readonly PackRect[],
  maxSize: number,
  padding = 2,
  maxHeight = maxSize,
): PackResult {
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
  if (height > maxHeight)
    throw new Error(`atlas needs more than ${maxSize}×${maxHeight} px: split it`);
  return { width: pow2(usedW), height, placed };
}

/** GPU bytes of the pages (RGBA): what a split saves is what the hunt doesn't hold. */
const pagesArea = (pages: readonly PackResult[]): number =>
  pages.reduce((a, p) => a + p.width * p.height, 0);

/** Fills one page (maxSize wide, at most maxHeight tall) with as many rects (in order) as fit. */
function fillPage(
  rest: readonly PackRect[],
  maxSize: number,
  padding: number,
  maxHeight: number,
): PackResult | null {
  let lo = 1;
  let hi = rest.length;
  let best: PackResult | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    try {
      best = shelfPack(rest.slice(0, mid), maxSize, padding, maxHeight);
      lo = mid + 1;
    } catch {
      hi = mid - 1;
    }
  }
  return best;
}

/** The pages filled to maxSize × maxSize in turn (the packing until v1.12). */
function fullPages(rest0: readonly PackRect[], maxSize: number, padding: number): PackResult[] {
  const pages: PackResult[] = [];
  let rest = rest0;
  while (rest.length > 0) {
    const best = fillPage(rest, maxSize, padding, maxSize);
    if (best === null) shelfPack(rest.slice(0, 1), maxSize, padding); // throws the real reason
    if (best === null) break;
    pages.push(best);
    rest = rest.slice(best.placed.length);
  }
  return pages;
}

/**
 * The least page area: the full pages, or a first page capped at half (a quarter, …) of the
 * full first page's height with the rest packed the same way. Power-of-two pages round a page
 * that is just over a half up to double (the guineafowl's mid@2x: 4096 × 2048 = 32 MB for 14.5 MB
 * of frames, v1.12 supervisor); a split only wins when it is strictly smaller, so an atlas that
 * was already tight packs exactly as before.
 */
function leastPages(rest: readonly PackRect[], maxSize: number, padding: number): PackResult[] {
  const full = fullPages(rest, maxSize, padding);
  let best = full;
  let bestArea = pagesArea(full);
  const first = full[0];
  if (first === undefined) return full;
  for (let cap = first.height / 2; cap >= 64; cap /= 2) {
    const top = fillPage(rest, maxSize, padding, cap);
    if (top === null) break;
    const left = rest.slice(top.placed.length);
    const pages = [top, ...(left.length > 0 ? leastPages(left, maxSize, padding) : [])];
    const area = pagesArea(pages);
    if (area < bestArea) {
      best = pages;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Packs rects onto as many maxSize pages as needed (Phaser multi-atlas) in shelf order, split
 * where that holds fewer GPU bytes (leastPages). Throws only if one rect can't fit on an empty
 * page.
 */
export function shelfPackPages(
  rects: readonly PackRect[],
  maxSize: number,
  padding = 2,
): PackResult[] {
  const order = [...rects].sort((a, b) => b.height - a.height || (a.id < b.id ? -1 : 1));
  return leastPages(order, maxSize, padding);
}
