// D-053: the optional HD art pack. Every asset group `g` (common, late, ver, desert, a biome) may
// have a lazy twin `g-hd` with the same art at 2 texture px per design px: the 2× renders the art
// tools draw anyway, kept instead of being averaged down. The asset index lists an entry's HD file
// beside its standard one (`hd` on images, layers, bird planes and guns). Standard is the 1× art
// of the first download, unchanged; HD textures are drawn at half scale, so design px stay design
// px and the sim, positions and hit areas never see the difference.
//
// Adding an asset to an HD pack (one step, docs/06 §HD): put its 2× render at
// `art-source/hd/<same path as the standard file>` (sprites/<key>.png, layers/<biome>/<layer>.png),
// or, for a sprite, bird or gun whose standard source is already a ≥ 2× master, nothing at all:
// `npm run assets:pack` packs the master into the HD group. `"hd": false` in a sidecar or rig.json
// leaves one out.

/** Suffix of an HD group: `bushveld-winter` → `bushveld-winter-hd`. */
export const HD_SUFFIX = '-hd';

/** Texture px per design px of HD art. */
export const HD_RES = 2;

/** Folder under art-source/ that holds the 2× sources (same layout as art-source/ itself). */
export const HD_SOURCE_DIR = 'hd';

/**
 * Layers without an HD version: the sky is a soft gradient (no detail gains from 2×, and at 2× it
 * would cost 35 MB of texture memory per area).
 */
export const HD_SKIP_LAYERS: readonly string[] = ['sky'];

/**
 * Texture keys (prefixes) without an HD version: images that are cropped and drawn without a view
 * scale (hdTexture.ts: Phaser 4.2 clamps a crop to the frame's halved size). The HUD ammo (the
 * hopper level), the meerkat helper (it climbs out of its burrow) and the water channels (scope
 * culling crops them).
 */
export const HD_SKIP_KEYS: readonly string[] = ['ui/ammo/', 'helper/meerkat', 'biome/water'];

/** True when `key` may have an HD version. */
export function hdAllowed(key: string): boolean {
  return !HD_SKIP_KEYS.some((p) => key.startsWith(p));
}

/** The HD twin of a group. */
export function hdGroupOf(group: string): string {
  return `${group}${HD_SUFFIX}`;
}

/** True for an HD group name. */
export function isHdGroup(group: string): boolean {
  return group.endsWith(HD_SUFFIX);
}

/** The standard group an HD group belongs to (the group itself when it is no HD group). */
export function baseGroupOf(group: string): string {
  return isHdGroup(group) ? group.slice(0, -HD_SUFFIX.length) : group;
}
