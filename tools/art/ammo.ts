// v1.1 interim HUD ammo (D-032): each gun's rounds drawn realistically — soft gradient shading,
// specular highlights, contact shadows and material texture, no comic ink outline — so the belt
// reads as real shells, pellets, stones, paper cartridges and kernels (product owner: "they
// shouldn't look cartoony"). Keys `ui/ammo/<type>` and `ui/ammo/<type>_spent`, at the size
// feel.json `guns.ammo` gives (1 texture px per design px, origin at the centre), drawn at 4× and
// averaged down. A new ammo type (the .22, rifle rounds in v1.3) adds one entry to AMMO_ART.
import { nextId } from './scenery';
import type { SpriteCtx, SpriteSpec } from './sprites';
import { el, ellipseD, g, polyD, smoothD } from './svg';

type Stop = readonly [number, string, number?];

/** A gradient definition plus its `url(#id)`. */
function grad(
  kind: 'h' | 'v' | 'r',
  stops: readonly Stop[],
  extra = {},
): { def: string; url: string } {
  const id = nextId();
  const st = stops.map(([o, c, a]) =>
    el('stop', { offset: o, 'stop-color': c, ...(a === undefined ? {} : { 'stop-opacity': a }) }),
  );
  const def =
    kind === 'r'
      ? el('radialGradient', { id, cx: 0.38, cy: 0.32, r: 0.75, ...extra }, ...st)
      : el(
          'linearGradient',
          { id, x1: 0, y1: 0, x2: kind === 'h' ? 1 : 0, y2: kind === 'v' ? 1 : 0, ...extra },
          ...st,
        );
  return { def, url: `url(#${id})` };
}

const path = (d: string, fill: string, extra = {}): string => el('path', { d, fill, ...extra });

/** Cylinder shading across x: dark rim, lit band left of centre, soft core, dark rim. */
function cylinder(dark: string, mid: string, light: string, spec: string): Stop[] {
  return [
    [0, dark],
    [0.18, mid],
    [0.32, light],
    [0.4, spec],
    [0.5, light],
    [0.75, mid],
    [1, dark],
  ];
}

/** Soft contact shadow under a round, so it sits in the belt loop. */
function shadow(cx: number, cy: number, rx: number, ry: number): string {
  const s = grad(
    'r',
    [
      [0, '#000000', 0.45],
      [1, '#000000', 0],
    ],
    { cx: 0.5, cy: 0.5, r: 0.5 },
  );
  return el('defs', {}, s.def) + path(ellipseD(cx, cy, rx, ry), s.url);
}

// ------------------------------------------------------------------- 12-gauge shell (30 × 84)

function shell12(spent: boolean): () => string {
  return () => {
    const hullTop = spent ? -33 : -38;
    const hull = `M-10.5 ${hullTop + 3}Q-10.5 ${hullTop} -8 ${hullTop}L8 ${hullTop}Q10.5 ${hullTop} 10.5 ${hullTop + 3}L10.5 22L-10.5 22Z`;
    const red = spent
      ? cylinder('#3E1512', '#6A2620', '#874139', '#A06A62')
      : cylinder('#4A0C0A', '#8E1B16', '#C8302A', '#F2A79C');
    const hullG = grad('h', red);
    const brass = spent
      ? cylinder('#4A3716', '#7A5E2A', '#9C7D42', '#C6AE7C')
      : cylinder('#5A4113', '#9C7428', '#D8B25A', '#FFF1C4');
    const brassG = grad('h', brass);
    const out: string[] = [el('defs', {}, hullG.def, brassG.def)];
    out.push(shadow(1.5, 40, 13, 2.6));
    out.push(path(hull, hullG.url));
    // Fine extrusion lines on the plastic hull.
    for (let x = -8; x <= 8; x += 2.2)
      out.push(
        el('line', {
          x1: x,
          y1: hullTop + 4,
          x2: x,
          y2: 21,
          stroke: x < 0 ? '#FFFFFF' : '#000000',
          'stroke-opacity': 0.05,
          'stroke-width': 0.5,
        }),
      );
    if (spent) {
      // The opened star crimp: six petals splayed out, the dark empty mouth, a soot ring.
      const mouth = grad('v', [
        [0, '#120806'],
        [1, '#3A1A14'],
      ]);
      out.push(el('defs', {}, mouth.def));
      for (let k = 0; k < 6; k++) {
        const x0 = -10.5 + k * 3.5;
        out.push(
          path(
            polyD([
              [x0, hullTop + 1],
              [x0 + 3.5, hullTop + 1],
              [x0 + 1.75 + (k - 2.5) * 1.1, hullTop - 6 - (k % 2) * 1.5],
            ]),
            k % 2 === 0 ? '#7A2E27' : '#5B211C',
          ),
        );
      }
      out.push(path(ellipseD(0, hullTop + 1, 9.5, 2.6), mouth.url));
      out.push(path(ellipseD(0, hullTop + 4, 10, 2), '#1A1210', { opacity: 0.35 }));
    } else {
      // Folded star crimp: a domed top with six fold lines meeting at the centre.
      const top = grad('v', [
        [0, '#E5655B'],
        [1, '#8E1B16'],
      ]);
      out.push(el('defs', {}, top.def));
      out.push(path(`M-10.5 ${hullTop + 3}Q0 ${hullTop - 4} 10.5 ${hullTop + 3}Z`, top.url));
      for (const x of [-7, -3.5, 0, 3.5, 7])
        out.push(
          el('line', {
            x1: x,
            y1: hullTop + 2.5,
            x2: x * 0.25,
            y2: hullTop - 1,
            stroke: '#3A0806',
            'stroke-opacity': 0.55,
            'stroke-width': 0.8,
          }),
        );
    }
    // Brass head: taller section, then the extractor rim a little wider.
    out.push(path('M-11 18L11 18L11 35L-11 35Z', brassG.url));
    out.push(
      path(
        'M-12.2 34.5L12.2 34.5L12.2 39.5Q12.2 40.5 11.2 40.5L-11.2 40.5Q-12.2 40.5 -12.2 39.5Z',
        brassG.url,
      ),
    );
    // Brass edge where the hull enters it, and the rim groove.
    out.push(path('M-11 18L11 18L11 19.4L-11 19.4Z', '#FFF6D8', { opacity: spent ? 0.18 : 0.45 }));
    out.push(path('M-11 33.6L11 33.6L11 34.6L-11 34.6Z', '#2E220C', { opacity: 0.55 }));
    if (spent) {
      // Tarnish and powder soot on the brass.
      out.push(path('M-11 18L11 18L11 26L-11 26Z', '#1A1208', { opacity: 0.25 }));
    }
    // Narrow vertical specular streak down the whole round (it's round and glossy).
    out.push(
      path(`M-5.6 ${hullTop + 4}L-4.2 ${hullTop + 4}L-4.2 39L-5.6 39Z`, '#FFFFFF', {
        opacity: spent ? 0.08 : 0.22,
      }),
    );
    return g({}, ...out);
  };
}

// ------------------------------------------------------------- diabolo pellet (26 × 34)

function diabolo(): string {
  const lead = grad('h', cylinder('#2B2E31', '#5A5F64', '#9AA0A6', '#E4E8EC'));
  const skirtIn = grad('v', [
    [0, '#16181A'],
    [1, '#3B3F43'],
  ]);
  // Domed head, narrow waist, flared hollow skirt (a classic waisted air-rifle pellet).
  const body = smoothD(
    [
      [0, -14],
      [5.2, -12.4],
      [7.4, -8.4],
      [7.2, -4.2],
      [4.2, -1.4],
      [3.6, 1],
      [5.6, 6],
      [8.4, 11.5],
      [8.8, 13.2],
      [-8.8, 13.2],
      [-8.4, 11.5],
      [-5.6, 6],
      [-3.6, 1],
      [-4.2, -1.4],
      [-7.2, -4.2],
      [-7.4, -8.4],
      [-5.2, -12.4],
    ],
    true,
    0.7,
  );
  // Drawn for a 26 × 34 box, shown at 34 × 44 (feel.json): scaled up to stay readable.
  return g(
    { transform: 'scale(1.28)' },
    el('defs', {}, lead.def, skirtIn.def),
    shadow(1, 14, 11, 2),
    path(body, lead.url),
    // The head's band and the skirt's rings (swaged lines).
    path('M-7.2 -4.6L7.2 -4.6L7 -3.4L-7 -3.4Z', '#1E2124', { opacity: 0.35 }),
    path(ellipseD(0, 12.9, 8.6, 1.9), skirtIn.url),
    path(ellipseD(-2.4, -9, 2, 3), '#FFFFFF', { opacity: 0.35 }),
    path(ellipseD(-3.6, 8, 1, 3), '#FFFFFF', { opacity: 0.2 }),
  );
}

// ---------------------------------------------------------------- river stone (38 × 30)

function stone(p: SpriteCtx): string {
  const pts: [number, number][] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const r = 1 + (p.rnd() - 0.5) * 0.12;
    pts.push([Math.cos(a) * 15.5 * r, Math.sin(a) * 11 * r - 1]);
  }
  const body = grad('r', [
    [0, '#D9CFC0'],
    [0.35, '#A99A86'],
    [0.75, '#7A6C5A'],
    [1, '#4A4034'],
  ]);
  const out: string[] = [
    el('defs', {}, body.def),
    shadow(1.5, 11, 16, 3.2),
    path(smoothD(pts), body.url),
  ];
  // Grain: fine light and dark specks, a faint mineral vein, a wet-ish sheen on top.
  for (let k = 0; k < 40; k++) {
    const x = (p.rnd() - 0.5) * 24;
    const y = (p.rnd() - 0.5) * 16 - 1;
    if ((x / 14) ** 2 + ((y + 1) / 10) ** 2 > 0.85) continue;
    out.push(
      path(
        ellipseD(x, y, 0.5 + p.rnd() * 0.6, 0.4 + p.rnd() * 0.5),
        p.rnd() < 0.5 ? '#3A3128' : '#EFE7DA',
        {
          opacity: 0.35,
        },
      ),
    );
  }
  out.push(
    el('path', {
      d: 'M-11 3Q-3 -2 4 1T13 -3',
      fill: 'none',
      stroke: '#E8E0D2',
      'stroke-opacity': 0.35,
      'stroke-width': 0.8,
    }),
  );
  out.push(path(ellipseD(-5, -6, 6, 2.6), '#FFFFFF', { opacity: 0.22 }));
  return g({}, ...out);
}

// ------------------------------------------------------ paper cartridge (28 × 80)

function paper(spent: boolean): (p: SpriteCtx) => string {
  return (p) => {
    const kraft = grad('h', cylinder('#8C7A55', '#C9B88E', '#E9DDBC', '#FFF8E6'));
    const ball = grad('r', [
      [0, '#C7CCD1'],
      [0.4, '#7C8187'],
      [1, '#33373B'],
    ]);
    const out: string[] = [el('defs', {}, kraft.def, ball.def)];
    out.push(shadow(1.5, 37, 12, 2.4));
    if (spent) {
      // Bitten open and emptied: a short, crumpled tube with a ragged torn top and powder stains.
      const pts: [number, number][] = [[-9, 34]];
      for (let k = 0; k <= 9; k++)
        pts.push([-9 + k * 2, -4 + (k % 2 === 0 ? -3 : 2) - p.rnd() * 4]);
      pts.push([9, 34]);
      out.push(path(polyD(pts), kraft.url));
      out.push(path('M-9 34L9 34L9 26L-9 26Z', '#2A231A', { opacity: 0.28 }));
      for (let k = 0; k < 4; k++)
        out.push(
          el('path', {
            d: `M${-7 + k * 4.5} ${4 + p.rnd() * 6}l${1.5 - p.rnd() * 3} ${10 + p.rnd() * 8}`,
            stroke: '#7D6C49',
            'stroke-opacity': 0.6,
            'stroke-width': 0.7,
            fill: 'none',
          }),
        );
      out.push(path(ellipseD(-2, 14, 4, 6), '#2B241C', { opacity: 0.18 }));
      return g({}, ...out);
    }
    // Tube from the twisted tail (bottom) up to the ball, which shows as a bulge at the top.
    out.push(path('M-8 -18L8 -18L8 30Q8 33 5 34L-5 34Q-8 33 -8 30Z', kraft.url));
    out.push(path(ellipseD(0, -24, 9, 10), ball.url));
    // Paper wrapped over the ball (translucent), tied below it with twine.
    out.push(path(ellipseD(0, -24, 9.4, 10.4), '#E9DDBC', { opacity: 0.55 }));
    out.push(path('M-8.6 -15L8.6 -15L8.6 -12.6L-8.6 -12.6Z', '#6B5131'));
    out.push(path('M-8.6 -14.6L8.6 -14.6L8.6 -13.8L-8.6 -13.8Z', '#A8865A', { opacity: 0.7 }));
    // Paper seam and folds, and the twisted tail end.
    out.push(
      el('path', {
        d: 'M3.5 -12L3.2 31M-6 2L6 4M-6 18L6 19',
        stroke: '#8C7A55',
        'stroke-opacity': 0.45,
        'stroke-width': 0.7,
        fill: 'none',
      }),
    );
    out.push(path('M-4.5 33L4.5 33L2.6 39L-2.6 39Z', '#B9A57A'));
    out.push(
      el('path', {
        d: 'M-3.8 34.5L3.4 36.4M-2.8 37L2.6 38.6',
        stroke: '#6D5D3E',
        'stroke-opacity': 0.6,
        'stroke-width': 0.6,
      }),
    );
    out.push(path(ellipseD(-3, -27, 2.4, 3.2), '#FFFFFF', { opacity: 0.35 }));
    return g({}, ...out);
  };
}

// -------------------------------------------------- mielie-kernel hopper (150 × 84)

/** One dent-corn kernel: rounded wedge, orange-gold with a pale crown and a germ. */
function kernel(x: number, y: number, rot: number, s: number, p: SpriteCtx): string {
  const body = grad('r', [
    [0, '#FFE39A'],
    [0.45, '#F0B232'],
    [1, '#B66E10'],
  ]);
  const d = smoothD(
    [
      [-4.2, -4.6],
      [0, -5.4],
      [4.2, -4.6],
      [3.4, 1.8],
      [1, 5],
      [-1, 5],
      [-3.4, 1.8],
    ],
    true,
    0.8,
  );
  return g(
    {
      transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(1)}) scale(${s.toFixed(2)})`,
    },
    el('defs', {}, body.def),
    path(d, body.url),
    path(ellipseD(0, -3.6, 3, 1.2), '#FFF3C8', { opacity: 0.65 }),
    path(ellipseD(0.3, 1.6, 1.2, 2), '#E8C45E', { opacity: p.rnd() < 0.5 ? 0.6 : 0.3 }),
  );
}

function hopper(full: boolean): (p: SpriteCtx) => string {
  return (p) => {
    const steel = grad('v', [
      [0, '#C9CED2'],
      [0.25, '#9AA1A7'],
      [0.6, '#6E757B'],
      [1, '#4A5056'],
    ]);
    const inside = grad('v', [
      [0, '#121416'],
      [1, '#2E2A22'],
    ]);
    const glass = grad('h', [
      [0, '#FFFFFF', 0],
      [0.3, '#FFFFFF', 0.16],
      [0.36, '#FFFFFF', 0.04],
      [0.7, '#FFFFFF', 0.1],
      [1, '#FFFFFF', 0],
    ]);
    // Galvanised bin with a long sight glass; feet and the outlet chute at the bottom.
    const out: string[] = [el('defs', {}, steel.def, inside.def, glass.def)];
    out.push(shadow(2, 40, 72, 2.5));
    out.push(path('M-72 -40L72 -40L72 34Q72 38 68 38L-68 38Q-72 38 -72 34Z', steel.url));
    // Spangle (galvanised crystals): faint patches.
    for (let k = 0; k < 26; k++)
      out.push(
        path(
          ellipseD(-68 + p.rnd() * 136, -38 + p.rnd() * 74, 3 + p.rnd() * 5, 2 + p.rnd() * 3),
          p.rnd() < 0.5 ? '#FFFFFF' : '#2A2F33',
          { opacity: 0.06 },
        ),
      );
    // Window: y from -30 to 30 (feel.json fillBand 0.12–0.84 of the 84 px height).
    const win = 'M-64 -30L64 -30L64 30L-64 30Z';
    out.push(path(win, inside.url));
    if (full) {
      const id = nextId();
      const kernels: string[] = [];
      for (let row = 0; row < 9; row++)
        for (let k = 0; k < 17; k++) {
          const x = -62 + k * 7.8 + (row % 2) * 3.9 + (p.rnd() - 0.5) * 2;
          const y = 27 - row * 6.6 + (p.rnd() - 0.5) * 2;
          kernels.push(kernel(x, y, (p.rnd() - 0.5) * 120, 0.85 + p.rnd() * 0.25, p));
        }
      out.push(el('clipPath', { id }, path(win, '#000')));
      out.push(g({ 'clip-path': `url(#${id})` }, ...kernels));
      // Shade toward the glass edges (depth).
      out.push(path('M-64 -30L64 -30L64 -22L-64 -22Z', '#000000', { opacity: 0.25 }));
    } else {
      for (let k = 0; k < 7; k++)
        out.push(kernel(-50 + p.rnd() * 100, 26 + p.rnd() * 2, (p.rnd() - 0.5) * 160, 0.9, p));
    }
    out.push(path(win, glass.url));
    // Window frame and the bin's rolled top edge, rivets.
    out.push(
      el('path', { d: win, fill: 'none', stroke: '#3A3F44', 'stroke-width': 2.2 }),
      path('M-72 -40L72 -40L72 -36L-72 -36Z', '#E6EAED', { opacity: 0.55 }),
    );
    for (const x of [-68, 68])
      for (const y of [-34, 33]) {
        out.push(
          path(ellipseD(x, y, 1.8, 1.8), '#4A5056'),
          path(ellipseD(x - 0.5, y - 0.5, 0.8, 0.8), '#F2F4F5', { opacity: 0.7 }),
        );
      }
    return g({}, ...out);
  };
}

/** Every interim ammo sprite (sizes come from feel.json guns.ammo via the placeholder manifest). */
export const AMMO_SPRITES: readonly SpriteSpec[] = [
  { key: 'ui/ammo/shell12', wobble: 0, draw: shell12(false) },
  { key: 'ui/ammo/shell12_spent', wobble: 0, draw: shell12(true) },
  { key: 'ui/ammo/diabolo', wobble: 0, draw: diabolo },
  { key: 'ui/ammo/stone', wobble: 0, draw: stone },
  { key: 'ui/ammo/paper', wobble: 0, draw: paper(false) },
  { key: 'ui/ammo/paper_spent', wobble: 0, draw: paper(true) },
  { key: 'ui/ammo/kernel', wobble: 0, draw: hopper(true) },
  { key: 'ui/ammo/kernel_spent', wobble: 0, draw: hopper(false) },
];
