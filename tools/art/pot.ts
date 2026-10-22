// The Generaal's helmet (bible §3.2): a dented, rusty blue enamel pot with its handle sticking out,
// worn upside down. It is the separate `fx/pot` sprite (140 × 110, origin on the rim centre at
// (70, 90)) that BirdView puts on his head and Fx spins off with a CLANG on the first hit, so the
// knock-off leaves his bare (stub-casque) head. Drawn at 2× and averaged down to the sprite size.
import type { Rgba } from '../assets/image';
import { resize } from '../assets/image';
import type { ArtConfig } from './config';
import { renderSvg } from './raster';
import { ellipseD, el, g, inked, smoothD, svgDoc, wobbleFilter } from './svg';

export const POT_SIZE = { width: 140, height: 110, originX: 70, originY: 90 } as const;
/**
 * Where the sprite's origin sits (px from its top): above the rim, so the pot comes down over the
 * top of the head instead of perching on it (BirdView puts the origin on the head hitbox's top).
 */
export const POT_SEAT_Y = 66;

export function potSvg(cfg: ArtConfig, scale: number): string {
  const P = cfg.birds.parts;
  const ink = cfg.ink;
  const L = 4;
  // Body: rim at y = 0 (on the head), dented crown on top.
  const body = smoothD(
    [
      [-50, 2],
      [-46, -30],
      [-40, -56],
      [-26, -64],
      [-14, -58], // the dent
      [-2, -66],
      [26, -66],
      [42, -56],
      [47, -28],
      [50, 2],
    ],
    true,
    0.7,
  );
  const shade = smoothD([
    [18, -66],
    [44, -56],
    [50, 4],
    [26, 4],
    [30, -40],
  ]);
  const hi = smoothD([
    [-36, -48],
    [-30, -58],
    [-24, -52],
    [-30, -14],
    [-38, -12],
  ]);
  const handle = smoothD(
    [
      [40, -46],
      [66, -58],
      [69, -50],
      [44, -34],
    ],
    true,
    0.4,
  );
  const id = 'potclip';
  const body2 = g(
    {},
    el('clipPath', { id }, el('path', { d: body })),
    inked(handle, P.potShadow, ink, L),
    el('path', { d: ellipseD(64, -53, 2.5, 2.5), fill: ink }),
    el('path', { d: body, fill: P.potBlue }),
    el('path', { d: shade, fill: P.potShadow, 'clip-path': `url(#${id})` }),
    el('path', { d: hi, fill: P.potHi, 'clip-path': `url(#${id})` }),
    // Chipped enamel with rust round the chips, and a dent crease.
    inked(ellipseD(14, -40, 9, 6), P.potRust, ink, 0),
    el('path', { d: ellipseD(14, -40, 5, 3.4), fill: P.potChip }),
    inked(ellipseD(-18, -22, 6, 4), P.potRust, ink, 0),
    el('path', { d: ellipseD(-18, -22, 3, 2), fill: P.potChip }),
    el('path', {
      d: 'M-22 -60q8 6 10 -2',
      fill: 'none',
      stroke: ink,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: body,
      fill: 'none',
      stroke: ink,
      'stroke-width': L,
      'stroke-linejoin': 'round',
    }),
    // Rolled cream rim with its blue edge (enamelware), worn through in one place.
    inked(
      smoothD(
        [
          [-56, -6],
          [56, -6],
          [56, 6],
          [-56, 6],
        ],
        true,
        0.3,
      ),
      P.potRim,
      ink,
      L * 0.8,
    ),
    el('path', { d: 'M-54 4L54 4', stroke: P.potBlue, 'stroke-width': 3 }),
    el('path', { d: ellipseD(30, 0, 6, 3), fill: P.potRust }),
  );
  const filter = wobbleFilter('wob', cfg.birds.wobble.frequency, 1.5, 5);
  return svgDoc(
    POT_SIZE.width * scale,
    POT_SIZE.height * scale,
    [-POT_SIZE.originX, -POT_SIZE.originY, POT_SIZE.width, POT_SIZE.height],
    filter,
    g({ filter: 'url(#wob)' }, body2),
  );
}

/** The sprite at its exact placeholder size (views draw it at 1 texture px per design px). */
export function renderPot(cfg: ArtConfig): Rgba {
  const big = renderSvg(potSvg(cfg, cfg.masterScale));
  return resize(big, POT_SIZE.width, POT_SIZE.height);
}
