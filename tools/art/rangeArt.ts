// 24 Oct update (D-037) interim Skietbaan art: the steel plate, a round gong hanging from two
// short chains (it swings about the hang point, the texture origin). Semi-realistic per D-035: no
// dark contours; mild steel lit from the upper left, a painted white face pocked by old hits.
// Rendered like the shared sprites (renderSprite) at PLATE_TEX_SIZE, group "range" (lazy).
import {
  PLATE_DISC_R,
  PLATE_HANG_PX,
  PLATE_ORIGIN,
  PLATE_TEX,
  PLATE_TEX_SIZE,
} from '../../src/game/range/rangeAssets';
import { el, g } from './svg';
import type { SpriteSpec } from './sprites';

const R = PLATE_DISC_R;
/** Disc centre below the hang point (texture px). */
const CY = PLATE_HANG_PX + R - PLATE_ORIGIN.y * PLATE_TEX_SIZE.height;

function radial(id: string, cx: number, cy: number, r: number, stops: [number, string][]): string {
  return el(
    'radialGradient',
    { id, gradientUnits: 'userSpaceOnUse', cx, cy, r },
    ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
  );
}

function plate(p: { rnd: () => number }): string {
  const chainX = R * 0.42;
  const links: string[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const t = k / 4;
      const x = side * chainX * (0.35 + 0.65 * t);
      const y = 2 + t * (CY - R * 0.92);
      links.push(
        el('ellipse', {
          cx: x,
          cy: y + 4,
          rx: 3,
          ry: 5.5,
          fill: 'none',
          stroke: k % 2 === 0 ? '#8C939B' : '#5F666E',
          'stroke-width': 2.4,
        }),
      );
    }
  }
  // Old hits: grey pocks where the paint came off.
  const pocks: string[] = [];
  for (let k = 0; k < 14; k++) {
    const a = p.rnd() * Math.PI * 2;
    const d = Math.sqrt(p.rnd()) * R * 0.8;
    const r = 2 + p.rnd() * 4;
    pocks.push(
      el('circle', {
        cx: Math.cos(a) * d,
        cy: CY + Math.sin(a) * d,
        r,
        fill: '#9AA0A6',
        opacity: 0.75,
      }),
    );
  }
  return g(
    {},
    el(
      'defs',
      {},
      radial('steel', -R * 0.35, CY - R * 0.4, R * 1.5, [
        [0, '#B9C0C7'],
        [0.55, '#7D858D'],
        [1, '#454B52'],
      ]),
      radial('paint', -R * 0.3, CY - R * 0.35, R * 1.3, [
        [0, '#FFFDF6'],
        [0.7, '#E9E4D8'],
        [1, '#C9C3B6'],
      ]),
    ),
    ...links,
    el('circle', { cx: 0, cy: CY, r: R, fill: 'url(#steel)' }),
    el('circle', { cx: 0, cy: CY, r: R * 0.9, fill: 'url(#paint)' }),
    ...pocks,
    // The rim's lit edge (upper left) and its shade (lower right), then the two hanger bolts.
    el('path', {
      d: `M${-R * 0.97} ${CY - R * 0.2}A${R} ${R} 0 0 1 ${R * 0.2} ${CY - R * 0.98}`,
      fill: 'none',
      stroke: '#E3E7EA',
      'stroke-width': 3,
      opacity: 0.8,
    }),
    el('path', {
      d: `M${R * 0.97} ${CY + R * 0.2}A${R} ${R} 0 0 1 ${-R * 0.2} ${CY + R * 0.98}`,
      fill: 'none',
      stroke: '#2C3136',
      'stroke-width': 4,
      opacity: 0.6,
    }),
    el('circle', { cx: -chainX, cy: CY - R * 0.86, r: 4.5, fill: '#5F666E' }),
    el('circle', { cx: chainX, cy: CY - R * 0.86, r: 4.5, fill: '#5F666E' }),
  );
}

export const RANGE_SPRITES: readonly SpriteSpec[] = [{ key: PLATE_TEX, wobble: 0, draw: plate }];
