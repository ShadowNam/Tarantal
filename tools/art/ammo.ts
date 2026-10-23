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

// ---------------------------------------------------------- .22 rimfire round (18 × 54, v1.3)

function rimfire22(spent: boolean): () => string {
  return () => {
    // A short straight brass case with a rim, a heeled grey lead bullet with a lube groove.
    // Spent: the empty case, its mouth open and sooty, the firing pin's crimp on the rim.
    const brass = spent
      ? cylinder('#4A3716', '#7A5E2A', '#A48546', '#CDB683')
      : cylinder('#5A4113', '#A07828', '#DDB75E', '#FFF3C8');
    const brassG = grad('h', brass);
    const lead = grad('h', cylinder('#4C5156', '#7E858C', '#B9C0C6', '#F4F7F9'));
    const out: string[] = [el('defs', {}, brassG.def, lead.def)];
    out.push(shadow(1, 25, 9, 2));
    // Case and rim.
    out.push(path('M-5.2 -4L5.2 -4L5.2 19.5L-5.2 19.5Z', brassG.url));
    out.push(
      path('M-6.6 19L6.6 19L6.6 22.6Q6.6 23.4 5.8 23.4L-5.8 23.4Q-6.6 23.4 -6.6 22.6Z', brassG.url),
    );
    out.push(path('M-5.2 18.2L5.2 18.2L5.2 19.1L-5.2 19.1Z', '#2E220C', { opacity: 0.5 }));
    if (spent) {
      const mouth = grad('v', [
        [0, '#0E0A06'],
        [1, '#3A2A14'],
      ]);
      out.push(el('defs', {}, mouth.def));
      out.push(path(ellipseD(0, -4, 5, 1.6), mouth.url));
      out.push(path('M-5.2 -4L5.2 -4L5.2 1L-5.2 1Z', '#1A1208', { opacity: 0.3 }));
      // Firing-pin crimp on the rim, a dark notch on its lit side.
      out.push(path('M-4.6 19.4L-2.2 19.4L-2.6 22.8L-4.2 22.8Z', '#3A2A10', { opacity: 0.75 }));
    } else {
      // Bullet: a rounded ogive above the case mouth, a lube groove ring, the heel.
      const bullet = smoothD(
        [
          [-4.7, -4],
          [-4.7, -14],
          [-3.6, -20.5],
          [0, -24],
          [3.6, -20.5],
          [4.7, -14],
          [4.7, -4],
        ],
        false,
        0.7,
      );
      out.push(path(`${bullet}Z`, lead.url));
      out.push(path('M-4.7 -8.6L4.7 -8.6L4.7 -7.4L-4.7 -7.4Z', '#3E4246', { opacity: 0.6 }));
      out.push(path('M-4.7 -4.6L4.7 -4.6L4.7 -4L-4.7 -4Z', '#2A2D30', { opacity: 0.45 }));
    }
    // Brass edge at the mouth and a long specular streak (round and smooth).
    out.push(
      path('M-5.2 -4L5.2 -4L5.2 -3.2L-5.2 -3.2Z', '#FFF6D8', { opacity: spent ? 0.2 : 0.5 }),
    );
    out.push(
      path(`M-2.9 ${spent ? -3 : -21}L-2 ${spent ? -3 : -21}L-2 22.5L-2.9 22.5Z`, '#FFFFFF', {
        opacity: spent ? 0.1 : 0.28,
      }),
    );
    return g({}, ...out);
  };
}

// ------------------------------------------------------------- diabolo pellet (26 × 34)

function diabolo(): string {
  // Bright, freshly-cast lead (not dark grey): it has to read on the dark belt slate.
  const lead = grad('h', cylinder('#5C6268', '#8E959C', '#C9CFD5', '#FFFFFF'));
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
  // Drawn for a 26 × 34 box, shown at 50 × 64 (feel.json, v1.1 review: "too small and dark"):
  // scaled up, with a light rim so the count reads at a glance on a phone.
  return g(
    { transform: 'scale(1.85)' },
    el('defs', {}, lead.def, skirtIn.def),
    shadow(1, 14, 11, 2),
    el('path', {
      d: body,
      fill: 'none',
      stroke: '#F4F6F8',
      'stroke-opacity': 0.75,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    }),
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
    // Brown kraft paper (v1.1 review: the first pass "read like white candles"), crinkled, with
    // the lead ball showing at the top and the powder end twisted shut at the bottom.
    const kraft = grad('h', cylinder('#4E3319', '#7E5730', '#A87B4A', '#D2A874'));
    const ball = grad('r', [
      [0, '#E9EDF0'],
      [0.35, '#9AA1A8'],
      [0.8, '#4E5459'],
      [1, '#2A2E31'],
    ]);
    const out: string[] = [el('defs', {}, kraft.def, ball.def)];
    out.push(shadow(1.5, 37, 12, 2.4));
    /** Crinkles: short darker and lighter strokes across the paper. */
    const crinkle = (y0: number, y1: number, n: number): void => {
      for (let k = 0; k < n; k++) {
        const y = y0 + p.rnd() * (y1 - y0);
        const x = -8 + p.rnd() * 10;
        out.push(
          el('path', {
            d: `M${x.toFixed(1)} ${y.toFixed(1)}l${(3 + p.rnd() * 5).toFixed(1)} ${(p.rnd() * 3 - 1.5).toFixed(1)}`,
            stroke: k % 2 === 0 ? '#3A2512' : '#E2BC88',
            'stroke-opacity': k % 2 === 0 ? 0.45 : 0.35,
            'stroke-width': 0.7,
            fill: 'none',
          }),
        );
      }
    };
    if (spent) {
      // Bitten open and emptied: the lower half of the tube with a ragged, torn top edge, the
      // dark powder-stained inside showing, and a torn flap hanging off one side.
      const pts: [number, number][] = [[-8.5, 30]];
      for (let k = 0; k <= 8; k++)
        pts.push([-8.5 + k * 2.1, 2 + (k % 2 === 0 ? -4 : 1.5) - p.rnd() * 5]);
      pts.push([8.5, 30]);
      out.push(path(smoothD(pts, true, 0.25), kraft.url));
      out.push(path(ellipseD(0, 1, 7.5, 2.4), '#20150B', { opacity: 0.75 }));
      out.push(path('M5 2L11 9L9 16L6 8Z', '#8A6236'));
      out.push(path('M-8.5 22L8.5 22L8.5 30L-8.5 30Z', '#2A1A0C', { opacity: 0.25 }));
      crinkle(6, 28, 10);
      out.push(path('M-4 30L4 30L2 37L-2 37Z', '#6E4B27'));
      return g({}, ...out);
    }
    // The tube: slightly uneven, as if rolled by hand.
    out.push(
      path(
        smoothD(
          [
            [-8.2, -16],
            [8.4, -16],
            [8.8, 6],
            [8.2, 28],
            [4, 31],
            [-4, 31],
            [-8.6, 28],
            [-8.9, 6],
          ],
          true,
          0.4,
        ),
        kraft.url,
      ),
    );
    // Lead ball, its top half out of the paper.
    out.push(path(ellipseD(0, -22, 8.6, 8.6), ball.url));
    out.push(path(ellipseD(-2.6, -26, 2.4, 2), '#FFFFFF', { opacity: 0.55 }));
    // The paper's folded lip round the ball and the twine tie under it.
    out.push(path('M-9 -20Q-6 -15 0 -15.5Q6 -15 9 -20L9 -15L-9 -15Z', '#8E6437'));
    out.push(path('M-9 -14.5L9 -14.5L9 -12L-9 -12Z', '#3F2A15'));
    out.push(path('M-9 -14L9 -14L9 -13.2L-9 -13.2Z', '#B79568', { opacity: 0.8 }));
    crinkle(-10, 26, 14);
    // Twisted tail: a tapering twist with spiral creases.
    out.push(path('M-5 30L5 30L2.2 40L-2.2 40Z', '#6E4B27'));
    out.push(
      el('path', {
        d: 'M-4.6 31.5L3.8 33.6M-3.6 34.4L3 36.4M-2.6 37.2L2.2 39',
        stroke: '#2E1D0D',
        'stroke-opacity': 0.7,
        'stroke-width': 0.7,
      }),
    );
    out.push(
      path('M-5.2 -10L-3.6 -10L-3.4 27L-5 27Z', '#F0D2A2', {
        opacity: 0.35,
      }),
    );
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
  { key: 'ui/ammo/rimfire22', wobble: 0, draw: rimfire22(false) },
  { key: 'ui/ammo/rimfire22_spent', wobble: 0, draw: rimfire22(true) },
];
