// HUD shapes that cost nothing per frame (M9 perf): Phaser re-tessellates a Graphics object's
// paths every frame it is drawn, while a Shape keeps its geometry until its size changes. These
// wrappers only touch the shape when its rectangle or colour really changes.
import type * as Phaser from 'phaser';

export class RoundRect {
  readonly obj: Phaser.GameObjects.Rectangle;
  private w = -1;
  private h = -1;
  private color: number;
  private alpha: number;

  constructor(
    scene: Phaser.Scene,
    color: number,
    alpha: number,
    private readonly radius: number,
  ) {
    this.color = color;
    this.alpha = alpha;
    this.obj = scene.add.rectangle(0, 0, 1, 1, color, alpha).setOrigin(0, 0);
  }

  /** Top-left x/y, width and height in design px; a size ≤ 0 hides it. */
  place(x: number, y: number, w: number, h: number): this {
    const show = w > 0 && h > 0;
    if (this.obj.visible !== show) this.obj.setVisible(show);
    if (!show) return this;
    if (this.obj.x !== x || this.obj.y !== y) this.obj.setPosition(x, y);
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.obj.setSize(w, h);
      this.obj.setRounded(Math.min(this.radius, w / 2, h / 2));
    }
    return this;
  }

  fill(color: number, alpha = 1): this {
    if (color !== this.color || alpha !== this.alpha) {
      this.color = color;
      this.alpha = alpha;
      this.obj.setFillStyle(color, alpha);
    }
    return this;
  }

  hide(): this {
    if (this.obj.visible) this.obj.setVisible(false);
    return this;
  }
}

/**
 * A Graphics drawing baked into a texture and shown as an Image (M9 perf): for drawings that
 * change now and then (the Vuvuzela button's cooldown wedge). `draw` paints in local coordinates
 * (0..w, 0..h); the bake happens only when `signature` changes.
 */
export class BakedDrawing {
  readonly image: Phaser.GameObjects.Image;
  private signature = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly key: string,
  ) {
    this.image = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0).setVisible(false);
  }

  draw(
    x: number,
    y: number,
    w: number,
    h: number,
    signature: string,
    paint: (g: Phaser.GameObjects.Graphics) => void,
  ): void {
    if (signature !== this.signature) {
      this.signature = signature;
      const g = this.scene.make.graphics({}, false);
      paint(g);
      if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
      g.generateTexture(this.key, Math.ceil(w), Math.ceil(h));
      g.destroy();
      this.image.setTexture(this.key);
    }
    this.image.setPosition(x, y).setVisible(true);
  }

  hide(): void {
    this.image.setVisible(false);
  }
}
