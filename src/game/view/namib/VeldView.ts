// v1.7d (D-059, art bible §4.5c) The Namib ground cover: bushman grass, dollar bush and dead
// branches as sprites from one small sheet (veldSheet.ts), placed over the sand of the mid, near
// and foreground layers at the art's placements (veld-namibie.json). Each sits in its layer's
// fruit container (above the layer's art, below its props), nearest last. Static: nothing moves,
// so a held frame holds. The sheet's frames are cut from whatever file is under the key (1×
// Standard, 2× HD) and re-cut when the HD runtime swaps it in.
import type * as Phaser from 'phaser';
import { LAYER_BLEED_PX } from '../../../sim/world';
import type { LayerNode, ParallaxView } from '../ParallaxView';
import {
  VELD_LAYERS,
  VELD_SHEET,
  veldFrames,
  veldTexelsPerPx,
  type VeldRect,
  type VeldSpot,
} from './veldSheet';
import spotsNamibie from './veld-namibie.json' with { type: 'json' };

const SPOTS: Readonly<Record<string, readonly VeldSpot[]>> = {
  namibie: spotsNamibie as unknown as readonly VeldSpot[],
};

/** Off-screen margin (design px) for showing sprites: wider than any frame. */
const MARGIN = 280;

interface Placed {
  readonly img: Phaser.GameObjects.Image;
  readonly frame: VeldRect;
  readonly s: number;
  readonly flip: boolean;
  readonly left: number;
  readonly right: number;
}

export class VeldView {
  private readonly frames = veldFrames();
  private readonly layers: { node: LayerNode; placed: Placed[] }[] = [];
  private sheet: Phaser.Textures.Texture | null = null;
  private tk = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    parallax: ParallaxView,
    biomeId: string,
  ) {
    const spots = [...(SPOTS[biomeId] ?? [])].sort((a, b) => a[3] - b[3]);
    if (spots.length === 0 || !this.ensureSheet()) return;
    VELD_LAYERS.forEach((id, li) => {
      const node = parallax.layer(id);
      if (node === undefined) return;
      const placed: Placed[] = [];
      for (const [l, fi, x, y, s100, flip] of spots) {
        const frame = this.frames[fi];
        if (l !== li || frame === undefined) continue;
        const s = s100 / 100;
        const lx = x - LAYER_BLEED_PX;
        const img = scene.add.image(lx, y, VELD_SHEET, frame.name);
        const p: Placed = {
          img,
          frame,
          s,
          flip: flip === 1,
          left: lx - frame.w * s,
          right: lx + frame.w * s,
        };
        this.pose(p);
        placed.push(p);
      }
      // Below the layer's fruit sprites (above its art, below its props).
      node.fruit.addAt(
        placed.map((p) => p.img),
        0,
      );
      this.layers.push({ node, placed });
    });
  }

  /** Sprites placed (e2e hook). */
  get count(): number {
    return this.layers.reduce((n, l) => n + l.placed.length, 0);
  }

  /** Sprites drawn on the last update (e2e hook: culling works). */
  shown = 0;

  private pose(p: Placed): void {
    const f = p.frame;
    p.img.setFrame(f.name);
    // Phaser flips round the frame's centre: mirror the origin with it.
    p.img.setOrigin(p.flip ? 1 - f.ox / f.w : f.ox / f.w, f.oy / f.h);
    p.img.setFlipX(p.flip);
    p.img.setScale(p.s / this.tk);
  }

  /** Cuts the frames from the file under the key; true once there is one. */
  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(VELD_SHEET)) return false;
    const tex = this.scene.textures.get(VELD_SHEET);
    if (tex === this.sheet) return true;
    const k = veldTexelsPerPx(tex.getSourceImage().width);
    for (const f of this.frames)
      if (!tex.has(f.name)) tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
    this.tk = k;
    this.sheet = tex;
    for (const l of this.layers)
      for (const p of l.placed) {
        p.img.setTexture(VELD_SHEET, p.frame.name);
        this.pose(p);
      }
    return true;
  }

  /** Shows only the sprites on screen (the layers' roots are already placed for this frame). */
  update(width: number): void {
    this.ensureSheet();
    let shown = 0;
    for (const { node, placed } of this.layers) {
      const k = node.root.scale;
      const from = (-node.root.x - MARGIN) / k;
      const to = (width - node.root.x + MARGIN) / k;
      for (const p of placed) {
        const on = node.root.visible && p.right >= from && p.left <= to;
        if (p.img.visible !== on) p.img.setVisible(on);
        if (on) shown++;
      }
    }
    this.shown = shown;
  }

  destroy(): void {
    for (const l of this.layers) for (const p of l.placed) p.img.destroy();
    this.layers.length = 0;
  }
}
