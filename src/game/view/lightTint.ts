// The map light's tint on one layer (v1.4 B lights; v1.7c, D-047: shared by the layer art and
// the fruit sprites on it, so a fruit takes its tree's colour at dawn, dusk or in dust). Pure.
import type { Light } from '../../content/schemas';

/** Channel-wise multiply of two 0xRRGGBB colours (tints compound like light filters). */
export function multiplyRgb(a: number, b: number): number {
  const ch = (shift: number): number =>
    Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Every light's tint on `layerId`, multiplied (0xFFFFFF: untinted). */
export function lightTint(lights: readonly Light[], layerId: string): number {
  let tint = 0xffffff;
  for (const light of lights) {
    const hex = light.tint?.[layerId];
    if (hex !== undefined) tint = multiplyRgb(tint, parseInt(hex.slice(1), 16));
  }
  return tint;
}
