// D-054: one sheet per herd (src/game/view/faunaHerds.ts): every look of the herd (species,
// pose, variant) drawn by farFauna.ts at its target height, each part (tail, body, head, ear)
// rendered at 4× and averaged down to the 2× master, trimmed to its pixels with a 1 design px
// clear margin, and shelf-packed. The frame table (design px; the pivot inside each frame and
// where it sits from the animal's feet) goes into the sidecar, and so into the asset index.
// Standard packs the master at 1×, HD uses it as it is (FAUNA_MASTER = 2).
import { blank, blit, crop, opaqueBounds, resize, type Rgba } from '../assets/image';
import {
  FAUNA_MASTER,
  FAUNA_PARTS,
  frameName,
  herdLooks,
  lookHeight,
  type FaunaFrame,
  type FaunaFrames,
  type FaunaHerd,
  type FaunaPose,
  type FaunaSpecies,
  type FaunaVariant,
} from '../../src/game/view/faunaHerds';
import { drawLook, type LookOpts } from './farFauna';
import { renderSvg } from './raster';
import { mix, resetIds } from './scenery';
import { svgDoc } from './svg';

/** Supersampling over the master (the art is drawn at 4× and averaged to 2×). */
const SUPER = 2;
/** Clear margin round every frame, design px (no bleeding from a neighbour at 1×). */
const MARGIN = 1;
/** Widest sheet, master px (Standard stays ≤ 2048, HD ≤ 4096). */
const MAX_W = 4096;

export interface FaunaSheet {
  /** The master (FAUNA_MASTER texture px per design px). */
  readonly img: Rgba;
  readonly frames: FaunaFrames;
  /** The animals (kind and drawn height) for tools/perspective-audit.ts. */
  readonly animals: readonly { readonly species: FaunaSpecies; readonly h: number }[];
}

/** A look's id back into its parts. */
export function parseLook(look: string): {
  species: FaunaSpecies;
  pose: FaunaPose;
  variant: FaunaVariant;
} {
  const [species, pose, variant] = look.split('.') as [FaunaSpecies, FaunaPose, FaunaVariant];
  return { species, pose, variant };
}

interface Cell {
  readonly name: string;
  readonly img: Rgba;
  /** Design px of the cell's top-left, feet-relative. */
  readonly x0: number;
  readonly y0: number;
  readonly pivot: readonly [number, number];
}

/** Renders one part over the look's box (integer design px), trimmed to its pixels + margin. */
function renderPart(
  svg: string,
  box: { x0: number; y0: number; x1: number; y1: number },
): { img: Rgba; x0: number; y0: number } | null {
  const x0 = Math.floor(box.x0);
  const y0 = Math.floor(box.y0);
  const w = Math.ceil(box.x1) - x0;
  const h = Math.ceil(box.y1) - y0;
  const k = FAUNA_MASTER * SUPER;
  const big = renderSvg(svgDoc(w * k, h * k, [x0, y0, w, h], '', svg));
  const img = resize(big, w * FAUNA_MASTER, h * FAUNA_MASTER);
  const b = opaqueBounds(img);
  if (b === null) return null;
  // Trim at whole design px, keeping MARGIN clear px round the art.
  const m = FAUNA_MASTER;
  const cx0 = Math.max(0, Math.floor(b.x / m) - MARGIN);
  const cy0 = Math.max(0, Math.floor(b.y / m) - MARGIN);
  const cx1 = Math.min(w, Math.ceil((b.x + b.w) / m) + MARGIN);
  const cy1 = Math.min(h, Math.ceil((b.y + b.h) / m) + MARGIN);
  if (b.x < m || b.y < m || b.x + b.w > (w - 1) * m || b.y + b.h > (h - 1) * m)
    throw new Error('a far animal part runs off its box: widen the look box in farFauna.ts');
  return {
    img: crop(img, cx0 * m, cy0 * m, (cx1 - cx0) * m, (cy1 - cy0) * m),
    x0: x0 + cx0,
    y0: y0 + cy0,
  };
}

/** Shelf packing (tallest first) at the width that gives the smallest sheet. */
function pack(cells: readonly Cell[]): { w: number; h: number; at: Map<string, [number, number]> } {
  const sorted = [...cells].sort(
    (a, b) => b.img.height - a.img.height || b.img.width - a.img.width,
  );
  const area = sorted.reduce((s, c) => s + c.img.width * c.img.height, 0);
  const widest = Math.max(...sorted.map((c) => c.img.width));
  let best: { w: number; h: number; at: Map<string, [number, number]> } | null = null;
  for (let w = widest; w <= MAX_W; w += FAUNA_MASTER * 8) {
    const at = new Map<string, [number, number]>();
    let x = 0;
    let y = 0;
    let row = 0;
    for (const c of sorted) {
      if (x + c.img.width > w) {
        x = 0;
        y += row;
        row = 0;
      }
      at.set(c.name, [x, y]);
      x += c.img.width;
      row = Math.max(row, c.img.height);
    }
    const h = y + row;
    // Even sizes: the master halves exactly to Standard.
    const sw =
      Math.ceil(
        Math.max(
          ...[...at].map(([n, p]) => p[0] + (sorted.find((c) => c.name === n)?.img.width ?? 0)),
        ) / 2,
      ) * 2;
    const sh = Math.ceil(h / 2) * 2;
    if (best === null || sw * sh < best.w * best.h) best = { w: sw, h: sh, at };
    if (w > Math.sqrt(area) * 3) break;
  }
  if (best === null) throw new Error('no fauna sheet layout');
  return best;
}

/**
 * Draws a herd's sheet. `pxPerMetre`: the plane's design px per metre (D-049); `tint`: the
 * layer's haze (the animals take half of it: solid, a little softened by distance).
 */
export function buildFaunaSheet(
  herd: FaunaHerd,
  pxPerMetre: number,
  tint: (hex: string) => string,
  dust?: string,
): FaunaSheet {
  const half = (hex: string): string => mix(hex, tint(hex), 0.5);
  const cells: Cell[] = [];
  for (const look of herdLooks(herd)) {
    const l = parseLook(look);
    const h = lookHeight(l.species, l.variant, pxPerMetre);
    resetIds();
    const opts: LookOpts = {
      tint: half,
      ...(dust === undefined ? {} : { dust: half(dust) }),
      ...(herd.wading === true ? { wading: true } : {}),
    };
    const d = drawLook({ ...l, h }, opts);
    for (const part of FAUNA_PARTS) {
      const svg = d.parts[part];
      const pivot = d.pivots[part];
      if (svg === undefined || pivot === undefined) continue;
      const r = renderPart(svg, d.box);
      if (r === null) continue;
      cells.push({ name: frameName(look, part), img: r.img, x0: r.x0, y0: r.y0, pivot });
    }
  }
  const p = pack(cells);
  const img = blank(p.w, p.h);
  const frames: Record<string, FaunaFrame> = {};
  const m = FAUNA_MASTER;
  const r3 = (n: number): number => Math.round(n * 1000) / 1000;
  for (const c of cells) {
    const at = p.at.get(c.name);
    if (at === undefined) continue;
    blit(img, c.img, at[0], at[1]);
    frames[c.name] = [
      at[0] / m,
      at[1] / m,
      c.img.width / m,
      c.img.height / m,
      r3(c.pivot[0] - c.x0),
      r3(c.pivot[1] - c.y0),
      r3(c.pivot[0]),
      r3(c.pivot[1]),
    ];
  }
  return {
    img,
    frames,
    animals: herd.animals.map((a) => ({
      species: a.species,
      h: lookHeight(a.species, a.variant, pxPerMetre) * a.s,
    })),
  };
}
