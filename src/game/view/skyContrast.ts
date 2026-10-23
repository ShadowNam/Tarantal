// v1.2 (D-033): bird readability against a map's sky. The weekday light multiplies the sky art by
// a tint (and may lay a haze over it); fly-overs cross the sky lanes, so the sky band there must
// keep enough contrast with the tarentaal's dark plumage. Pure: callers pass the sky pixels.
import type { Light } from '../../content/schemas';

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an 0xRRGGBB colour. */
export function luminance(rgb: number): number {
  return (
    0.2126 * channel((rgb >> 16) & 0xff) +
    0.7152 * channel((rgb >> 8) & 0xff) +
    0.0722 * channel(rgb & 0xff)
  );
}

/** WCAG contrast ratio of two colours (1 … 21). */
export function contrast(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const hex = (s: string): number => parseInt(s.slice(1), 16);

/** One sky pixel as drawn under these lights (sky tints multiply, sky hazes blend over). */
export function litSky(
  rgb: number,
  lights: readonly Light[],
  /** Design y of the pixel (haze bands cover only their own rows). */
  y = 0,
  skyLayer = 'sky',
): number {
  let r = (rgb >> 16) & 0xff;
  let g = (rgb >> 8) & 0xff;
  let b = rgb & 0xff;
  for (const light of lights) {
    const t = light.tint?.[skyLayer];
    if (t !== undefined) {
      const c = hex(t);
      r = (r * ((c >> 16) & 0xff)) / 255;
      g = (g * ((c >> 8) & 0xff)) / 255;
      b = (b * (c & 0xff)) / 255;
    }
  }
  for (const light of lights)
    for (const h of light.haze ?? []) {
      if (h.layer !== skyLayer || y < (h.top ?? 0) || y >= (h.bottom ?? Infinity)) continue;
      const c = hex(h.color);
      r = r * (1 - h.alpha) + ((c >> 16) & 0xff) * h.alpha;
      g = g * (1 - h.alpha) + ((c >> 8) & 0xff) * h.alpha;
      b = b * (1 - h.alpha) + (c & 0xff) * h.alpha;
    }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** Median contrast of the bird colour against sky pixels under these lights. */
export function medianSkyContrast(
  sky: readonly { readonly rgb: number; readonly y: number }[],
  lights: readonly Light[],
  bird: number,
): number {
  const cs = sky.map((p) => contrast(litSky(p.rgb, lights, p.y), bird)).sort((a, b) => a - b);
  return cs[cs.length >> 1] ?? 0;
}
