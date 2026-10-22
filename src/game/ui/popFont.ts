// Score pops as BitmapText (v1.0.1, D-028 §4). Every kill used to create one or two Phaser `Text`s
// (a canvas render and a texture upload each, twice when "10 ×2" resolves to "+20"), which can
// stutter on low-end phones. Instead the pop glyphs (digits and signs) are drawn once into two
// glyph atlases — the outline and a white fill — from the font the pops already use (self-hosted
// Baloo 2, no extra download), and pops are pooled pairs of BitmapTexts: a new number is a
// re-layout of quads, with no canvas work and no upload. The fill is tinted to the pop's colour.
// The atlases are rebuilt when Settings change the text size or contrast.
import * as Phaser from 'phaser';
import { fontPx, outline } from './textLook';
import { POP_CHARS, bitmapFontData, layoutGlyphs, type PopLook } from './popGlyphs';

export { popCanShow } from './popGlyphs';

/** Atlas width limit (px): small enough for any GPU, wide enough for one or two rows. */
const ATLAS_MAX_W = 1024;

function lookKey(look: PopLook): string {
  return `popfont:${look.family}:${look.weight}:${look.sizePx}:${look.stroke}:${look.strokePx}`;
}

/** The pop look at the current Settings text size and contrast (as `fontPx` and `outline`). */
export function popLook(family: string, size: number, strokePx: number): PopLook {
  const o = outline(size, strokePx);
  return {
    family,
    weight: '900',
    sizePx: parseInt(fontPx(size), 10),
    stroke: o.stroke ?? '#1B1410',
    strokePx: o.strokeThickness ?? 0,
  };
}

export interface PopFontKeys {
  readonly stroke: string;
  readonly fill: string;
  /** The atlas font size: BitmapText at this size draws glyphs 1:1. */
  readonly sizePx: number;
}

/** Builds (once per look) the outline and fill atlases; returns their bitmap font keys. */
export function ensurePopFont(scene: Phaser.Scene, look: PopLook): PopFontKeys {
  const base = lookKey(look);
  const keys = { stroke: `${base}:stroke`, fill: `${base}:fill`, sizePx: look.sizePx };
  const cache = scene.sys.cache.bitmapFont;
  if (cache.exists(keys.fill) && cache.exists(keys.stroke)) return keys;

  const font = `${look.weight} ${look.sizePx}px ${look.family}`;
  const measure = document.createElement('canvas').getContext('2d');
  if (measure === null) throw new Error('popFont: no 2D canvas');
  measure.font = font;
  const advances = Array.from(POP_CHARS).map((ch) => measure.measureText(ch).width);
  const pad = Math.ceil(look.strokePx / 2) + 1;
  // Baloo 2 reaches about 1.15 em above the baseline and 0.45 em below; leave room for both.
  const ascent = Math.ceil(look.sizePx * 1.05);
  const cellH = ascent + Math.ceil(look.sizePx * 0.4) + 2 * pad;
  const layout = layoutGlyphs(POP_CHARS, advances, cellH, pad, ATLAS_MAX_W);
  const data = bitmapFontData(font, look.sizePx, layout, pad);

  for (const part of ['stroke', 'fill'] as const) {
    const key = keys[part];
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, layout.w, layout.h);
    if (tex === null) throw new Error(`popFont: canvas texture ${key} failed`);
    const ctx = tex.getContext();
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = look.strokePx;
    ctx.strokeStyle = look.stroke;
    ctx.fillStyle = '#FFFFFF';
    for (const g of layout.glyphs) {
      const ch = String.fromCodePoint(g.code);
      const x = g.x + pad;
      const y = g.y + pad + ascent;
      if (part === 'stroke') {
        if (look.strokePx > 0) ctx.strokeText(ch, x, y);
        // The outline layer also fills: no seam between outline and fill when scaled down.
        ctx.fillStyle = look.stroke;
        ctx.fillText(ch, x, y);
      } else ctx.fillText(ch, x, y);
    }
    tex.refresh();
    cache.add(key, { data, texture: key, frame: null });
  }
  return keys;
}

/** A pooled pop: outline + tinted fill BitmapTexts in one container. */
export class PopText {
  readonly root: Phaser.GameObjects.Container;
  private readonly outline: Phaser.GameObjects.BitmapText;
  private readonly fill: Phaser.GameObjects.BitmapText;
  private fontKey = '';
  private size = 0;

  constructor(scene: Phaser.Scene, keys: PopFontKeys) {
    this.outline = new Phaser.GameObjects.BitmapText(scene, 0, 0, keys.stroke, '');
    this.fill = new Phaser.GameObjects.BitmapText(scene, 0, 0, keys.fill, '');
    this.root = scene.add.container(0, 0, [this.outline, this.fill]);
  }

  /** Sets font (if it changed), size, text, origin and fill colour; makes it visible. */
  show(
    keys: PopFontKeys,
    size: number,
    text: string,
    originX: number,
    originY: number,
    color: number,
  ): this {
    if (this.fontKey !== keys.fill || this.size !== size) {
      this.outline.setFont(keys.stroke, size);
      this.fill.setFont(keys.fill, size);
      this.fontKey = keys.fill;
      this.size = size;
    }
    this.setText(text);
    this.outline.setOrigin(originX, originY);
    this.fill.setOrigin(originX, originY).setTint(color);
    this.root.setVisible(true).setActive(true).setAlpha(1).setScale(1).setAngle(0);
    return this;
  }

  setText(text: string): this {
    this.outline.setText(text);
    this.fill.setText(text);
    return this;
  }

  setColor(color: number): this {
    this.fill.setTint(color);
    return this;
  }

  get text(): string {
    return this.fill.text;
  }

  get width(): number {
    return this.fill.width;
  }
}

/**
 * A free list of PopTexts for one scene. `acquire` reuses a released pop (or makes one);
 * `release` hides it and kills its tweens. Pops are never destroyed until the scene shuts down.
 */
export class PopPool {
  private readonly free: PopText[] = [];
  /** Pops made so far, and pops shown (for the perf evidence and the e2e test hook). */
  created = 0;
  shown = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  acquire(keys: PopFontKeys): PopText {
    this.shown++;
    const p = this.free.pop();
    if (p !== undefined) return p;
    this.created++;
    return new PopText(this.scene, keys);
  }

  release(p: PopText): void {
    this.scene.tweens.killTweensOf(p.root);
    p.root.setVisible(false).setActive(false);
    this.free.push(p);
  }
}

/** '#RRGGBB' → 0xRRGGBB (pop colours are written as CSS strings next to the Text ones). */
export function colorNumber(css: string): number {
  return Phaser.Display.Color.HexStringToColor(css).color;
}
