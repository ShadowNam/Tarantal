// v1.7e (D-061, art bible §4.7) The tell animals' sheet: every secret's tell in one small texture,
// four frames each — rest, act_a and act_b (its small action, shown in turn), flee (leaving after
// a hit). Sizes are prop px (the secret's prop is drawn 1:1 on its layer); every frame's origin is
// the animal's feet (a perched bird's tail hangs below them). Frames face right; the view mirrors them. Drawn at 2× (small animals at 1×
// are mostly half-transparent edge pixels), so HD needs no twin. The sheet loads with the late
// group (after the first download; no area chunk grows). Pure constants and a frame table: the
// game, the placeholder and the interim art generator (tools/art/tells.ts) all read them.

import { TELL_SHEET_W } from './tellKeys';

export { TELL_SHEET, TELL_SHEET_H, TELL_SHEET_W } from './tellKeys';

/** Each species' frame box (prop px at 1×) and its feet within it. */
export const TELL_BOXES = {
  fork_tailed_drongo: { w: 40, h: 60, ox: 18, oy: 42 },
  rock_agama: { w: 52, h: 26, ox: 24, oy: 23 },
  striped_skink: { w: 44, h: 18, ox: 22, oy: 15 },
  lilac_breasted_roller: { w: 46, h: 64, ox: 20, oy: 48 },
  flap_necked_chameleon: { w: 48, h: 32, ox: 24, oy: 29 },
  rock_kestrel: { w: 48, h: 66, ox: 22, oy: 48 },
  cape_wagtail: { w: 40, h: 34, ox: 20, oy: 26 },
  fiscal_shrike: { w: 34, h: 58, ox: 15, oy: 38 },
  striped_mouse: { w: 76, h: 40, ox: 38, oy: 37 },
  pied_crow: { w: 64, h: 84, ox: 30, oy: 64 },
  malachite_kingfisher: { w: 30, h: 42, ox: 13, oy: 32 },
  red_billed_oxpecker: { w: 40, h: 32, ox: 20, oy: 26 },
  african_jacana: { w: 78, h: 84, ox: 36, oy: 81 },
} as const;

export type TellSpecies = keyof typeof TELL_BOXES;
export const TELL_SPECIES = Object.keys(TELL_BOXES) as TellSpecies[];
export const TELL_POSES = ['rest', 'act_a', 'act_b', 'flee'] as const;
export type TellPose = (typeof TELL_POSES)[number];

export const tellFrameName = (species: string, pose: TellPose): string => `${species}_${pose}`;

export interface TellRect {
  readonly name: string;
  readonly species: TellSpecies;
  readonly pose: TellPose;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

const GAP = 2;

/** Every frame's rect at 1× (prop px): one row per species. */
export function tellFrames(): TellRect[] {
  const out: TellRect[] = [];
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const species of TELL_SPECIES) {
    const b = TELL_BOXES[species];
    for (const pose of TELL_POSES) {
      if (x + b.w + GAP > TELL_SHEET_W) {
        x = GAP;
        y += row + GAP;
        row = 0;
      }
      out.push({ name: tellFrameName(species, pose), species, pose, x, y, ...b });
      x += b.w + GAP;
      row = Math.max(row, b.h);
    }
  }
  return out;
}

/** Sheet height the frames need (prop px at 1×; tellKeys.ts TELL_SHEET_H must equal it). */
export function tellSheetHeight(): number {
  return Math.max(...tellFrames().map((f) => f.y + f.h)) + GAP;
}

/** Texture px per prop px of a sheet whose file is `width` px wide (2: the delivered 2× art). */
export function tellTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / TELL_SHEET_W));
}
