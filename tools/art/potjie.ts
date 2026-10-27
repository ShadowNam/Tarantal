// D-051 (Karoo polish, product owner 26 Oct: "The braai pot … add a small bit of animation … and
// when it's shot, at least the deksel should fall off"): the HD potjie, drawn for 2× textures.
// A round cast-iron three-legged pot with a soft sheen and a rim highlight, standing on a small
// fire of glowing coals and a few logs inside a ring of stones. The lid is its own texture
// (potjieLid) so the view can rattle it and knock it off; the pot is drawn open (dark stew in the
// mouth) so it reads right once the lid has gone. Steam and the coals' flicker are drawn in code.
// Coordinates: design px, the prop's origin at (0, 0); the pot's rim centre at POT_RIM.
import { mix, nextId, shade, stone, tone, type Pen, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, r2, smoothD } from './svg';
import { contactShadow, fillD } from './realism';

/** Where the lid's origin (the middle of its rim) sits on the pot, from the prop's origin. */
export const POT_RIM = { x: 0, y: -30 } as const;

/** The pot's colours. */
export interface PotLook {
  readonly iron: string;
  readonly ink: string;
  readonly stone: string;
  readonly wood: string;
  readonly ash: string;
  readonly ember: string;
  readonly glow: string;
}

const IRON = '#34302E';

function radial(
  id: string,
  stops: readonly (readonly [number, string, number])[],
  cx: number,
  cy: number,
  r = 0.6,
) {
  return el(
    'radialGradient',
    { id, cx, cy, r },
    ...stops.map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })),
  );
}

function stroke(d: string, ink: string, w: number, extra: Record<string, string | number> = {}) {
  return el('path', {
    d,
    fill: 'none',
    stroke: ink,
    'stroke-width': r2(w),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...extra,
  });
}

function filled(d: string, fill: string, ink: string, w: number): string {
  return el('path', { d, fill, stroke: ink, 'stroke-width': r2(w), 'stroke-linejoin': 'round' });
}

/** A short split log lying across the fire (x0,y0 → x1,y1), bark, end grain and a charred end. */
function log(x0: number, y0: number, x1: number, y1: number, r: number, look: PotLook): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  const body = polyD([
    [x0 + nx, y0 + ny],
    [x1 + nx, y1 + ny],
    [x1 - nx, y1 - ny],
    [x0 - nx, y0 - ny],
  ]);
  const ink = shade(look.wood, -0.55);
  return g(
    {},
    filled(body, look.wood, ink, 1.6),
    // Lit top edge, bark grooves, a charred, glowing inner end and pale end grain outside.
    stroke(
      `M${r2(x0 + nx * 0.6)} ${r2(y0 + ny * 0.6)}L${r2(x1 + nx * 0.6)} ${r2(y1 + ny * 0.6)}`,
      shade(look.wood, 0.25),
      2,
    ),
    stroke(
      `M${r2(x0 - nx * 0.2)} ${r2(y0 - ny * 0.2)}L${r2(x1 - nx * 0.3)} ${r2(y1 - ny * 0.3)}`,
      shade(look.wood, -0.3),
      1.2,
    ),
    filled(ellipseD(x1, y1, r * 0.55, r), '#2A1E1A', ink, 1.2),
    fillD(ellipseD(x1, y1, r * 0.3, r * 0.55), look.ember, 0.85),
    filled(ellipseD(x0, y0, r * 0.55, r), shade(look.wood, 0.35), ink, 1.2),
    stroke(ellipseD(x0, y0, r * 0.28, r * 0.5), shade(look.wood, 0.1), 0.8),
  );
}

/** The fire under the pot: ash bed, coals glowing at their hearts, logs, ring stones. */
function fire(rnd: Rnd, look: PotLook, pen: Pen): string {
  const parts: string[] = [contactShadow(0, 100, 92, 14, 0.32)];
  const glowId = nextId();
  parts.push(
    el(
      'defs',
      {},
      radial(
        glowId,
        [
          [0, look.glow, 0.85],
          [0.45, look.ember, 0.5],
          [1, look.ember, 0],
        ],
        0.5,
        0.5,
        0.5,
      ),
    ),
    fillD(ellipseD(0, 92, 74, 16), shade(look.ash, -0.25)),
    fillD(ellipseD(-6, 90, 60, 11), look.ash),
    el('path', { d: ellipseD(0, 88, 70, 22), fill: `url(#${glowId})` }),
  );
  // Coals: rounded lumps, dark crust with orange-red cracks and a hot core.
  for (let i = 0; i < 16; i++) {
    const x = -52 + i * 7 + (rnd() - 0.5) * 6;
    const y = 86 + (rnd() - 0.5) * 9 + Math.abs(x) * 0.04;
    const r = 4 + rnd() * 3.5;
    parts.push(
      filled(
        ellipseD(x, y, r * 1.2, r * 0.8),
        mix('#3A2420', look.ember, rnd() * 0.25),
        '#24140F',
        0.9,
      ),
      fillD(
        ellipseD(x - r * 0.2, y - r * 0.1, r * 0.65, r * 0.38),
        i % 3 === 0 ? look.glow : look.ember,
        0.9,
      ),
    );
  }
  parts.push(
    log(-70, 98, -8, 80, 6, look),
    log(72, 100, 12, 82, 6.5, look),
    log(-28, 104, 30, 96, 5.5, { ...look, wood: shade(look.wood, -0.12) }),
  );
  // Small flame tongues licking up between the logs, then a few coals spilled in front.
  const tongue = (x: number, h: number, wd: number, col: string, a: number) =>
    fillD(
      smoothD(
        [
          [x - wd, 92],
          [x - wd * 0.6, 92 - h * 0.55],
          [x + wd * 0.1, 92 - h],
          [x + wd * 0.3, 92 - h * 0.5],
          [x + wd, 92],
        ],
        true,
        0.7,
      ),
      col,
      a,
    );
  parts.push(
    tongue(-24, 30, 9, look.ember, 0.85),
    tongue(-24, 18, 5, look.glow, 0.9),
    tongue(20, 34, 10, look.ember, 0.85),
    tongue(20, 20, 5.5, look.glow, 0.9),
    tongue(-2, 22, 7, look.glow, 0.8),
  );
  for (const [x, y, r] of [
    [-40, 100, 5],
    [-12, 102, 4.5],
    [24, 103, 5],
    [44, 99, 4],
  ] as const)
    parts.push(
      filled(ellipseD(x, y, r * 1.25, r * 0.8), '#3A2420', '#24140F', 0.9),
      fillD(ellipseD(x - r * 0.15, y - r * 0.15, r * 0.75, r * 0.42), look.ember, 0.95),
      fillD(ellipseD(x - r * 0.25, y - r * 0.2, r * 0.35, r * 0.2), look.glow, 0.95),
    );
  for (const [x, y, r] of [
    [-84, 98, 12],
    [-58, 108, 11],
    [52, 108, 12],
    [86, 97, 12],
    [0, 110, 9],
  ] as const)
    parts.push(stone(rnd, x, y, r, tone(look.stone, 0.25, 0.3), pen));
  return g({}, ...parts);
}

/** The HD pot on its fire, lidless (the lid is potjieLid, laid on at POT_RIM). */
export function potjieHd(rnd: Rnd, look: PotLook, pen: Pen): string {
  const ink = mix(pen.ink, IRON, 0.35);
  const w = Math.max(1.6, pen.w * 0.45);
  const body = nextId();
  const sheen = nextId();
  const clip = nextId();
  const belly = ellipseD(0, 10, 64, 50);
  const parts: string[] = [
    el(
      'defs',
      {},
      radial(
        body,
        [
          [0, shade(look.iron, 0.42), 1],
          [0.35, shade(look.iron, 0.12), 1],
          [0.75, look.iron, 1],
          [1, shade(look.iron, -0.45), 1],
        ],
        0.36,
        0.3,
        0.75,
      ),
      radial(
        sheen,
        [
          [0, '#F4EEE6', 0.55],
          [1, '#F4EEE6', 0],
        ],
        0.5,
        0.5,
        0.5,
      ),
    ),
    fire(rnd, look, { ink: shade(look.stone, -0.5), w: Math.max(1.2, pen.w * 0.35) }),
  ];
  // Three cast legs (the back one shorter, half hidden).
  for (const [x, top, foot, lean] of [
    [0, 44, 70, 0],
    [-40, 40, 80, -6],
    [40, 40, 80, 6],
  ] as const)
    parts.push(
      filled(
        polyD([
          [x - 7, top],
          [x - 5 + lean, foot],
          [x + 4 + lean, foot],
          [x + 7, top],
        ]),
        shade(look.iron, -0.12),
        ink,
        w,
      ),
      stroke(`M${x - 3} ${top + 4}L${x - 2 + lean} ${foot - 3}`, shade(look.iron, 0.3), 1.4),
    );
  // The glow of the coals on the pot's underside.
  parts.push(
    el('clipPath', { id: clip }, el('path', { d: belly })),
    el('path', { d: belly, fill: `url(#${body})` }),
    g(
      { 'clip-path': `url(#${clip})` },
      fillD(ellipseD(0, 60, 64, 22), look.ember, 0.35),
      fillD(ellipseD(0, 64, 50, 14), look.glow, 0.25),
      // Soft sheen up left, a reflected-light rim on the right.
      el('path', { d: ellipseD(-26, -6, 22, 26), fill: `url(#${sheen})` }),
      stroke('M44 -14c14 14 18 34 10 52', shade(look.iron, 0.3), 3, { opacity: 0.6 }),
      // A cast seam and a few soot specks.
      stroke('M-64 12c30 8 98 8 128 0', shade(look.iron, -0.3), 1.2, { opacity: 0.7 }),
    ),
    stroke(belly, ink, w),
  );
  // Side ears with the wire bail resting down the right flank.
  parts.push(
    filled('M-62 -18c-10 -2 -14 8 -6 12l6 2z', shade(look.iron, -0.05), ink, w),
    filled('M62 -18c10 -2 14 8 6 12l-6 2z', shade(look.iron, -0.05), ink, w),
    stroke('M-66 -10c-8 20 -2 42 20 50', '#5A5450', 2.2),
    stroke('M66 -10c8 20 2 42 -20 50', '#5A5450', 2.2),
  );
  // The neck and the open mouth: thick rim, dark inside, stew catching the light.
  const neck = smoothD(
    [
      [-54, -30],
      [-58, -18],
      [-48, -8],
      [48, -8],
      [58, -18],
      [54, -30],
    ],
    true,
    0.6,
  );
  parts.push(
    filled(neck, shade(look.iron, -0.08), ink, w),
    filled(ellipseD(POT_RIM.x, POT_RIM.y, 57, 12), shade(look.iron, -0.05), ink, w),
    fillD(ellipseD(POT_RIM.x, POT_RIM.y + 1, 50, 8.5), '#140E0C'),
    fillD(ellipseD(POT_RIM.x + 2, POT_RIM.y + 3.5, 42, 5), '#6A3A22', 0.9),
    fillD(ellipseD(POT_RIM.x - 12, POT_RIM.y + 3, 10, 1.6), '#C58A52', 0.7),
    // Rim highlight along the front lip.
    stroke(`M-50 ${POT_RIM.y + 6}c24 8 76 8 100 0`, shade(look.iron, 0.6), 2, { opacity: 0.85 }),
    stroke(`M-52 ${POT_RIM.y - 3}c8 -6 22 -9 34 -10`, shade(look.iron, 0.45), 1.4, {
      opacity: 0.7,
    }),
  );
  return g({}, ...parts);
}

/** The lid alone; its origin (0, 0) is the middle of its rim (POTJIE_LID_SIZE in the factory). */
export function potjieLid(look: PotLook, pen: Pen): string {
  const ink = mix(pen.ink, IRON, 0.35);
  const w = Math.max(1.6, pen.w * 0.45);
  const fillId = nextId();
  const dome = smoothD(
    [
      [-58, 0],
      [-50, -14],
      [-26, -23],
      [0, -25],
      [26, -23],
      [50, -14],
      [58, 0],
    ],
    false,
    0.6,
  );
  const shape = `${dome}c-10 7 -106 7 -116 0z`;
  return g(
    {},
    el(
      'defs',
      {},
      radial(
        fillId,
        [
          [0, shade(look.iron, 0.5), 1],
          [0.4, shade(look.iron, 0.12), 1],
          [1, shade(look.iron, -0.35), 1],
        ],
        0.34,
        0.2,
        0.8,
      ),
    ),
    // Lip (overhangs the pot's rim), the dome, its sheen and the cast knob.
    filled(ellipseD(0, 1, 60, 8), shade(look.iron, -0.2), ink, w),
    filled(shape, `url(#${fillId})`, ink, w),
    fillD(ellipseD(-22, -15, 15, 4), '#F4EEE6', 0.35),
    stroke('M-54 2c26 7 82 7 108 0', shade(look.iron, 0.55), 1.8, { opacity: 0.8 }),
    filled('M-6 -24l-4 -8c0 -4 20 -4 20 0l-4 8z', shade(look.iron, -0.05), ink, w),
    filled(ellipseD(0, -33, 12, 5), shade(look.iron, 0.1), ink, w),
    fillD(ellipseD(-4, -34.5, 5, 1.5), '#F4EEE6', 0.45),
  );
}

/** The pot's look from a biome palette. */
export function potLook(c: (key: string) => string, tint: (hex: string) => string): PotLook {
  return {
    iron: tint(IRON),
    ink: tint('#1E1A18'),
    stone: c('stone'),
    wood: c('trunk'),
    ash: tint('#B8AEA2'),
    ember: tint('#E2552C'),
    glow: tint('#FFC45A'),
  };
}
