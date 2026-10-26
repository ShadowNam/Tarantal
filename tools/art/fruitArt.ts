// v1.7c (D-047): the fruit sheets. Each fruit the species code handed to the collector
// (fruitSink.ts) is rendered on its own (its body, and its stalk as a second frame), cropped,
// and packed into one sheet per biome of a fixed size (FRUIT_SHEET: the placeholder matches it,
// so a delivery keeps that size); the spots table says where each sits on its layer or prop and
// where its frames are. Prop fruit are seen close up (props are 2× art): drawn at 2×.
import { LAYER_BLEED_PX } from '../../src/sim/world';
import { FRUIT_SHEET, type FruitFrame, type FruitSpot } from '../../src/game/view/fruit/fruitTypes';
import { blank, blit, crop, opaqueBounds, resize, type Rgba } from '../assets/image';
import { shelfPack } from '../assets/shelfPack';
import type { CollectedFruit } from './fruitSink';
import { renderSvg } from './raster';
import { svgDoc } from './svg';

/** Fruit collected from one layer (layer px incl. bleed) or one prop asset (prop px). */
export interface FruitOwner {
  readonly on: string;
  readonly prop: boolean;
  readonly fruit: readonly CollectedFruit[];
}

/** Texture px per design px: prop fruit 2×, layer fruit 1×. */
export const PROP_FRUIT_RES = 2;

interface Piece {
  readonly id: string;
  readonly img: Rgba;
  /** Pivot in the image (texture px). */
  readonly px: number;
  readonly py: number;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** A drawing around (cx, cy) at `res` texture px per design px, supersampled, cropped. */
function renderPiece(
  id: string,
  svg: string,
  cx: number,
  cy: number,
  reach: number,
  res: number,
  masterScale: number,
): Piece | null {
  const r = Math.ceil(reach);
  const side = r * 2;
  const big = renderSvg(
    svgDoc(
      side * res * masterScale,
      side * res * masterScale,
      [cx - r, cy - r, side, side],
      '',
      svg,
    ),
  );
  const img = resize(big, side * res, side * res);
  const b = opaqueBounds(img);
  if (b === null) return null;
  return { id, img: crop(img, b.x, b.y, b.w, b.h), px: r * res - b.x, py: r * res - b.y };
}

/** Renders and packs a biome's fruit: the sheet image and its spots (layer px without bleed). */
export function fruitSheet(
  owners: readonly FruitOwner[],
  masterScale: number,
): { img: Rgba; spots: FruitSpot[] } {
  const pieces: Piece[] = [];
  const pending: {
    spot: Omit<FruitSpot, keyof FruitFrame | 'stalk'>;
    body: Piece;
    stalk: Piece | null;
  }[] = [];
  for (const o of owners)
    o.fruit.forEach((f, i) => {
      const res = o.prop ? PROP_FRUIT_RES : 1;
      const id = `${o.on}#${String(i).padStart(3, '0')}`;
      const at = f.attach ?? { x: f.x, y: f.y };
      const body = renderPiece(`${id}b`, f.body, at.x, at.y, f.reach, res, masterScale);
      if (body === null) return;
      const stalk =
        f.stalk === null
          ? null
          : renderPiece(`${id}s`, f.stalk, f.x, f.y, f.reach, res, masterScale);
      pieces.push(body, ...(stalk === null ? [] : [stalk]));
      const dx = o.prop ? 0 : -LAYER_BLEED_PX;
      pending.push({
        body,
        stalk,
        spot: {
          species: f.species,
          motion: f.motion,
          on: o.on,
          prop: o.prop,
          x: r1(f.x + dx),
          y: r1(f.y),
          ground: r1(f.ground),
          res,
          ax: r1(at.x - f.x),
          ay: r1(at.y - f.y),
          trunk: f.trunk === undefined ? null : { x: r1(f.trunk.x + dx), half: r1(f.trunk.half) },
        },
      });
    });
  const packed = shelfPack(
    pieces.map((p) => ({ id: p.id, width: p.img.width, height: p.img.height })),
    FRUIT_SHEET.width,
    1,
  );
  if (packed.width > FRUIT_SHEET.width || packed.height > FRUIT_SHEET.height)
    throw new Error(
      `fruit sheet needs ${packed.width}×${packed.height}, FRUIT_SHEET is ${FRUIT_SHEET.width}×${FRUIT_SHEET.height}`,
    );
  const img = blank(FRUIT_SHEET.width, FRUIT_SHEET.height);
  const at = new Map(packed.placed.map((p) => [p.id, p]));
  const frameOf = (p: Piece, res: number): FruitFrame => {
    const pl = at.get(p.id);
    if (pl === undefined) throw new Error(`fruit ${p.id} not packed`);
    blit(img, p.img, pl.x, pl.y);
    return {
      fx: pl.x,
      fy: pl.y,
      tw: p.img.width,
      th: p.img.height,
      fw: r1(p.img.width / res),
      fh: r1(p.img.height / res),
      ox: r1(p.px / res),
      oy: r1(p.py / res),
    };
  };
  const spots = pending.map((p): FruitSpot => ({
    ...p.spot,
    ...frameOf(p.body, p.spot.res),
    stalk: p.stalk === null ? null : frameOf(p.stalk, p.spot.res),
  }));
  return { img, spots };
}
