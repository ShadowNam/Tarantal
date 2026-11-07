// v1.13 (D-075) STAND-IN drawings for the hoofed cameos (warthogs, springbok, gemsbok): plain inked
// silhouettes so the sheet pipeline works; the real drawings replace this file.
import type { CameoFrame } from '../../src/game/cameos/cameoSheet';
import type { CameoArt } from './cameos';
import { ellipseD, inked } from './svg';

const PREFIXES = ['hog_', 'pig_', 'sb_', 'gb_'];

export function isHoofedFrame(name: CameoFrame): boolean {
  return PREFIXES.some((p) => name.startsWith(p));
}

const SIZE: Readonly<Record<string, readonly [number, number, string]>> = {
  hog_: [52, 30, '#6E5A4A'],
  pig_: [22, 14, '#7A6656'],
  sb_: [50, 40, '#C98B4E'],
  gb_: [70, 70, '#B9A88E'],
};

export function hoofedFrameArt(name: CameoFrame): CameoArt {
  const p = PREFIXES.find((x) => name.startsWith(x)) ?? 'hog_';
  const [rx, ry, fill] = SIZE[p] ?? [20, 20, '#888'];
  return { defs: '', body: inked(ellipseD(0, -ry, rx, ry), fill, '#1C130F', 2) };
}
