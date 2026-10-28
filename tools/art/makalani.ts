// 1.9.3 (D-056, art bible §4.2b): interim art for the makalani palm (Hyphaene petersiana) in the
// D-035 semi-realistic style of the camelthorn: form from gradients and layered tones, a warm-dark
// broken edge instead of a cartoon outline, small highlights where light catches; light from the
// upper left. Per plane one straight trunk and one crown (src/game/view/palms/makalaniSheet.ts
// frames; MakalaniView turns, stretches and combines them into groups), and the nut sheet.
// - Trunk: tall and slender, pale grey with faint leaf-scar rings, a gentle swelling a third of
//   the way up, a few old leaf bases under the crown, a flared foot in grass.
// - Crown: stiff, fan-shaped grey-green leaves on long spiny stalks radiating from the top, lit
//   upper left; dry brown fronds hang below in a skirt.
// - Nuts: nearly round, mostly glossy dark chestnut-brown with a highlight, some orange and green;
//   a motion-blurred twin each; fibre, husk and pale ivory chips for the crack-off and the pop.
// Coordinates: design px at plane scale 1 (each plane's texture is drawn scaled by its plane).
import {
  CROWN,
  NUT_MASTER,
  NUT_SHEET_H,
  NUT_SHEET_W,
  PALM_ART_SCALE,
  TRUNK,
  nutFrames,
  type NutFrame,
  type PalmArtPlane,
} from '../../src/game/view/palms/makalaniSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { mix, nextId, shade, type Pen, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, polyD, r2, svgDoc } from './svg';

/** What the drawing needs from the layer it stands on (hazed colours and the ink). */
export interface MakalaniPaint {
  readonly tint: (hex: string) => string;
  readonly pen: Pen;
  readonly rnd: Rnd;
}

const BARK = { lit: '#C2BEB2', mid: '#9A968A', dark: '#66625A' };
const FROND = { lit: '#B9C6A0', mid: '#8C9C78', dark: '#5C6A4E', vein: '#D6DEC2' };
const DRY = { lit: '#B8936A', mid: '#94704A', dark: '#644A30' };

function hGrad(id: string, stops: readonly [number, string][]): string {
  return el(
    'linearGradient',
    { id, x1: 0, y1: 0, x2: 1, y2: 0 },
    ...stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })),
  );
}

/** The trunk, straight up from its foot (0, 0) to (0, −TRUNK.len). */
export function makalaniTrunk(p: MakalaniPaint): string {
  const { rnd } = p;
  const len = TRUNK.len;
  const half = (y: number): number => {
    const f = -y / len;
    // Tapering from the flared foot, a gentle swelling a third of the way up.
    const swell = Math.exp(-(((f - 0.36) / 0.14) ** 2)) * 0.2;
    const flare = Math.max(0, 0.08 - f) * 2.2;
    return (TRUNK.w / 2) * (1 - 0.34 * f + swell + flare);
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let k = 0; k <= 40; k++) {
    const y = -(len * k) / 40;
    const wob = (rnd() - 0.5) * 0.8;
    left.push([-half(y) + wob, y]);
    right.push([half(y) + wob, y]);
  }
  const outline = [...left, ...right.reverse()];
  const id = nextId();
  const parts: string[] = [
    hGrad(id, [
      [0, p.tint(BARK.mid)],
      [0.18, p.tint(BARK.lit)],
      [0.42, p.tint(mix(BARK.lit, BARK.mid, 0.5))],
      [0.8, p.tint(BARK.dark)],
      [1, p.tint(shade(BARK.dark, -0.2))],
    ]),
    // Grass and a soft shadow at the foot.
    el('path', { d: ellipseD(4, 4, TRUNK.w * 0.62, 6), fill: '#2A1A14', opacity: 0.25 }),
    el('path', { d: polyD(outline), fill: `url(#${id})` }),
  ];
  // Faint leaf-scar rings: shallow arcs, darker below a lit lip.
  const rings: string[] = [];
  const lips: string[] = [];
  for (let y = -14; y > -len + 30; y -= 12 + rnd() * 16) {
    const w = half(y);
    const sag = 2 + rnd() * 2;
    rings.push(`M${r2(-w)} ${r2(y)}Q0 ${r2(y + sag)} ${r2(w)} ${r2(y - 1)}`);
    lips.push(
      `M${r2(-w * 0.85)} ${r2(y - 1.4)}Q${r2(-w * 0.3)} ${r2(y + sag - 1.6)} ${r2(w * 0.1)} ${r2(y - 0.8)}`,
    );
  }
  parts.push(
    el('path', {
      d: rings.join(''),
      fill: 'none',
      stroke: p.tint(BARK.dark),
      'stroke-width': 1.6,
      opacity: 0.55,
    }),
    el('path', {
      d: lips.join(''),
      fill: 'none',
      stroke: p.tint('#D8D4C8'),
      'stroke-width': 0.9,
      opacity: 0.5,
    }),
  );
  // A few fine vertical cracks.
  for (let k = 0; k < 6; k++) {
    const x = (rnd() - 0.5) * TRUNK.w * 0.6;
    const y0 = -rnd() * len * 0.9;
    parts.push(
      el('path', {
        d: `M${r2(x)} ${r2(y0)}l${r2((rnd() - 0.5) * 3)} ${r2(-30 - rnd() * 40)}`,
        stroke: p.tint(BARK.dark),
        'stroke-width': 0.8,
        opacity: 0.35,
        fill: 'none',
      }),
    );
  }
  // Old leaf bases under the crown: split, brown, angled up.
  for (let k = 0; k < 11; k++) {
    const y = -len + 8 + k * 13 + rnd() * 6;
    const side = k % 2 === 0 ? -1 : 1;
    const w = half(y);
    const tipX = side * (w + 6 + rnd() * 6);
    const tipY = y - 18 - rnd() * 8;
    const base: Pt[] = [
      [side * w * 0.2, y + 5],
      [side * (w + 2), y - 2],
      [tipX, tipY],
      [tipX - side * 6, tipY + 2],
    ];
    parts.push(
      el('path', {
        d: polyD(base),
        fill: p.tint(k % 3 === 0 ? DRY.dark : DRY.mid),
        stroke: p.pen.ink,
        'stroke-width': 0.8,
        'stroke-opacity': 0.5,
      }),
    );
  }
  // The warm-dark broken edge.
  const edge = (pts: readonly Pt[], dash: string): string =>
    el('path', {
      d: polyD(pts, false),
      fill: 'none',
      stroke: p.pen.ink,
      'stroke-width': 1.6,
      'stroke-opacity': 0.55,
      'stroke-dasharray': dash,
    });
  parts.push(edge(left, '60 6 30 4'), edge(right, '40 5 70 8'));
  // Grass at the foot.
  for (let k = 0; k < 14; k++) {
    const x = (rnd() - 0.5) * TRUNK.w * 0.9;
    const h = 6 + rnd() * 8;
    parts.push(
      el('path', {
        d: `M${r2(x)} ${r2(TRUNK.below - 2)}q${r2((rnd() - 0.5) * 6)} ${r2(-h * 0.6)} ${r2((rnd() - 0.5) * 8)} ${r2(-h)}`,
        stroke: p.tint(k % 2 === 0 ? '#6E8A44' : '#8EA05A'),
        'stroke-width': 1.6,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  }
  return g({}, ...parts);
}

/** One fan leaf: a stalk with fine spines from the crown base, a pleated fan at its end. */
function fanLeaf(
  p: MakalaniPaint,
  ang: number,
  stalk: number,
  r: number,
  dry: boolean,
  droop: number,
): string {
  const { rnd } = p;
  const c = dry ? DRY : FROND;
  // The stalk bends a little under the fan's weight.
  const ex = Math.cos(ang) * stalk;
  const ey = Math.sin(ang) * stalk + droop;
  const mx = Math.cos(ang) * stalk * 0.5;
  const my = Math.sin(ang) * stalk * 0.5 - droop * 0.2;
  const parts: string[] = [
    el('path', {
      d: `M0 0Q${r2(mx)} ${r2(my)} ${r2(ex)} ${r2(ey)}`,
      fill: 'none',
      stroke: p.tint(dry ? DRY.dark : shade(FROND.dark, -0.1)),
      'stroke-width': 3,
      'stroke-linecap': 'round',
    }),
  ];
  // Spines along the stalk (the makalani's petioles are toothed).
  const spines: string[] = [];
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    const x = 2 * (1 - t) * t * mx + t * t * ex;
    const y = 2 * (1 - t) * t * my + t * t * ey;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const s = k % 2 === 0 ? 1 : -1;
    spines.push(
      `M${r2(x)} ${r2(y)}l${r2(nx * 3.5 * s + Math.cos(ang) * 2)} ${r2(ny * 3.5 * s + Math.sin(ang) * 2)}`,
    );
  }
  parts.push(
    el('path', {
      d: spines.join(''),
      stroke: p.tint(DRY.dark),
      'stroke-width': 0.9,
      fill: 'none',
    }),
  );
  // The fan: segments opening from the stalk's end; folded, so lit and shaded alternate.
  const dir = dry ? ang + (Math.PI / 2 - ang) * 0.8 : ang;
  const spread = dry ? 0.8 : 1.0 + rnd() * 0.25;
  const segs = dry ? 7 : 13;
  const tips: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = dir - spread / 2 + (spread * i) / segs + (rnd() - 0.5) * 0.04;
    // Stiff, pleated segments: the middle ones longest, the tips split and a little ragged.
    const rr =
      r * (0.7 + 0.3 * Math.sin((i / segs) * Math.PI)) * (dry ? 1.15 : 1) * (0.94 + rnd() * 0.12);
    tips.push([ex + Math.cos(a) * rr, ey + Math.sin(a) * rr]);
  }
  // Light from the upper left: fans facing up-left are lit.
  const facing = Math.cos(dir - (-Math.PI * 3) / 4);
  const base = dry ? c.mid : facing > 0.3 ? mix(c.mid, c.lit, 0.6) : facing < -0.3 ? c.dark : c.mid;
  for (let i = 0; i < segs; i++) {
    const a = tips[i] as Pt;
    const b = tips[i + 1] as Pt;
    const lit = i % 2 === 0;
    // Split tips: each segment ends in a little notch.
    const nx = (a[0] + b[0]) / 2 + (ex - (a[0] + b[0]) / 2) * 0.08;
    const ny = (a[1] + b[1]) / 2 + (ey - (a[1] + b[1]) / 2) * 0.08;
    parts.push(
      el('path', {
        d: polyD([[ex, ey], a, [nx, ny], b]),
        fill: p.tint(lit ? shade(base, 0.08) : shade(base, -0.12)),
      }),
    );
  }
  // Pleat lines and a warm-dark broken rim.
  parts.push(
    el('path', {
      d: tips.map((t) => `M${r2(ex)} ${r2(ey)}L${r2(t[0])} ${r2(t[1])}`).join(''),
      stroke: p.tint(dry ? DRY.dark : FROND.vein),
      'stroke-width': 0.7,
      opacity: dry ? 0.5 : 0.45,
      fill: 'none',
    }),
    el('path', {
      d: polyD(tips, false),
      stroke: p.pen.ink,
      'stroke-width': 1.1,
      'stroke-opacity': 0.45,
      'stroke-dasharray': '14 3 8 2',
      fill: 'none',
    }),
  );
  return g({}, ...parts);
}

/** The crown: its base at (0, 0); fans reach CROWN.up above and CROWN.half aside, the dry
 *  skirt CROWN.down below. */
export function makalaniCrown(p: MakalaniPaint): string {
  const { rnd } = p;
  const back: string[] = [];
  const front: string[] = [];
  // The dry skirt first (behind): old fronds hanging down round the trunk top.
  for (let k = 0; k < 10; k++) {
    const a = Math.PI * (0.3 + (k / 9) * 0.4) + (rnd() - 0.5) * 0.08;
    back.push(fanLeaf(p, a, 30 + rnd() * 16, 58 + rnd() * 20, true, 0));
  }
  // Living fans: back ones (upward) first, then the sides, the front ones last.
  const fans: { a: number; z: number }[] = [];
  for (let k = 0; k < 20; k++) {
    const a = -Math.PI * (0.04 + (k / 19) * 0.92) + (rnd() - 0.5) * 0.12;
    fans.push({ a, z: rnd() });
  }
  for (let k = 0; k < 4; k++)
    fans.push({ a: Math.PI * (k < 2 ? 0.06 + k * 0.05 : 0.86 + (k - 2) * 0.05), z: 2 });
  fans.sort((a, b) => a.z - b.z);
  for (const f of fans) {
    const down = Math.sin(f.a) > -0.2;
    const stalk = down ? 40 + rnd() * 14 : 56 + rnd() * 24;
    const r = down ? 40 + rnd() * 10 : 46 + rnd() * 14;
    (f.z > 1 ? front : back).push(fanLeaf(p, f.a, stalk, r, false, down ? 18 : 6));
  }
  // The dark heart where the leaf bases meet.
  const heart = el('path', {
    d: ellipseD(0, -4, 16, 12),
    fill: p.tint('#4A4232'),
    stroke: p.pen.ink,
    'stroke-width': 1,
    'stroke-opacity': 0.5,
  });
  return g({}, ...back, heart, ...front);
}

/** A nut (radius r at (0, 0)): glossy, nearly round, a highlight upper left. */
function nut(colour: 'brown' | 'orange' | 'green', r: number, blur: boolean): string {
  const tones = {
    brown: { hi: '#9A5A30', mid: '#5E3018', dark: '#2E160A' },
    orange: { hi: '#F0A24A', mid: '#C8742A', dark: '#7E3E12' },
    green: { hi: '#B6C46A', mid: '#7C8E3E', dark: '#46561E' },
  }[colour];
  const id = nextId();
  const grad = el(
    'radialGradient',
    { id, cx: 0.36, cy: 0.32, r: 0.75 },
    el('stop', { offset: 0, 'stop-color': tones.hi }),
    el('stop', { offset: 0.45, 'stop-color': tones.mid }),
    el('stop', { offset: 1, 'stop-color': tones.dark }),
  );
  const body = el('path', {
    d: `M${r2(-r)} 0C${r2(-r)} ${r2(-r * 0.58)} ${r2(-r * 0.56)} ${r2(-r * 1.02)} 0 ${r2(-r * 1.02)}C${r2(r * 0.6)} ${r2(-r)} ${r2(r)} ${r2(-r * 0.55)} ${r2(r * 0.98)} 0C${r2(r)} ${r2(r * 0.6)} ${r2(r * 0.55)} ${r2(r)} 0 ${r2(r)}C${r2(-r * 0.58)} ${r2(r)} ${r2(-r)} ${r2(r * 0.55)} ${r2(-r)} 0Z`,
    fill: `url(#${id})`,
    stroke: '#24120A',
    'stroke-width': 0.9,
    'stroke-opacity': 0.7,
  });
  // The stalk scar (a small pale disc) and the gloss.
  const scar = el('path', {
    d: ellipseD(r * 0.1, -r * 0.82, r * 0.18, r * 0.1),
    fill: '#C9B48E',
    opacity: 0.8,
  });
  const gloss = el('path', {
    d: ellipseD(-r * 0.38, -r * 0.38, r * 0.26, r * 0.16),
    fill: '#FFFFFF',
    opacity: colour === 'brown' ? 0.6 : 0.45,
    transform: 'rotate(-35)',
  });
  if (!blur) return g({}, grad, body, scar, gloss);
  const fid = nextId();
  return g(
    {},
    grad,
    el(
      'filter',
      { id: fid, x: -0.5, y: -0.5, width: 2, height: 2 },
      el('feGaussianBlur', { stdDeviation: r * 0.14 }),
    ),
    g({ filter: `url(#${fid})`, opacity: 0.9 }, body, gloss),
  );
}

function bit(name: NutFrame, w: number, h: number): string {
  if (name === 'fibre')
    return g(
      {},
      el('path', {
        d: `M${r2(-w / 2)} ${r2(h * 0.2)}Q0 ${r2(-h / 2)} ${r2(w / 2)} ${r2(h * 0.1)}M${r2(-w * 0.4)} ${r2(h * 0.4)}Q0 ${r2(-h * 0.1)} ${r2(w * 0.45)} ${r2(h * 0.4)}`,
        stroke: '#A07A4A',
        'stroke-width': 1.1,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  if (name === 'husk')
    return el('path', {
      d: polyD([
        [-w / 2, -h * 0.2],
        [-w * 0.1, -h / 2],
        [w / 2, -h * 0.25],
        [w * 0.3, h / 2],
        [-w * 0.35, h * 0.35],
      ]),
      fill: '#5A3018',
      stroke: '#24120A',
      'stroke-width': 0.7,
    });
  // An ivory chip: pale, a shaded facet.
  return g(
    {},
    el('path', {
      d: polyD([
        [-w / 2, h * 0.1],
        [-w * 0.15, -h / 2],
        [w / 2, -h * 0.15],
        [w * 0.2, h / 2],
      ]),
      fill: '#F2EADA',
      stroke: '#8A7A5E',
      'stroke-width': 0.6,
    }),
    el('path', {
      d: polyD([
        [w * 0.05, -h * 0.05],
        [w / 2, -h * 0.15],
        [w * 0.2, h / 2],
      ]),
      fill: '#D6CAB0',
    }),
  );
}

/** The nut sheet at NUT_MASTER × (makalaniSheet.ts frames). */
export function renderNutSheet(nutR: number): Rgba {
  const k = NUT_MASTER;
  const items = nutFrames().map((f) => {
    const [kind, colour, blur] = f.name.split('_');
    const body =
      kind === 'nut'
        ? nut((colour ?? 'brown') as 'brown' | 'orange' | 'green', nutR, blur === 'blur')
        : bit(f.name, f.w, f.h);
    return g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, body);
  });
  return renderSvg(
    svgDoc(NUT_SHEET_W * k, NUT_SHEET_H * k, [0, 0, NUT_SHEET_W, NUT_SHEET_H], '', g({}, ...items)),
  );
}

/** A whole palm (far silhouettes in the layers): grey slender trunk, a fan crown, a dry skirt
 *  and a dark nut cluster, at (x, foot), `h` tall. `detail` far: shapes only. */
export function makalaniPalm(
  rnd: Rnd,
  x: number,
  foot: number,
  h: number,
  p: { tint: (hex: string) => string; pen: Pen },
  lean = 0,
): string {
  const tw = Math.max(1.4, h * 0.035);
  const tx = x + lean * h;
  const ty = foot - h;
  const trunk = p.tint(BARK.mid);
  const ink = mix(p.pen.ink, trunk, 0.4);
  const d = `M${r2(x)} ${r2(foot)}Q${r2(x + lean * h * 0.15)} ${r2(foot - h * 0.6)} ${r2(tx)} ${r2(ty)}`;
  const parts: string[] = [
    el('path', { d, fill: 'none', stroke: ink, 'stroke-width': tw + 1, 'stroke-linecap': 'round' }),
    el('path', { d, fill: 'none', stroke: trunk, 'stroke-width': tw, 'stroke-linecap': 'round' }),
  ];
  const R = h * 0.2;
  // The dry skirt.
  parts.push(
    el('path', {
      d: polyD([
        [tx - R * 0.35, ty],
        [tx + R * 0.35, ty],
        [tx + R * 0.22, ty + R * 0.7],
        [tx - R * 0.26, ty + R * 0.66],
      ]),
      fill: p.tint(DRY.mid),
    }),
  );
  // Fans: a round head of wedges, lit upper left.
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI * (0.02 + (k / (n - 1)) * 0.96) + (rnd() - 0.5) * 0.1;
    const rr = R * (0.85 + rnd() * 0.3);
    const ex = tx + Math.cos(a) * rr * 0.55;
    const ey = ty + Math.sin(a) * rr * 0.5;
    const pts: Pt[] = [[ex, ey]];
    for (let i = 0; i <= 4; i++) {
      const aa = a - 0.55 + (1.1 * i) / 4;
      pts.push([ex + Math.cos(aa) * rr * 0.55, ey + Math.sin(aa) * rr * 0.45]);
    }
    const lit = Math.cos(a) < 0;
    parts.push(
      el('path', {
        d: `M${r2(tx)} ${r2(ty)}L${r2(ex)} ${r2(ey)}`,
        stroke: p.tint(FROND.dark),
        'stroke-width': Math.max(0.5, tw * 0.3),
        fill: 'none',
      }),
      el('path', {
        d: polyD(pts),
        fill: p.tint(lit ? FROND.lit : FROND.mid),
        stroke: ink,
        'stroke-width': 0.5,
      }),
    );
  }
  // A nut cluster under the head.
  if (h > 40)
    parts.push(
      el('path', {
        d: ellipseD(tx + R * 0.15, ty + R * 0.45, R * 0.14, R * 0.12),
        fill: p.tint('#3E2210'),
      }),
    );
  return g({}, ...parts);
}

/** The plane's trunk and crown, at that plane's scale (frames from makalaniSheet.ts). */
/** 1.9.3 review M13: the crown drawn × this (it spreads about a third of the trunk's height). */
const CROWN_DRAW = 1.3;

export function palmPart(part: 'trunk' | 'crown', plane: PalmArtPlane, p: MakalaniPaint): string {
  const s = PALM_ART_SCALE[plane];
  return g(
    { transform: `scale(${r2(s)})` },
    part === 'trunk'
      ? makalaniTrunk(p)
      : g({ transform: `scale(${r2(CROWN_DRAW)})` }, makalaniCrown(p)),
  );
}

/** Frame reach of the crown (for tests). */
export const CROWN_REACH = CROWN;
