// Score pops as BitmapText (v1.0.1, D-028 §4). Every kill used to create one or two Phaser `Text`s
// (a canvas render and a texture upload each, twice when "10 ×2" resolves to "+20"), which can
// stutter on low-end phones. Instead the pop glyphs (digits and signs) are drawn once into two
// glyph atlases — the outline and a white fill — from the font the pops already use (self-hosted
// Baloo 2, no extra download), and pops are pooled pairs of BitmapTexts: a new number is a
// re-layout of quads, with no canvas work and no upload. The fill is tinted to the pop's colour.
// The atlases are built when the HUD starts, and rebuilt when Settings change the text size or
// contrast and once more if the web font arrives late (popAtlas.ts, fontReady.ts).
import * as Phaser from 'phaser';
import { fontPx, outline } from './textLook';
import type { PopLook } from './popGlyphs';
import { ensurePopAtlas, type PopFontKeys } from './popAtlas';
import { fontReadiness } from './fontReady';

export { popCanShow } from './popGlyphs';
export type { PopFontKeys } from './popAtlas';

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

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Builds (once per look, and again once its web font has arrived) the outline and fill atlases
 * in this game's caches; returns their bitmap font keys (popAtlas.ts).
 */
export function ensurePopFont(scene: Phaser.Scene, look: PopLook): PopFontKeys {
  const cache = scene.sys.cache.bitmapFont;
  const textures = scene.textures;
  return ensurePopAtlas(
    {
      hasFont: (key) => cache.exists(key),
      addFont: (key, data) => cache.add(key, { data, texture: key, frame: null }),
      removeFont: (key) => {
        cache.remove(key);
      },
      hasTexture: (key) => textures.exists(key),
      removeTexture: (key) => {
        textures.remove(key);
      },
      createCanvas: (key, w, h) => {
        const tex = textures.createCanvas(key, w, h);
        return tex === null ? null : { ctx: tex.getContext(), refresh: () => tex.refresh() };
      },
      measure: (font, ch) => {
        measureCtx ??= document.createElement('canvas').getContext('2d');
        if (measureCtx === null) throw new Error('popFont: no 2D canvas');
        measureCtx.font = font;
        return measureCtx.measureText(ch).width;
      },
      fontState: (font) => fontReadiness.state(font),
    },
    look,
  );
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
