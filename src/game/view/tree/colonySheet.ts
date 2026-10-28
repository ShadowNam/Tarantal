// 1.9.4 (D-057, art bible §4.3b) The weaver colony's sheet: sociable weavers (flapping, gliding,
// perched, hopping, pecking), the pygmy falcon (perched, looking round, flying) and the
// rosy-faced lovebird (perched, flying). Sizes are design px at plane scale 1 (a weaver's
// wingspan is feel.juice.weavers.sizePx there); the view scales them per plane. The Standard
// sheet is 1×, its HD twin 2×. It loads with either desert map (desert group). Frames face
// right; the view mirrors them. Pure constants: the game, the placeholder and the interim art
// generator (tools/art/colony.ts) read them.
import { COLONY_SHEET_KEY } from '../../assets/desertAssets';

export const COLONY_SHEET = COLONY_SHEET_KEY;

export const COLONY_FRAMES = [
  { name: 'weaver_fly_a', w: 58, h: 36, ox: 29, oy: 18 },
  { name: 'weaver_fly_b', w: 58, h: 36, ox: 29, oy: 18 },
  { name: 'weaver_glide', w: 58, h: 36, ox: 29, oy: 18 },
  { name: 'weaver_perch', w: 32, h: 30, ox: 16, oy: 28 },
  { name: 'weaver_hop', w: 32, h: 30, ox: 16, oy: 28 },
  { name: 'weaver_peck', w: 32, h: 30, ox: 16, oy: 28 },
  { name: 'falcon_perch', w: 36, h: 46, ox: 18, oy: 44 },
  { name: 'falcon_look', w: 36, h: 46, ox: 18, oy: 44 },
  { name: 'falcon_fly_a', w: 66, h: 38, ox: 33, oy: 19 },
  { name: 'falcon_fly_b', w: 66, h: 38, ox: 33, oy: 19 },
  { name: 'lovebird_perch', w: 32, h: 36, ox: 16, oy: 34 },
  { name: 'lovebird_fly_a', w: 54, h: 34, ox: 27, oy: 17 },
  { name: 'lovebird_fly_b', w: 54, h: 34, ox: 27, oy: 17 },
] as const;

export type ColonyFrame = (typeof COLONY_FRAMES)[number]['name'];

export interface ColonyRect {
  readonly name: ColonyFrame;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

export const COLONY_SHEET_W = 256;
const GAP = 2;

export function colonyFrames(): ColonyRect[] {
  const out: ColonyRect[] = [];
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const f of COLONY_FRAMES) {
    if (x + f.w + GAP > COLONY_SHEET_W) {
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

export const COLONY_SHEET_H = ((): number => {
  const fr = colonyFrames();
  return Math.max(...fr.map((f) => f.y + f.h)) + GAP;
})();

/** Texture px per design px of a sheet whose file is `width` px wide (1 Standard, 2 HD). */
export function colonyTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / COLONY_SHEET_W));
}

/** A flying weaver's drawn wingspan in the sheet (weaver_fly_*, design px at 1×): the view scales
 *  every frame by feel.treeLife.colony.wingspanPx[plane] / this (review R4). */
export const COLONY_WINGSPAN = 34;
