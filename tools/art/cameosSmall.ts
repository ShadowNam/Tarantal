// v1.13 (D-075) STAND-IN drawings for the small cameos (the dung beetle, the tortoise, the ostrich
// and its dust): plain inked silhouettes so the sheet pipeline works; the real drawings replace this.
import type { CameoFrame } from '../../src/game/cameos/cameoSheet';
import type { CameoArt } from './cameos';
import { ellipseD, inked } from './svg';

export function smallFrameArt(name: CameoFrame): CameoArt {
  const [rx, ry, fill] = name.startsWith('ost_')
    ? [60, 95, '#3A302C']
    : name === 'dust'
      ? [50, 22, '#D9C29A']
      : name.startsWith('tort_')
        ? [42, 22, '#8A7A4A']
        : [26, 16, '#3A2A1A'];
  return { defs: '', body: inked(ellipseD(0, -ry, rx, ry), fill, '#1C130F', 2) };
}
