// Pure half of the BitmapText score pops (v1.0.1, D-028 §4, popFont.ts): which characters the
// pop atlas holds, how its glyph cells are packed, and the Phaser bitmap font data for them.
/** Every character a score pop can show (format.ts popParts / formatAward: 12K, 1.5M, −150). */
export const POP_CHARS = '0123456789KM+-−×x.,: \u00a0\u202f';

/** How the pop text looks; one atlas pair per distinct look. */
export interface PopLook {
  readonly family: string;
  readonly weight: string;
  /** Font size of the atlas glyphs (px). */
  readonly sizePx: number;
  /** Outline colour (#RRGGBB) and width (px, like Text strokeThickness: centred on the path). */
  readonly stroke: string;
  readonly strokePx: number;
}

export interface GlyphRect {
  readonly code: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly advance: number;
}

/**
 * Packs one cell per character (advance + 2 × pad wide, cellH tall) into rows of at most maxW px.
 * Pure: the atlas layout for `bitmapFontData`.
 */
export function layoutGlyphs(
  chars: string,
  advances: readonly number[],
  cellH: number,
  pad: number,
  maxW: number,
): { readonly w: number; readonly h: number; readonly glyphs: readonly GlyphRect[] } {
  const glyphs: GlyphRect[] = [];
  let x = 0;
  let y = 0;
  let w = 0;
  Array.from(chars).forEach((ch, i) => {
    const advance = Math.ceil(advances[i] ?? 0);
    const cw = advance + 2 * pad;
    if (x > 0 && x + cw > maxW) {
      x = 0;
      y += cellH;
    }
    glyphs.push({ code: ch.codePointAt(0) ?? 0, x, y, w: cw, h: cellH, advance });
    x += cw;
    w = Math.max(w, x);
  });
  return { w: Math.max(1, w), h: Math.max(1, y + cellH), glyphs };
}

/** One character's entry in Phaser's bitmap font data (the shape ParseXMLBitmapFont builds). */
interface CharData {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  xOffset: number;
  yOffset: number;
  xAdvance: number;
  data: object;
  kerning: Record<number, number>;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * Phaser bitmap font data for an atlas laid out by `layoutGlyphs` (whole texture, untrimmed).
 * Each glyph is drawn `pad` px left of the pen so its outline can spill over; v is flipped as in
 * Phaser 4's parsers. Pure.
 */
export function bitmapFontData(
  font: string,
  sizePx: number,
  layout: ReturnType<typeof layoutGlyphs>,
  pad: number,
): { font: string; size: number; lineHeight: number; chars: Record<number, CharData> } {
  const chars: Record<number, CharData> = {};
  for (const g of layout.glyphs) {
    chars[g.code] = {
      x: g.x,
      y: g.y,
      width: g.w,
      height: g.h,
      centerX: Math.floor(g.w / 2),
      centerY: Math.floor(g.h / 2),
      xOffset: -pad,
      yOffset: 0,
      xAdvance: g.advance,
      data: {},
      kerning: {},
      u0: g.x / layout.w,
      v0: 1 - g.y / layout.h,
      u1: (g.x + g.w) / layout.w,
      v1: 1 - (g.y + g.h) / layout.h,
    };
  }
  return { font, size: sizePx, lineHeight: layout.glyphs[0]?.h ?? sizePx, chars };
}

/** True if every character of `s` is in the pop atlas. */
export function popCanShow(s: string): boolean {
  return Array.from(s).every((ch) => POP_CHARS.includes(ch));
}
