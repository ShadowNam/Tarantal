// 1.9.4 (D-057, art bible §4.2c) The baobab residents' sheet: one small texture with every frame
// of the bushbaby, the tree squirrel, the barn owl, the yellow-billed hornbill (and the female's
// beak tip in the slit), the red-billed buffalo weaver and a bee. Sizes are prop px (the baobab
// is drawn 1:1 on the mid layer); the sheet is drawn at 2× (review R2: at 1× the small animals
// were mostly half-transparent edge pixels and read as faint outlines), so HD needs no twin. Frames face right; the view mirrors
// them. Pure constants and a frame table: the game, the placeholder and the interim art
// generator (tools/art/baobabLife.ts) all read them.

/** The sheet's texture key (Bushveld group: only the Bushveld manifest lists it). */
export const RESIDENT_SHEET = 'bushveld/baobab_life';

export const RESIDENT_FRAMES = [
  // Bushbaby at its hole (origin: the hole's centre): ears, eyes over the rim, head out, looking.
  { name: 'galago_ears', w: 44, h: 46, ox: 22, oy: 30 },
  { name: 'galago_eyes', w: 44, h: 46, ox: 22, oy: 30 },
  { name: 'galago_out', w: 44, h: 46, ox: 22, oy: 30 },
  { name: 'galago_look', w: 44, h: 46, ox: 22, oy: 30 },
  // Tree squirrel: at its hole (origin: the hole's centre), then on the limb (origin: its feet).
  { name: 'squirrel_peek', w: 28, h: 26, ox: 14, oy: 16 },
  { name: 'squirrel_run_a', w: 76, h: 38, ox: 38, oy: 33 },
  { name: 'squirrel_run_b', w: 76, h: 38, ox: 38, oy: 33 },
  { name: 'squirrel_sit', w: 60, h: 52, ox: 30, oy: 47 },
  // Barn owl in its cavity (origin: the cavity's centre), and flying off (origin: its body).
  { name: 'owl_front', w: 44, h: 54, ox: 22, oy: 27 },
  { name: 'owl_left', w: 44, h: 54, ox: 22, oy: 27 },
  { name: 'owl_blink', w: 44, h: 54, ox: 22, oy: 27 },
  { name: 'owl_fly_a', w: 74, h: 40, ox: 37, oy: 20 },
  { name: 'owl_fly_b', w: 74, h: 40, ox: 37, oy: 20 },
  // Yellow-billed hornbill: flying (origin: its body), clinging beside the slit (origin: its
  // feet on the bark), feeding (beak at the slit); the female's beak tip in the slit (origin:
  // the slit's centre).
  { name: 'hornbill_fly_a', w: 64, h: 34, ox: 30, oy: 17 },
  { name: 'hornbill_fly_b', w: 64, h: 34, ox: 30, oy: 17 },
  { name: 'hornbill_cling', w: 50, h: 54, ox: 16, oy: 40 },
  { name: 'hornbill_feed', w: 50, h: 54, ox: 16, oy: 40 },
  { name: 'beak_tip', w: 10, h: 14, ox: 5, oy: 7 },
  // Red-billed buffalo weaver: flying and perched (origin: its body / its feet).
  { name: 'buffalo_fly_a', w: 24, h: 16, ox: 12, oy: 8 },
  { name: 'buffalo_fly_b', w: 24, h: 16, ox: 12, oy: 8 },
  { name: 'buffalo_perch', w: 18, h: 18, ox: 9, oy: 16 },
  // A bee (an amber dot with a dark band and a glint of wing).
  { name: 'bee', w: 6, h: 6, ox: 3, oy: 3 },
] as const;

export type ResidentFrame = (typeof RESIDENT_FRAMES)[number]['name'];

export interface ResidentRect {
  readonly name: ResidentFrame;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

/** Sheet width (prop px at 1×); frames are packed left to right in rows this wide. */
export const RESIDENT_SHEET_W = 256;
const GAP = 2;

/** Every frame's rect at 1× (prop px). */
export function residentFrames(): ResidentRect[] {
  const out: ResidentRect[] = [];
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const f of RESIDENT_FRAMES) {
    if (x + f.w + GAP > RESIDENT_SHEET_W) {
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

/** Sheet height (prop px at 1×). */
export const RESIDENT_SHEET_H = ((): number => {
  const fr = residentFrames();
  return Math.max(...fr.map((f) => f.y + f.h)) + GAP;
})();

/** Texture px per prop px of a sheet whose file is `width` px wide (1 Standard, 2 HD). */
export function residentTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / RESIDENT_SHEET_W));
}
