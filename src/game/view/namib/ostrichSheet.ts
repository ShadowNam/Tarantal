// v1.7d (D-059, art bible §4.5d) The ostriches' sheet: a black-and-white male and a grey-brown
// female in every pose the sim uses (standing, looking round, a four-step walk, pecking, sitting
// on the nest, the male's wing display, a three-step run, hissing), the nest scrape and one egg.
// Frames face right with the feet (or the scrape's middle) at their origin, in design px at the
// mid plane (OSTRICH_ART_SCALE: the view scales by the family's plane scale ÷ it). D-080: drawn
// for the true-size birds (OSTRICH_MASTER, with an HD twin). Pure constants: the game, the
// placeholder and the interim art generator (tools/art/ostrich.ts) read them.

import type { OstrichView } from '../../../sim/types';

export const OSTRICH_SHEET = 'namibie/ostriches';

/** The plane scale the sheet is drawn at (the mid plane). */
export const OSTRICH_ART_SCALE = 0.42;

/** Poses with a frame (the sim's OstrichPose plus the walk and run steps). */
export const OSTRICH_POSES = [
  'stand',
  'look',
  'walk_0',
  'walk_1',
  'walk_2',
  'walk_3',
  'peck',
  'sit',
  'display',
  'run_0',
  'run_1',
  'run_2',
  'hiss',
] as const;
export type OstrichFramePose = (typeof OSTRICH_POSES)[number];

interface Box {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

const BOX: Readonly<Record<OstrichFramePose, Box>> = {
  // Tight to the drawn birds (measured, a 4 px margin): less texture per frame.
  stand: { w: 145, h: 222, ox: 72, oy: 214 },
  look: { w: 145, h: 222, ox: 72, oy: 214 },
  walk_0: { w: 163, h: 218, ox: 76, oy: 210 },
  walk_1: { w: 163, h: 218, ox: 76, oy: 210 },
  walk_2: { w: 163, h: 218, ox: 76, oy: 210 },
  walk_3: { w: 163, h: 218, ox: 76, oy: 210 },
  peck: { w: 186, h: 175, ox: 75, oy: 167 },
  sit: { w: 150, h: 173, ox: 79, oy: 161 },
  display: { w: 161, h: 183, ox: 81, oy: 171 },
  run_0: { w: 215, h: 212, ox: 77, oy: 195 },
  run_1: { w: 215, h: 212, ox: 77, oy: 195 },
  run_2: { w: 215, h: 212, ox: 77, oy: 195 },
  hiss: { w: 201, h: 186, ox: 73, oy: 178 },
};

/**
 * v1.20.2 (D-082): the hen is drawn this share of the cock's size. The D-059 sheet drew her as tall
 * as him (~210 layout px to the head, 2.66 m at the true-size 2.8×); a real hen stands 1.7–2.0 m
 * and a cock 2.1–2.8 m. At 0.73 she is ~153 layout px, 1.94 m beside the guineafowl. Her hit shapes
 * shrink with her (content birds.json ostriches.henScale, tested equal).
 */
export const OSTRICH_HEN_SCALE = 0.73;

/** A hen's frame box: the cock's scaled by OSTRICH_HEN_SCALE (her drawing is, from the same
 *  vector shapes), so the frames stay tight and the sheet smaller. */
const henBox = (b: Box): Box => ({
  w: Math.ceil(b.w * OSTRICH_HEN_SCALE),
  h: Math.ceil(b.h * OSTRICH_HEN_SCALE),
  ox: Math.round(b.ox * OSTRICH_HEN_SCALE),
  oy: Math.round(b.oy * OSTRICH_HEN_SCALE),
});

export interface OstrichFrameDef extends Box {
  readonly name: string;
}

/** Frame name of a sex and pose. */
export const ostrichFrame = (male: boolean, pose: OstrichFramePose): string =>
  `${male ? 'm' : 'f'}_${pose}`;

/** Every frame: the male's poses, the female's (no display; smaller, OSTRICH_HEN_SCALE), the
 *  scrape and an egg. */
export const OSTRICH_FRAMES: readonly OstrichFrameDef[] = [
  ...OSTRICH_POSES.map((p) => ({ name: ostrichFrame(true, p), ...BOX[p] })),
  ...OSTRICH_POSES.filter((p) => p !== 'display').map((p) => ({
    name: ostrichFrame(false, p),
    ...henBox(BOX[p]),
  })),
  { name: 'scrape', w: 170, h: 34, ox: 85, oy: 20 },
  { name: 'egg', w: 16, h: 14, ox: 8, oy: 13 },
];

export interface OstrichRect extends OstrichFrameDef {
  readonly x: number;
  readonly y: number;
}

/** Sheet width at 1× (design px). */
export const OSTRICH_SHEET_W = 1024;
const GAP = 2;

/** Each frame's rect in the 1× sheet, in OSTRICH_FRAMES order: packed in rows tallest first
 *  (the least empty sheet, so the least texture memory). */
export function ostrichFrames(): OstrichRect[] {
  const at = new Map<string, { x: number; y: number }>();
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const f of [...OSTRICH_FRAMES].sort((a, b) => b.h - a.h || b.w - a.w)) {
    if (x + f.w + GAP > OSTRICH_SHEET_W) {
      x = GAP;
      y += row + GAP;
      row = 0;
    }
    at.set(f.name, { x, y });
    x += f.w + GAP;
    row = Math.max(row, f.h);
  }
  return OSTRICH_FRAMES.map((f) => ({
    ...f,
    x: at.get(f.name)?.x ?? 0,
    y: at.get(f.name)?.y ?? 0,
  }));
}

export const OSTRICH_SHEET_H = ((): number => {
  const fr = ostrichFrames();
  return Math.max(...fr.map((f) => f.y + f.h)) + GAP;
})();

/** Texture px per layout px of a sheet whose file is `width` px wide (OSTRICH_MASTER Standard,
 *  twice that HD). */
export function ostrichTexelsPerPx(width: number): number {
  // Not rounded: the sheet ships at ≈ 1.41× (Standard) and ≈ 2.81× (HD).
  return Math.max(1, width / OSTRICH_SHEET_W);
}

/**
 * The sheet's layout is in design px at the mid plane at sizeMul 1 (a standing bird 197 px). D-080:
 * the birds are shown at their true size, sizeMul 2.8 (553 px), so the Standard file is drawn at
 * 1440 / 1024 ≈ 1.41 texture px per layout px — 0.5 per drawn px — and its HD twin at twice that (1.0
 * per drawn px; 2880 px wide).
 * Redrawn from the vector shapes at that size, never scaled up (D-080 review 4). D-059 shipped
 * one 1.5× sheet for both (0.54 per drawn px at the true size: blurry).
 */
export const OSTRICH_MASTER = 1440 / OSTRICH_SHEET_W;
/** The birds' growth the sheet is drawn for (content birds.json ostriches.sizeMul, tested equal). */
export const OSTRICH_DRAWN_MUL = 2.8;

/** Where each egg lies in the scrape (design px at the art scale, from its middle), in the
 *  order they are laid: the first `eggs` of these show. Packed in two loose rings. */
export const EGG_SPOTS: readonly (readonly [number, number])[] = [
  [-6, -3],
  [7, -2],
  [0, 3],
  [-16, 1],
  [15, 2],
  [-9, 6],
  [10, 7],
  [-24, -2],
  [23, -1],
  [-2, -8],
  [-19, 7],
  [19, 8],
  [0, 10],
  [-30, 4],
  [29, 5],
];

/** Ticks per step of the walk (four steps) and the run (three). */
const WALK_STEP_TICKS = 9;
const RUN_STEP_TICKS = 5;

/** The frame of a bird's pose at its pose tick. */
export function framePose(b: Pick<OstrichView, 'pose' | 't' | 'male'>): OstrichFramePose {
  switch (b.pose) {
    case 'walk':
      return `walk_${Math.floor(b.t / WALK_STEP_TICKS) % 4}` as OstrichFramePose;
    case 'run':
      return `run_${Math.floor(b.t / RUN_STEP_TICKS) % 3}` as OstrichFramePose;
    case 'display':
      return b.male ? 'display' : 'stand';
    default:
      return b.pose;
  }
}
