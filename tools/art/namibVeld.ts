// v1.7d (D-059) Namibië veld life: the Namib ground drawn at the camelthorn / quiver-tree bar —
// no ink. Bushman grass (Stipagrostis) clumps of fine blades with feathery seed plumes (lit tops,
// shaded bases, a darker tone of the grass at the edges, a soft contact shadow, dry broken stems
// and litter), red sand with wind ripples, soft dune undulations, fine grain, gravel plains with
// pebbles, a quartz patch, animal tracks, dollar bush (Zygophyllum) and dead branches, and a
// natural plane edge (a lit sand ridge over a soft shadow) instead of an inked line.
// Every placement comes from the caller's seeded PRNG; colours come in a NamibLook.
import { flat, mix, nextId, shade, yAt, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, prng, r2, smoothD, svgDoc } from './svg';
import { renderSvg } from './raster';
import type { Rgba } from '../assets/image';
import {
  VELD_FRAMES,
  VELD_LAYERS,
  VELD_SHEET_H,
  VELD_SHEET_W,
  veldFrameFor,
  veldFrames,
  type VeldFrameDef,
  type VeldKind,
  type VeldLayer,
  type VeldSpot,
} from '../../src/game/view/namib/veldSheet';

/** The colours of one plane (already hazed toward the horizon by the caller). */
export interface NamibLook {
  /** Grass: shaded base, body, lit top, the edge tone, seed plumes. */
  readonly grassBase: string;
  readonly grass: string;
  readonly grassLit: string;
  readonly grassEdge: string;
  readonly plume: string;
  /** Sand: the hollow, body, lit crest. */
  readonly sandDark: string;
  readonly sand: string;
  readonly sandLit: string;
  /** Gravel and stones. */
  readonly gravel: string;
  readonly pebble: string;
  /** Dwarf shrubs and dead wood. */
  readonly shrub: string;
  readonly wood: string;
  /** Contact shadow colour. */
  readonly shadow: string;
}

/** Design px → stroke width floor (the finest line that still survives the png8 palette). */
const hair = (w: number): number => Math.max(0.45, w);

/** One tapered, curved blade from (x, y): `lean` px sideways at the tip, `w` wide at the base. */
function bladeD(x: number, y: number, h: number, lean: number, w: number, bend: number): string {
  const tx = x + lean;
  const ty = y - h;
  // The control point sits over the base and bows the blade toward its lean (arching grass).
  const cx = x + lean * (0.15 + bend);
  const cy = y - h * (0.62 + bend * 0.2);
  return (
    `M${r2(x - w / 2)} ${r2(y)}Q${r2(cx - w * 0.3)} ${r2(cy)} ${r2(tx)} ${r2(ty)}` +
    `Q${r2(cx + w * 0.3)} ${r2(cy)} ${r2(x + w / 2)} ${r2(y)}Z`
  );
}

export interface ClumpOpts {
  /** Blade count multiplier (1 = a full clump). */
  readonly density?: number;
  /** Chance a stem carries a seed plume. */
  readonly plumes?: number;
  /** Draw fine edges/hairs (off for far planes, where they are below a pixel). */
  readonly detail?: boolean;
  /** Width of the clump relative to its height (default ~0.9). */
  readonly spread?: number;
}

/**
 * A bushman-grass clump (Stipagrostis) standing on (x, y), `h` design px tall: a dense fan of
 * fine blades (back ones in shade, front ones lit), culms with silvery feathery plumes above them,
 * a few dry broken stems, litter at the base and a soft contact shadow toward the lower right.
 */
export function bushmanClump(
  rnd: Rnd,
  x: number,
  y: number,
  h: number,
  look: NamibLook,
  o: ClumpOpts = {},
): string {
  const detail = o.detail ?? h > 18;
  const spread = (o.spread ?? 0.9) * (0.8 + rnd() * 0.4);
  const n = Math.max(5, Math.round((6 + h * 0.3) * (o.density ?? 1)));
  const parts: string[] = [];
  // Contact shadow: two soft ellipses, offset away from the light (upper left).
  parts.push(
    flat(ellipseD(x + h * 0.12, y + h * 0.015, h * spread * 0.62, h * 0.07), look.shadow, {
      opacity: 0.18,
    }),
    flat(ellipseD(x + h * 0.06, y, h * spread * 0.4, h * 0.045), look.shadow, { opacity: 0.28 }),
  );
  // Per-clump gradient: shaded base → body → lit top (userSpace so every blade shares it).
  const grad = nextId();
  const gradBack = nextId();
  parts.push(
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id: grad, x1: 0, y1: y, x2: 0, y2: y - h, gradientUnits: 'userSpaceOnUse' },
        el('stop', { offset: 0, 'stop-color': look.grassBase }),
        el('stop', { offset: 0.35, 'stop-color': look.grass }),
        el('stop', { offset: 1, 'stop-color': look.grassLit }),
      ),
      el(
        'linearGradient',
        { id: gradBack, x1: 0, y1: y, x2: 0, y2: y - h, gradientUnits: 'userSpaceOnUse' },
        el('stop', { offset: 0, 'stop-color': shade(look.grassBase, -0.12) }),
        el('stop', { offset: 0.5, 'stop-color': mix(look.grassBase, look.grass, 0.6) }),
        el('stop', { offset: 1, 'stop-color': look.grass }),
      ),
    ),
  );
  const back: string[] = [];
  const front: string[] = [];
  const edges: string[] = [];
  const bw = Math.max(0.7, h * 0.022);
  for (let k = 0; k < n; k++) {
    const t = (k + rnd()) / n; // across the fan, left → right
    const side = t * 2 - 1;
    const bx = x + side * h * spread * 0.22 + (rnd() - 0.5) * h * 0.06;
    const bh = h * (0.55 + rnd() * 0.45) * (1 - Math.abs(side) * 0.3);
    const lean = side * h * spread * (0.35 + rnd() * 0.35) + (rnd() - 0.5) * h * 0.12;
    const d = bladeD(bx, y + 0.5, bh, lean, bw * (0.7 + rnd() * 0.6), 0.15 + rnd() * 0.35);
    // Blades leaning toward the light (left) and the front half are lit; the rest sit in shade.
    if (rnd() < 0.42 + (side < 0 ? 0.18 : -0.08)) back.push(d);
    else front.push(d);
    if (detail && rnd() < 0.5) edges.push(d);
  }
  parts.push(flat(back.join(''), `url(#${gradBack})`));
  // The edge tone (a darker grass, never black) under the front blades, so they read separately.
  if (edges.length > 0)
    parts.push(
      el('path', {
        d: edges.join(''),
        fill: 'none',
        stroke: look.grassEdge,
        'stroke-width': hair(bw * 0.35),
        'stroke-linejoin': 'round',
        opacity: 0.75,
      }),
    );
  parts.push(flat(front.join(''), `url(#${grad})`));
  // Dry broken stems: bleached, kinked, a few lying over.
  let broken = '';
  const nb = Math.round(rnd() * (1 + h / 40));
  for (let k = 0; k < nb; k++) {
    const sx = x + (rnd() - 0.5) * h * spread * 0.5;
    const kh = h * (0.25 + rnd() * 0.35);
    const dir = rnd() < 0.5 ? -1 : 1;
    const ex = sx + dir * h * (0.25 + rnd() * 0.35);
    broken += `M${r2(sx)} ${r2(y)}L${r2(sx + dir * kh * 0.15)} ${r2(y - kh)}L${r2(ex)} ${r2(y - kh * 0.25 - rnd() * kh * 0.3)}`;
  }
  if (broken !== '')
    parts.push(
      el('path', {
        d: broken,
        fill: 'none',
        stroke: mix(look.grassLit, look.grassEdge, 0.35),
        'stroke-width': hair(bw * 0.5),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
  // Culms with feathery plumes: the plume is a soft silvery spindle, its lit side brighter, with
  // a few fine awn hairs (only where they are big enough to see).
  const culms = Math.round(n * 0.4 * (o.plumes ?? 0.8));
  let stems = '';
  const plumes: string[] = [];
  let hairs = '';
  for (let k = 0; k < culms; k++) {
    const side = rnd() * 2 - 1;
    const sx = x + side * h * spread * 0.18;
    const top = h * (1.0 + rnd() * 0.45);
    const lean = side * h * spread * 0.45 + (rnd() - 0.4) * h * 0.15;
    const tx = sx + lean;
    const ty = y - top;
    const cx = sx + lean * 0.25;
    const cy = y - top * 0.6;
    stems += `M${r2(sx)} ${r2(y)}Q${r2(cx)} ${r2(cy)} ${r2(tx)} ${r2(ty)}`;
    // The plume hangs along the culm's top quarter, tilted with it.
    const pl = top * (0.2 + rnd() * 0.1);
    const ang = (Math.atan2(tx - cx, cy - ty) * 180) / Math.PI;
    const pw = Math.max(0.6, pl * 0.09);
    const px = tx - (tx - cx) * 0.18;
    const py = ty + (cy - ty) * 0.18;
    plumes.push(
      g(
        { transform: `translate(${r2(px)} ${r2(py)}) rotate(${r2(ang)})` },
        flat(ellipseD(0, 0, pw * 1.3, pl * 0.6), mix(look.plume, look.grassLit, 0.35), {
          opacity: 0.3,
        }),
        flat(ellipseD(-pw * 0.3, -pl * 0.05, pw * 0.55, pl * 0.48), look.plume, {
          opacity: 0.55,
        }),
      ),
    );
    if (detail && pl > 6)
      for (let a = 0; a < 5; a++) {
        const f = -0.4 + a * 0.2;
        const hx = px + Math.sin((ang * Math.PI) / 180) * pl * f;
        const hy = py - Math.cos((ang * Math.PI) / 180) * pl * f;
        const s = (a % 2 === 0 ? 1 : -1) * pw * (1.6 + rnd());
        hairs += `M${r2(hx)} ${r2(hy)}l${r2(s)} ${r2(-pw * 0.6 - rnd() * pw)}`;
      }
  }
  if (stems !== '')
    parts.push(
      el('path', {
        d: stems,
        fill: 'none',
        stroke: mix(look.grass, look.grassEdge, 0.3),
        'stroke-width': hair(bw * 0.32),
        'stroke-linecap': 'round',
      }),
    );
  parts.push(...plumes);
  if (hairs !== '')
    parts.push(
      el('path', {
        d: hairs,
        fill: 'none',
        stroke: mix(look.plume, '#FFFFFF', 0.3),
        'stroke-width': hair(pwOf(h)),
        'stroke-linecap': 'round',
        opacity: 0.7,
      }),
    );
  // Litter: short straw bits scattered at the base.
  if (detail) {
    let litter = '';
    for (let k = 0; k < 3 + h / 12; k++) {
      const lx = x + (rnd() - 0.5) * h * spread * 1.1;
      const ly = y + (rnd() - 0.3) * h * 0.06;
      const len = h * (0.05 + rnd() * 0.08);
      const a = (rnd() - 0.5) * 0.6;
      litter += `M${r2(lx)} ${r2(ly)}l${r2(len)} ${r2(len * a)}`;
    }
    parts.push(
      el('path', {
        d: litter,
        fill: 'none',
        stroke: look.grassLit,
        'stroke-width': hair(bw * 0.35),
        'stroke-linecap': 'round',
        opacity: 0.85,
      }),
    );
  }
  return g({}, ...parts);
}

const pwOf = (h: number): number => Math.max(0.3, h * 0.004);

/** A soft blur filter (defs + id) for undulations and edge shadows. */
export function softBlur(sd: number): { def: string; id: string } {
  const id = nextId();
  return {
    id,
    def: el(
      'filter',
      { id, x: '-20%', y: '-50%', width: '140%', height: '200%' },
      el('feGaussianBlur', { stdDeviation: sd }),
    ),
  };
}

/**
 * The sand's body texture inside [x0, x1] × [y0, y1]: soft dune undulations (blurred lit crests
 * and dark hollows), wind ripples (a shadow line under a lit line, spacing growing toward the
 * viewer) and fine grain. `k` scales everything to the plane (1 = near).
 */
export function sandTexture(
  rnd: Rnd,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  look: NamibLook,
  k: number,
): string {
  const parts: string[] = [];
  const blur = softBlur(6 * k + 1);
  // Undulations: long low swells, lit on their upper-left flank, shaded behind.
  let lit = '';
  let dark = '';
  for (let n = 0; n < ((x1 - x0) / 260) * 2; n++) {
    const cx = x0 + rnd() * (x1 - x0);
    const t = rnd();
    const cy = y0 + (y1 - y0) * t;
    const rx = (90 + rnd() * 200) * k * (0.6 + t * 0.8);
    const ry = (6 + rnd() * 12) * k * (0.6 + t * 0.8);
    lit += ellipseD(cx - rx * 0.15, cy - ry * 0.7, rx, ry * 0.7);
    dark += ellipseD(cx + rx * 0.2, cy + ry * 0.6, rx * 0.9, ry * 0.8);
  }
  parts.push(
    el('defs', {}, blur.def),
    g(
      { filter: `url(#${blur.id})` },
      flat(dark, look.sandDark, { opacity: 0.55 }),
      flat(lit, look.sandLit, { opacity: 0.55 }),
    ),
  );
  // Wind ripples: rows across the band, each broken into long gently wavy runs.
  let rs = '';
  let rl = '';
  for (let y = y0 + rnd() * 3; y < y1;) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const gap = Math.max(7, (6 + t * 12) * k);
    for (let x = x0 - rnd() * 60; x < x1;) {
      const len = (40 + rnd() * 160) * k * (0.6 + t);
      if (rnd() < 0.4) {
        const amp = (0.6 + rnd() * 1.2) * k * (0.6 + t);
        const wav = (14 + rnd() * 10) * k * (0.6 + t);
        let d = `M${r2(x)} ${r2(y)}`;
        let px = x;
        let up = rnd() < 0.5;
        while (px < x + len) {
          const nx = Math.min(x + len, px + wav);
          d += `Q${r2((px + nx) / 2)} ${r2(y + (up ? -amp : amp))} ${r2(nx)} ${r2(y)}`;
          px = nx;
          up = !up;
        }
        rs += d;
        // The lit flank sits just above the shadow line.
        rl += d.replace(
          /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
          (_m, a: string, b: string) => `${a} ${r2(Number(b) - gap * 0.32)}`,
        );
      }
      x += len + (10 + rnd() * 60) * k;
    }
    y += gap * (0.8 + rnd() * 0.5);
  }
  const rw = hair(0.55 * k + 0.25);
  parts.push(
    el('path', {
      d: rs,
      fill: 'none',
      stroke: look.sandDark,
      'stroke-width': rw,
      'stroke-linecap': 'round',
      opacity: 0.3,
    }),
    el('path', {
      d: rl,
      fill: 'none',
      stroke: look.sandLit,
      'stroke-width': rw * 0.9,
      'stroke-linecap': 'round',
      opacity: 0.32,
    }),
  );
  // Fine grain: sparse dark and light specks.
  let gd = '';
  let gl = '';
  const ng = ((x1 - x0) * (y1 - y0)) / (420 / k);
  for (let n = 0; n < ng; n++) {
    const sx = x0 + rnd() * (x1 - x0);
    const sy = y0 + rnd() * (y1 - y0);
    const r = (0.35 + rnd() * 0.45) * k * (0.7 + ((sy - y0) / Math.max(1, y1 - y0)) * 0.6);
    if (rnd() < 0.55) gd += ellipseD(sx, sy, r, r * 0.7);
    else gl += ellipseD(sx, sy, r, r * 0.7);
  }
  parts.push(flat(gd, look.sandDark, { opacity: 0.6 }), flat(gl, look.sandLit, { opacity: 0.7 }));
  return g({}, ...parts);
}

/** One pebble: body, a lit cap toward the upper left, a shadow toward the lower right. */
function pebble(x: number, y: number, r: number, body: string, shadow: string): string {
  return (
    flat(ellipseD(x + r * 0.35, y + r * 0.3, r * 1.05, r * 0.55), shadow, { opacity: 0.4 }) +
    flat(ellipseD(x, y, r, r * 0.66), body) +
    flat(ellipseD(x - r * 0.3, y - r * 0.25, r * 0.5, r * 0.28), mix(body, '#FFFFFF', 0.45), {
      opacity: 0.85,
    })
  );
}

/** A gravel plain patch: a greyer soft stain with pebbles of many sizes, denser in the middle. */
export function gravelPatch(
  rnd: Rnd,
  x: number,
  y: number,
  rx: number,
  ry: number,
  look: NamibLook,
  quartz = false,
): string {
  const blur = softBlur(Math.max(1, ry * 0.35));
  const parts: string[] = [
    el('defs', {}, blur.def),
    flat(ellipseD(x, y, rx, ry), quartz ? mix(look.sand, look.pebble, 0.3) : look.gravel, {
      opacity: 0.55,
      filter: `url(#${blur.id})`,
    }),
  ];
  const n = Math.round((rx * ry) / (quartz ? 22 : 30));
  const stones: { y: number; svg: string }[] = [];
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    const px = x + Math.cos(a) * d * rx;
    const py = y + Math.sin(a) * d * ry;
    const r = Math.max(0.5, (0.4 + Math.pow(rnd(), 2.2) * 2.2) * (ry / 9));
    const body = quartz
      ? rnd() < 0.7
        ? mix('#F4F1EA', look.pebble, 0.15)
        : mix(look.pebble, look.sandDark, 0.2)
      : mix(look.pebble, rnd() < 0.5 ? look.sandDark : look.gravel, rnd() * 0.5);
    stones.push({ y: py, svg: pebble(px, py, r, body, look.shadow) });
  }
  stones.sort((a, b) => a.y - b.y);
  parts.push(...stones.map((s) => s.svg));
  return g({}, ...parts);
}

/** A meandering line of small animal tracks (dents with a lit rim) from (x, y) over `len` px. */
export function tracks(
  rnd: Rnd,
  x: number,
  y: number,
  len: number,
  s: number,
  look: NamibLook,
): string {
  let dk = '';
  let lt = '';
  let px = x;
  let py = y;
  let k = 0;
  const dir = rnd() < 0.5 ? -1 : 1;
  while (Math.abs(px - x) < len) {
    const off = (k % 2 === 0 ? -1 : 1) * s * 0.9;
    dk += ellipseD(px, py + off * 0.4, s * 0.55, s * 0.28);
    lt += ellipseD(px - s * 0.12, py + off * 0.4 + s * 0.18, s * 0.45, s * 0.12);
    px += dir * s * (2.2 + rnd() * 0.6);
    py += (rnd() - 0.5) * s * 0.8;
    k++;
  }
  return g(
    {},
    flat(dk, look.sandDark, { opacity: 0.55 }),
    flat(lt, look.sandLit, { opacity: 0.6 }),
  );
}

/**
 * Dollar bush (Zygophyllum stapffii): a low rounded mound of fleshy coin-shaped leaves, yellow-
 * green to grey, shaded under and lit on top, on a few woody twigs; `s` = mound radius.
 */
export function dollarBush(rnd: Rnd, x: number, y: number, s: number, look: NamibLook): string {
  const parts: string[] = [
    flat(ellipseD(x + s * 0.25, y + s * 0.04, s * 1.25, s * 0.2), look.shadow, { opacity: 0.3 }),
  ];
  let twigs = '';
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI * (0.15 + rnd() * 0.7);
    twigs += `M${r2(x)} ${r2(y)}L${r2(x + Math.cos(a) * s * 0.9)} ${r2(y + Math.sin(a) * s * 0.7)}`;
  }
  parts.push(
    el('path', {
      d: twigs,
      fill: 'none',
      stroke: look.wood,
      'stroke-width': hair(s * 0.05),
      'stroke-linecap': 'round',
    }),
  );
  const dark = mix(look.shrub, look.shadow, 0.35);
  const lit = mix(look.shrub, '#F4F0C8', 0.4);
  const leaves: { y: number; svg: string }[] = [];
  const n = Math.round(14 + s * 1.6);
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI;
    const d = Math.sqrt(rnd());
    const lx = x - Math.cos(a) * d * s;
    const ly = y - Math.sin(a) * d * s * 0.62 - s * 0.05;
    const r = s * (0.1 + rnd() * 0.07);
    const up = (y - ly) / (s * 0.67); // 0 at the base → 1 on top
    const leftness = (x - lx) / s;
    const tone = mix(dark, lit, Math.min(1, Math.max(0, up * 0.7 + leftness * 0.3 + rnd() * 0.25)));
    leaves.push({
      y: ly,
      svg:
        flat(ellipseD(lx, ly, r, r * 0.8), tone) +
        flat(ellipseD(lx - r * 0.25, ly - r * 0.25, r * 0.4, r * 0.3), mix(tone, '#FFFFFF', 0.3), {
          opacity: 0.6,
        }),
    });
  }
  leaves.sort((a, b) => b.y - a.y);
  parts.push(...leaves.map((l) => l.svg));
  return g({}, ...parts);
}

/** A dead branch lying on the sand: grey, twisted, lit along its top edge, a thin shadow. */
export function deadBranch(rnd: Rnd, x: number, y: number, len: number, look: NamibLook): string {
  const w = Math.max(1, len * 0.045);
  const pts: Pt[] = [];
  const dir = rnd() < 0.5 ? -1 : 1;
  for (let k = 0; k <= 5; k++)
    pts.push([x + dir * len * (k / 5), y + (rnd() - 0.5) * len * 0.08 - (k / 5) * len * 0.05]);
  const main = smoothD(pts, false, 0.6);
  let side = '';
  for (let k = 0; k < 3; k++) {
    const p = pts[1 + Math.floor(rnd() * 4)] ?? pts[0] ?? [x, y];
    const a = -Math.PI * (0.15 + rnd() * 0.3) * (rnd() < 0.5 ? 1 : 0.2);
    const l = len * (0.15 + rnd() * 0.2);
    side += `M${r2(p[0])} ${r2(p[1])}l${r2(Math.cos(a) * l * dir)} ${r2(Math.sin(a) * l)}`;
  }
  const shadowD = main.replace(
    /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_m, a: string, b: string) => `${r2(Number(a) + w * 0.6)} ${r2(Number(b) + w * 0.9)}`,
  );
  const stroke = (d: string, c: string, sw: number, op = 1): string =>
    el('path', {
      d,
      fill: 'none',
      stroke: c,
      'stroke-width': hair(sw),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: op,
    });
  const dark = mix(look.wood, look.shadow, 0.3);
  return g(
    {},
    stroke(shadowD, look.shadow, w * 1.1, 0.3),
    stroke(main + side, dark, w),
    stroke(main, mix(look.wood, '#FFFFFF', 0.3), w * 0.4, 0.9),
  );
}

/**
 * The plane's front edge as a natural sand ridge: a soft shadow below the crest (blurred) and a
 * lit crest line along it — no ink. Returns the svg to draw over the band.
 */
export function sandRidge(edge: readonly Pt[], look: NamibLook, k: number): string {
  const blur = softBlur(2.2 * k + 0.6);
  const d = smoothD(edge, false, 0.8);
  const down = (dy: number): string =>
    d.replace(
      /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
      (_m, a: string, b: string) => `${a} ${r2(Number(b) + dy)}`,
    );
  return g(
    {},
    el('defs', {}, blur.def),
    el('path', {
      d: down(3.2 * k),
      fill: 'none',
      stroke: look.sandDark,
      'stroke-width': 5 * k,
      opacity: 0.5,
      filter: `url(#${blur.id})`,
    }),
    el('path', {
      d: down(0.6 * k),
      fill: 'none',
      stroke: look.sandLit,
      'stroke-width': hair(1.6 * k),
      'stroke-linecap': 'round',
      opacity: 0.9,
    }),
  );
}

/** A soft vertical sand gradient for a band: paler and cooler at its top (aerial perspective). */
export function sandGradient(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): string {
  const id = nextId();
  return (
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id, x1: 0, y1: y0, x2: 0, y2: y1, gradientUnits: 'userSpaceOnUse' },
        ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
      ),
    ) + el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: `url(#${id})` })
  );
}

/** Scatter of grass clumps over a band: irregular spacing with bare sand between, many sizes. */
export function clumpField(
  rnd: Rnd,
  o: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
    /** Clump height at y0 and y1 (design px). */
    readonly h: readonly [number, number];
    /** Mean spacing (px) at y1; sparser toward y0. */
    readonly gap: number;
    readonly look: NamibLook;
    readonly avoid?: (x: number, y: number) => boolean;
    readonly detail?: boolean;
    /** Draws (or records) one clump; default: a bushman-grass clump in place. */
    readonly draw?: (x: number, y: number, h: number) => string;
  },
): { y: number; svg: string }[] {
  const items: { x: number; y: number; svg: string }[] = [];
  const area = (o.x1 - o.x0) * (o.y1 - o.y0);
  const n = Math.round(area / (o.gap * o.gap * 0.35));
  for (let k = 0; k < n; k++) {
    // Clustered: most clumps fall near a previous one (grass grows in patches).
    const prev = items.length > 0 && rnd() < 0.55 ? items[Math.floor(rnd() * items.length)] : null;
    const t = Math.pow(rnd(), 0.75);
    let y = o.y0 + t * (o.y1 - o.y0);
    let x = o.x0 + rnd() * (o.x1 - o.x0);
    if (prev !== null && prev !== undefined) {
      const pt = (prev.y - o.y0) / Math.max(1, o.y1 - o.y0);
      const r = o.gap * (0.3 + pt * 0.5);
      x = prev.x + (rnd() - 0.5) * r * 2;
      y = Math.min(o.y1, Math.max(o.y0, prev.y + (rnd() - 0.5) * r * 0.5));
    }
    const ty = (y - o.y0) / Math.max(1, o.y1 - o.y0);
    // Sparser into the distance: drop far ones more often.
    if (rnd() > 0.35 + ty * 0.65) continue;
    if (o.avoid?.(x, y) === true) continue;
    const base = o.h[0] + (o.h[1] - o.h[0]) * ty;
    const h = base * (0.35 + Math.pow(rnd(), 1.6) * 1.15);
    const item = {
      x,
      y,
      svg:
        o.draw === undefined
          ? bushmanClump(rnd, x, y, h, o.look, {
              detail: (o.detail ?? true) && h > 14,
              density: 0.7 + rnd() * 0.6,
              plumes: rnd() < 0.25 ? 0.2 : 0.9,
            })
          : o.draw(x, y, h),
    };
    items.push(item);
  }
  return items;
}

/** Y of a band edge at x (re-exported for the biome plans). */
export { yAt };

// --- the veld sheet and its placements (v1.7d, D-059) ---------------------------------------

/** Placements recorded while a layer renders (null = not recording: draw the svg in place). */
let veldSink: VeldSpot[] | null = null;

/** Starts recording placements (interim: around the Namibië layers' render). */
export function collectVeld<T>(draw: () => T): { result: T; spots: VeldSpot[] } {
  const prev = veldSink;
  veldSink = [];
  try {
    const result = draw();
    return { result, spots: veldSink };
  } finally {
    veldSink = prev;
  }
}

/**
 * A ground-cover sprite on `layer` at its foot (x, y), `size` design px (clump height, bush
 * radius or branch length): recorded as a placement while collecting; never baked (returns '').
 */
export function veldSprite(
  rnd: Rnd,
  layer: VeldLayer,
  kind: VeldKind,
  x: number,
  y: number,
  size: number,
): string {
  const v = Math.floor(rnd() * 3);
  const flip = rnd() < 0.5 ? 1 : 0;
  const f = veldFrameFor(kind, size, v);
  const def = VELD_FRAMES[f];
  if (def === undefined) return '';
  const s = size / def.ref;
  // Outside a collection (the HD layer render, previews) the ground cover is left out: the
  // sheet and VeldView draw it.
  veldSink?.push([
    VELD_LAYERS.indexOf(layer),
    f,
    Number(r2(x)),
    Number(r2(y)),
    Math.round(s * 100),
    flip,
  ]);
  return '';
}

/** The colours the sheet is drawn in: small classes (mid plane, hazed) and near ones. */
export interface VeldLooks {
  readonly far: NamibLook;
  readonly near: NamibLook;
}

/** One frame's drawing at its foot (0, 0), from a PRNG seeded by its name. */
export function drawVeldFrame(f: VeldFrameDef, looks: VeldLooks): string {
  let seed = 5381;
  for (let k = 0; k < f.name.length; k++) seed = (seed * 33 + f.name.charCodeAt(k)) >>> 0;
  const rnd = prng(seed);
  const look = f.ref < 20 || f.name.includes('_m_') ? looks.far : looks.near;
  switch (f.kind) {
    case 'grass':
      return bushmanClump(rnd, 0, 0, f.ref, look, {
        spread: 0.85,
        plumes: 0.9,
        density: f.ref > 100 ? 0.75 : 1,
        detail: f.ref > 18,
      });
    case 'tuft':
      return bushmanClump(rnd, 0, 0, f.ref, look, {
        spread: 0.8,
        plumes: 0.35,
        density: 0.8,
        detail: f.ref > 18,
      });
    case 'dry':
      return bushmanClump(
        rnd,
        0,
        0,
        f.ref,
        { ...look, grass: look.grassLit, grassBase: look.grass },
        {
          spread: 1,
          plumes: 0.15,
          density: 0.55,
        },
      );
    case 'dollar':
      return dollarBush(rnd, 0, 0, f.ref, look);
    case 'branch':
      return deadBranch(rnd, -f.ref / 2, 0, f.ref, look);
  }
}

/** The veld sheet at `k` texture px per design px (1 Standard, 2 HD). */
export function renderVeldSheet(k: number, looks: VeldLooks): Rgba {
  const cells = veldFrames().map((f) => {
    const id = nextId();
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, drawVeldFrame(f, looks)),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      VELD_SHEET_W * k,
      VELD_SHEET_H * k,
      [0, 0, VELD_SHEET_W, VELD_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}
