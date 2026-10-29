// v1.7d (D-059, art bible §4.5c) The Namib ground cover: bushman grass, dollar bush and dead
// branches from one small sheet (veldSheet.ts), at the art's placements (veld-namibie.json) over
// the sand of the mid, near and foreground layers, in each layer's fruit container (above the
// layer's art, below its props), nearest last. Static, so the mid and near cover (~1 500 tufts)
// is BAKED once into DynamicTexture strips covering only the band the tufts sit in (pieces at
// most PIECE_W wide, 1 texel per design px, Standard resolution in HD too): a handful of images a
// frame instead of ~770 live Images (review: the per-object render cost was most of Namibië's
// CPU at 4× throttle). The 15 foreground tufts stay images. If the sheet under the key changes
// (a texture swap), the strips are re-baked in place (clear, stamps, one render: one frame never
// shows both sets).
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

/** Widest baked piece (design px = texels): inside every GPU's texture limit. */
const PIECE_W = 2048;
/** Layers baked into strips (indices into VELD_LAYERS: mid, near); the rest stay images. */
const BAKED: ReadonlySet<number> = new Set([0, 1]);
/** Off-screen margin (design px) for showing images: wider than any frame. */
const MARGIN = 280;
let bakeSerial = 0;

interface Spot {
  readonly frame: VeldRect;
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly flip: boolean;
  readonly left: number;
  readonly right: number;
}

interface Piece {
  readonly key: string;
  readonly dt: Phaser.Textures.DynamicTexture;
  readonly img: Phaser.GameObjects.Image;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
}

interface Baked {
  readonly node: LayerNode;
  readonly spots: readonly Spot[];
  readonly pieces: Piece[];
}

interface Loose {
  readonly node: LayerNode;
  readonly spots: readonly Spot[];
  readonly imgs: Phaser.GameObjects.Image[];
}

export class VeldView {
  private readonly frames = veldFrames();
  private readonly baked: Baked[] = [];
  private readonly loose: Loose[] = [];
  private sheet: Phaser.Textures.Texture | null = null;
  private tk = 1;
  private total = 0;
  /** Images (baked pieces and loose tufts) drawn on the last update (e2e hook). */
  shown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    parallax: ParallaxView,
    biomeId: string,
  ) {
    const spots = [...(SPOTS[biomeId] ?? [])].sort((a, b) => a[3] - b[3]);
    this.total = spots.length;
    VELD_LAYERS.forEach((id, li) => {
      const node = parallax.layer(id);
      if (node === undefined) return;
      const list: Spot[] = [];
      for (const [l, fi, x, y, s100, flip] of spots) {
        const frame = this.frames[fi];
        if (l !== li || frame === undefined) continue;
        const s = s100 / 100;
        const lx = x - LAYER_BLEED_PX;
        list.push({
          frame,
          x: lx,
          y,
          s,
          flip: flip === 1,
          left: lx - frame.w * s,
          right: lx + frame.w * s,
        });
      }
      if (list.length === 0) return;
      if (BAKED.has(li)) this.baked.push({ node, spots: list, pieces: [] });
      else this.loose.push({ node, spots: list, imgs: [] });
    });
    this.ensureSheet();
  }

  /** Tufts placed (e2e hook). */
  get count(): number {
    return this.total;
  }

  /** Texels in the baked strips (e2e/report: their texture memory is 4 bytes each). */
  get bakedTexels(): number {
    let n = 0;
    for (const b of this.baked) for (const p of b.pieces) n += p.dt.width * p.dt.height;
    return n;
  }

  /** Cuts the frames from the file under the key, then (re)bakes; true once there is one. */
  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(VELD_SHEET)) return false;
    const tex = this.scene.textures.get(VELD_SHEET);
    if (tex === this.sheet) return true;
    const k = veldTexelsPerPx(tex.getSourceImage().width);
    for (const f of this.frames)
      if (!tex.has(f.name)) tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
    this.tk = k;
    this.sheet = tex;
    for (const b of this.baked) this.bake(b);
    for (const l of this.loose) this.place(l);
    return true;
  }

  /** Stamps a layer's tufts into its strip pieces (made on the first bake). */
  private bake(b: Baked): void {
    if (b.pieces.length === 0) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of b.spots) {
        const f = p.frame;
        x0 = Math.min(x0, p.left);
        x1 = Math.max(x1, p.right);
        y0 = Math.min(y0, p.y - f.oy * p.s);
        y1 = Math.max(y1, p.y + (f.h - f.oy) * p.s);
      }
      const top = Math.floor(y0) - 1;
      const h = Math.ceil(y1) + 1 - top;
      const left = Math.floor(x0) - 1;
      const width = Math.ceil(x1) + 1 - left;
      const pieces: Piece[] = [];
      for (let px = left; px < left + width; px += PIECE_W) {
        const w = Math.min(PIECE_W, left + width - px);
        const key = `namibie/veld-bake/${String(++bakeSerial)}`;
        const dt = this.scene.textures.addDynamicTexture(key, w, h);
        if (dt === null) return;
        const img = this.scene.add.image(px, top, key).setOrigin(0, 0);
        pieces.push({ key, dt, img, x0: px, y0: top, w });
      }
      b.pieces.push(...pieces);
      // Below the layer's fruit sprites (above its art, below its props).
      b.node.fruit.addAt(
        pieces.map((p) => p.img),
        0,
      );
    }
    for (const piece of b.pieces) {
      piece.dt.clear();
      for (const p of b.spots) {
        if (p.right < piece.x0 || p.left > piece.x0 + piece.w) continue;
        const f = p.frame;
        piece.dt.stamp(VELD_SHEET, f.name, p.x - piece.x0, p.y - piece.y0, {
          originX: f.ox / f.w,
          originY: f.oy / f.h,
          scaleX: ((p.flip ? -1 : 1) * p.s) / this.tk,
          scaleY: p.s / this.tk,
        });
      }
      piece.dt.render();
    }
  }

  /** The foreground's few tufts as images (made once, re-textured after a swap). */
  private place(l: Loose): void {
    if (l.imgs.length === 0) {
      for (const p of l.spots)
        l.imgs.push(this.scene.add.image(p.x, p.y, VELD_SHEET, p.frame.name));
      l.node.fruit.addAt(l.imgs, 0);
    }
    l.spots.forEach((p, i) => {
      const img = l.imgs[i];
      if (img === undefined) return;
      const f = p.frame;
      img.setTexture(VELD_SHEET, f.name);
      // Phaser flips round the frame's centre: mirror the origin with it.
      img.setOrigin(p.flip ? 1 - f.ox / f.w : f.ox / f.w, f.oy / f.h);
      img.setFlipX(p.flip);
      img.setScale(p.s / this.tk);
    });
  }

  /** Shows only what is on screen (the layers' roots are already placed for this frame). */
  update(width: number): void {
    this.ensureSheet();
    let shown = 0;
    for (const b of this.baked) {
      const r = b.node.root;
      const from = (-r.x - MARGIN) / r.scale;
      const to = (width - r.x + MARGIN) / r.scale;
      for (const p of b.pieces) {
        const on = r.visible && p.x0 + p.w >= from && p.x0 <= to;
        if (p.img.visible !== on) p.img.setVisible(on);
        if (on) shown++;
      }
    }
    for (const l of this.loose) {
      const r = l.node.root;
      const from = (-r.x - MARGIN) / r.scale;
      const to = (width - r.x + MARGIN) / r.scale;
      for (let i = 0; i < l.spots.length; i++) {
        const p = l.spots[i];
        const img = l.imgs[i];
        if (p === undefined || img === undefined) continue;
        const on = r.visible && p.right >= from && p.left <= to;
        if (img.visible !== on) img.setVisible(on);
        if (on) shown++;
      }
    }
    this.shown = shown;
  }

  destroy(): void {
    for (const b of this.baked)
      for (const p of b.pieces) {
        // The image goes first: nothing draws the strip's key when it is removed.
        p.img.destroy();
        this.scene.textures.remove(p.key);
      }
    for (const l of this.loose) for (const img of l.imgs) img.destroy();
    this.baked.length = 0;
    this.loose.length = 0;
  }
}
