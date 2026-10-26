// v1.7c review (D-047, product owner via the 26 Oct screenshots): the fruit sprites at the
// camelthorn bar (v1.4/v1.6): real shapes, two or three tones lit from the upper left, a
// highlight and a shadow side, skin texture, and a stalk where they hang. Used only for the
// sprites (fruitSink `hi`); the baked far-plane fruit keep their simple look. Each drawing
// seeds its own random stream from where it is, so the layer's stream is never touched.
import { clamp } from './camelthorn';
import type { FruitDrawing } from './fruitSink';
import { seedAt } from './fruitSink';
import { mix, nextId, shade, type Pt } from './scenery';
import { el, ellipseD, g, polyD, r2 } from './svg';

type Stop = readonly [number, string, number?];

function stops(list: readonly Stop[]): string {
  return list
    .map(([o, c, a]) =>
      el('stop', { offset: o, 'stop-color': c, ...(a === undefined ? {} : { 'stop-opacity': a }) }),
    )
    .join('');
}

function linear(x1: number, y1: number, x2: number, y2: number, list: readonly Stop[]) {
  const id = nextId();
  return {
    url: `url(#${id})`,
    def: el(
      'linearGradient',
      { id, x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), gradientUnits: 'userSpaceOnUse' },
      stops(list),
    ),
  };
}

function radial(cx: number, cy: number, r: number, list: readonly Stop[]) {
  const id = nextId();
  return {
    url: `url(#${id})`,
    def: el(
      'radialGradient',
      { id, cx: r2(cx), cy: r2(cy), r: r2(r), gradientUnits: 'userSpaceOnUse' },
      stops(list),
    ),
  };
}

function clipTo(d: string): { id: string; def: string } {
  const id = nextId();
  return { id, def: el('clipPath', { id }, el('path', { d })) };
}

const defs = (...d: string[]): string => el('defs', {}, ...d);

/** An ellipse turned by `deg` about its centre. */
function oval(x: number, y: number, rx: number, ry: number, deg: number, attrs: object): string {
  return el('path', {
    d: ellipseD(x, y, rx, ry),
    transform: `rotate(${r2(deg)} ${r2(x)} ${r2(y)})`,
    ...attrs,
  });
}

// --- the sausage tree (Kigelia africana) ------------------------------------------------------

export interface KigeliaShape {
  /** Stalk top (on the limb), the stalk's end where the fruit hangs, and the stalk's sway. */
  readonly top: Pt;
  readonly attach: Pt;
  readonly sway: number;
  readonly len: number;
  readonly w: number;
  readonly tilt: number;
  readonly c: { readonly fill: string; readonly lit: string; readonly dark: string };
  readonly ink: string;
}

/**
 * A sausage fruit: long and heavy, slightly curved, fatter toward the blunt darker tip; grey-brown
 * mottled rough skin with pale lenticel dots, lit from the upper left; on a long thin rope-like
 * stalk that thickens where it meets the fruit.
 */
export function kigelia(s: KigeliaShape): FruitDrawing {
  const rnd = seedAt(s.attach[0], s.attach[1], 11);
  const [x1, y1] = s.attach;
  const len = s.len;
  const w = s.w * 1.15;
  const d: Pt = [Math.sin(s.tilt), Math.cos(s.tilt)];
  const n: Pt = [Math.cos(s.tilt), -Math.sin(s.tilt)];
  // Heavy fruit hang with a slight curve (either way).
  const curl = (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.07);
  const P = (t: number, side: number): Pt => {
    const bend = curl * len * t * t;
    return [x1 + d[0] * len * t + n[0] * (bend + side), y1 + d[1] * len * t + n[1] * (bend + side)];
  };
  /** Half width along the fruit: a narrow neck, swelling to the tip, rounded both ends. */
  const hw = (t: number): number => {
    const swell = 0.5 + 0.5 * Math.min(1, t / 0.4) ** 0.8;
    const grow = 0.9 + 0.18 * t;
    const capB = t > 0.84 ? Math.sqrt(Math.max(0, 1 - ((t - 0.84) / 0.16) ** 2)) : 1;
    const capT = t < 0.05 ? 0.55 + 0.45 * Math.sqrt(1 - ((0.05 - t) / 0.05) ** 2) : 1;
    return (w / 2) * swell * grow * capB * capT;
  };
  const N = 36;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    left.push(P(t, -hw(t)));
    right.push(P(t, hw(t)));
  }
  const outline = polyD([...left, ...right.reverse()]);
  const clip = clipTo(outline);
  const mid0 = P(0.55, -hw(0.55));
  const mid1 = P(0.55, hw(0.55));
  const body = linear(mid0[0], mid0[1], mid1[0], mid1[1], [
    [0, s.c.lit],
    [0.3, mix(s.c.lit, s.c.fill, 0.6)],
    [0.62, s.c.fill],
    [1, s.c.dark],
  ]);
  const tipPt = P(0.95, 0);
  const tip = radial(tipPt[0], tipPt[1], w * 1.1, [
    [0, shade(s.c.dark, -0.5), 0.95],
    [0.5, shade(s.c.dark, -0.2), 0.7],
    [1, s.c.dark, 0],
  ]);
  const inside: string[] = [];
  // Mottling: soft patches of a darker and a paler grey-brown, long along the fruit.
  const axisDeg = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  for (let k = 0; k < 26; k++) {
    const t = 0.06 + rnd() * 0.86;
    const p = P(t, (rnd() - 0.5) * 1.6 * hw(t));
    const rx = w * (0.16 + rnd() * 0.2);
    const dark = rnd() < 0.6;
    inside.push(
      oval(p[0], p[1], rx * (1.6 + rnd() * 1.2), rx, axisDeg + (rnd() - 0.5) * 30, {
        fill: dark ? mix(s.c.fill, '#4A3E30', 0.55) : mix(s.c.fill, '#C8BCA0', 0.55),
        opacity: r2(0.22 + rnd() * 0.2),
      }),
    );
  }
  // Rough skin: short fine scratches along the fruit.
  let rough = '';
  for (let k = 0; k < 60; k++) {
    const t = 0.05 + rnd() * 0.88;
    const side = (rnd() - 0.5) * 1.7;
    const a = P(t, side * hw(t));
    const b = P(t + 0.008 + rnd() * 0.01, (side + (rnd() - 0.5) * 0.15) * hw(t));
    rough += `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
  }
  inside.push(
    el('path', {
      d: rough,
      stroke: '#3E3428',
      'stroke-width': r2(clamp(w * 0.03, 0.2, 0.5)),
      opacity: 0.3,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
  );
  // The shade side and the lit band (upper left), then the darker blunt tip.
  const band = (side: number, t0: number, t1: number): string => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = t0 + ((t1 - t0) * i) / 12;
      pts.push(P(t, side * hw(t)));
    }
    return polyD(pts, false);
  };
  inside.push(
    el('path', {
      d: band(0.62, 0.06, 0.92),
      stroke: s.c.dark,
      'stroke-width': r2(w * 0.28),
      opacity: 0.4,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: band(-0.5, 0.12, 0.78),
      stroke: shade(s.c.lit, 0.35),
      'stroke-width': r2(w * 0.11),
      opacity: 0.6,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', { d: ellipseD(tipPt[0], tipPt[1], w * 1.1, w * 1.1), fill: tip.url }),
  );
  // Lenticels: small pale dots, a few with a dark rim.
  let dots = '';
  let rims = '';
  for (let k = 0; k < 24; k++) {
    const t = 0.05 + rnd() * 0.85;
    const p = P(t, (rnd() - 0.5) * 1.7 * hw(t));
    const r = w * (0.022 + rnd() * 0.022);
    dots += ellipseD(p[0], p[1], r, r * 0.8);
    if (k % 4 === 0) rims += ellipseD(p[0] + r * 0.4, p[1] + r * 0.4, r * 1.2, r);
  }
  inside.push(
    el('path', { d: rims, fill: s.c.dark, opacity: 0.35 }),
    el('path', { d: dots, fill: '#E2D6B8', opacity: 0.7 }),
  );
  // The calyx scar where it hangs.
  const cal = P(0.02, 0);
  const bodySvg = g(
    {},
    defs(clip.def, body.def, tip.def),
    el('path', { d: outline, fill: body.url }),
    g({ 'clip-path': `url(#${clip.id})` }, ...inside),
    el('path', {
      d: ellipseD(cal[0], cal[1], w * 0.24, w * 0.14),
      fill: shade(s.c.dark, -0.3),
    }),
    el('path', {
      d: outline,
      fill: 'none',
      stroke: s.ink,
      'stroke-width': r2(clamp(w * 0.07, 0.5, 1.3)),
      'stroke-linejoin': 'round',
    }),
  );
  // The stalk: a thin twisted rope, thickening into the fruit.
  const [x0, y0] = s.top;
  const cx = x0 + s.sway * 1.6;
  const cy = (y0 + y1) / 2;
  const Q = (t: number): Pt => [
    (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1,
    (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1,
  ];
  const sw = clamp(s.w * 0.1, 0.5, 1.4);
  const rope = `M${r2(x0)} ${r2(y0)}Q${r2(cx)} ${r2(cy)} ${r2(x1)} ${r2(y1)}`;
  const k0 = Q(0.86);
  const swell: Pt[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = 0.86 + (0.14 * i) / steps;
    const p = Q(t);
    swell.push([p[0] - (sw * (0.5 + 1.3 * ((t - 0.86) / 0.14))) / 2, p[1]]);
  }
  for (let i = steps; i >= 0; i--) {
    const t = 0.86 + (0.14 * i) / steps;
    const p = Q(t);
    swell.push([p[0] + (sw * (0.5 + 1.3 * ((t - 0.86) / 0.14))) / 2, p[1]]);
  }
  const ropeC = '#6B5B45';
  const stalkSvg = g(
    {},
    el('path', { d: rope, fill: 'none', stroke: s.ink, 'stroke-width': r2(sw + 0.7) }),
    el('path', { d: rope, fill: 'none', stroke: ropeC, 'stroke-width': r2(sw) }),
    el('path', {
      d: rope,
      fill: 'none',
      stroke: '#A08E6C',
      'stroke-width': r2(sw * 0.5),
      'stroke-dasharray': `${r2(sw * 1.3)} ${r2(sw * 1.5)}`,
      opacity: 0.85,
    }),
    el('path', {
      d: polyD(swell),
      fill: mix(ropeC, s.c.dark, 0.4),
      stroke: s.ink,
      'stroke-width': r2(sw * 0.45),
    }),
    el('path', {
      d: `M${r2(k0[0] - sw * 0.2)} ${r2(k0[1])}L${r2(x1 - sw * 0.5)} ${r2(y1)}`,
      stroke: '#B8A684',
      'stroke-width': r2(sw * 0.35),
      opacity: 0.7,
    }),
  );
  return { body: bodySvg, stalk: stalkSvg, attach: { x: x1, y: y1 } };
}

// --- the baobab (Adansonia digitata) ----------------------------------------------------------

/**
 * A baobab pod: a velvety ovoid, grey-green to olive-tan, with a fine fuzzy rim and a soft light
 * from the upper left, on a woody stalk from the limb (the last stretch thick and brown).
 */
export function baobabPod(
  px: number,
  py: number,
  rx: number,
  ry: number,
  top: Pt,
  ink: string,
): FruitDrawing {
  const rnd = seedAt(px, py, 23);
  // Egg shape: wider at the bottom, a slight lean.
  const lean = (rnd() - 0.5) * 0.12;
  const pts: Pt[] = [];
  const rim: { p: Pt; a: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const sa = Math.sin(a);
    const wob = 1 + (rnd() - 0.5) * 0.03;
    const x = px + rx * Math.cos(a) * (1 + 0.12 * sa) * wob + lean * ry * sa;
    const y = py + ry * sa * wob;
    pts.push([x, y]);
    rim.push({ p: [x, y], a });
  }
  const outline = polyD(pts);
  const clip = clipTo(outline);
  const shadeG = radial(px + rx * 0.5, py + ry * 0.42, Math.max(rx, ry) * 1.05, [
    [0, '#4E4834', 0.4],
    [0.6, '#4E4834', 0.22],
    [1, '#4E4834', 0],
  ]);
  const sheen = radial(px - rx * 0.32, py - ry * 0.34, Math.max(rx, ry) * 0.5, [
    [0, '#ECEAD6', 0.38],
    [1, '#ECEAD6', 0],
  ]);
  const fill = radial(px - rx * 0.4, py - ry * 0.42, Math.max(rx, ry) * 1.55, [
    [0, '#CFCCAE'],
    [0.32, '#ABA785'],
    [0.62, '#948C66'],
    [0.86, '#7A7152'],
    [1, '#5C5640'],
  ]);
  const inside: string[] = [];
  // Shade side (lower right) and the soft light (upper left).
  inside.push(
    el('path', {
      d: ellipseD(px + rx * 0.5, py + ry * 0.42, rx * 1.05, ry * 1.05),
      fill: shadeG.url,
    }),
    // Velvet takes the light softly: a broad, faint sheen, no sharp spot.
    el('path', {
      d: ellipseD(px - rx * 0.32, py - ry * 0.34, rx * 0.5, ry * 0.42),
      fill: sheen.url,
    }),
  );
  // Faint lengthwise ridges and the velvet's speckle.
  for (const f of [-0.45, 0.05, 0.5])
    inside.push(
      el('path', {
        d: `M${r2(px + f * rx * 0.6)} ${r2(py - ry)}Q${r2(px + f * rx * 1.25)} ${r2(py)} ${r2(px + f * rx * 0.75)} ${r2(py + ry)}`,
        stroke: '#4E4834',
        'stroke-width': r2(clamp(rx * 0.05, 0.25, 0.8)),
        opacity: 0.16,
        fill: 'none',
      }),
    );
  let speck = '';
  for (let k = 0; k < 40; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * 0.9;
    speck += ellipseD(px + Math.cos(a) * rx * rr, py + Math.sin(a) * ry * rr, 0.35, 0.35);
  }
  inside.push(el('path', { d: speck, fill: '#E4E0C8', opacity: 0.3 }));
  // Velvet fuzz: fine pale hairs standing off the rim, thicker on the lit side.
  let fuzz = '';
  for (const { p, a } of rim)
    for (let h = 0; h < 3; h++) {
      const aa = a + (rnd() - 0.5) * 0.25;
      const l = Math.max(rx, ry) * (0.05 + rnd() * 0.05);
      const o = (rnd() - 0.5) * 0.6;
      fuzz += `M${r2(p[0] + o)} ${r2(p[1] + o)}l${r2(Math.cos(aa) * l)} ${r2(Math.sin(aa) * l)}`;
    }
  // The style's dried point at the bottom, and the calyx scar at the top.
  const body = g(
    {},
    defs(clip.def, fill.def, shadeG.def, sheen.def),
    el('path', { d: outline, fill: fill.url }),
    g({ 'clip-path': `url(#${clip.id})` }, ...inside),
    el('path', {
      d: outline,
      fill: 'none',
      stroke: mix(ink, '#6E6650', 0.55),
      'stroke-width': r2(clamp(rx * 0.05, 0.35, 1)),
    }),
    el('path', {
      d: fuzz,
      stroke: '#DAD6BC',
      'stroke-width': 0.35,
      opacity: 0.55,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: ellipseD(px + lean * ry * 0.9, py + ry * 0.98, rx * 0.08, ry * 0.05),
      fill: '#4E4834',
    }),
    el('path', {
      d: ellipseD(px - lean * ry, py - ry * 0.95, rx * 0.2, ry * 0.07),
      fill: '#5A4A36',
    }),
  );
  // The stalk: thin from the limb, the last third thick, woody and brown, with a node.
  const end: Pt = [px - lean * ry, py - ry * 0.95];
  // It droops from the limb and hangs straight down into the pod.
  const c: Pt = [end[0], top[1] + (end[1] - top[1]) * 0.25];
  const Q = (t: number): Pt => [
    (1 - t) * (1 - t) * top[0] + 2 * (1 - t) * t * c[0] + t * t * end[0],
    (1 - t) * (1 - t) * top[1] + 2 * (1 - t) * t * c[1] + t * t * end[1],
  ];
  const sw = clamp(rx * 0.12, 0.6, 2.4);
  const thin = `M${r2(top[0])} ${r2(top[1])}Q${r2(c[0])} ${r2(c[1])} ${r2(end[0])} ${r2(end[1])}`;
  const w0 = Q(0.66);
  const knot = Q(0.8);
  const woody = `M${r2(w0[0])} ${r2(w0[1])}L${r2(knot[0])} ${r2(knot[1])}L${r2(end[0])} ${r2(end[1])}`;
  const stalk = g(
    {},
    el('path', { d: thin, fill: 'none', stroke: ink, 'stroke-width': r2(sw + 0.8) }),
    el('path', { d: thin, fill: 'none', stroke: '#6E6252', 'stroke-width': r2(sw) }),
    el('path', {
      d: woody,
      fill: 'none',
      stroke: ink,
      'stroke-width': r2(sw * 2.2 + 0.8),
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: woody,
      fill: 'none',
      stroke: '#6A523A',
      'stroke-width': r2(sw * 2.2),
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: woody,
      fill: 'none',
      stroke: '#9A8064',
      'stroke-width': r2(sw * 0.6),
      transform: `translate(${r2(-sw * 0.5)} 0)`,
      opacity: 0.7,
    }),
    el('path', {
      d: ellipseD(knot[0], knot[1], sw * 1.5, sw * 0.8),
      fill: '#5A4430',
      stroke: ink,
      'stroke-width': r2(sw * 0.3),
    }),
  );
  return { body, stalk, attach: { x: end[0], y: end[1] } };
}

// --- round fruit (marula, jackalberry, ilala, !nara) -------------------------------------------

export interface RoundLook {
  /** Small dark dots on the skin (marula). */
  readonly speckle?: boolean;
  /** Warts and pale bands (!nara). */
  readonly warts?: string;
  /** A glossy skin: a sharper highlight (ilala). */
  readonly gloss?: boolean;
  /** The calyx or stem nub on top. */
  readonly calyx?: boolean;
}

/** A round fruit with a real shape: body, shade side, highlight, skin detail and its nub. */
export function roundHi(x: number, y: number, r: number, c: string, look: RoundLook = {}): string {
  const rnd = seedAt(x, y, 37);
  const rx = r;
  const ry = r * (0.9 + rnd() * 0.08);
  const body = ellipseD(x, y, rx, ry);
  const clip = clipTo(body);
  const fill = radial(x - r * 0.38, y - r * 0.42, r * 1.7, [
    [0, shade(c, 0.5)],
    [0.35, shade(c, 0.12)],
    [0.7, c],
    [1, shade(c, -0.45)],
  ]);
  const inside: string[] = [
    el('path', {
      d: ellipseD(x + r * 0.42, y + r * 0.46, r * 0.95, r * 0.9),
      fill: shade(c, -0.55),
      opacity: 0.32,
    }),
  ];
  if (look.speckle) {
    let d = '';
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 0.8;
      d += ellipseD(x + Math.cos(a) * r * rr, y + Math.sin(a) * r * rr, r * 0.05, r * 0.05);
    }
    inside.push(el('path', { d, fill: shade(c, -0.55), opacity: 0.6 }));
  }
  if (look.warts !== undefined) {
    for (const f of [-0.5, 0, 0.5])
      inside.push(
        el('path', {
          d: `M${r2(x + f * r)} ${r2(y - r)}Q${r2(x + f * r * 1.5)} ${r2(y)} ${r2(x + f * r)} ${r2(y + r)}`,
          stroke: shade(c, 0.35),
          'stroke-width': r2(r * 0.12),
          opacity: 0.35,
          fill: 'none',
        }),
      );
    let dark = '';
    let lit = '';
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 0.85;
      const wx = x + Math.cos(a) * r * rr;
      const wy = y + Math.sin(a) * r * rr * 0.9;
      const wr = r * (0.07 + rnd() * 0.04);
      dark += ellipseD(wx + wr * 0.3, wy + wr * 0.3, wr, wr);
      lit += ellipseD(wx - wr * 0.3, wy - wr * 0.3, wr * 0.45, wr * 0.45);
    }
    inside.push(
      el('path', { d: dark, fill: look.warts, opacity: 0.75 }),
      el('path', { d: lit, fill: shade(c, 0.55), opacity: 0.7 }),
    );
  }
  const hl = look.gloss ? 0.9 : 0.6;
  inside.push(
    el('path', {
      d: ellipseD(x - r * 0.36, y - r * 0.4, r * 0.3, r * 0.2),
      fill: '#FFF8E6',
      opacity: hl,
      transform: `rotate(-30 ${r2(x - r * 0.36)} ${r2(y - r * 0.4)})`,
    }),
  );
  if (look.gloss)
    inside.push(
      el('path', {
        d: ellipseD(x + r * 0.3, y + r * 0.42, r * 0.22, r * 0.1),
        fill: shade(c, 0.4),
        opacity: 0.5,
      }),
    );
  const parts = [
    defs(clip.def, fill.def),
    el('path', { d: body, fill: fill.url }),
    g({ 'clip-path': `url(#${clip.id})` }, ...inside),
    el('path', {
      d: body,
      fill: 'none',
      stroke: shade(c, -0.6),
      'stroke-width': r2(clamp(r * 0.14, 0.35, 1.1)),
    }),
  ];
  if (look.calyx !== false) {
    const nx = x + r * 0.12;
    const ny = y - ry * 0.9;
    parts.push(
      el('path', {
        d: `M${r2(nx - r * 0.18)} ${r2(ny + r * 0.04)}L${r2(nx)} ${r2(ny - r * 0.08)}L${r2(nx + r * 0.18)} ${r2(ny + r * 0.04)}`,
        stroke: '#5A4630',
        'stroke-width': r2(clamp(r * 0.12, 0.3, 0.9)),
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  }
  return g({}, ...parts);
}

/** An ilala palm's bunch: a bent stalk to a short branched rachis with glossy brown fruit. */
export function ilalaBunch(
  top: Pt,
  at: Pt,
  fruit: readonly { x: number; y: number; r: number }[],
  c: string,
  stalkC: string,
  sw: number,
): FruitDrawing {
  const [tx, ty] = top;
  const [cx, cy] = at;
  const stalk = g(
    {},
    el('path', {
      d: `M${r2(tx)} ${r2(ty)}Q${r2(cx)} ${r2(ty - 2)} ${r2(cx)} ${r2(cy)}`,
      fill: 'none',
      stroke: shade(stalkC, -0.4),
      'stroke-width': r2(sw + 0.6),
    }),
    el('path', {
      d: `M${r2(tx)} ${r2(ty)}Q${r2(cx)} ${r2(ty - 2)} ${r2(cx)} ${r2(cy)}`,
      fill: 'none',
      stroke: stalkC,
      'stroke-width': r2(sw),
    }),
  );
  // Rachis branches from the bunch's top to each fruit, behind the fruit.
  let twigs = '';
  for (const f of fruit) twigs += `M${r2(cx)} ${r2(cy)}L${r2(f.x)} ${r2(f.y - f.r * 0.7)}`;
  const sorted = [...fruit].sort((a, b) => a.y - b.y);
  const body = g(
    {},
    el('path', {
      d: twigs,
      stroke: shade(stalkC, -0.2),
      'stroke-width': r2(Math.max(0.35, sw * 0.6)),
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    ...sorted.map((f) =>
      roundHi(f.x, f.y, f.r * 1.08, mix(c, '#5A3418', ((f.x * 7) % 1) * 0.3), {
        gloss: true,
        calyx: false,
      }),
    ),
  );
  return { body, stalk, attach: { x: cx, y: cy } };
}

// --- pods ------------------------------------------------------------------------------------

/**
 * A sweet-thorn sickle pod: flat and curved, two tones across, the seeds as bulges with pale
 * rims, a lit upper edge and a short stalk where it hangs.
 */
export function sickleHi(x: number, y: number, len: number, ang: number, c: string): string {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const P = (u: number, v: number): Pt => [x + u * ca - v * sa, y + u * sa + v * ca];
  const S = (u: number, v: number): string => {
    const p = P(u, v);
    return `${r2(p[0])} ${r2(p[1])}`;
  };
  const w = len * 0.16;
  const curve = (u: number): number => len * 0.3 * 4 * (u / len) * (1 - u / len) * 0.5;
  // Outline: the back edge follows the curve, the front edge bulges over each seed.
  const seeds = Math.max(4, Math.round(len / 4));
  const back: string[] = [];
  const front: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = (len * i) / 24;
    back.push(S(u, curve(u)));
  }
  for (let i = 24; i >= 0; i--) {
    const u = (len * i) / 24;
    const bump = 1 + 0.18 * Math.abs(Math.sin((u / len) * seeds * Math.PI));
    const taper = Math.min(1, (u / len) * 4, ((len - u) / len) * 5);
    front.push(S(u, curve(u) + w * taper * bump));
  }
  const d = `M${back.join('L')}L${front.join('L')}Z`;
  const clip = clipTo(d);
  const mid0 = P(len / 2, curve(len / 2));
  const mid1 = P(len / 2, curve(len / 2) + w);
  const fill = linear(mid0[0], mid0[1], mid1[0], mid1[1], [
    [0, shade(c, 0.35)],
    [0.45, c],
    [1, shade(c, -0.4)],
  ]);
  let seedD = '';
  let seedLit = '';
  for (let i = 0; i < seeds; i++) {
    const u = (len * (i + 0.5)) / seeds;
    const p = P(u, curve(u) + w * 0.55);
    seedD += ellipseD(p[0], p[1], (len / seeds) * 0.32, w * 0.3);
    const q = P(u - len * 0.02, curve(u) + w * 0.4);
    seedLit += ellipseD(q[0], q[1], (len / seeds) * 0.14, w * 0.12);
  }
  const stalkEnd = P(-len * 0.06, curve(0) - w * 0.2);
  return g(
    {},
    defs(clip.def, fill.def),
    el('path', {
      d: `M${S(0, w * 0.3)}L${r2(stalkEnd[0])} ${r2(stalkEnd[1])}`,
      stroke: shade(c, -0.5),
      'stroke-width': r2(clamp(len * 0.05, 0.4, 1.1)),
      'stroke-linecap': 'round',
    }),
    el('path', { d, fill: fill.url }),
    g(
      { 'clip-path': `url(#${clip.id})` },
      el('path', { d: seedD, fill: shade(c, -0.3), opacity: 0.55 }),
      el('path', { d: seedLit, fill: shade(c, 0.45), opacity: 0.6 }),
    ),
    el('path', {
      d: `M${back.join('L')}`,
      fill: 'none',
      stroke: shade(c, 0.5),
      'stroke-width': r2(clamp(len * 0.04, 0.3, 0.9)),
      opacity: 0.85,
    }),
    el('path', {
      d,
      fill: 'none',
      stroke: shade(c, -0.55),
      'stroke-width': r2(clamp(len * 0.035, 0.3, 0.9)),
    }),
  );
}

/**
 * A camelthorn pod: a thick grey velvety crescent with the seeds bulging, two tones, a lit rim,
 * a shaded belly and fine fuzz along the outer edge.
 */
export function camelPodHi(
  x: number,
  y: number,
  len: number,
  ang: number,
  look: { readonly fill: string; readonly lit: string; readonly dark: string },
): string {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const P = (u: number, v: number): Pt => [x + u * ca - v * sa, y + u * sa + v * ca];
  const h = len * 0.5;
  const seeds = 6;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const u = -h + len * t;
    const arc = len * 0.62 * 4 * t * (1 - t) * 0.5;
    const bump = 1 + 0.12 * Math.abs(Math.sin(t * seeds * Math.PI));
    const thick = len * 0.2 * Math.min(1, t * 5, (1 - t) * 5) * bump;
    outer.push(P(u, arc));
    inner.push(P(u, arc - thick));
  }
  const d = polyD([...outer, ...inner.reverse()]);
  const clip = clipTo(d);
  const a0 = P(0, len * 0.3);
  const a1 = P(0, len * 0.1);
  const fill = linear(a0[0], a0[1], a1[0], a1[1], [
    [0, look.dark],
    [0.5, look.fill],
    [1, look.lit],
  ]);
  let seedD = '';
  for (let i = 0; i < seeds; i++) {
    const t = (i + 0.5) / seeds;
    const u = -h + len * t;
    const arc = len * 0.62 * 4 * t * (1 - t) * 0.5;
    const p = P(u, arc - len * 0.1);
    seedD += ellipseD(p[0], p[1], len * 0.055, len * 0.07);
  }
  let fuzz = '';
  for (let i = 1; i < outer.length - 1; i++) {
    const p = outer[i] as Pt;
    fuzz += `M${r2(p[0])} ${r2(p[1])}l${r2(-sa * len * 0.03)} ${r2(ca * len * 0.03)}`;
  }
  return g(
    {},
    defs(clip.def, fill.def),
    el('path', { d, fill: fill.url }),
    g(
      { 'clip-path': `url(#${clip.id})` },
      el('path', { d: seedD, fill: look.lit, opacity: 0.4 }),
      el('path', {
        d: polyD(inner, false),
        stroke: look.lit,
        'stroke-width': r2(len * 0.06),
        opacity: 0.55,
        fill: 'none',
      }),
    ),
    el('path', {
      d: fuzz,
      stroke: shade(look.lit, 0.3),
      'stroke-width': 0.3,
      opacity: 0.6,
      fill: 'none',
    }),
    el('path', {
      d,
      fill: 'none',
      stroke: look.dark,
      'stroke-width': r2(clamp(len * 0.05, 0.35, 1.1)),
    }),
  );
}

// --- quiver-tree flowers ------------------------------------------------------------------------

/** A quiver tree's flower spike as drawn for the sprite: the same stalks, racemes of tubes. */
export function quiverSpikeHi(
  stems: readonly string[],
  racemes: readonly { x: number; y: number; h: number }[],
  ink: string,
): string {
  const rnd = seedAt(racemes[0]?.x ?? 0, racemes[0]?.y ?? 0, 51);
  const parts: string[] = stems.map((d) =>
    g(
      {},
      el('path', { d, stroke: shade('#7E7040', -0.3), 'stroke-width': 1.7, fill: 'none' }),
      el('path', { d, stroke: '#A39558', 'stroke-width': 1.1, fill: 'none' }),
    ),
  );
  for (const r of racemes) {
    // Tubular flowers in rows: open yellow below, greener buds at the top; lit left, shade right.
    const rows = Math.max(5, Math.round(r.h / 1.6));
    const tubes: string[] = [];
    for (let i = 0; i < rows; i++) {
      const f = i / (rows - 1);
      const y = r.y - r.h * f;
      const spread = 2.6 * (1 - f * 0.4);
      for (const side of [-1, 0, 1]) {
        const x = r.x + side * spread * 0.8 + (rnd() - 0.5) * 0.5;
        const c =
          f > 0.75
            ? mix('#C8C860', '#F2C632', 1 - (f - 0.75) * 3)
            : side > 0
              ? '#D49A1E'
              : side < 0
                ? '#FBDC5A'
                : '#F2C632';
        tubes.push(
          oval(x, y, 0.8, 1.6, side * 25, {
            fill: c,
            stroke: mix(ink, '#B07A10', 0.6),
            'stroke-width': 0.25,
          }),
        );
        if (f < 0.6 && side !== 0 && rnd() < 0.5)
          tubes.push(
            el('path', {
              d: `M${r2(x)} ${r2(y + 1.4)}l${r2(side * 0.4)} 1`,
              stroke: '#FFE680',
              'stroke-width': 0.3,
            }),
          );
      }
    }
    parts.push(...tubes);
  }
  return g({}, ...parts);
}
