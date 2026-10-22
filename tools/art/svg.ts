// Small SVG-building helpers for the interim art generator (D-029). Pure string building; numbers
// are rounded so the same input always gives the same SVG text (and the same pixels).

export const r2 = (n: number): string => String(Math.round(n * 100) / 100);

export type Attrs = Readonly<Record<string, string | number | undefined>>;

export function el(tag: string, attrs: Attrs, ...children: string[]): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? r2(v) : v}"`)
    .join('');
  return children.length === 0 ? `<${tag}${a}/>` : `<${tag}${a}>${children.join('')}</${tag}>`;
}

export const g = (attrs: Attrs, ...children: string[]): string => el('g', attrs, ...children);

/** A filled shape with a warm-black ink outline (bible §1 rule 1). */
export function inked(
  d: string,
  fill: string,
  ink: string,
  width: number,
  extra: Attrs = {},
): string {
  return el('path', {
    d,
    fill,
    stroke: width > 0 ? ink : 'none',
    'stroke-width': width > 0 ? width : undefined,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    ...extra,
  });
}

/** An ellipse as path data. */
export function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0Z`;
}

/** A polyline/polygon as path data. */
export function polyD(pts: readonly (readonly [number, number])[], close = true): string {
  return (
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`).join('') + (close ? 'Z' : '')
  );
}

/**
 * A smooth closed shape through the points (Catmull-Rom → cubic Béziers), the workhorse for
 * organic outlines (bodies, wings, wood).
 */
export function smoothD(
  pts: readonly (readonly [number, number])[],
  close = true,
  tension = 1,
): string {
  const n = pts.length;
  if (n < 3) return polyD(pts, close);
  const p = (i: number): readonly [number, number] => {
    const k = close ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
    return pts[k] ?? [0, 0];
  };
  let d = `M${r2(p(0)[0])} ${r2(p(0)[1])}`;
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [x0, y0] = p(i - 1);
    const [x1, y1] = p(i);
    const [x2, y2] = p(i + 1);
    const [x3, y3] = p(i + 2);
    const t = tension / 6;
    d += `C${r2(x1 + (x2 - x0) * t)} ${r2(y1 + (y2 - y0) * t)} ${r2(x2 - (x3 - x1) * t)} ${r2(y2 - (y3 - y1) * t)} ${r2(x2)} ${r2(y2)}`;
  }
  return d + (close ? 'Z' : '');
}

/** Rotates and moves points: the poses are built from parts in their own frames. */
export function place(
  pts: readonly (readonly [number, number])[],
  dx: number,
  dy: number,
  deg = 0,
  sx = 1,
  sy = 1,
): [number, number][] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [dx + x * sx * c - y * sy * s, dy + x * sx * s + y * sy * c]);
}

/** Seeded PRNG (mulberry32): dots, grain and scratches are the same on every run. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The hand-drawn wobble filter (turbulence displacement), or '' when off. */
export function wobbleFilter(id: string, frequency: number, scale: number, seed: number): string {
  if (scale <= 0) return '';
  return el(
    'filter',
    {
      id,
      x: '-5%',
      y: '-5%',
      width: '110%',
      height: '110%',
      'color-interpolation-filters': 'sRGB',
    },
    el('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: frequency,
      numOctaves: 2,
      seed,
      result: 'n',
    }),
    el('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'n',
      scale,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
    }),
  );
}

/** A whole SVG document with a view box in art units, rendered at width × height px. */
export function svgDoc(
  width: number,
  height: number,
  viewBox: readonly [number, number, number, number],
  defs: string,
  body: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox.map(r2).join(' ')}" preserveAspectRatio="none">${defs === '' ? '' : `<defs>${defs}</defs>`}${body}</svg>`;
}
