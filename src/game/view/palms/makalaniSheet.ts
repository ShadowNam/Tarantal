// 1.9.3 (D-056, art bible §4.2b) Makalani art: per plane one straight trunk and one crown texture
// (MakalaniView builds each palm group from them: a trunk turned to its lean and stretched to its
// height, a crown at its top, swaying), and one small nut sheet. Kept this small on purpose: the
// Okavango's HD hunt is the closest to the texture budget (D-054), and a whole group drawn as one
// image would cost several times the memory. Sizes are design px at plane scale 1; each plane's
// textures are drawn at that plane's scale. Pure constants and frame tables: the game, the
// placeholder and the interim art generator (tools/art/makalani.ts) all read them.
import type { NutColour } from '../../../content/schemas';

export type PalmArtPlane = 'near' | 'mid';
export const PALM_ART_PLANES: readonly PalmArtPlane[] = ['near', 'mid'];
/** Plane scales the textures are drawn at (scoring.json planes; checked in a test). */
export const PALM_ART_SCALE: Readonly<Record<PalmArtPlane, number>> = { near: 1, mid: 0.42 };

export const palmTrunkKey = (plane: PalmArtPlane): string => `okavango/makalani_trunk_${plane}`;
export const palmCrownKey = (plane: PalmArtPlane): string => `okavango/makalani_crown_${plane}`;

/** The trunk is drawn straight up, `len` long from its foot (the origin), `w` wide at the base,
 *  `below` px of roots and grass under the foot. */
export const TRUNK = { len: 800, w: 60, below: 16 } as const;
/** The crown: its base (where the trunk top meets the leaf bases) is the origin; fans reach `up`
 *  above it and `half` to each side, the dry fronds hang `down` below it. */
export const CROWN = { half: 140, up: 140, down: 120 } as const;

export interface PalmFrame {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

/** A plane's trunk and crown frames in texture px at 1× (design px on that plane). */
export function palmFrames(plane: PalmArtPlane): { trunk: PalmFrame; crown: PalmFrame } {
  const s = PALM_ART_SCALE[plane];
  const r = (n: number): number => Math.max(2, Math.round(n * s));
  return {
    // Room round the drawing: the flared foot and its grass, and 24 px above the top (the crown
    // covers it; the edge audit wants no art cut by the texture's edge).
    trunk: {
      w: r(TRUNK.w + 28),
      h: r(TRUNK.len + TRUNK.below + 24),
      ox: r(TRUNK.w + 28) / 2,
      oy: r(TRUNK.len + 24),
    },
    crown: {
      w: r(CROWN.half * 2),
      h: r(CROWN.up + CROWN.down),
      ox: r(CROWN.half * 2) / 2,
      oy: r(CROWN.up),
    },
  };
}

/** The nut sheet (the Okavango's group): nuts at plane scale 1, drawn at 2× (NUT_MASTER). */
export const NUT_SHEET = 'fx/makalani';
export const NUT_MASTER = 2;
export const NUT_COLOURS: readonly NutColour[] = ['brown', 'orange', 'green'];

export type NutFrame = `nut_${NutColour}` | `nut_${NutColour}_blur` | 'fibre' | 'husk' | 'chip';

export interface NutRect {
  readonly name: NutFrame;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

/** A nut frame's size: birds.json makalani.nutR × 2 plus a rim (checked in a test). */
export const NUT_BOX = 24;
const GAP = 2;

export function nutFrames(): NutRect[] {
  const out: NutRect[] = [];
  let x = GAP;
  for (const c of NUT_COLOURS)
    for (const name of [`nut_${c}`, `nut_${c}_blur`] as const) {
      out.push({ name, x, y: GAP, w: NUT_BOX, h: NUT_BOX, ox: NUT_BOX / 2, oy: NUT_BOX / 2 });
      x += NUT_BOX + GAP;
    }
  const bits: [NutFrame, number, number][] = [
    ['fibre', 14, 5],
    ['husk', 10, 8],
    ['chip', 8, 7],
  ];
  for (const [name, w, h] of bits) {
    out.push({ name, x, y: GAP, w, h, ox: w / 2, oy: h / 2 });
    x += w + GAP;
  }
  return out;
}

const all = nutFrames();
export const NUT_SHEET_W = Math.max(...all.map((f) => f.x + f.w)) + GAP;
export const NUT_SHEET_H = NUT_BOX + 2 * GAP;

/** Sounds through the AudioDirector: common recordings, pitched (a woody tok, a sharp krak, a
 *  hard bounce, the whoosh of Weg!). */
export const NUT_SOUNDS = {
  tok: 'sfx/thud',
  krak: 'sfx/scratch',
  bounce: 'sfx/tick',
  whistle: 'sfx/whoosh',
} as const;
