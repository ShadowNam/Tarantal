// Interim parallax layers and props (D-031). A biome module describes each layer as SVG in layer
// coordinates (x 0 … full width incl. bleed, y = design y) and each prop in its own coordinates
// (origin = the prop's content position, so `occluder.ox/oy` and secret part offsets line up).
// Layers render at 1× (they are already at design px); props at masterScale and are averaged down.
import type { Biome, ContentBundle } from '../../src/content/schemas';
import { coreWidth, LAYER_BLEED_PX } from '../../src/sim/world';
import { resize, type Rgba } from '../assets/image';
import { biomePalette, type ArtConfig } from './config';
import { renderSvg } from './raster';
import { mix, resetIds, type Pen, type Rnd } from './scenery';
import { el, g, prng, svgDoc, wobbleFilter } from './svg';

export interface PaintCtx {
  /** Palette colour by name, already hazed toward the horizon for this layer. */
  readonly c: (name: string) => string;
  /** The raw palette colour (no haze). */
  readonly raw: (name: string) => string;
  readonly pen: Pen;
  readonly rnd: Rnd;
  /** v1.6 (D-042): any colour hazed toward the horizon like this layer's palette. */
  readonly tint: (hex: string) => string;
}

export interface LayerCtx extends PaintCtx {
  /** Full layer width incl. bleed (px). */
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
  /** Layer x of a content `u` (0 … 1 across the core width). */
  readonly u: (u: number) => number;
}

export interface LayerPlan {
  /** Design y of the art's top edge and its height (docs/06 §4: may start above the band). */
  readonly top: number;
  readonly height: number;
  /** Tile encoding: palette PNG (default) or full colour ('png', smooth skies: no banding). */
  readonly encode?: 'png' | 'png8';
  /** v1.6 (D-042): palette size for png8 (default 256): fewer colours, fewer bytes. */
  readonly colours?: number;
  /** D-035: px over which the art fades in at the top edge (tall grass tips taper out there
   *  instead of being cut flat by the texture's edge). */
  readonly fadeTop?: number;
  /** v1.7d (D-059): false = no hand-drawn wobble (fine, ink-free ground art it would smear). */
  readonly wobble?: boolean;
  draw(ctx: LayerCtx): string;
}

export interface PropCtx extends PaintCtx {
  readonly prop: Biome['props'][number];
  /** Occluder box (w × h) centred at (ox, oy), or a default 140 × 140 box. */
  readonly box: {
    readonly w: number;
    readonly h: number;
    readonly ox: number;
    readonly oy: number;
  };
}

export interface PropPlan {
  /** Layer whose ink weight and haze the prop takes. */
  draw(ctx: PropCtx): string;
  /** Texture size and origin (px) when the art needs more room than the placeholder (D-031). */
  readonly frame?: {
    readonly w: number;
    readonly h: number;
    readonly ox: number;
    readonly oy: number;
  };
  /** v1.4 B (D-039): draw resolution in texture px per design px (default 1). A master of 2
   *  delivers a 2× image (sidecar `master: 2`); assets:pack scales it per plane. */
  readonly master?: number;
  /** False = no hand-drawn wobble (fine, detailed art that the displacement would smear). */
  readonly wobble?: boolean;
  /** v1.6 (D-042): png8 palette size (default 256). */
  readonly colours?: number;
}

export interface BiomeArtPlan {
  readonly biome: string;
  readonly layers: Readonly<Record<string, LayerPlan>>;
  /** Keyed by prop asset key (e.g. `karoo/windpomp`). */
  readonly props: Readonly<Record<string, PropPlan>>;
}

const WOBBLE_OF: Readonly<Record<string, 'far' | 'mid' | 'near' | null>> = {
  sky: null,
  far_ridge: 'far',
  far_veld: 'far',
  mid: 'mid',
  near: 'near',
  foreground: 'near',
};

function seedOf(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619) >>> 0;
  return h;
}

/** D-054: a layer's haze as a colour function (the far animals take half of it). */
export function layerTint(cfg: ArtConfig, biome: string, layerId: string): (hex: string) => string {
  return paint(cfg, biome, layerId, `${biome}/${layerId}`).tint;
}

/** v1.7d (D-059): a layer's paint context (palette, haze, pen, a PRNG seeded by `seedKey`). */
export function paint(cfg: ArtConfig, biome: string, layerId: string, seedKey: string): PaintCtx {
  const pal = biomePalette(cfg, biome);
  const haze = cfg.scenery.haze[layerId] ?? 0;
  const horizon = pal('horizon');
  return {
    raw: pal,
    c: (name) => mix(pal(name), horizon, haze),
    tint: (hex) => mix(hex, horizon, haze),
    pen: { ink: mix(cfg.ink, horizon, haze * 1.6), w: cfg.scenery.lines[layerId] ?? 4 },
    rnd: prng(seedOf(seedKey)),
  };
}

/** Renders one layer at its delivered size (core + 2 × bleed wide), × `res` for an HD pack
 *  (D-053: the same drawing at 2 texture px per design px). */
export function renderLayer(
  cfg: ArtConfig,
  plan: BiomeArtPlan,
  layer: Biome['layers'][number],
  res = 1,
): Rgba {
  const lp = plan.layers[layer.id];
  if (lp === undefined) throw new Error(`${plan.biome}: no layer plan for ${layer.id}`);
  const core = coreWidth(layer.scrollFactor);
  const width = core + LAYER_BLEED_PX * 2;
  resetIds();
  const ctx: LayerCtx = {
    ...paint(cfg, plan.biome, layer.id, `${plan.biome}/${layer.id}`),
    width,
    top: lp.top,
    bottom: lp.top + lp.height,
    u: (u) => LAYER_BLEED_PX + u * core,
  };
  const body = lp.draw(ctx);
  const wob = lp.wobble === false ? null : (WOBBLE_OF[layer.id] ?? null);
  const filter =
    wob === null
      ? ''
      : wobbleFilter('wob', cfg.scenery.wobble.frequency, cfg.scenery.wobble[wob], 23);
  const fade = lp.fadeTop ?? 0;
  const mask =
    fade <= 0
      ? ''
      : el(
          'linearGradient',
          {
            id: 'fadeTopG',
            x1: 0,
            y1: lp.top,
            x2: 0,
            y2: lp.top + fade,
            gradientUnits: 'userSpaceOnUse',
          },
          el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }),
          el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 1 }),
        ) +
        el(
          'mask',
          { id: 'fadeTop', maskUnits: 'userSpaceOnUse', x: 0, y: lp.top, width, height: lp.height },
          el('rect', { x: 0, y: lp.top, width, height: lp.height, fill: 'url(#fadeTopG)' }),
        );
  const art = g(filter === '' ? {} : { filter: 'url(#wob)' }, body);
  return renderSvg(
    svgDoc(
      width * res,
      lp.height * res,
      [0, lp.top, width, lp.height],
      filter + mask,
      mask === '' ? art : g({ mask: 'url(#fadeTop)' }, art),
    ),
  );
}

/** The occluder box of a prop (the placeholder's default box when it has none). */
export function propBox(prop: Biome['props'][number]): PropCtx['box'] {
  const o = prop.occluder;
  if (o === undefined) return { w: 140, h: 140, ox: 0, oy: 0 };
  return o.type === 'rect'
    ? { w: o.w, h: o.h, ox: o.ox, oy: o.oy }
    : { w: o.rx * 2, h: o.ry * 2, ox: o.ox, oy: o.oy };
}

export interface RenderedProp {
  readonly img: Rgba;
  /** Origin as fractions (written to the sidecar only when it differs from the placeholder's). */
  readonly originX: number;
  readonly originY: number;
  /** Texture px per design px of `img` (PropPlan.master). */
  readonly master: number;
}

/**
 * One prop at its placeholder texture size and origin (`size`, `origin` from the placeholder
 * manifest), unless the plan gives its own frame.
 */
export function renderProp(
  cfg: ArtConfig,
  plan: BiomeArtPlan,
  biome: Biome,
  prop: Biome['props'][number],
  size: { width: number; height: number },
  origin: { x: number; y: number },
  /** D-053: texture px per design px of the result (default the plan's master); an HD pack
   *  asks for 2. Never above the render (masterScale × master). */
  res?: number,
): RenderedProp {
  const pp = plan.props[prop.asset];
  if (pp === undefined) throw new Error(`${plan.biome}: no prop plan for ${prop.asset}`);
  const f = pp.frame ?? {
    w: size.width,
    h: size.height,
    ox: origin.x * size.width,
    oy: origin.y * size.height,
  };
  resetIds();
  const layerId = biome.layers.find((l) => l.id === prop.layer)?.id ?? 'mid';
  const ctx: PropCtx = {
    ...paint(cfg, plan.biome, layerId, prop.asset),
    prop,
    box: propBox(prop),
  };
  const master = pp.master ?? 1;
  const k = cfg.masterScale * master;
  const wob = pp.wobble === false ? null : (WOBBLE_OF[layerId] ?? null);
  const filter = wobbleFilter(
    'wob',
    cfg.scenery.wobble.frequency,
    wob === null ? 0 : cfg.scenery.wobble[wob] * 0.6,
    29,
  );
  const big = renderSvg(
    svgDoc(
      f.w * k,
      f.h * k,
      [-f.ox, -f.oy, f.w, f.h],
      filter,
      g(filter === '' ? {} : { filter: 'url(#wob)' }, pp.draw(ctx)),
    ),
  );
  const out = Math.min(res ?? master, k);
  return {
    img: out === k ? big : resize(big, f.w * out, f.h * out),
    originX: f.ox / f.w,
    originY: f.oy / f.h,
    master: out,
  };
}

export type { ContentBundle };

/**
 * v1.4 B: any drawing in a biome's palette (as seen on `layerId`) at `master` × design px, for
 * previews and for shared art that has no prop of its own yet. No wobble.
 */
export function renderLoose(
  cfg: ArtConfig,
  biome: string,
  layerId: string,
  seedKey: string,
  frame: { w: number; h: number; ox: number; oy: number },
  master: number,
  draw: (ctx: PaintCtx) => string,
): Rgba {
  resetIds();
  const ctx = paint(cfg, biome, layerId, seedKey);
  const k = cfg.masterScale * master;
  const big = renderSvg(
    svgDoc(frame.w * k, frame.h * k, [-frame.ox, -frame.oy, frame.w, frame.h], '', draw(ctx)),
  );
  return resize(big, frame.w * master, frame.h * master);
}
