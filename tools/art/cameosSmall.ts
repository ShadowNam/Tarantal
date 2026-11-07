// v1.13 (D-075, art bible §5.7) interim art for the small veld cameos: the Bushveld's dung beetle
// rolling its ball (near plane, drawn about twice its true size so it reads), the Karoo's leopard
// tortoise (near plane), the Karoo's sprinting ostrich (mid plane: the Namibië cock from ostrich.ts,
// drawn again) and the dust it kicks up. Inked Bosveld Comic in daylight: lit from the upper left,
// form from gradients, and no ink on the creatures (lesson 43): every edge a shade darker than its
// part at full stroke width, a readable eye. Never hurt: the beetle tumbles comically and rights
// itself, the tortoise pulls in, the ostrich veers.
// Coordinates: design px round each frame's origin (the ground point), facing right, y down.
import type { CameoFrame } from '../../src/game/cameos/cameoSheet';
import type { CameoArt } from './cameos';
import { add, limb, lerp, mul, nrm, rot, sub, unit, type V } from './farFauna';
import { drawOstrich } from './ostrich';
import { mix, shade } from './scenery';
import { el, ellipseD, g, polyD, prng, r2, smoothD } from './svg';

// Gradient and clip ids, unique across a whole sheet (several frames share one SVG).
let uid = 0;
const nid = (): string => `cms${++uid}`;

interface Defs {
  readonly list: string[];
}

function linear(
  d: Defs,
  a: V,
  b: V,
  stops: readonly (readonly [number, string, number])[],
): string {
  const id = nid();
  d.list.push(
    el(
      'linearGradient',
      { id, gradientUnits: 'userSpaceOnUse', x1: a[0], y1: a[1], x2: b[0], y2: b[1] },
      ...stops.map(([o, c, op]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': op })),
    ),
  );
  return `url(#${id})`;
}

function radial(
  d: Defs,
  c: V,
  r: number,
  stops: readonly (readonly [number, string, number])[],
  focus?: V,
): string {
  const id = nid();
  d.list.push(
    el(
      'radialGradient',
      {
        id,
        gradientUnits: 'userSpaceOnUse',
        cx: c[0],
        cy: c[1],
        r,
        fx: focus?.[0],
        fy: focus?.[1],
      },
      ...stops.map(([o, col, op]) =>
        el('stop', { offset: o, 'stop-color': col, 'stop-opacity': op }),
      ),
    ),
  );
  return `url(#${id})`;
}

function clip(d: Defs, ...paths: string[]): string {
  const id = nid();
  d.list.push(el('clipPath', { id }, ...paths.map((p) => el('path', { d: p }))));
  return `url(#${id})`;
}

/** A soft contact shadow on the ground line. */
function shadow(d: Defs, x0: number, x1: number, h: number, a = 0.4): string {
  const cx = (x0 + x1) / 2;
  const rx = (x1 - x0) / 2;
  const fill = radial(d, [0, 0], 1, [
    [0, '#2A1E14', a],
    [1, '#2A1E14', 0],
  ]);
  return g(
    { transform: `translate(${r2(cx)} 0) scale(${r2(rx)} ${r2(h)})` },
    el('circle', { cx: 0, cy: 0, r: 1, fill }),
  );
}

/** Points round an ellipse (rotated `deg`), for shapes that get bent or transformed. */
function ellPts(cx: number, cy: number, rx: number, ry: number, n = 16, ryLow = ry): V[] {
  const out: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = Math.sin(a);
    out.push([cx + Math.cos(a) * rx, cy + s * (s > 0 ? ryLow : ry)]);
  }
  return out;
}

/** A filled part with its own darker edge (no ink). */
const part = (d: string, fill: string, edge: string, w: number): string =>
  el('path', {
    d,
    fill,
    stroke: edge,
    'stroke-width': w,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });

const lineP = (d: string, stroke: string, w: number, op = 1): string =>
  el('path', {
    d,
    fill: 'none',
    stroke,
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity: op === 1 ? undefined : op,
  });

// === the dung beetle ===========================================================================

const BTL = {
  body: '#2C251D',
  bronze: '#8A7148',
  sheen: '#E2D2A6',
  dark: '#120E0A',
  edge: '#0B0806',
  leg: '#2A231C',
  legEdge: '#0B0806',
  eye: '#7A5226',
  ball: '#77663F',
  ballLit: '#A8946A',
  ballDark: '#3F3320',
  ballEdge: '#271E12',
  straw: '#E0CC92',
  grit: '#33281A',
};

const BALL_R = 16.5;

/** The dung ball, rotated `deg` (its lumps and straw move; light stays upper left). The pattern
 *  repeats every 90°, so the four push frames (0°, 22.5°, 45°, 67.5°) loop seamlessly. */
function ball(d: Defs, c: V, deg: number): string {
  const R = BALL_R;
  const a0 = (deg * Math.PI) / 180;
  const pts: V[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const k =
      1 +
      0.012 * Math.sin(4 * (a - a0)) +
      0.03 * Math.sin(12 * (a - a0) + 1.3) +
      0.015 * Math.sin(8 * (a - a0));
    pts.push([c[0] + Math.cos(a) * R * k, c[1] + Math.sin(a) * R * k]);
  }
  const outline = smoothD(pts);
  const fill = radial(d, [c[0] - R * 0.35, c[1] - R * 0.4], R * 1.55, [
    [0, BTL.ballLit, 1],
    [0.45, BTL.ball, 1],
    [1, BTL.ballDark, 1],
  ]);
  const cl = clip(d, outline);
  const rnd = prng(4111);
  const fibres: string[] = [];
  const dark: string[] = [];
  // One quarter's flecks, repeated four times round the ball.
  const quarter: { r: number; a: number; dir: number; len: number; kind: number }[] = [];
  for (let i = 0; i < 6; i++)
    quarter.push({
      r: R * (0.32 + rnd() * 0.58),
      a: rnd() * (Math.PI / 2),
      dir: rnd() * Math.PI,
      len: 3 + rnd() * 3.5,
      kind: rnd() < 0.62 ? 0 : 1,
    });
  for (let q = 0; q < 4; q++)
    for (const f of quarter) {
      const a = f.a + (q * Math.PI) / 2 + a0;
      const p: V = [c[0] + Math.cos(a) * f.r, c[1] + Math.sin(a) * f.r];
      const dir = f.dir + (q * Math.PI) / 2 + a0;
      const h: V = [(Math.cos(dir) * f.len) / 2, (Math.sin(dir) * f.len) / 2];
      const s = `M${r2(p[0] - h[0])} ${r2(p[1] - h[1])}Q${r2(p[0] + h[1] * 0.3)} ${r2(p[1] - h[0] * 0.3)} ${r2(p[0] + h[0])} ${r2(p[1] + h[1])}`;
      if (f.kind === 0) fibres.push(s);
      else
        dark.push(el('path', { d: ellipseD(p[0], p[1], 1.3, 1.0), fill: BTL.grit, opacity: 0.75 }));
    }
  // A lit rim at the upper left and a deep shade low right (form, not ink).
  const shadeF = radial(d, [c[0] + R * 0.45, c[1] + R * 0.5], R * 1.1, [
    [0, '#1A120A', 0.45],
    [1, '#1A120A', 0],
  ]);
  return g(
    {},
    part(outline, fill, BTL.ballEdge, 2.2),
    g(
      { 'clip-path': cl },
      el('circle', { cx: c[0] + R * 0.45, cy: c[1] + R * 0.5, r: R * 1.1, fill: shadeF }),
      ...dark,
      lineP(fibres.join(''), BTL.straw, 1.5, 0.95),
      lineP(fibres.slice(0, 8).join(''), '#5C4A2A', 0.7, 0.6),
    ),
  );
}

/** How the beetle's body sits: centre, mirrored (head to the left), flipped (on its back), turned. */
interface BeetleLay {
  readonly c: V;
  readonly mirror: boolean;
  readonly flip: boolean;
  readonly deg: number;
}

/** One leg from a hip on the body to a foot, the knee bent away from the body's centre. */
function beetleLeg(hip: V, foot: V, centre: V, far: boolean, bendK = 0.32): string {
  const dir = sub(foot, hip);
  const len = Math.hypot(dir[0], dir[1]);
  const n = nrm(unit(dir));
  const mid = lerp(hip, foot, 0.45);
  const k1 = add(mid, mul(n, len * bendK));
  const k2 = add(mid, mul(n, -len * bendK));
  const dist = (p: V): number => Math.hypot(p[0] - centre[0], p[1] - centre[1]);
  const kn = dist(k1) > dist(k2) ? k1 : k2;
  // Never below the ground line (a planted foot's knee stays up).
  const knee: V = [kn[0], Math.min(kn[1], -2.6)];
  const fill = far ? shade(BTL.leg, -0.35) : BTL.leg;
  const femur = limb(
    [
      { p: hip, w: 3.4 },
      { p: lerp(hip, knee, 0.6), w: 3.6 },
      { p: knee, w: 3 },
    ],
    0.8,
  );
  // The tibia: toothed and broad near the foot (a digger's leg), a thin claw at the end.
  const tib = limb(
    [
      { p: knee, w: 2.8 },
      { p: lerp(knee, foot, 0.7), w: 3.2 },
      { p: foot, w: 1.6 },
    ],
    0.8,
  );
  const tdir = unit(sub(foot, knee));
  const tn = nrm(tdir);
  let teeth = '';
  for (const t of [0.45, 0.7]) {
    const p = lerp(knee, foot, t);
    const side = mul(tn, 1.9);
    teeth += polyD([add(p, mul(tdir, -0.8)), add(p, side), add(p, mul(tdir, 0.9))]);
  }
  return g(
    {},
    part(femur + tib + teeth, fill, BTL.legEdge, 1.3),
    lineP(
      `M${r2(hip[0])} ${r2(hip[1])}L${r2(knee[0])} ${r2(knee[1])}`,
      far ? shade(BTL.bronze, -0.4) : BTL.bronze,
      0.8,
      0.55,
    ),
  );
}

/** The beetle's body (elytra, pronotum, toothed head) in its own frame: head at +x, back up (−y). */
function beetleBody(d: Defs, lay: BeetleLay): { svg: string; at: (p: V) => V } {
  const at = (p: V): V => {
    const q: V = [lay.mirror ? -p[0] : p[0], lay.flip ? -p[1] : p[1]];
    return add(rot(q, [0, 0], lay.deg), lay.c);
  };
  const map = (pts: V[]): V[] => pts.map(at);
  const elytra = smoothD(map(ellPts(-3.5, 0, 11.5, 8.6, 18, 5.2)));
  const pron = smoothD(map(ellPts(8.6, 0.3, 5.4, 6.8, 14, 5.4)));
  // The clypeus: a flat shovel with a toothed front edge.
  const head = smoothD(
    map([
      [12.5, -4.2],
      [16, -3.6],
      [18.6, -1.6],
      [19.4, 0.2],
      [18.4, 1.2],
      [19, 2.4],
      [17, 3.4],
      [13.5, 4],
      [12, 1],
    ]),
  );
  // Light from the upper left on screen, whatever the pose.
  const lit = linear(d, add(lay.c, [-10, -14]), add(lay.c, [9, 10]), [
    [0, BTL.bronze, 1],
    [0.42, BTL.body, 1],
    [1, BTL.dark, 1],
  ]);
  const litHead = linear(d, add(at([16, 0]), [-5, -5]), add(at([16, 0]), [4, 4]), [
    [0, shade(BTL.bronze, -0.1), 1],
    [1, BTL.dark, 1],
  ]);
  // Striae along the wing cases, the seam between them and the pronotum.
  const stria = (y: number): string =>
    smoothD(
      map([
        [-13, y * 0.6],
        [-6, y],
        [2, y],
        [6.5, y * 0.8],
      ]),
      false,
    );
  // A specular highlight on the shell's lit shoulder (on screen: up-left of the body).
  const topOf = (x: number, rr: number): V => at([x, lay.flip ? rr : -rr]);
  const sp1 = topOf(-5, 6.2);
  const sp2 = topOf(8.4, 4.8);
  const eye = at([13.2, 1.2]);
  const ant = at([15.6, 3.2]);
  const antEnd = at([17.2, 6.4]);
  const svg = g(
    {},
    part(elytra, lit, BTL.edge, 2),
    part(pron, lit, BTL.edge, 2),
    part(head, litHead, BTL.edge, 1.6),
    lineP(stria(-3.2) + stria(-0.6), mix(BTL.dark, BTL.bronze, 0.25), 0.8, 0.8),
    lineP(
      smoothD(
        map([
          [3.2, -7],
          [2.4, -1],
          [3.2, 4.5],
        ]),
        false,
      ),
      BTL.dark,
      1.1,
    ),
    el('path', {
      d: ellipseD(sp1[0], sp1[1], 3.6, 1.5),
      fill: BTL.sheen,
      opacity: 0.6,
      transform: `rotate(${r2(lay.deg + (lay.mirror ? 10 : -10))} ${r2(sp1[0])} ${r2(sp1[1])})`,
    }),
    el('path', {
      d: ellipseD(sp2[0], sp2[1], 1.8, 1.1),
      fill: BTL.sheen,
      opacity: 0.5,
    }),
    // The antenna's lamellate club, then the eye (amber, with a glint: it reads on black).
    lineP(`M${r2(ant[0])} ${r2(ant[1])}L${r2(antEnd[0])} ${r2(antEnd[1])}`, '#6A5434', 1),
    el('circle', {
      cx: antEnd[0],
      cy: antEnd[1],
      r: 1.3,
      fill: '#8A6C40',
      stroke: BTL.edge,
      'stroke-width': 0.6,
    }),
    el('circle', {
      cx: eye[0],
      cy: eye[1],
      r: 1.9,
      fill: BTL.eye,
      stroke: BTL.edge,
      'stroke-width': 0.7,
    }),
    el('circle', { cx: eye[0] - 0.6, cy: eye[1] - 0.6, r: 0.6, fill: '#FFF4DC' }),
  );
  return { svg, at };
}

/** The four push frames: 0 … 3 (ball turned 22.5° each, legs stepping). */
function beetlePush(d: Defs, i: number): string {
  const bc: V = [21, -BALL_R];
  const lay: BeetleLay = { c: [-4, -18], mirror: true, flip: false, deg: -55 };
  const ph = (i / 4) * Math.PI * 2;
  const body = beetleBody(d, lay);
  const { at } = body;
  const onBall = (deg: number): V => {
    const a = (deg * Math.PI) / 180;
    return [bc[0] + Math.cos(a) * (BALL_R - 0.6), bc[1] + Math.sin(a) * (BALL_R - 0.6)];
  };
  const sw = Math.sin(ph);
  const cw = Math.cos(ph);
  // Head down, front legs on the ground, the long hind legs up on the ball: it walks backwards.
  // Far legs (behind the body), then the near ones; the pairs step in turn.
  const far =
    beetleLeg(at([-7, 3.6]), onBall(-104 - 8 * cw), lay.c, true) +
    beetleLeg(at([1, 4.2]), [4 - 2.5 * sw, 0], lay.c, true) +
    beetleLeg(at([10, 4.4]), [-17 + 2.5 * cw, 0], lay.c, true);
  const near =
    beetleLeg(at([-9, 4]), onBall(-124 + 8 * cw), lay.c, false) +
    beetleLeg(at([2.5, 4.6]), [0 + 2.5 * sw, 0], lay.c, false) +
    beetleLeg(at([11, 4.6]), [-22 - 2.5 * cw, 0], lay.c, false);
  return g({}, shadow(d, -28, 38, 1.7), ball(d, bc, i * 22.5), far, body.svg, near);
}

function beetleTumble(d: Defs): string {
  const bc: V = [24, -BALL_R];
  const lay: BeetleLay = { c: [-6, -8.8], mirror: true, flip: true, deg: 6 };
  const body = beetleBody(d, lay);
  const { at } = body;
  // Legs waving in the air (a comic upset: unhurt, kicking).
  const far =
    beetleLeg(at([-7, 3.6]), [5, -27], lay.c, true, 0.25) +
    beetleLeg(at([1, 4.2]), [-6, -29], lay.c, true, 0.3) +
    beetleLeg(at([10, 4.4]), [-20, -24], lay.c, true, 0.3);
  const near =
    beetleLeg(at([-9, 4]), [9, -21], lay.c, false, 0.3) +
    beetleLeg(at([2.5, 4.6]), [-1, -31], lay.c, false, 0.28) +
    beetleLeg(at([11, 4.6]), [-24, -27], lay.c, false, 0.25);
  return g({}, shadow(d, -26, 40, 1.7), ball(d, bc, 11), far, body.svg, near);
}

function beetleRight(d: Defs): string {
  const bc: V = [24, -BALL_R];
  const lay: BeetleLay = { c: [-9, -14.5], mirror: false, flip: false, deg: -72 };
  const body = beetleBody(d, lay);
  const { at } = body;
  // Rocked up onto its tail, legs reaching for the ground to tip back over.
  const far =
    beetleLeg(at([-7, 3.6]), [-3, 0], lay.c, true) +
    beetleLeg(at([1, 4.2]), [4, -2], lay.c, true) +
    beetleLeg(at([10, 4.4]), [6, -20], lay.c, true);
  const near =
    beetleLeg(at([-9, 4]), [1, 0], lay.c, false) +
    beetleLeg(at([2.5, 4.6]), [7.5, 0], lay.c, false) +
    beetleLeg(at([11, 4.6]), [9, -15], lay.c, false);
  return g({}, shadow(d, -24, 40, 1.7), ball(d, bc, 33), far, body.svg, near);
}

// === the leopard tortoise ======================================================================

const TRT = {
  shell: '#E4CF95',
  shellLit: '#F7EBC4',
  shellDark: '#9C8350',
  seam: '#5A4426',
  edge: '#5E4A2A',
  spot: '#1E1610',
  skin: '#C9A673',
  skinLit: '#E3C796',
  skinDark: '#8A6A40',
  skinEdge: '#5E4528',
  scale: '#A58050',
  nail: '#EADCB8',
  eye: '#1A120C',
};

interface Shell {
  readonly x0: number;
  readonly x1: number;
  /** The rim's height off the ground (y of the marginal scutes' lower edge), and the dome. */
  readonly yb: number;
  readonly h: number;
}

/** A point on the shell: u −1 (rear) … 1 (front), v 0 (rim) … 1 (top of the dome). */
function shellPt(s: Shell, u: number, v: number): V {
  const half = (s.x1 - s.x0) / 2;
  const cx = (s.x0 + s.x1) / 2;
  const prof = (uu: number): number => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(uu), 2.4)), 0.46);
  // The rim flares a little at front and rear; the dome's crown sits a bit to the rear.
  const uu = Math.max(-1, Math.min(1, u * (1 - 0.06 * v) + 0.06 * v));
  return [
    cx + uu * half * (1 - 0.04 * v),
    s.yb - v * s.h * prof(uu) + Math.abs(uu) * 1.2 * (1 - v),
  ];
}

function shellD(s: Shell): string {
  const pts: V[] = [];
  for (let i = 0; i <= 24; i++) pts.push(shellPt(s, -1 + (i / 24) * 2, 1));
  // The rim: the marginals' lower edge, a slight belly curve.
  pts.push([s.x1 - 1, s.yb + 1.2]);
  pts.push([(s.x0 + s.x1) / 2, s.yb + 1.8]);
  pts.push([s.x0 + 1, s.yb + 1.2]);
  return smoothD(pts, true, 0.7);
}

/** A scute between u0…u1 and v0…v1, as a closed outline. */
function scuteD(s: Shell, u0: number, u1: number, v0: number, v1: number): string {
  const pts: V[] = [];
  const n = 4;
  for (let i = 0; i <= n; i++) pts.push(shellPt(s, u0 + ((u1 - u0) * i) / n, v0));
  for (let i = 0; i <= n; i++) pts.push(shellPt(s, u1, v0 + ((v1 - v0) * i) / n));
  for (let i = 0; i <= n; i++) pts.push(shellPt(s, u1 - ((u1 - u0) * i) / n, v1));
  for (let i = 0; i <= n; i++) pts.push(shellPt(s, u0, v1 - ((v1 - v0) * i) / n));
  return polyD(pts);
}

function tortShell(d: Defs, s: Shell): string {
  const outline = shellD(s);
  const cl = clip(d, outline);
  const rnd = prng(7307);
  // Scute rows: the marginals round the rim, the costals on the flank, the vertebrals on top.
  const rows: { v0: number; v1: number; cols: number; off: number }[] = [
    { v0: -0.2, v1: 0.2, cols: 9, off: 0 },
    { v0: 0.2, v1: 0.64, cols: 4, off: 0.1 },
    { v0: 0.64, v1: 1.3, cols: 3, off: -0.05 },
  ];
  const seams: string[] = [];
  const spots: string[] = [];
  for (const row of rows) {
    const w = 2 / row.cols;
    for (let c = 0; c < row.cols; c++) {
      const u0 = -1 + c * w + row.off * w;
      const u1 = u0 + w;
      seams.push(scuteD(s, u0, u1, row.v0, row.v1));
      // The leopard spots: a dark blotch in the scute's centre, speckles toward its seams.
      const vc = Math.max(0.05, Math.min(0.88, (row.v0 + row.v1) / 2));
      const uc = (u0 + u1) / 2;
      const ctr = shellPt(s, uc, vc);
      const big = row.cols === 9 ? 1.6 : 2.6;
      const bl: V[] = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + rnd();
        const rr = big * (0.7 + rnd() * 0.6);
        bl.push([ctr[0] + Math.cos(a) * rr * 1.15, ctr[1] + Math.sin(a) * rr * 0.85]);
      }
      spots.push(el('path', { d: smoothD(bl), fill: TRT.spot, opacity: 0.88 }));
      const nSp = row.cols === 9 ? 1 : 4;
      for (let k = 0; k < nSp; k++) {
        const p = shellPt(
          s,
          u0 + w * (0.12 + rnd() * 0.76),
          row.v0 + (row.v1 - row.v0) * (rnd() < 0.5 ? 0.15 + rnd() * 0.15 : 0.7 + rnd() * 0.15),
        );
        spots.push(
          el('path', {
            d: ellipseD(p[0], p[1], 0.9 + rnd() * 0.7, 0.8 + rnd() * 0.5),
            fill: TRT.spot,
            opacity: 0.85,
          }),
        );
      }
    }
  }
  const cx = (s.x0 + s.x1) / 2;
  const base = linear(
    d,
    [cx - 10, s.yb - s.h],
    [cx + 6, s.yb],
    [
      [0, TRT.shellLit, 1],
      [0.5, TRT.shell, 1],
      [1, TRT.shellDark, 1],
    ],
  );
  const light = radial(d, [cx - (s.x1 - s.x0) * 0.18, s.yb - s.h * 0.78], s.h * 0.95, [
    [0, '#FFF8E4', 0.55],
    [1, '#FFF8E4', 0],
  ]);
  const dark = linear(
    d,
    [cx - 6, s.yb - s.h * 0.5],
    [cx + 20, s.yb + 2],
    [
      [0, '#3A2814', 0],
      [1, '#3A2814', 0.42],
    ],
  );
  return g(
    {},
    part(outline, base, TRT.edge, 2.4),
    g(
      { 'clip-path': cl },
      ...spots,
      lineP(seams.join(''), TRT.seam, 1.3, 0.9),
      el('rect', {
        x: s.x0 - 4,
        y: s.yb - s.h - 4,
        width: s.x1 - s.x0 + 8,
        height: s.h + 8,
        fill: light,
      }),
      el('rect', {
        x: s.x0 - 4,
        y: s.yb - s.h - 4,
        width: s.x1 - s.x0 + 8,
        height: s.h + 8,
        fill: dark,
      }),
    ),
    // The rim's lower edge, a shade darker (the plastron's shadow under the marginals).
    lineP(
      `M${r2(s.x0 + 3)} ${r2(s.yb + 1)}Q${r2(cx)} ${r2(s.yb + 2.6)} ${r2(s.x1 - 3)} ${r2(s.yb + 1)}`,
      TRT.edge,
      1.4,
      0.8,
    ),
  );
}

/** Big overlapping scales (legs and their openings): rows of small lens shapes. */
function scales(pts: readonly V[], r: number, col: string): string {
  return pts
    .map(([x, y]) =>
      el('path', {
        d: ellipseD(x, y, r, r * 0.8),
        fill: col,
        stroke: TRT.skinEdge,
        'stroke-width': 0.7,
        opacity: 0.95,
      }),
    )
    .join('');
}

/** A column leg like an elephant's, from under the shell to a flat foot with blunt nails. */
function tortLeg(d: Defs, top: V, foot: V, far: boolean): string {
  const skin = far ? shade(TRT.skin, -0.3) : TRT.skin;
  // A sturdy column, a little wider at the flat, round foot.
  const [tx, ty] = top;
  const [fx] = foot;
  const mx = (tx + fx) / 2;
  const my = (ty + foot[1]) / 2;
  const legD = smoothD(
    [
      [tx - 6.4, ty],
      [tx + 6.4, ty],
      [mx + 5.2, my],
      [fx + 6.4, -2.6],
      [fx + 6.6, -1.1],
      [fx - 5.6, -1.1],
      [fx - 6.2, -2.8],
      [mx - 5.2, my],
    ],
    true,
    0.6,
  );
  const fill = linear(
    d,
    [top[0] - 6, top[1]],
    [top[0] + 6, foot[1]],
    [
      [0, far ? skin : TRT.skinLit, 1],
      [1, shade(skin, -0.25), 1],
    ],
  );
  const sc: V[] = [];
  for (let k = 0; k < 3; k++) {
    const p = lerp(top, foot, 0.35 + k * 0.22);
    sc.push(add(p, [-2.4, 0]), add(p, [2.4, 1]));
  }
  const nails = [-3.2, 0, 3.2]
    .map((dx) =>
      el('path', {
        d: ellipseD(foot[0] + 2 + dx, foot[1] - 1.4, 1.3, 1.2),
        fill: far ? shade(TRT.nail, -0.3) : TRT.nail,
        stroke: TRT.skinEdge,
        'stroke-width': 0.6,
      }),
    )
    .join('');
  return g(
    {},
    part(legD, fill, TRT.skinEdge, 1.8),
    scales(sc, 2.1, far ? shade(TRT.scale, -0.3) : TRT.scale),
    nails,
  );
}

/** Head on its neck from under the shell's front: `out` 1 = fully out, 0.5 = peeking. */
function tortHead(d: Defs, root: V, head: V, look: number): string {
  const neck = limb(
    [
      { p: root, w: 9 },
      { p: lerp(root, head, 0.6), w: 7 },
      { p: head, w: 6.4 },
    ],
    0.8,
  );
  const hd = smoothD([
    [head[0] - 4, head[1] - 3.4],
    [head[0] + 1.5, head[1] - 4.4],
    [head[0] + 5, head[1] - 2.2],
    [head[0] + 6, head[1] + 0.6],
    [head[0] + 4, head[1] + 2.8],
    [head[0] - 1, head[1] + 3.4],
    [head[0] - 4.4, head[1] + 1.6],
  ]);
  const fill = linear(
    d,
    [head[0] - 6, head[1] - 6],
    [head[0] + 3, head[1] + 4],
    [
      [0, TRT.skinLit, 1],
      [1, TRT.skinDark, 1],
    ],
  );
  const eye: V = [head[0] + 1.6 + look * 0.4, head[1] - 1.2];
  return g(
    {},
    part(neck, TRT.skin, TRT.skinEdge, 1.8),
    lineP(
      `M${r2(root[0] + 1)} ${r2(root[1] - 2)}Q${r2((root[0] + head[0]) / 2)} ${r2((root[1] + head[1]) / 2 - 1)} ${r2(head[0] - 3)} ${r2(head[1] - 1)}`,
      TRT.skinDark,
      0.8,
      0.7,
    ),
    part(hd, fill, TRT.skinEdge, 1.8),
    // Head scales, the beak line, the beady eye with its glint.
    el('path', {
      d: ellipseD(head[0] - 1.2, head[1] - 2.6, 1.4, 0.9),
      fill: TRT.scale,
      opacity: 0.8,
    }),
    lineP(
      `M${r2(head[0] + 1.5)} ${r2(head[1] + 1.4)}Q${r2(head[0] + 4)} ${r2(head[1] + 1.6)} ${r2(head[0] + 5.6)} ${r2(head[1] + 0.8)}`,
      TRT.skinEdge,
      0.8,
    ),
    el('circle', {
      cx: eye[0],
      cy: eye[1],
      r: 1.75,
      fill: TRT.eye,
      stroke: TRT.skinEdge,
      'stroke-width': 0.5,
    }),
    el('circle', { cx: eye[0] - 0.5, cy: eye[1] - 0.6, r: 0.55, fill: '#FFF4DC' }),
  );
}

const SHELL_UP: Shell = { x0: -39, x1: 33, yb: -13.5, h: 35 };
const SHELL_DOWN: Shell = { x0: -39, x1: 33, yb: -2.2, h: 34 };

function tortWalk(d: Defs, step: 0 | 1): string {
  const s = SHELL_UP;
  const fwd = step === 0 ? 1 : -1;
  const tail = part(
    polyD([
      [s.x0 + 3, s.yb - 3],
      [s.x0 - 2.5, s.yb + 1.5],
      [s.x0 + 3, s.yb + 1.5],
    ]),
    TRT.skin,
    TRT.skinEdge,
    1.4,
  );
  return g(
    {},
    shadow(d, -40, 34, 1.7),
    // Far legs, diagonal to the near pair.
    tortLeg(d, [24, -15], [27 - 3 * fwd, 0], true),
    tortLeg(d, [-17, -15], [-15 + 3 * fwd, 0], true),
    tail,
    tortHead(d, [27, -16], [37, -21.5 + step * 0.8], 0),
    tortLeg(d, [19, -15], [21 + 3.5 * fwd, 0], false),
    tortLeg(d, [-25, -15], [-26 - 3 * fwd, 0], false),
    tortShell(d, s),
  );
}

/** The leg scales showing at the shell's openings when it has pulled in. */
function openings(): string {
  const s = SHELL_DOWN;
  const front: V[] = [
    [s.x1 - 3, s.yb - 1.2],
    [s.x1 + 1.5, s.yb - 1],
    [s.x1 + 4.6, s.yb - 2.4],
    [s.x1 - 1, s.yb - 5],
    [s.x1 + 3, s.yb - 5.4],
  ];
  const rear: V[] = [
    [s.x0 + 1, s.yb - 1],
    [s.x0 + 5, s.yb - 1],
    [s.x0 + 3, s.yb - 4.4],
  ];
  return g(
    {},
    part(ellipseD(s.x1 - 1, s.yb - 3, 7.5, 5), TRT.skinDark, TRT.skinEdge, 1.6),
    scales(front, 2.4, TRT.scale),
    part(ellipseD(s.x0 + 3, s.yb - 2.4, 5.2, 3.8), TRT.skinDark, TRT.skinEdge, 1.6),
    scales(rear, 2.2, TRT.scale),
  );
}

function tortHide(d: Defs): string {
  return g({}, shadow(d, -42, 36, 1.7), openings(), tortShell(d, SHELL_DOWN));
}

function tortPeek(d: Defs): string {
  const s = SHELL_DOWN;
  return g(
    {},
    shadow(d, -42, 38, 1.7),
    openings(),
    tortHead(d, [s.x1 - 6, s.yb - 5], [s.x1 + 3, s.yb - 6.5], 1),
    tortShell(d, s),
  );
}

// === the ostrich and its dust ==================================================================

/** The cock is drawn by ostrich.ts round his feet (a lifted foot's toes hang below the line);
 *  this centres him in the cameo box and stands his lowest toe on the ground. */
const OST_AT: Readonly<Record<'run_0' | 'run_1' | 'run_2', V>> = {
  run_0: [-26, -3.5],
  run_1: [-26, -11],
  run_2: [-26, -3.5],
};

const OST_VEER: readonly [number, number, number] = [0, -3.5, 13];

/** ostrich.ts's drawing split into its contact shadow (always on the ground; flattened here to
 *  fit the cameo box's thin margin under the feet) and the bird. */
function ostrichParts(pose: 'run_0' | 'run_1' | 'run_2'): { shadow: string; bird: string } {
  const svg = drawOstrich(true, pose);
  const m =
    /^<g>(<radialGradient id="(z\d+)">.*?<\/radialGradient><path d="[^"]*" fill="url\(#\2\)"\/>)/.exec(
      svg,
    );
  if (m?.[1] === undefined) throw new Error('cameosSmall: the ostrich drawing lost its shadow');
  return { shadow: m[1], bird: `<g>${svg.slice(3 + m[1].length)}` };
}

function ostrich(name: 'ost_run_a' | 'ost_run_b' | 'ost_run_c' | 'ost_veer'): string {
  if (name === 'ost_veer') {
    // Leaning into the veer: the bird tipped back over his planted foot (a skew keeps the foot
    // on the ground), wings half out for balance.
    const p = ostrichParts('run_0');
    const [dx, dy, sk] = OST_VEER;
    return g(
      {},
      g({ transform: `translate(${dx} 0) scale(1 0.5)` }, p.shadow),
      g({ transform: `translate(${dx} ${dy}) skewX(${sk})` }, p.bird),
    );
  }
  const pose = name === 'ost_run_a' ? 'run_0' : name === 'ost_run_b' ? 'run_1' : 'run_2';
  const [dx, dy] = OST_AT[pose];
  const p = ostrichParts(pose);
  // In the airborne stride the bird is lifted but his shadow stays on the ground.
  return g(
    {},
    g({ transform: `translate(${dx} 0) scale(1 0.5)` }, p.shadow),
    g({ transform: `translate(${dx} ${dy})` }, p.bird),
  );
}

function dust(d: Defs): string {
  const puffs: readonly (readonly [number, number, number])[] = [
    [-38, -10, 17],
    [-22, -18, 22],
    [-2, -22, 24],
    [18, -17, 21],
    [36, -10, 16],
    [-12, -6, 18],
    [12, -5, 17],
  ];
  const cl = clip(d, `M-70 -70H70V1.2H-70Z`);
  const parts = puffs.map(([x, y, r]) => {
    const fill = radial(d, [x, y], r, [
      [0, '#F2E6CA', 0.8],
      [0.35, '#E6D4AC', 0.7],
      [0.7, '#D8C29A', 0.3],
      [1, '#C9AF84', 0],
    ]);
    return el('circle', { cx: x, cy: y, r, fill });
  });
  const rnd = prng(919);
  const grit: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = -46 + rnd() * 92;
    const y = -8 - rnd() * 34;
    grit.push(el('circle', { cx: x, cy: y, r: 0.9 + rnd() * 0.8, fill: '#9A7E56', opacity: 0.55 }));
  }
  // A shaded underside where the cloud is thickest.
  const under = radial(d, [4, -4], 40, [
    [0, '#A08660', 0.28],
    [1, '#A08660', 0],
  ]);
  return g(
    { 'clip-path': cl },
    ...parts,
    el('path', { d: ellipseD(2, -6, 40, 9), fill: under }),
    ...grit,
  );
}

// === the frames ================================================================================

export function smallFrameArt(name: CameoFrame): CameoArt {
  const d: Defs = { list: [] };
  let body: string;
  switch (name) {
    case 'beetle_push_a':
      body = beetlePush(d, 0);
      break;
    case 'beetle_push_b':
      body = beetlePush(d, 1);
      break;
    case 'beetle_push_c':
      body = beetlePush(d, 2);
      break;
    case 'beetle_push_d':
      body = beetlePush(d, 3);
      break;
    case 'beetle_tumble':
      body = beetleTumble(d);
      break;
    case 'beetle_right':
      body = beetleRight(d);
      break;
    case 'tort_walk_a':
      body = tortWalk(d, 0);
      break;
    case 'tort_walk_b':
      body = tortWalk(d, 1);
      break;
    case 'tort_hide':
      body = tortHide(d);
      break;
    case 'tort_peek':
      body = tortPeek(d);
      break;
    case 'ost_run_a':
    case 'ost_run_b':
    case 'ost_run_c':
    case 'ost_veer':
      body = ostrich(name);
      break;
    case 'dust':
      body = dust(d);
      break;
    default:
      throw new Error(`cameosSmall: no drawing for ${name}`);
  }
  return { defs: d.list.join(''), body };
}
