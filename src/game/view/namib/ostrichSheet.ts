// v1.7d (D-059, art bible §4.5d) The ostriches' sheet: a black-and-white male and a grey-brown
// female in every pose the sim uses (standing, looking round, a four-step walk, pecking, sitting
// on the nest, the male's wing display, a three-step run, hissing), the nest scrape and one egg.
// Frames face right with the feet (or the scrape's middle) at their origin, in design px at the
// mid plane (OSTRICH_ART_SCALE: the view scales by the family's plane scale ÷ it). The Standard
// sheet is 1×, its HD twin 2×. Pure constants: the game, the placeholder and the interim art
// generator (tools/art/ostrich.ts) read them.

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
  stand: { w: 220, h: 230, ox: 100, oy: 224 },
  look: { w: 220, h: 230, ox: 100, oy: 224 },
  walk_0: { w: 230, h: 230, ox: 105, oy: 224 },
  walk_1: { w: 230, h: 230, ox: 105, oy: 224 },
  walk_2: { w: 230, h: 230, ox: 105, oy: 224 },
  walk_3: { w: 230, h: 230, ox: 105, oy: 224 },
  peck: { w: 250, h: 170, ox: 100, oy: 164 },
  sit: { w: 230, h: 220, ox: 110, oy: 214 },
  display: { w: 300, h: 210, ox: 150, oy: 204 },
  run_0: { w: 290, h: 214, ox: 135, oy: 208 },
  run_1: { w: 290, h: 214, ox: 135, oy: 208 },
  run_2: { w: 290, h: 214, ox: 135, oy: 208 },
  hiss: { w: 260, h: 200, ox: 110, oy: 194 },
};

export interface OstrichFrameDef extends Box {
  readonly name: string;
}

/** Frame name of a sex and pose. */
export const ostrichFrame = (male: boolean, pose: OstrichFramePose): string =>
  `${male ? 'm' : 'f'}_${pose}`;

/** Every frame: the male's poses, the female's (no display), the scrape and an egg. */
export const OSTRICH_FRAMES: readonly OstrichFrameDef[] = [
  ...OSTRICH_POSES.map((p) => ({ name: ostrichFrame(true, p), ...BOX[p] })),
  ...OSTRICH_POSES.filter((p) => p !== 'display').map((p) => ({
    name: ostrichFrame(false, p),
    ...BOX[p],
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

export function ostrichFrames(): OstrichRect[] {
  const out: OstrichRect[] = [];
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const f of OSTRICH_FRAMES) {
    if (x + f.w + GAP > OSTRICH_SHEET_W) {
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

export const OSTRICH_SHEET_H = ((): number => {
  const fr = ostrichFrames();
  return Math.max(...fr.map((f) => f.y + f.h)) + GAP;
})();

/** Texture px per design px of a sheet whose file is `width` px wide (1 Standard, 2 HD). */
export function ostrichTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / OSTRICH_SHEET_W));
}

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
