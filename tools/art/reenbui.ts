// v1.10 (D-067, art bible §5.6) interim art for Reënbui, the first summer rain and the flying ants:
// one small sheet (layout in src/game/view/reenbui/reenbuiSheet.ts) at 1× (Standard in HD: the
// Okavango's HD hunt leaves ~3 MB of texture memory). Soft, light-catching weather in the D-035
// style: form from gradients and layered tones, no hard outlines on the vapour.
// - Two rain tiles that repeat across the screen (each streak is drawn at its wrapped copies so
//   the tile has no seam): fine far streaks, and fat near drops with a bright head.
// - The alate column: winged termites pouring up from a mound in a loose plume, wider and thinner
//   as it rises; four frames of the rising loop (the swarm's pattern repeats every PERIOD px, so
//   the fourth frame leads back into the first), pale wings catching the light.
// - The mound they pour from, the first drops' dust puff (four frames), a wet-ground patch (the
//   game fades it in where it rains), two storm towers (dark bases, lit tops), two small
//   lightning forks (a far-off strike, never a screen flash).
// Coordinates: design px; each frame is drawn round its origin.
import {
  COLUMN,
  COLUMN_FRAMES,
  PUFF_FRAMES,
  RAIN_TILE,
  REENBUI_SHEET_H,
  REENBUI_SHEET_W,
  reenbuiFrames,
  type ReenbuiFrame,
} from '../../src/game/view/reenbui/reenbuiSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { el, ellipseD, g, polyD, prng, r2, smoothD, svgDoc } from './svg';

type P = readonly [number, number];

let seq = 0;
const uid = (p: string): string => `rb${p}${seq++}`;

function radial(stops: readonly [number, string, number][]): { def: string; url: string } {
  const id = uid('rg');
  return {
    def: el(
      'radialGradient',
      { id, cx: 0.5, cy: 0.5, r: 0.5 },
      ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
    ),
    url: `url(#${id})`,
  };
}

function linear(
  stops: readonly [number, string, number][],
  x2 = 0,
  y2 = 1,
): { def: string; url: string } {
  const id = uid('lg');
  return {
    def: el(
      'linearGradient',
      { id, x1: 0, y1: 0, x2, y2 },
      ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
    ),
    url: `url(#${id})`,
  };
}

// --- rain ------------------------------------------------------------------------------------

/** Wind slant of the streaks: x per y (they fall a little to the left). */
const SLANT = -0.2;

/** A rain tile: `n` streaks, each drawn at its wrapped copies (no seam when tiled). */
function rainTile(seed: number, n: number, near: boolean): string {
  const rnd = prng(seed);
  const { w, h } = RAIN_TILE;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = near ? 38 + rnd() * 34 : 16 + rnd() * 20;
    const width = near ? 1.8 + rnd() * 1.2 : 0.9 + rnd() * 0.5;
    const op = near ? 0.45 + rnd() * 0.3 : 0.28 + rnd() * 0.24;
    const head = near && rnd() < 0.45;
    for (const dx of [-w, 0, w])
      for (const dy of [-h, 0, h]) {
        const x0 = x + dx;
        const y0 = y + dy;
        const x1 = x0 + SLANT * len;
        const y1 = y0 + len;
        if (Math.max(x0, x1) < -4 || Math.min(x0, x1) > w + 4 || y1 < -4 || y0 > h + 4) continue;
        out.push(
          el('path', {
            d: polyD(
              [
                [x0, y0],
                [x1, y1],
              ],
              false,
            ),
            stroke: '#EEF3FA',
            'stroke-width': width,
            'stroke-linecap': 'round',
            opacity: op,
          }),
        );
        if (head)
          out.push(
            el('path', {
              d: ellipseD(x1, y1 - 2.4, 1.9, 3.2),
              fill: '#FFFFFF',
              opacity: Math.min(1, op + 0.2),
            }),
          );
      }
  }
  return g({}, ...out);
}

// --- the alate column ------------------------------------------------------------------------

/** The swarm's pattern repeats every PERIOD px up the column (a frame rises PERIOD / frames). */
const PERIOD = 88;

/** Half-width of the plume at height `up` px above the mound. */
function plumeHalf(up: number): number {
  return 7 + (up / (COLUMN.oy - 6)) * 34;
}

/** One alate: a dark body and two pale wings (one lit edge), at (x, y), tilted `a` rad. */
function alate(x: number, y: number, a: number, s: number, lit: boolean): string {
  const deg = (a * 180) / Math.PI;
  return g(
    { transform: `translate(${r2(x)} ${r2(y)}) rotate(${r2(deg)}) scale(${r2(s)})` },
    el('path', { d: ellipseD(-2.6, -0.6, 3.2, 1.2), fill: '#F6EEDC', opacity: 0.78 }),
    el('path', { d: ellipseD(2.6, -0.6, 3.2, 1.2), fill: '#E8DEC8', opacity: 0.7 }),
    el('path', { d: ellipseD(0, 0, 0.9, 2), fill: '#3A2A1C' }),
    lit ? el('path', { d: ellipseD(-2.6, -1.1, 1.8, 0.5), fill: '#FFFBEA', opacity: 0.95 }) : '',
  );
}

function columnFrame(i: number): string {
  const defs: string[] = [];
  // The plume's haze: warm, faint, fading upward.
  const haze = linear(
    [
      [0, '#E8D9BE', 0],
      [0.35, '#E3D2B2', 0.16],
      [0.85, '#D9C49E', 0.3],
      [1, '#CDB48A', 0.38],
    ],
    0,
    1,
  );
  defs.push(haze.def);
  const top = -COLUMN.oy + 6;
  const hazePts: P[] = [];
  for (let up = 0; up <= -top; up += 24) hazePts.push([plumeHalf(up) * 0.85, -up]);
  const left = hazePts.map(([x, y]): P => [-x, y]).reverse();
  const body: string[] = [el('path', { d: smoothD([...hazePts, ...left]), fill: haze.url })];
  // The swarm: a fixed scatter, periodic in PERIOD, risen i / frames of a period.
  const rnd = prng(4711);
  const rise = (i / COLUMN_FRAMES) * PERIOD;
  const perCell = 34;
  const cells = Math.ceil(-top / PERIOD) + 1;
  for (let k = 0; k < perCell; k++) {
    const v = rnd();
    const lat = rnd() * 2 - 1;
    const tilt = rnd() * Math.PI;
    const size = 0.8 + rnd() * 0.5;
    const lit = rnd() < 0.3;
    const wob = rnd() * Math.PI * 2;
    for (let c = 0; c < cells; c++) {
      const up = ((v * PERIOD + rise) % PERIOD) + c * PERIOD;
      if (up > -top - 4) continue;
      const half = plumeHalf(up);
      // Thicker near the mound, thinning out as it climbs.
      const keep = 1 - (up / -top) * 0.55;
      if (((k * 7 + c * 3) % 10) / 10 > keep) continue;
      const x = lat * half + Math.sin(up / 31 + wob) * 4;
      const fade = 1 - (up / -top) * 0.6;
      body.push(
        g(
          { opacity: r2(Math.max(0.25, fade)) },
          alate(x, -up, tilt + up / 40, size * (0.85 + (up / -top) * 0.35), lit),
        ),
      );
    }
  }
  return g({}, el('defs', {}, ...defs), ...body);
}

function mound(): string {
  const soil = radial([
    [0, '#9A6A44', 1],
    [0.7, '#7A4E30', 1],
    [1, '#5A3820', 0.0],
  ]);
  return g(
    {},
    el('defs', {}, soil.def),
    el('path', { d: ellipseD(0, 2, 44, 9), fill: soil.url }),
    el('path', {
      d: smoothD([
        [-30, 4],
        [-18, -6],
        [-4, -10],
        [10, -8],
        [26, -2],
        [30, 4],
      ]),
      fill: '#8C5C3A',
    }),
    el('path', {
      d: smoothD(
        [
          [-22, 0],
          [-10, -7],
          [4, -8],
          [18, -4],
        ],
        false,
      ),
      stroke: '#B88A5E',
      'stroke-width': 1.6,
      fill: 'none',
      opacity: 0.8,
    }),
    el('path', { d: ellipseD(0, -3, 6, 2.6), fill: '#2A1A10' }),
    el('path', { d: ellipseD(-14, 0, 3, 1.4), fill: '#2A1A10' }),
    el('path', { d: ellipseD(13, -1, 2.6, 1.2), fill: '#2A1A10' }),
    alate(-4, -6, 0.4, 0.9, true),
    alate(6, -8, -0.7, 0.8, false),
  );
}

// --- drops, puffs, wet ground ----------------------------------------------------------------

function puff(i: number): string {
  const t = i / (PUFF_FRAMES - 1);
  const rnd = prng(900 + i);
  const r = 8 + t * 22;
  const op = 0.75 - t * 0.6;
  const out: string[] = [];
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    const x = Math.cos(a) * r * (0.9 + rnd() * 0.3);
    const y = -4 + Math.sin(a) * r * 0.45 * (0.8 + rnd() * 0.4);
    out.push(
      el('path', {
        d: ellipseD(x, y, 5 + t * 8, 3 + t * 5),
        fill: k % 2 === 0 ? '#D9BE94' : '#C9A87A',
        opacity: r2(op),
      }),
    );
  }
  // The drop's own crater in the first frame.
  if (i === 0) out.push(el('path', { d: ellipseD(0, -1, 4, 1.6), fill: '#6A4A30', opacity: 0.8 }));
  return g({}, ...out);
}

function wet(): string {
  const r = radial([
    [0, '#2E2016', 0.6],
    [0.55, '#33251A', 0.42],
    [1, '#3A2A1E', 0],
  ]);
  return g({}, el('defs', {}, r.def), el('path', { d: ellipseD(0, 0, 94, 22), fill: r.url }));
}

// --- storm towers and forks ------------------------------------------------------------------

function cloud(seed: number, anvil: boolean): string {
  const rnd = prng(seed);
  const body = linear(
    [
      [0, '#D7DAE2', 1],
      [0.45, '#9EA3B2', 1],
      [0.8, '#5E6372', 1],
      [1, '#454957', 1],
    ],
    0,
    1,
  );
  const out: string[] = [];
  // Billows from the base up: a tower (or an anvil spreading at the top).
  const lumps: [number, number, number][] = [];
  for (let k = 0; k < 26; k++) {
    const up = rnd();
    const spread = anvil && up > 0.72 ? 1.3 : 1 - up * 0.5;
    const x = (rnd() * 2 - 1) * 100 * spread;
    const y = -16 - up * 104;
    const r = 16 + rnd() * 16 - up * 4;
    lumps.push([x, y, r]);
  }
  lumps.sort((a, b) => a[1] - b[1]);
  out.push(
    el('path', {
      d: smoothD([
        [-120, -4],
        [-60, -30],
        [0, -38],
        [60, -30],
        [120, -4],
      ]),
      fill: '#555A68',
    }),
  );
  for (const [x, y, r] of lumps)
    out.push(el('path', { d: ellipseD(x, y, r * 1.15, r), fill: body.url }));
  for (const [x, y, r] of lumps)
    if (y < -60)
      out.push(
        el('path', {
          d: ellipseD(x - r * 0.25, y - r * 0.3, r * 0.6, r * 0.42),
          fill: '#F2F3F6',
          opacity: 0.55,
        }),
      );
  // The flat dark base, ragged with a little virga.
  out.push(el('path', { d: ellipseD(0, -6, 122, 9), fill: '#3C404C' }));
  return g(
    {},
    el('defs', {}, body.def),
    el(
      'clipPath',
      { id: `clip${seed}` },
      el('rect', { x: -140, y: -146, width: 280, height: 146 }),
    ),
    g({ 'clip-path': `url(#clip${seed})` }, ...out),
  );
}

function fork(seed: number): string {
  const rnd = prng(seed);
  const main: P[] = [[0, 0]];
  let x = 0;
  for (let y = 12; y <= 140; y += 10 + rnd() * 8) {
    x = Math.max(-20, Math.min(20, x + (rnd() * 2 - 1) * 9));
    main.push([x, y]);
  }
  const branch = (from: P, n: number, dir: number): P[] => {
    const pts: P[] = [from];
    let [bx, by] = from;
    for (let k = 0; k < n; k++) {
      bx += dir * (4 + rnd() * 5);
      by += 7 + rnd() * 6;
      pts.push([bx, by]);
    }
    return pts;
  };
  const b1 = branch(main[3] ?? [0, 30], 4, rnd() < 0.5 ? -1 : 1);
  const b2 = branch(main[6] ?? [0, 70], 3, rnd() < 0.5 ? -1 : 1);
  const line = (pts: P[], w: number, c: string, op: number): string =>
    el('path', {
      d: polyD(pts, false),
      fill: 'none',
      stroke: c,
      'stroke-width': w,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      opacity: op,
    });
  return g(
    {},
    line(main, 9, '#9DB4FF', 0.22),
    line(b1, 6, '#9DB4FF', 0.18),
    line(b2, 6, '#9DB4FF', 0.18),
    line(main, 3.2, '#DCE6FF', 0.85),
    line(b1, 1.8, '#DCE6FF', 0.7),
    line(b2, 1.8, '#DCE6FF', 0.7),
    line(main, 1.4, '#FFFFFF', 1),
  );
}

function frameArt(name: ReenbuiFrame): string {
  if (name.startsWith('col_')) return columnFrame(Number(name.slice(4)));
  if (name.startsWith('puff_')) return puff(Number(name.slice(5)));
  switch (name) {
    case 'rain_far':
      return rainTile(31, 150, false);
    case 'rain_near':
      return rainTile(77, 40, true);
    case 'mound':
      return mound();
    case 'wet':
      return wet();
    case 'cloud_a':
      return cloud(1301, false);
    case 'cloud_b':
      return cloud(2207, true);
    case 'fork_a':
      return fork(51);
    case 'fork_b':
      return fork(88);
    default:
      return '';
  }
}

/** The whole sheet as SVG (design px viewBox, rendered at `k`×). */
export function reenbuiSheetSvg(k = 1): string {
  seq = 0;
  const parts: string[] = [];
  for (const f of reenbuiFrames()) {
    const id = uid('cell');
    parts.push(
      g(
        {},
        el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
        g(
          { 'clip-path': `url(#${id})` },
          g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, frameArt(f.name)),
        ),
      ),
    );
  }
  return svgDoc(
    REENBUI_SHEET_W * k,
    REENBUI_SHEET_H * k,
    [0, 0, REENBUI_SHEET_W, REENBUI_SHEET_H],
    '',
    parts.join(''),
  );
}

export function renderReenbuiSheet(k = 1): Rgba {
  return renderSvg(reenbuiSheetSvg(k));
}
