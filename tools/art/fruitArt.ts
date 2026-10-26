// v1.7c (D-047): the fruit sheets. Each fruit the species code handed to the collector
// (fruitSink.ts) is rendered on its own, cropped, and packed into one sheet per biome of a fixed
// size (FRUIT_SHEET: the placeholder matches it, so a delivery keeps that size); the spots table
// says where each sits on its layer or prop and where its frame is.
import { LAYER_BLEED_PX } from '../../src/sim/world';
import { FRUIT_SHEET, type FruitSpot } from '../../src/game/view/fruit/fruitTypes';
import { blank, blit, crop, opaqueBounds, resize, type Rgba } from '../assets/image';
import { shelfPack } from '../assets/shelfPack';
import type { RawFruit } from './fruitSink';
import { renderSvg } from './raster';
import { svgDoc } from './svg';

/** Fruit collected from one layer (layer px incl. bleed) or one prop asset (prop px). */
export interface FruitOwner {
  readonly on: string;
  readonly prop: boolean;
  readonly fruit: readonly RawFruit[];
}

interface Frame {
  readonly id: string;
  readonly img: Rgba;
  readonly spot: Omit<FruitSpot, 'fx' | 'fy'>;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** One fruit at 1 texture px per design px, supersampled `masterScale` ×, cropped. */
function renderFruit(
  f: RawFruit,
  masterScale: number,
): { img: Rgba; ox: number; oy: number } | null {
  const reach = Math.ceil(f.reach);
  const side = reach * 2;
  const big = renderSvg(
    svgDoc(
      side * masterScale,
      side * masterScale,
      [f.x - reach, f.y - reach, side, side],
      '',
      f.svg,
    ),
  );
  const img = resize(big, side, side);
  const b = opaqueBounds(img);
  if (b === null) return null;
  return { img: crop(img, b.x, b.y, b.w, b.h), ox: reach - b.x, oy: reach - b.y };
}

/** Renders and packs a biome's fruit: the sheet image and its spots (layer px without bleed). */
export function fruitSheet(
  owners: readonly FruitOwner[],
  masterScale: number,
): { img: Rgba; spots: FruitSpot[] } {
  const frames: Frame[] = [];
  for (const o of owners)
    o.fruit.forEach((f, i) => {
      const r = renderFruit(f, masterScale);
      if (r === null) return;
      const dx = o.prop ? 0 : -LAYER_BLEED_PX;
      frames.push({
        id: `${o.on}#${String(i).padStart(3, '0')}`,
        img: r.img,
        spot: {
          species: f.species,
          motion: f.motion,
          on: o.on,
          prop: o.prop,
          x: r1(f.x + dx),
          y: r1(f.y),
          ground: r1(f.ground),
          fw: r.img.width,
          fh: r.img.height,
          ox: r.ox,
          oy: r.oy,
        },
      });
    });
  const packed = shelfPack(
    frames.map((f) => ({ id: f.id, width: f.img.width, height: f.img.height })),
    FRUIT_SHEET.width,
    1,
  );
  if (packed.width > FRUIT_SHEET.width || packed.height > FRUIT_SHEET.height)
    throw new Error(
      `fruit sheet needs ${packed.width}×${packed.height}, FRUIT_SHEET is ${FRUIT_SHEET.width}×${FRUIT_SHEET.height}`,
    );
  const img = blank(FRUIT_SHEET.width, FRUIT_SHEET.height);
  const at = new Map(packed.placed.map((p) => [p.id, p]));
  const spots: FruitSpot[] = [];
  for (const f of frames) {
    const p = at.get(f.id);
    if (p === undefined) throw new Error(`fruit ${f.id} not packed`);
    blit(img, f.img, p.x, p.y);
    spots.push({ ...f.spot, fx: p.x, fy: p.y });
  }
  return { img, spots };
}
