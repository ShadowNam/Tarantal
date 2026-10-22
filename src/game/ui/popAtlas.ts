// The score-pop glyph atlases (v1.0.1, D-028 §4), without Phaser: popFont.ts passes the scene's
// bitmap-font cache, texture manager and a measuring canvas in as `PopAtlasDeps`, so the build and
// cache rules can be unit-tested with fakes.
//   - One outline atlas and one white fill atlas per look (font, size, stroke) and per font state:
//     a look drawn before its web font arrived ('fallback', system face) is a different key from
//     the same look once it has ('ready'), so a late font gets exactly one rebuild (D-028 review).
//   - Old looks are dropped, but never the previous one: a pop still on screen may draw with it.
import type { FontState } from './fontReady';
import { POP_CHARS, bitmapFontData, layoutGlyphs, type PopLook } from './popGlyphs';

/** Atlas width limit (px): small enough for any GPU, wide enough for one or two rows. */
const ATLAS_MAX_W = 1024;
/** Looks kept: the current one and the one before it (pops on screen may still use it). */
const LOOKS_KEPT = 2;

export interface PopFontKeys {
  readonly stroke: string;
  readonly fill: string;
  /** The atlas font size: BitmapText at this size draws glyphs 1:1. */
  readonly sizePx: number;
}

/** The 2D-context calls the atlas uses. */
export type AtlasContext = Pick<
  CanvasRenderingContext2D,
  | 'font'
  | 'textBaseline'
  | 'lineJoin'
  | 'lineWidth'
  | 'strokeStyle'
  | 'fillStyle'
  | 'strokeText'
  | 'fillText'
>;

export interface PopAtlasDeps {
  /** Has the bitmap font cache an entry for `key`? */
  hasFont(key: string): boolean;
  addFont(key: string, data: ReturnType<typeof bitmapFontData>): void;
  removeFont(key: string): void;
  hasTexture(key: string): boolean;
  removeTexture(key: string): void;
  /** A canvas texture to draw into; `refresh` uploads it. */
  createCanvas(key: string, w: number, h: number): { ctx: AtlasContext; refresh(): void } | null;
  /** Advance width of `ch` in `font` (px). */
  measure(font: string, ch: string): number;
  /** Has `font` loaded (fontReady.ts)? */
  fontState(font: string): FontState;
}

/** The CSS font shorthand the atlas draws with. */
export function popFontCss(look: PopLook): string {
  return `${look.weight} ${look.sizePx}px ${look.family}`;
}

function lookKey(look: PopLook, state: FontState): string {
  return `popfont:${look.family}:${look.weight}:${look.sizePx}:${look.stroke}:${look.strokePx}:${state}`;
}

/** Looks built, oldest first (module state: the caches they live in are game-wide). */
const built: string[] = [];

/** For tests: forget which looks were built. */
export function resetPopAtlasesForTests(): void {
  built.length = 0;
}

/** Builds (once per look and font state) the outline and fill atlases; returns their keys. */
export function ensurePopAtlas(deps: PopAtlasDeps, look: PopLook): PopFontKeys {
  const font = popFontCss(look);
  const base = lookKey(look, deps.fontState(font));
  const keys = { stroke: `${base}:stroke`, fill: `${base}:fill`, sizePx: look.sizePx };
  if (deps.hasFont(keys.fill) && deps.hasFont(keys.stroke)) return keys;

  const advances = Array.from(POP_CHARS).map((ch) => deps.measure(font, ch));
  const pad = Math.ceil(look.strokePx / 2) + 1;
  // Baloo 2 reaches about 1.15 em above the baseline and 0.45 em below; leave room for both.
  const ascent = Math.ceil(look.sizePx * 1.05);
  const cellH = ascent + Math.ceil(look.sizePx * 0.4) + 2 * pad;
  const layout = layoutGlyphs(POP_CHARS, advances, cellH, pad, ATLAS_MAX_W);
  const data = bitmapFontData(font, look.sizePx, layout, pad);

  for (const part of ['stroke', 'fill'] as const) {
    const key = keys[part];
    if (deps.hasTexture(key)) deps.removeTexture(key);
    const canvas = deps.createCanvas(key, layout.w, layout.h);
    if (canvas === null) throw new Error(`popFont: canvas texture ${key} failed`);
    const ctx = canvas.ctx;
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = look.strokePx;
    ctx.strokeStyle = look.stroke;
    ctx.fillStyle = part === 'stroke' ? look.stroke : '#FFFFFF';
    for (const g of layout.glyphs) {
      const ch = String.fromCodePoint(g.code);
      const x = g.x + pad;
      const y = g.y + pad + ascent;
      // The outline layer also fills: no seam between outline and fill when scaled down.
      if (part === 'stroke' && look.strokePx > 0) ctx.strokeText(ch, x, y);
      ctx.fillText(ch, x, y);
    }
    canvas.refresh();
    deps.addFont(key, data);
  }

  const at = built.indexOf(base);
  if (at >= 0) built.splice(at, 1);
  built.push(base);
  while (built.length > LOOKS_KEPT) {
    const old = built.shift();
    if (old === undefined) break;
    for (const part of ['stroke', 'fill']) {
      const key = `${old}:${part}`;
      if (deps.hasFont(key)) deps.removeFont(key);
      if (deps.hasTexture(key)) deps.removeTexture(key);
    }
  }
  return keys;
}
