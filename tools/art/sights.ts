// v1.3 (D-036) interim sight pictures: what you see through each rifle sight, drawn as SVG at the
// placeholder's size and origin (src/game/placeholder/sightArt.ts) and rendered like the other
// shared sprites. Semi-realistic per D-035: no dark contours (every edge is a darker or lighter
// shade of its own material), blued steel lit from the upper left, glass with a coating tint and
// a reflection, parts near the eye out of focus.
//   sight/iron_rear   rear leaf with a square notch on its base, the barrel running down
//   sight/iron_front  square front post on a serrated ramp with a dovetail base (in focus)
//   sight/peep        the aperture disc, out of focus, clear in the middle
//   sight/scope       tube wall, lens edge and coated glass around the clear view
import { el, g } from './svg';
import type { SpriteSpec } from './sprites';

const STEEL = { lit: '#6A7484', mid: '#2E343C', dark: '#14171B', sky: '#9DB3C8' };
/** Must match sightArt.ts (SightView joins the art to its screen fills). */
const PEEP_CLEAR_R = 150;
const PEEP_DARK = '#17191C';
const SCOPE_GLASS_R = 206;
const SCOPE_DARK = '#070809';
const BARREL_BOTTOM = { left: -35, right: 35 };

let ids = 0;
const id = (name: string): string => `${name}${++ids}`;

function linear(
  gid: string,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  stops: readonly (readonly [number, string, number?])[],
): string {
  return el(
    'linearGradient',
    { id: gid, gradientUnits: 'userSpaceOnUse', x1, y1, x2, y2 },
    ...stops.map(([o, c, a]) =>
      el('stop', { offset: o, 'stop-color': c, ...(a === undefined ? {} : { 'stop-opacity': a }) }),
    ),
  );
}

function radial(
  gid: string,
  r: number,
  stops: readonly (readonly [number, string, number?])[],
): string {
  return el(
    'radialGradient',
    { id: gid, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r },
    ...stops.map(([o, c, a]) =>
      el('stop', { offset: o, 'stop-color': c, ...(a === undefined ? {} : { 'stop-opacity': a }) }),
    ),
  );
}

const blur = (fid: string, sd: number): string =>
  el(
    'filter',
    { id: fid, x: '-20%', y: '-20%', width: '140%', height: '140%' },
    el('feGaussianBlur', { stdDeviation: sd }),
  );

/** Rear leaf (origin: the middle of its top edge, level with the notch top) and the slim stem
 *  below it. v1.3 review: a slimmer leaf and a wide notch, so light shows either side of the post. */
function ironRear(): string {
  const f = id('soft');
  const leaf = id('leaf');
  const barrel = id('barrel');
  const sheen = id('sheen');
  // Rounded ends, top edge at y 0, a square notch 88 wide and 38 deep.
  const leafD = 'M-188 44Q-200 8-176 2L-44 0L-44 38L44 38L44 0L176 2Q200 8 188 44Z';
  return g(
    {},
    el(
      'defs',
      {},
      blur(f, 2),
      linear(
        leaf,
        [0, 0, 0, 44],
        [
          [0, STEEL.lit],
          [0.15, STEEL.mid],
          [1, STEEL.dark],
        ],
      ),
      linear(
        barrel,
        [-35, 0, 35, 0],
        [
          [0, STEEL.lit],
          [0.3, STEEL.mid],
          [1, STEEL.dark],
        ],
      ),
      linear(
        sheen,
        [0, 56, 0, 280],
        [
          [0, STEEL.sky, 0.5],
          [1, STEEL.sky, 0.08],
        ],
      ),
    ),
    g(
      { filter: `url(#${f})` },
      // The slim stem (barrel), widening toward the eye; a sky reflection along its left.
      el('path', {
        d: `M-18 56L18 56L${BARREL_BOTTOM.right} 280L${BARREL_BOTTOM.left} 280Z`,
        fill: `url(#${barrel})`,
      }),
      el('path', { d: 'M-14 58L-8 58L-18 280L-30 280Z', fill: `url(#${sheen})` }),
      // The leaf's base block, a darker shade than the leaf.
      el('rect', { x: -26, y: 38, width: 52, height: 22, rx: 3, fill: STEEL.dark }),
      el('rect', { x: -26, y: 38, width: 52, height: 3, fill: STEEL.mid }),
      el('path', { d: leafD, fill: `url(#${leaf})` }),
      // Lit top edge of the leaf (the key light), broken by the notch.
      el('path', { d: 'M-176 3L-44 1L-44 4L-176 6Z', fill: STEEL.sky, opacity: 0.6 }),
      el('path', { d: 'M44 1L176 3L176 6L44 4Z', fill: STEEL.sky, opacity: 0.35 }),
    ),
  );
}

/** Front post on its ramp (origin: the post's tip = the aim point). Sharp: it is in focus.
 *  v1.3 review: a broad post (48 px) with a bright bevel along its top edge. */
function ironFront(): string {
  const ramp = id('ramp');
  const post = id('post');
  const grooves: string[] = [];
  for (let y = 152; y < 300; y += 12)
    grooves.push(
      el('path', {
        d: `M${-24 - (y - 144) * 0.09} ${y}L${24 + (y - 144) * 0.09} ${y}`,
        stroke: STEEL.dark,
        'stroke-width': 3,
        opacity: 0.7,
      }),
    );
  return g(
    {},
    el(
      'defs',
      {},
      linear(
        post,
        [-24, 0, 24, 0],
        [
          [0, STEEL.lit],
          [0.45, STEEL.mid],
          [1, STEEL.dark],
        ],
      ),
      linear(
        ramp,
        [-38, 0, 38, 0],
        [
          [0, STEEL.lit],
          [0.45, STEEL.mid],
          [1, STEEL.dark],
        ],
      ),
    ),
    // The post: lit left face, the shadow face a darker shade of the same steel, a bright
    // bevel along the top catching the key light (no dark outline, D-035).
    el('rect', { x: -24, y: 0, width: 48, height: 150, fill: `url(#${post})` }),
    el('rect', { x: -24, y: 0, width: 48, height: 4, fill: STEEL.sky, opacity: 0.9 }),
    el('rect', { x: -24, y: 4, width: 6, height: 140, fill: STEEL.sky, opacity: 0.3 }),
    el('path', { d: 'M-24 144L24 144L38 314L-38 314Z', fill: `url(#${ramp})` }),
    ...grooves,
    // Dovetail base.
    el('path', { d: 'M-38 290L38 290L32 314L-32 314Z', fill: STEEL.dark }),
  );
}

/** The aperture disc, out of focus: clear in the middle, a soft dark ring, a faint sheen. */
function peep(): string {
  const r = id('peep');
  const s = id('peepSheen');
  const corner = 256 * Math.SQRT2;
  return g(
    {},
    el(
      'defs',
      {},
      radial(r, corner, [
        [0, PEEP_DARK, 0],
        [PEEP_CLEAR_R / corner, PEEP_DARK, 0],
        [(PEEP_CLEAR_R + 44) / corner, PEEP_DARK, 1],
        [1, PEEP_DARK, 1],
      ]),
      radial(s, 256, [
        [0, '#000000', 0],
        [0.7, '#000000', 0],
        [0.8, STEEL.lit, 0.18],
        [0.9, '#000000', 0],
      ]),
    ),
    el('rect', { x: -256, y: -256, width: 512, height: 512, fill: `url(#${r})` }),
    // The disc's knurled rim catching the light (upper left, blurred).
    el('circle', { cx: -8, cy: -8, r: 256, fill: `url(#${s})` }),
  );
}

/** The scope: dark beyond the tube, the tube wall, the lens edge, coated glass, a reflection. */
function scope(): string {
  const dark = id('scopeDark');
  const wall = id('wall');
  const vig = id('vignette');
  const coat = id('coat');
  const corner = 256 * Math.SQRT2;
  const R = SCOPE_GLASS_R;
  return g(
    {},
    el(
      'defs',
      {},
      radial(dark, corner, [
        [0, SCOPE_DARK, 0],
        [(R - 0.5) / corner, SCOPE_DARK, 0],
        [(R + 1) / corner, SCOPE_DARK, 1],
        [1, SCOPE_DARK, 1],
      ]),
      linear(
        wall,
        [-R, -R, R, R],
        [
          [0, '#4A5360'],
          [0.4, '#1C2026'],
          [1, '#0A0B0D'],
        ],
      ),
      // Glass: a thin dark band at the very edge (the tube's shadow) and a hint of green-blue
      // coating. Kept narrow (v1.6 review): a wide band read as grey fog over the bright skies.
      radial(vig, R, [
        [0, '#000000', 0],
        [0.94, '#000000', 0],
        [1, '#000000', 0.6],
      ]),
      radial(coat, R, [
        [0, '#5FB3A3', 0],
        [0.97, '#5FB3A3', 0],
        [1, '#5FB3A3', 0.12],
      ]),
    ),
    el('rect', { x: -256, y: -256, width: 512, height: 512, fill: `url(#${dark})` }),
    el('circle', { cx: 0, cy: 0, r: R, fill: `url(#${vig})` }),
    el('circle', { cx: 0, cy: 0, r: R, fill: `url(#${coat})` }),
    // Tube wall and the lens edge (a bright rim where the glass meets the tube).
    el('circle', {
      cx: 0,
      cy: 0,
      r: R + 8,
      fill: 'none',
      stroke: `url(#${wall})`,
      'stroke-width': 14,
    }),
    el('circle', {
      cx: 0,
      cy: 0,
      r: R + 0.8,
      fill: 'none',
      stroke: '#B8CEDC',
      'stroke-width': 1.6,
      opacity: 0.55,
    }),
    // A soft reflection of the sky on the glass, upper left.
    el('path', {
      d: `M${-R * 0.78} ${-R * 0.18}A${R * 0.86} ${R * 0.86} 0 0 1 ${-R * 0.22} ${-R * 0.8}A${R * 0.98} ${R * 0.98} 0 0 0 ${-R * 0.78} ${-R * 0.18}Z`,
      fill: '#FFFFFF',
      opacity: 0.05,
    }),
  );
}

export const SIGHT_SPRITES: readonly SpriteSpec[] = [
  { key: 'sight/iron_rear', wobble: 0, draw: ironRear },
  { key: 'sight/iron_front', wobble: 0, draw: ironFront },
  { key: 'sight/peep', wobble: 0, draw: peep },
  { key: 'sight/scope', wobble: 0, draw: scope },
];
