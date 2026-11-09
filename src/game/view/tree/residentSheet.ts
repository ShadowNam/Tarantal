// 1.9.4 (D-057, art bible §4.2c) The baobab residents' sheet: one small texture with every frame
// of the bushbaby, the tree squirrel, the barn owl, the yellow-billed hornbill (and the female's
// beak tip in the slit), the red-billed buffalo weaver and a bee. Sizes are prop px (the baobab
// is drawn 1:1 on the mid layer); the sheet is drawn at 2× (review R2: at 1× the small animals
// were mostly half-transparent edge pixels and read as faint outlines), so HD needs no twin. Frames face right; the view mirrors
// them. Pure constants and a frame table: the game, the placeholder and the interim art
// generator (tools/art/baobabLife.ts) all read them.

/** The sheet's texture key (Bushveld group: only the Bushveld manifest lists it). */
export const RESIDENT_SHEET = 'bushveld/baobab_life';

/**
 * v1.20.2 (D-082): the residents brought to their true size beside the mid guineafowl (110.5 px
 * standing, 221 px a metre), where they fit the stage-set baobab: the flying barn owl (wingspan
 * 69 → 193 px, 0.87 m; a real one 0.8–0.95 m), the yellow-billed hornbill (×2.3: flying 56.5 →
 * 130 px bill to tail, 0.59 m; clinging 49 → 113 px, 0.51 m; a real one 0.48–0.6 m) and the
 * bushbaby (its head 1.6 → 1.07 of the D-057 drawing: 20 → 13 px wide, 0.06 m). Each drawn
 * from its shapes at that size (tools/art/baobabLife.ts), never scaled up. The owl in its cavity
 * (head and shoulders through a 38 × 50 px hole) and the buffalo weaver at its 46 × 30 px stick
 * nest stay: a true whole owl or a true weaver would not fit the stage-set tree's hole or nest
 * (tools/sizes.ts NOT_FIXED).
 */
export const RESIDENT_TRUE_MUL = { owlFly: 2.8, hornbill: 2.3, galago: 1.07 / 1.6 } as const;

/** A frame box (and its origin) grown by `k` from its D-057 size, rounded out. */
const grown = (
  w: number,
  h: number,
  ox: number,
  oy: number,
  k: number,
): { w: number; h: number; ox: number; oy: number } => ({
  w: Math.ceil(w * k),
  h: Math.ceil(h * k),
  ox: Math.round(ox * k),
  oy: Math.round(oy * k),
});
const OWL_K = RESIDENT_TRUE_MUL.owlFly;
const HB_K = RESIDENT_TRUE_MUL.hornbill;

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
  { name: 'owl_fly_a', ...grown(74, 40, 37, 20, OWL_K) },
  { name: 'owl_fly_b', ...grown(74, 40, 37, 20, OWL_K) },
  // Yellow-billed hornbill: flying (origin: its body), clinging beside the slit (origin: its
  // feet on the bark), feeding (beak at the slit); the female's beak tip in the slit (origin:
  // the slit's centre).
  { name: 'hornbill_fly_a', ...grown(64, 34, 30, 17, HB_K) },
  { name: 'hornbill_fly_b', ...grown(64, 34, 30, 17, HB_K) },
  { name: 'hornbill_cling', ...grown(50, 54, 16, 40, HB_K) },
  { name: 'hornbill_feed', ...grown(50, 54, 16, 40, HB_K) },
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

/** Sheet width (prop px at 1×); frames are packed left to right in rows this wide (D-082: 256 →
 *  336 for the true-size owl and hornbill). */
export const RESIDENT_SHEET_W = 336;
const GAP = 2;

/** v1.20.2 (D-082): the rows' order — the true-size flying owl beside a clinging hornbill (twice),
 *  the flying hornbill, then the small animals — 336 × 447 (2× sheet 2.29 MiB; in table order it
 *  would be 256 × 697, 2.72 MiB). */
const PACK_ORDER: readonly ResidentFrame[] = [
  'owl_fly_a',
  'hornbill_cling',
  'owl_fly_b',
  'hornbill_feed',
  'hornbill_fly_a',
  'hornbill_fly_b',
  'beak_tip',
  'bee',
  'galago_ears',
  'galago_eyes',
  'galago_out',
  'galago_look',
  'owl_front',
  'owl_left',
  'owl_blink',
  'squirrel_peek',
  'squirrel_run_a',
  'squirrel_run_b',
  'squirrel_sit',
  'buffalo_fly_a',
  'buffalo_fly_b',
  'buffalo_perch',
];

/** Every frame's rect at 1× (prop px), in RESIDENT_FRAMES order: packed in rows PACK_ORDER first
 *  (frames not in it after, in table order). */
export function residentFrames(): ResidentRect[] {
  const at = new Map<ResidentFrame, { x: number; y: number }>();
  const rank = (n: ResidentFrame): number => {
    const i = PACK_ORDER.indexOf(n);
    return i < 0 ? PACK_ORDER.length : i;
  };
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const f of [...RESIDENT_FRAMES].sort((a, b) => rank(a.name) - rank(b.name))) {
    if (x + f.w + GAP > RESIDENT_SHEET_W) {
      x = GAP;
      y += row + GAP;
      row = 0;
    }
    at.set(f.name, { x, y });
    x += f.w + GAP;
    row = Math.max(row, f.h);
  }
  return RESIDENT_FRAMES.map((f) => ({ ...f, ...(at.get(f.name) ?? { x: 0, y: 0 }) }));
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
