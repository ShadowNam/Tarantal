// v1.7e (D-061, product owner 25 Oct: "the rocks and the middle distances look a little bit
// childish, cartoonish; they need to look more realistic"): Bushveld granite without ink.
// A boulder is a weathered, rounded-but-faceted block lit from the upper left: a soft light-to-
// shade gradient, darker tones (not a black line) toward its rim, a dark undercut and a soft
// contact shadow, onion-skin exfoliation shells with a lit lip and a shadow under each, fresher
// pinkish rock where a shell has flaked off, black rain streaks running down from the crown,
// lichen rosettes (orange, grey-green, pale), cracks with grass in them, and a fine granite grain.
// Coordinates as in rocks.ts: the boulder stands on (x, y), `w` wide and `h` tall.
// Pure: (rnd, arguments) → SVG.
import { blurFilter, ringNoise } from './camelthorn';
import { mix, nextId, shade, type Pt, type Rnd } from './scenery';
import { el, ellipseD, g, r2, smoothD } from './svg';

export interface GraniteLook {
  readonly base: string;
  readonly lit: string;
  readonly shade: string;
  /** The deepest tone (undercuts, crevices). */
  readonly deep: string;
  /** Freshly exposed rock where a shell flaked off (pinker, lighter). */
  readonly fresh: string;
  /** Black rain streaks (cyanobacteria) down from the crown. */
  readonly streak: string;
  /** Iron staining (ochre). */
  readonly stain: string;
  readonly lichen: readonly string[];
  readonly grass: string;
  readonly grassDark: string;
}

/** Bushveld granite, hazed for its plane by `tint`. */
export function bushveldGranite(tint: (hex: string) => string, grass = '#C9B98F'): GraniteLook {
  const base = tint('#A59A8C');
  return {
    base,
    lit: tint('#DCD2C2'),
    shade: tint('#6C635C'),
    deep: tint('#3A3430'),
    fresh: tint('#C7AE98'),
    streak: tint('#4A4643'),
    stain: tint('#B08458'),
    lichen: [tint('#D08A3C'), tint('#A7AA84'), tint('#D6D2C2'), tint('#C6B45A')],
    grass: tint(grass),
    grassDark: tint(shade(grass, -0.35)),
  };
}

export interface GraniteOpts {
  /** A deep crack (the boulder_crack secret): centred at (x, y), `len` long. */
  readonly crack?: { readonly x: number; readonly y: number; readonly len: number };
  /** Grass at the foot and in cracks (default true). */
  readonly grass?: boolean;
  /** Fine detail (grain, lichen, shells); off for small far rocks. */
  readonly detail?: boolean;
  /** The contact shadow on the ground (default true; off for rocks resting on rocks). */
  readonly shadow?: boolean;
  /** Undercut: how much narrower the foot is than the body (0 … 0.3, default 0.12). */
  readonly undercut?: number;
  /** Flatter top (0 = dome … 1 = flat-topped block, default random 0.1 … 0.5). */
  readonly flat?: number;
}

/** The boulder's outline points, foot to foot over the crown. */
function outline(rnd: Rnd, x: number, y: number, w: number, h: number, o: GraniteOpts): Pt[] {
  const n = ringNoise(rnd, 2, 9, 0.5);
  const hw = w / 2;
  const flat = o.flat ?? 0.1 + rnd() * 0.4;
  const cut = o.undercut ?? 0.12;
  const pts: Pt[] = [];
  const steps = 28;
  for (let k = 0; k < steps; k++) {
    const f = k / (steps - 1);
    const t = Math.PI * (1 + f);
    const r = 1 + n(t * 1.6) * 0.09;
    const s = Math.abs(Math.sin(t));
    // A dome flattened toward a block by `flat`; the widest point a little above the foot.
    const lift = Math.pow(s, 0.6 + flat * 0.9) * (1 - flat * 0.25) + flat * 0.25 * Math.pow(s, 0.2);
    const px = x + Math.cos(t) * hw * r;
    const py = y - h * 0.12 - h * 0.88 * lift * r;
    pts.push([px, Math.min(y - h * 0.08, py)]);
  }
  // The undercut: the foot tucks in under the body.
  pts.push([x + hw * (0.96 - cut), y - h * 0.03], [x + hw * (0.9 - cut), y]);
  pts.push([x - hw * (0.9 - cut * 0.6), y], [x - hw * (0.97 - cut * 0.6), y - h * 0.04]);
  return pts;
}

/** One granite boulder. */
export function graniteBoulder(
  rnd: Rnd,
  x: number,
  y: number,
  w: number,
  h: number,
  look: GraniteLook,
  o: GraniteOpts = {},
): string {
  const detail = o.detail !== false && w > 40;
  const hw = w / 2;
  const pts = outline(rnd, x, y, w, h, o);
  const d = smoothD(pts, true, 0.55);
  const clip = nextId();
  const grad = nextId();
  const parts: string[] = [];
  const inner: string[] = [];
  if (o.shadow !== false) {
    const blur = blurFilter(Math.max(1, h * 0.06));
    parts.push(
      blur.def,
      el('path', {
        d: ellipseD(x + w * 0.06, y + 1, hw * 1.02, Math.max(2.5, h * 0.09)),
        fill: '#231B16',
        opacity: 0.38,
        filter: `url(#${blur.id})`,
      }),
    );
  }
  parts.push(
    el(
      'linearGradient',
      { id: grad, x1: 0, y1: 0, x2: 1, y2: 1 },
      el('stop', { offset: 0, 'stop-color': look.lit }),
      el('stop', { offset: 0.42, 'stop-color': look.base }),
      el('stop', { offset: 1, 'stop-color': look.shade }),
    ),
    el('clipPath', { id: clip }, el('path', { d })),
    el('path', { d, fill: `url(#${grad})` }),
  );
  // Facets: broad planes from a ridge point, lit or shaded by which way they face (soft).
  const peak: Pt = [x - hw * 0.12 + (rnd() - 0.5) * hw * 0.25, y - h * 0.68];
  const rim = pts.slice(0, 28);
  for (let k = 0; k + 4 < rim.length; k += 4) {
    const a = rim[k] as Pt;
    const b = rim[k + 4] as Pt;
    const mx = (a[0] + b[0]) / 2 - peak[0];
    const my = (a[1] + b[1]) / 2 - peak[1];
    const len = Math.hypot(mx, my) || 1;
    const lum = (-mx / len) * 0.6 + (-my / len) * 0.7;
    if (Math.abs(lum) < 0.25) continue;
    inner.push(
      el('path', {
        d: `M${r2(peak[0])} ${r2(peak[1])}L${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}Z`,
        fill: lum > 0 ? look.lit : look.shade,
        opacity: r2(Math.min(0.4, Math.abs(lum) * 0.35)),
      }),
    );
  }
  // Darker toward the rim (form shadow), deep under the belly, a faint bounce at the very foot.
  const rimBlur = blurFilter(Math.max(1.2, w * 0.035));
  const belly = blurFilter(Math.max(1.5, h * 0.08));
  inner.push(
    rimBlur.def,
    belly.def,
    el('path', {
      d,
      fill: 'none',
      stroke: look.shade,
      'stroke-width': r2(Math.max(2, w * 0.07)),
      opacity: 0.55,
      transform: `translate(${r2(w * 0.035)} ${r2(h * 0.05)})`,
      filter: `url(#${rimBlur.id})`,
    }),
    el('path', {
      d: ellipseD(x + hw * 0.18, y - h * 0.02, hw * 1.05, h * 0.3),
      fill: look.deep,
      opacity: 0.55,
      filter: `url(#${belly.id})`,
    }),
    el('path', {
      d: ellipseD(x + hw * 0.05, y - h * 0.05, hw * 0.6, h * 0.05),
      fill: look.base,
      opacity: 0.3,
    }),
  );
  // Warm iron-stained patches (grey granite weathers ochre in places).
  const wash = blurFilter(Math.max(1.5, w * 0.06));
  const washes: string[] = [];
  for (let k = 0; k < 2; k++)
    washes.push(
      ellipseD(
        x + (rnd() - 0.5) * hw * 1.2,
        y - h * (0.25 + rnd() * 0.4),
        hw * (0.25 + rnd() * 0.3),
        h * (0.15 + rnd() * 0.15),
      ),
    );
  inner.push(
    wash.def,
    el('path', { d: washes.join(''), fill: look.stain, opacity: 0.28, filter: `url(#${wash.id})` }),
  );
  if (detail) {
    // Granite grain: a fractal noise mottle, dark and light, very low contrast.
    const grain = nextId();
    const freq = r2(Math.min(0.35, 9 / Math.max(20, w)));
    inner.push(
      el(
        'filter',
        { id: grain, x: 0, y: 0, width: 1, height: 1 },
        el('feTurbulence', {
          type: 'fractalNoise',
          baseFrequency: freq,
          numOctaves: 3,
          seed: Math.floor(rnd() * 1000),
        }),
        el('feColorMatrix', {
          type: 'matrix',
          values: '0 0 0 0 0.16  0 0 0 0 0.14  0 0 0 0 0.12  3.4 0 0 0 -1.45',
        }),
      ),
      el('rect', {
        x: r2(x - hw),
        y: r2(y - h * 1.1),
        width: r2(w),
        height: r2(h * 1.1),
        filter: `url(#${grain})`,
        opacity: 0.8,
      }),
    );
    // Exfoliation shells: the crown's curve repeated lower, a shadow under each lip, a lit lip;
    // where a shell has gone, fresher pinkish rock.
    const shells = 1 + Math.floor(rnd() * 2);
    const lipBlur = blurFilter(Math.max(0.5, h * 0.012));
    inner.push(lipBlur.def);
    for (let s = 0; s < shells; s++) {
      const drop = h * (0.07 + s * 0.12 + rnd() * 0.05);
      const k0 = 6 + Math.floor(rnd() * 6);
      const k1 = Math.min(rim.length - 6, k0 + 5 + Math.floor(rnd() * 6));
      const seg = rim
        .slice(k0, k1)
        .map(([px, py]): Pt => [x + (px - x) * (1 - s * 0.08), py + drop]);
      if (seg.length < 3) continue;
      const lip = smoothD(seg, false, 0.6);
      if (rnd() < 0.5) {
        const back = seg.map(([px, py]): Pt => [px, py - drop * 0.55]).reverse();
        inner.push(
          el('path', { d: smoothD([...seg, ...back], true, 0.6), fill: look.fresh, opacity: 0.45 }),
        );
      }
      inner.push(
        el('path', {
          d: lip,
          fill: 'none',
          stroke: look.deep,
          'stroke-width': r2(Math.max(1, h * 0.03)),
          opacity: 0.4,
          transform: `translate(0 ${r2(Math.max(1, h * 0.022))})`,
          'stroke-linecap': 'round',
          filter: `url(#${lipBlur.id})`,
        }),
        el('path', {
          d: lip,
          fill: 'none',
          stroke: look.lit,
          'stroke-width': r2(Math.max(0.8, h * 0.014)),
          opacity: 0.5,
          'stroke-linecap': 'round',
        }),
      );
    }
    // Black rain streaks running down from the crown.
    const streaks: string[] = [];
    for (let k = 0; k < 3 + Math.floor(rnd() * 4); k++) {
      const sx = x + (rnd() - 0.5) * hw * 1.4;
      const sy = y - h * (0.75 + rnd() * 0.2);
      const len = h * (0.3 + rnd() * 0.45);
      const sw = Math.max(1, w * (0.01 + rnd() * 0.025));
      streaks.push(
        `M${r2(sx - sw)} ${r2(sy)}Q${r2(sx - sw * 0.6)} ${r2(sy + len * 0.6)} ${r2(sx + (rnd() - 0.5) * sw)} ${r2(sy + len)}Q${r2(sx + sw * 0.6)} ${r2(sy + len * 0.6)} ${r2(sx + sw)} ${r2(sy)}Z`,
      );
    }
    const sBlur = blurFilter(Math.max(0.6, w * 0.006));
    inner.push(
      sBlur.def,
      el('path', {
        d: streaks.join(''),
        fill: look.streak,
        opacity: 0.32,
        filter: `url(#${sBlur.id})`,
      }),
    );
    // Lichen rosettes in clusters on the lit upper half.
    const bins: string[][] = look.lichen.map(() => []);
    for (let c = 0; c < 3 + Math.floor(w / 60); c++) {
      const a = Math.PI * (1.08 + rnd() * 0.84);
      const rr = 0.25 + rnd() * 0.6;
      const cx = x + Math.cos(a) * hw * rr;
      const cy = y - h * 0.45 + Math.sin(a) * h * 0.5 * rr;
      const kind = Math.floor(rnd() * look.lichen.length);
      const size = Math.max(0.8, w * (0.008 + rnd() * 0.01));
      for (let k = 0; k < 4 + Math.floor(rnd() * 10); k++) {
        const r = Math.sqrt(rnd()) * size * 4;
        const t = rnd() * Math.PI * 2;
        const s = size * (0.5 + rnd() * 0.9);
        bins[kind]?.push(ellipseD(cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.7, s, s * 0.75));
      }
    }
    bins.forEach((ds, i) => {
      if (ds.length > 0)
        inner.push(el('path', { d: ds.join(''), fill: look.lichen[i] ?? look.lit, opacity: 0.8 }));
    });
  }
  // Cracks: jagged, dark, with a lit edge on the left.
  const crackD = (sx: number, sy: number, len: number, lean: number): string => {
    let dd = `M${r2(sx)} ${r2(sy)}`;
    let cx = sx;
    let cy = sy;
    for (let k = 0; k < 6; k++) {
      cx += (rnd() - 0.5 + lean) * len * 0.3;
      cy += len / 6;
      dd += `L${r2(cx)} ${r2(cy)}`;
    }
    return dd;
  };
  const cracks: string[] = [];
  const crackW: number[] = [];
  if (o.crack !== undefined) {
    cracks.push(crackD(o.crack.x, o.crack.y - o.crack.len * 0.5, o.crack.len, 0));
    crackW.push(Math.max(2, w * 0.03));
  }
  if (detail)
    for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) {
      cracks.push(
        crackD(
          x + (rnd() - 0.4) * hw,
          y - h * (0.6 + rnd() * 0.25),
          h * (0.3 + rnd() * 0.4),
          (rnd() - 0.5) * 0.3,
        ),
      );
      crackW.push(Math.max(1, w * 0.012));
    }
  cracks.forEach((c, i) => {
    const cw = crackW[i] ?? 1;
    inner.push(
      el('path', {
        d: c,
        fill: 'none',
        stroke: look.lit,
        'stroke-width': r2(cw * 0.6),
        opacity: 0.6,
        transform: `translate(${r2(-cw * 0.7)} 0)`,
      }),
      el('path', {
        d: c,
        fill: 'none',
        stroke: look.deep,
        'stroke-width': r2(cw),
        'stroke-linejoin': 'round',
        opacity: 0.85,
      }),
    );
  });
  parts.push(g({ 'clip-path': `url(#${clip})` }, ...inner));
  // The crevice where it meets the ground: soft and dark, no line.
  const foot = blurFilter(Math.max(0.8, h * 0.025));
  parts.push(
    foot.def,
    el('path', {
      d: ellipseD(x + hw * 0.05, y - 0.5, hw * 0.82, Math.max(1.2, h * 0.035)),
      fill: look.deep,
      opacity: 0.7,
      filter: `url(#${foot.id})`,
    }),
  );
  if (o.grass !== false) parts.push(graniteGrass(rnd, x, y, w, h, look));
  return g({}, ...parts);
}

/** Grass tufts breaking over the foot, and one in the shade of a crack. */
function graniteGrass(
  rnd: Rnd,
  x: number,
  y: number,
  w: number,
  h: number,
  look: GraniteLook,
): string {
  const hw = w / 2;
  const dark: string[] = [];
  const lit: string[] = [];
  const tufts = 2 + Math.floor(rnd() * 3);
  for (let k = 0; k < tufts; k++) {
    const tx = x + (rnd() - 0.5) * hw * 2.1;
    const ty = y + 1 + rnd() * 2;
    const th = Math.max(5, h * (0.12 + rnd() * 0.14));
    for (let b = 0; b < 9; b++) {
      const a = -Math.PI / 2 + (b / 8 - 0.5) * 1.5 + (rnd() - 0.5) * 0.3;
      const bh = th * (0.6 + rnd() * 0.5);
      const s = `M${r2(tx + (rnd() - 0.5) * 3)} ${r2(ty)}q${r2(Math.cos(a) * bh * 0.3)} ${r2(Math.sin(a) * bh * 0.6)} ${r2(Math.cos(a) * bh * 0.65)} ${r2(Math.sin(a) * bh)}`;
      (b % 3 === 0 ? dark : lit).push(s);
    }
  }
  const sw = Math.max(0.7, w * 0.008);
  return g(
    {},
    el('path', {
      d: dark.join(''),
      fill: 'none',
      stroke: look.grassDark,
      'stroke-width': r2(sw * 1.3),
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: lit.join(''),
      fill: 'none',
      stroke: look.grass,
      'stroke-width': r2(sw),
      'stroke-linecap': 'round',
    }),
  );
}

/** A heap of boulders (a koppie or a pile), back to front. */
export function granitePile(
  rnd: Rnd,
  x: number,
  base: number,
  w: number,
  h: number,
  look: GraniteLook,
  n = 5,
  o: GraniteOpts = {},
): string {
  const rocks: [number, number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0 : k / (n - 1) - 0.5;
    const rw = w * (0.32 + rnd() * 0.16);
    const rh = h * (0.4 + rnd() * 0.18);
    const lift = Math.max(0, 1 - Math.abs(f) * 1.6) * h * 0.4;
    rocks.push([x + f * w * 0.72 + (rnd() - 0.5) * w * 0.06, base - lift, rw, rh]);
  }
  rocks.sort((a, b) => a[1] - b[1]);
  return g(
    {},
    ...rocks.map(([rx, ry, rw, rh]) =>
      graniteBoulder(rnd, rx, ry, rw, rh, look, {
        ...o,
        shadow: ry >= base - 1,
        grass: o.grass !== false && ry >= base - h * 0.1,
      }),
    ),
  );
}

/**
 * A dwala: a low sheet of bare granite breaking through the grass, its surface textured (grain,
 * cracks, lichen, dark water stains), its edges ragged and overgrown by grass; no outline.
 */
export function dwala(
  rnd: Rnd,
  x: number,
  y: number,
  w: number,
  h: number,
  look: GraniteLook,
): string {
  const hw = w / 2;
  const n = ringNoise(rnd, 2, 8, 0.6);
  const pts: Pt[] = [];
  for (let k = 0; k < 24; k++) {
    const t = (k / 24) * Math.PI * 2;
    const r = 1 + n(t) * 0.2;
    const top = Math.sin(t) < 0 ? 1 : 0.35;
    pts.push([x + Math.cos(t) * hw * r, y + Math.sin(t) * h * r * top]);
  }
  const d = smoothD(pts, true, 0.7);
  const clip = nextId();
  const grad = nextId();
  const inner: string[] = [];
  // Dark water stains (no noise grain on the sheets: it costs too many bytes in a layer).
  const stains: string[] = [];
  for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++)
    stains.push(
      ellipseD(
        x + (rnd() - 0.5) * w * 0.7,
        y + (rnd() - 0.3) * h * 0.4,
        w * (0.06 + rnd() * 0.08),
        h * (0.12 + rnd() * 0.12),
      ),
    );
  const sBlur = blurFilter(Math.max(1, h * 0.12));
  inner.push(
    sBlur.def,
    el('path', {
      d: stains.join(''),
      fill: look.streak,
      opacity: 0.28,
      filter: `url(#${sBlur.id})`,
    }),
  );
  // Joints across the sheet: a dark crack with a lit lip.
  const joints: string[] = [];
  for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) {
    let jx = x + (rnd() - 0.5) * w * 0.8;
    let jy = y - h * 0.9;
    let dd = `M${r2(jx)} ${r2(jy)}`;
    for (let s = 0; s < 5; s++) {
      jx += (rnd() - 0.5) * w * 0.08;
      jy += h * 0.4;
      dd += `L${r2(jx)} ${r2(jy)}`;
    }
    joints.push(dd);
  }
  const jw = Math.max(1, h * 0.06);
  inner.push(
    el('path', {
      d: joints.join(''),
      fill: 'none',
      stroke: look.lit,
      'stroke-width': r2(jw * 0.6),
      opacity: 0.5,
      transform: `translate(${r2(-jw * 0.8)} 0)`,
    }),
    el('path', {
      d: joints.join(''),
      fill: 'none',
      stroke: look.deep,
      'stroke-width': r2(jw),
      opacity: 0.7,
    }),
  );
  // Lichen flecks.
  const lich: string[] = [];
  for (let k = 0; k < Math.round(w / 12); k++)
    lich.push(
      ellipseD(
        x + (rnd() - 0.5) * w * 0.9,
        y + (rnd() - 0.6) * h * 0.8,
        Math.max(0.8, w * 0.008),
        Math.max(0.6, w * 0.005),
      ),
    );
  inner.push(
    el('path', {
      d: lich.join(''),
      fill: look.lichen[rnd() < 0.5 ? 0 : 2] ?? look.lit,
      opacity: 0.7,
    }),
  );
  // The far rim catches the light; the near edge sinks into shade.
  const rim = blurFilter(Math.max(1, h * 0.1));
  inner.push(
    rim.def,
    el('path', {
      d: ellipseD(x + hw * 0.1, y + h * 0.35, hw * 1.05, h * 0.35),
      fill: look.shade,
      opacity: 0.45,
      filter: `url(#${rim.id})`,
    }),
  );
  const parts = [
    el(
      'linearGradient',
      { id: grad, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': mix(look.lit, look.base, 0.4) }),
      el('stop', { offset: 1, 'stop-color': look.base }),
    ),
    el('clipPath', { id: clip }, el('path', { d })),
    el('path', { d, fill: `url(#${grad})` }),
    g({ 'clip-path': `url(#${clip})` }, ...inner),
  ];
  // Grass overgrowing the ragged near edge.
  const blades: string[] = [];
  for (let k = 0; k < Math.round(w / 6); k++) {
    const t = rnd() * Math.PI;
    const bx = x + Math.cos(t) * hw * (0.9 + rnd() * 0.15);
    const by = y + Math.sin(t) * h * 0.35 + 1;
    const bh = Math.max(3, h * (0.35 + rnd() * 0.5));
    blades.push(`M${r2(bx)} ${r2(by)}l${r2((rnd() - 0.5) * bh * 0.6)} ${r2(-bh)}`);
  }
  parts.push(
    el('path', {
      d: blades.join(''),
      fill: 'none',
      stroke: look.grass,
      'stroke-width': r2(Math.max(0.8, h * 0.05)),
      'stroke-linecap': 'round',
    }),
  );
  return g({}, ...parts);
}
