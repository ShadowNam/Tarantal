// D-048 special-day assets: Halloween's sheet (bats, owls, pumpkin lanterns, the moon, witch
// hats, cobwebs, a puff) and its sounds. They load in a lazy group of their own ("feesdae") only
// when a special day's hunt starts (or the admin/test override asks for one) — never with the
// first download, and inside no biome's chunk. Pure constants and a frame table: the game, the
// pack tool and the interim art generator all read them.

/** The special days' asset group (lazy: tools/size-check counts it as its own chunk). */
export const FEESDAE_GROUP = 'feesdae';

/** Every Halloween frame on one sheet (texture key). */
export const HALLOWEEN_SHEET = 'feesdae/halloween';
/** The interim sheet is drawn at 2× (and so is the in-game stand-in): crisp in a scope. */
export const SHEET_MASTER = 2;

/** Sounds through the AudioDirector (recording once delivered, else a small synth). */
export const SPOOK_SOUNDS = {
  sting: 'sfx/spook_sting',
  hoot: 'sfx/owl_hoot',
  squeak: 'sfx/bat_squeak',
  puff: 'sfx/lantern_puff',
} as const;
export type SpookSound = keyof typeof SPOOK_SOUNDS;

/** A key that belongs to the feesdae group. */
export function isFeesdaeKey(key: string): boolean {
  return key === HALLOWEEN_SHEET || (Object.values(SPOOK_SOUNDS) as string[]).includes(key);
}

/** A frame's box in design px (×1) and its origin in the box. `forScale`: the plane scale it is
 *  drawn for (1 = the near plane; witch hats come in one drawing per plane size). */
interface FrameSpec {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly forScale?: number;
}

/** Lantern frames: the pumpkin's centre is the origin; its ground line LANTERN_GROUND_PX below
 *  (feesdae.json lanterns.lift is this distance, so the sim's hit circle sits on the pumpkin). */
export const LANTERN_GROUND_PX = 58;

const OWL = { w: 330, h: 200, ox: 165, oy: 100 };
const BAT = { w: 170, h: 110, ox: 85, oy: 55 };
const LANTERN = { w: 150, h: 170, ox: 75, oy: 70 };
/** Packed in shelves in this order (rows of about SHEET_W). The moon is drawn small and shown
 *  larger (it is a soft shape), which keeps the sheet's GPU size down. */
const SPECS: readonly FrameSpec[] = [
  { name: 'moon', w: 280, h: 280, ox: 140, oy: 140 },
  { name: 'owl_0', ...OWL },
  { name: 'owl_1', ...OWL },
  { name: 'owl_2', ...OWL },
  { name: 'glow', w: 220, h: 220, ox: 110, oy: 110 },
  { name: 'cobweb', w: 220, h: 220, ox: 0, oy: 0 },
  { name: 'bat_0', ...BAT },
  { name: 'bat_1', ...BAT },
  { name: 'bat_2', ...BAT },
  { name: 'lantern_rock_lit', ...LANTERN },
  { name: 'lantern_rock_dark', ...LANTERN },
  { name: 'lantern_post_lit', ...LANTERN },
  { name: 'lantern_post_dark', ...LANTERN },
  { name: 'hat_l', w: 130, h: 120, ox: 65, oy: 104, forScale: 1 },
  { name: 'puff', w: 120, h: 120, ox: 60, oy: 60 },
  { name: 'hat_m', w: 70, h: 64, ox: 35, oy: 55, forScale: 0.5 },
  { name: 'skybat_0', w: 70, h: 40, ox: 35, oy: 20 },
  { name: 'skybat_1', w: 70, h: 40, ox: 35, oy: 20 },
  { name: 'hat_s', w: 36, h: 34, ox: 18, oy: 29, forScale: 0.22 },
];

export type HalloweenFrame =
  | 'moon'
  | 'owl_0'
  | 'owl_1'
  | 'owl_2'
  | 'glow'
  | 'cobweb'
  | 'bat_0'
  | 'bat_1'
  | 'bat_2'
  | 'lantern_rock_lit'
  | 'lantern_rock_dark'
  | 'lantern_post_lit'
  | 'lantern_post_dark'
  | 'hat_l'
  | 'puff'
  | 'hat_m'
  | 'skybat_0'
  | 'skybat_1'
  | 'hat_s';

export interface SheetRect {
  readonly name: HalloweenFrame;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly forScale: number;
}

/** Sheet width in design px (×SHEET_MASTER in texture px). */
export const SHEET_W = 960;
const PAD = 4;

/** Every frame of the sheet in design px (×1), packed in shelves in SPECS order. */
export function sheetFrames(): SheetRect[] {
  const out: SheetRect[] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  for (const s of SPECS) {
    if (x + s.w > SHEET_W) {
      x = 0;
      y += row + PAD;
      row = 0;
    }
    out.push({
      name: s.name as HalloweenFrame,
      x,
      y,
      w: s.w,
      h: s.h,
      ox: s.ox,
      oy: s.oy,
      forScale: s.forScale ?? 1,
    });
    x += s.w + PAD;
    row = Math.max(row, s.h);
  }
  return out;
}

/** Sheet height in design px. */
export const SHEET_H = ((): number => {
  const f = sheetFrames();
  return Math.max(...f.map((r) => r.y + r.h));
})();

/** The witch hat drawn for a plane of this scale (the nearest drawing at or above it). */
export function hatFrame(scale: number): 'hat_l' | 'hat_m' | 'hat_s' {
  return scale >= 0.75 ? 'hat_l' : scale >= 0.35 ? 'hat_m' : 'hat_s';
}
