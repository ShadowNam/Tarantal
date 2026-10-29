// v1.7d (D-059, art bible §4.5c) The Namib ground cover as sprites: bushman grass (Stipagrostis)
// clumps, short tufts and dry clumps, dollar bush (Zygophyllum) and dead branches, a few variants
// per kind and per plane size, placed over the sand layers by VeldView from the art's placement
// list (veld-namibie.json). Baking hundreds of fine clumps into the layer textures cost ~4× the
// bytes; one small sheet of variants, scaled and mirrored, keeps the Namibië chunk in budget.
// Sizes are design px; the Standard sheet is 1×, its HD twin 2×. Pure constants: the game, the
// placeholder and the interim art generator (tools/art/namibVeld.ts) read them.

/** The sheet's texture key (namibie group; its 2× twin in namibie-hd). */
export const VELD_SHEET = 'namibie/veld';

export type VeldKind = 'grass' | 'tuft' | 'dry' | 'dollar' | 'branch';

export interface VeldFrameDef {
  readonly name: string;
  readonly kind: VeldKind;
  /** The size it was drawn at (design px): clump height, bush radius or branch length. */
  readonly ref: number;
  /** Frame box and the foot point (origin) in it, design px at 1×. */
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

const grass = (name: string, ref: number): VeldFrameDef => ({
  name,
  kind: 'grass',
  ref,
  w: Math.ceil(ref * 1.7),
  h: Math.ceil(ref * 1.55),
  ox: Math.ceil(ref * 0.85),
  oy: Math.ceil(ref * 1.47),
});
const tuft = (name: string, ref: number): VeldFrameDef => ({
  ...grass(name, ref),
  kind: 'tuft',
});
const dry = (name: string, ref: number): VeldFrameDef => ({ ...grass(name, ref), kind: 'dry' });
const dollar = (name: string, ref: number): VeldFrameDef => ({
  name,
  kind: 'dollar',
  ref,
  w: Math.ceil(ref * 2.8),
  h: Math.ceil(ref * 1.0),
  ox: Math.ceil(ref * 1.35),
  oy: Math.ceil(ref * 0.86),
});
const branch = (name: string, ref: number): VeldFrameDef => ({
  name,
  kind: 'branch',
  ref,
  w: Math.ceil(ref * 2.2),
  h: Math.ceil(ref * 0.5),
  ox: Math.ceil(ref * 1.1),
  oy: Math.ceil(ref * 0.32),
});

/**
 * Size classes: mid (far into the pan edge), near (the red dune edge) and foreground (the
 * screen's foot). The view picks the class whose `ref` is nearest the wanted size, so a frame is
 * never scaled by much (no shimmer from big downscales, no blur from upscales).
 */
export const VELD_FRAMES: readonly VeldFrameDef[] = [
  grass('grass_s_a', 12),
  grass('grass_s_b', 12),
  tuft('tuft_s_a', 7),
  grass('grass_m_a', 24),
  grass('grass_m_b', 24),
  grass('grass_m_c', 24),
  tuft('tuft_m_a', 13),
  tuft('tuft_m_b', 13),
  grass('grass_n_a', 58),
  grass('grass_n_b', 58),
  grass('grass_n_c', 58),
  tuft('tuft_n_a', 30),
  tuft('tuft_n_b', 30),
  dry('dry_n_a', 46),
  grass('grass_f_a', 150),
  grass('grass_f_b', 150),
  grass('grass_f_c', 150),
  dollar('dollar_m_a', 7),
  dollar('dollar_n_a', 22),
  dollar('dollar_n_b', 22),
  branch('branch_m_a', 22),
  branch('branch_n_a', 80),
];

export interface VeldRect extends VeldFrameDef {
  readonly x: number;
  readonly y: number;
}

/** Sheet width at 1× (design px). */
export const VELD_SHEET_W = 576;
const GAP = 2;

/** Each frame's rect in the 1× sheet, in VELD_FRAMES order: packed in rows tallest first (the
 *  least empty sheet, so the least texture memory in HD). */
export function veldFrames(): VeldRect[] {
  const at = new Map<string, { x: number; y: number }>();
  let x = GAP;
  let y = GAP;
  let row = 0;
  for (const f of [...VELD_FRAMES].sort((a, b) => b.h - a.h || b.w - a.w)) {
    if (x + f.w + GAP > VELD_SHEET_W) {
      x = GAP;
      y += row + GAP;
      row = 0;
    }
    at.set(f.name, { x, y });
    x += f.w + GAP;
    row = Math.max(row, f.h);
  }
  return VELD_FRAMES.map((f) => ({ ...f, x: at.get(f.name)?.x ?? 0, y: at.get(f.name)?.y ?? 0 }));
}

export const VELD_SHEET_H = ((): number => {
  const fr = veldFrames();
  return Math.max(...fr.map((f) => f.y + f.h)) + GAP;
})();

/** Texture px per design px of a sheet whose file is `width` px wide (1 Standard, 2 HD). */
export function veldTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / VELD_SHEET_W));
}

/**
 * One placement on a layer: [layer index into VELD_LAYERS, frame index, x, y (the foot, layer
 * px incl. bleed), scale × 100, mirrored 0/1]. Written by the interim art, read by VeldView.
 */
export type VeldSpot = readonly [number, number, number, number, number, number];

/** The layers a placement can sit on (index = VeldSpot[0]). */
export const VELD_LAYERS = ['mid', 'near', 'foreground'] as const;
export type VeldLayer = (typeof VELD_LAYERS)[number];

/** The frame of `kind` nearest in size to `size` (design px), variant `v` among its equals. */
export function veldFrameFor(kind: VeldKind, size: number, v: number): number {
  let best = -1;
  let bestRef = 0;
  VELD_FRAMES.forEach((f, i) => {
    if (f.kind !== kind) return;
    const d = Math.abs(Math.log(f.ref / size));
    if (best < 0 || d < Math.abs(Math.log(bestRef / size)) - 1e-9) {
      best = i;
      bestRef = f.ref;
    }
  });
  const same = VELD_FRAMES.map((f, i) => ({ f, i })).filter(
    (e) => e.f.kind === kind && e.f.ref === bestRef,
  );
  return same[Math.abs(v) % Math.max(1, same.length)]?.i ?? best;
}
