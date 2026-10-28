// 1.9.4 (D-057, art bible §4.3b) The weaver colony's sheet (src/game/view/tree/colonySheet.ts):
// the sociable weaver (Philetairus socius: pale brown, a scaly back of dark feathers with pale
// edges, a black chin, a pale blue-grey bill) flapping, gliding, perched, hopping and pecking;
// the African pygmy falcon (Polihierax semitorquatus: white below, grey above, a red eye ring)
// perched, looking round and flying; the rosy-faced lovebird (Agapornis roseicollis: green, a
// rosy face, a blue rump) perched and flying. Frames face right, drawn round their origins, in
// design px at plane scale 1; light from the upper left.
import {
  COLONY_SHEET_H,
  COLONY_SHEET_W,
  colonyFrames,
  type ColonyFrame,
} from '../../src/game/view/tree/colonySheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { nextId, shade } from './scenery';
import { el, ellipseD, g, r2, svgDoc } from './svg';

const INK = '#2A1E16';
const fill = (d: string, f: string, extra: Record<string, string | number> = {}): string =>
  el('path', { d, fill: f, ...extra });
const inked = (d: string, f: string, w = 0.9): string =>
  el('path', { d, fill: f, stroke: INK, 'stroke-width': w, 'stroke-linejoin': 'round' });
const line = (
  d: string,
  c: string,
  w: number,
  extra: Record<string, string | number> = {},
): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: c,
    'stroke-width': w,
    'stroke-linecap': 'round',
    ...extra,
  });

// --- the sociable weaver -----------------------------------------------------------------------

const W_BROWN = '#B39A74';
const W_BACK = '#8C7656';
const W_PALE = '#E6D9BE';
const W_BILL = '#C6CCD4';

/** Scaly back: dark feather centres with pale edges. */
function scales(cx: number, cy: number, rx: number, ry: number): string {
  let dark = '';
  let pale = '';
  for (let i = -2; i <= 2; i++)
    for (let j = -1; j <= 1; j++) {
      const x = cx + i * rx * 0.36 + (j % 2) * rx * 0.18;
      const y = cy + j * ry * 0.5;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.85) continue;
      dark += ellipseD(x, y, rx * 0.14, ry * 0.22);
      pale += `M${r2(x - rx * 0.15)} ${r2(y + ry * 0.2)}q${r2(rx * 0.15)} ${r2(ry * 0.14)} ${r2(rx * 0.3)} 0`;
    }
  return g(
    {},
    fill(dark, '#3E3226', { opacity: 0.75 }),
    line(pale, W_PALE, 0.7, { opacity: 0.85 }),
  );
}

function weaverHead(x: number, y: number, down = false): string {
  const bx = down ? x + 3 : x + 4.6;
  const by = down ? y + 3.6 : y + 0.6;
  return g(
    {},
    inked(ellipseD(x, y, 5.4, 4.8), W_BROWN),
    fill(ellipseD(x - 1, y - 2.2, 3.6, 1.8), '#7E6A4E', { opacity: 0.7 }),
    // The black chin and the face.
    fill(
      `M${r2(x + 1)} ${r2(y + 1)}Q${r2(x + 4.4)} ${r2(y + 2)} ${r2(x + 3.4)} ${r2(y + 4.6)}Q${r2(x + 1)} ${r2(y + 4.4)} ${r2(x + 1)} ${r2(y + 1)}Z`,
      '#1C1612',
    ),
    inked(
      `M${r2(bx - 1)} ${r2(by - 2)}L${r2(bx + 4.2)} ${r2(by + (down ? 2.6 : 0.4))}L${r2(bx - 1)} ${r2(by + 1.8)}Z`,
      W_BILL,
      0.6,
    ),
    fill(ellipseD(x + 1.6, y - 0.8, 1.1, 1.1), '#120C08'),
    fill(ellipseD(x + 1.3, y - 1.1, 0.35, 0.35), '#FFFFFF'),
  );
}

function weaverFlying(kind: 'a' | 'b' | 'glide'): string {
  const wing =
    kind === 'a'
      ? 'M-4 -2Q-8 -16 4 -17Q10 -10 6 -2Z'
      : kind === 'b'
        ? 'M-4 1Q-6 13 6 15Q9 8 6 1Z'
        : 'M-6 -1Q-18 -6 -27 -2Q-14 2 -4 2Z';
  const wing2 = kind === 'glide' ? 'M6 -1Q16 -6 26 -3Q16 2 6 2Z' : '';
  return g(
    {},
    // Tail.
    inked('M-10 -1L-17 -3L-17 3L-10 2Z', W_BACK),
    inked(ellipseD(0, 0, 11, 6), W_BROWN),
    fill(ellipseD(1, 2.6, 8, 3), W_PALE, { opacity: 0.8 }),
    scales(-1, -2, 9, 3.2),
    inked(wing, W_BACK),
    wing2 === '' ? '' : inked(wing2, W_BACK),
    line(
      kind === 'a' ? 'M0 -6Q4 -13 4 -15' : kind === 'b' ? 'M0 4Q3 10 5 13' : 'M-6 0Q-16 -3 -24 -1',
      '#5E4C36',
      0.8,
    ),
    weaverHead(11, -2),
  );
}

function weaverPerched(kind: 'perch' | 'hop' | 'peck'): string {
  const lift = kind === 'hop' ? -4 : 0;
  const legs =
    kind === 'hop'
      ? line('M-1 -6L-2 -3M2 -6L2 -3', '#6E5A44', 1)
      : line('M-1 -5L-2 0M2 -5L3 0', '#6E5A44', 1);
  if (kind === 'peck')
    return g(
      {},
      legs,
      inked('M-8 -10L-15 -15L-14 -11Z', W_BACK),
      inked(ellipseD(-1, -8, 9, 6), W_BROWN),
      scales(-2, -10, 7, 2.6),
      weaverHead(8, -4, true),
    );
  return g(
    { transform: `translate(0 ${lift})` },
    legs,
    inked('M-5 -7L-11 -1L-8 0L-3 -5Z', W_BACK),
    inked(ellipseD(0, -11, 7.2, 8), W_BROWN),
    fill(ellipseD(1.6, -8, 4.4, 4.8), W_PALE, { opacity: 0.85 }),
    scales(-2, -13, 5.6, 4.4),
    weaverHead(2.4, -19),
  );
}

// --- the pygmy falcon -----------------------------------------------------------------------

function falconHead(x: number, y: number, turned: boolean): string {
  const dir = turned ? -1 : 1;
  return g(
    {},
    inked(ellipseD(x, y, 6.2, 5.8), '#F4F2EE'),
    fill(ellipseD(x - dir * 1.4, y - 3, 5, 2.8), '#8C9098'),
    // The red-orange eye ring, the dark eye, the hooked beak.
    fill(ellipseD(x + dir * 2.2, y - 0.4, 2.3, 2.3), '#E0522E'),
    fill(ellipseD(x + dir * 2.2, y - 0.4, 1.3, 1.3), '#140C08'),
    fill(ellipseD(x + dir * 1.9, y - 0.8, 0.4, 0.4), '#FFFFFF'),
    inked(
      `M${r2(x + dir * 4.6)} ${r2(y - 0.6)}Q${r2(x + dir * 8.2)} ${r2(y)} ${r2(x + dir * 6.4)} ${r2(y + 2.6)}L${r2(x + dir * 4.8)} ${r2(y + 1.6)}Z`,
      '#E8B83A',
      0.6,
    ),
  );
}

function falconPerched(turned: boolean): string {
  return g(
    {},
    line('M-1 -5L-2 0M2 -5L3 0', '#E8B83A', 1.4),
    // Long black-and-white barred tail.
    inked('M-4 -10L-6 2L0 2L1 -10Z', '#2E2E32'),
    line('M-5 -6L0 -6M-5.4 -2L0 -2', '#F4F2EE', 0.9),
    inked(ellipseD(0, -17, 8, 11), '#F4F2EE'),
    // Grey back and wings (white spots on the flight feathers).
    inked('M-7 -24Q-10 -14 -5 -6Q0 -10 0 -18Q-2 -24 -7 -24Z', '#7E838C'),
    el('path', {
      d: 'M-6 -16Q-6 -11 -4 -8',
      fill: 'none',
      stroke: '#F4F2EE',
      'stroke-width': 1,
      'stroke-dasharray': '0.4 2',
    }),
    falconHead(1.5, -29, turned),
  );
}

function falconFlying(up: boolean): string {
  const wing = up ? 'M-6 -2Q-6 -18 8 -19Q12 -10 6 -2Z' : 'M-6 1Q-4 15 9 16Q11 8 6 1Z';
  return g(
    {},
    inked('M-12 -2L-26 -3L-26 3L-12 2Z', '#2E2E32'),
    line('M-22 -2.4L-22 2.4M-17 -2.2L-17 2.2', '#F4F2EE', 0.9),
    inked(ellipseD(-1, 0, 13, 6.4), '#F4F2EE'),
    inked(wing, '#7E838C'),
    falconHead(13, -2, false),
  );
}

// --- the rosy-faced lovebird -----------------------------------------------------------------

const L_GREEN = '#6CAE3E';
const L_DARK = '#3E7A2A';

function lovebirdHead(x: number, y: number): string {
  return g(
    {},
    inked(ellipseD(x, y, 6, 5.6), L_GREEN),
    fill(
      `M${r2(x + 0.4)} ${r2(y - 4.4)}Q${r2(x + 6.4)} ${r2(y - 3)} ${r2(x + 5.6)} ${r2(y + 3.4)}Q${r2(x + 1)} ${r2(y + 6)} ${r2(x - 0.6)} ${r2(y + 1)}Z`,
      '#F08A9A',
    ),
    fill(ellipseD(x + 3, y - 2.4, 2, 1.2), '#E4566E', { opacity: 0.8 }),
    inked(
      `M${r2(x + 4.4)} ${r2(y - 1.2)}Q${r2(x + 8.4)} ${r2(y)} ${r2(x + 6.6)} ${r2(y + 3.2)}L${r2(x + 4.4)} ${r2(y + 2)}Z`,
      '#E8DCC0',
      0.6,
    ),
    fill(ellipseD(x + 2, y - 1, 1.1, 1.1), '#140C08'),
    fill(ellipseD(x + 1.7, y - 1.3, 0.35, 0.35), '#FFFFFF'),
  );
}

function lovebirdPerched(): string {
  return g(
    {},
    line('M-1 -5L-2 0M2 -5L3 0', '#8E8A84', 1.2),
    inked('M-4 -8L-9 -1L-5 0L-1 -6Z', '#3E8EC8'),
    inked(ellipseD(0, -13, 8, 9.6), L_GREEN),
    fill(ellipseD(-2.4, -15, 4.4, 5.6), L_DARK, { opacity: 0.6 }),
    fill(ellipseD(1.4, -17, 2.8, 2), shade(L_GREEN, 0.3), { opacity: 0.8 }),
    lovebirdHead(2.6, -23),
  );
}

function lovebirdFlying(up: boolean): string {
  const wing = up ? 'M-5 -2Q-6 -16 6 -17Q11 -9 6 -2Z' : 'M-5 1Q-4 13 7 14Q9 7 6 1Z';
  return g(
    {},
    inked('M-10 -1L-17 -2L-16 3L-10 2Z', '#3E8EC8'),
    inked(ellipseD(0, 0, 11, 6), L_GREEN),
    inked(wing, L_DARK),
    lovebirdHead(11, -2),
  );
}

function drawFrame(name: ColonyFrame): string {
  switch (name) {
    case 'weaver_fly_a':
      return weaverFlying('a');
    case 'weaver_fly_b':
      return weaverFlying('b');
    case 'weaver_glide':
      return weaverFlying('glide');
    case 'weaver_perch':
      return weaverPerched('perch');
    case 'weaver_hop':
      return weaverPerched('hop');
    case 'weaver_peck':
      return weaverPerched('peck');
    case 'falcon_perch':
      return falconPerched(false);
    case 'falcon_look':
      return falconPerched(true);
    case 'falcon_fly_a':
      return falconFlying(true);
    case 'falcon_fly_b':
      return falconFlying(false);
    case 'lovebird_perch':
      return lovebirdPerched();
    case 'lovebird_fly_a':
      return lovebirdFlying(true);
    case 'lovebird_fly_b':
      return lovebirdFlying(false);
  }
}

/** The sheet at `k` texture px per design px (1 Standard, 2 HD). */
export function renderColonySheet(k: number): Rgba {
  const cells = colonyFrames().map((f) => {
    const id = nextId();
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, drawFrame(f.name)),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      COLONY_SHEET_W * k,
      COLONY_SHEET_H * k,
      [0, 0, COLONY_SHEET_W, COLONY_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}
