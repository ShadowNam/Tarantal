// v1.7d (D-059, art bible §4.5c) The Namib ground cover: bushman grass, dollar bush and dead
// branches from one small sheet (veldSheet.ts), at the art's placements (veld-namibie.json) over
// the sand of the mid, near and foreground layers, in each layer's fruit container (above the
// layer's art, below its props), nearest last. Static, so all of it (~1 500 tufts) is BAKED once
// into DynamicTexture strips (review: the per-object render cost was most of Namibië's CPU at 4×
// throttle): each layer is cut into PIECE_W-wide columns, and each column with tufts in
// it becomes one piece trimmed to its own tufts' box (1 texel per design px, Standard resolution
// in HD too; empty columns make none). A handful of images a frame instead of ~770. If the sheet
// under the key changes (a texture swap), the strips are re-baked in place (clear, stamps, one
// render: one frame never shows both sets).
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

/** Column width of the baked pieces (design px = texels): narrow enough that each piece's own
 *  trimmed box hugs the band (less texture than 2048-wide pieces), wide enough for few images. */
const PIECE_W = 1024;
/** Off-screen margin (design px) for showing pieces. */
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
  readonly top: number;
  readonly bottom: number;
}

interface Piece {
  readonly key: string;
  readonly dt: Phaser.Textures.DynamicTexture;
  readonly img: Phaser.GameObjects.Image;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  /** The tufts stamped into it (those reaching into its box). */
  readonly spots: readonly Spot[];
}

interface Layer {
  readonly node: LayerNode;
  readonly spots: readonly Spot[];
  readonly pieces: Piece[];
}

export class VeldView {
  private readonly frames = veldFrames();
  private readonly layers: Layer[] = [];
  private sheet: Phaser.Textures.Texture | null = null;
  private tk = 1;
  private total = 0;
  /** e2e hook: baked pieces, and those drawn on the last update. */
  strips = 0;
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
          top: y - frame.oy * s,
          bottom: y + (frame.h - frame.oy) * s,
        });
      }
      if (list.length > 0) this.layers.push({ node, spots: list, pieces: [] });
    });
    this.ensureSheet();
  }

  /** Tufts placed (e2e hook). */
  get count(): number {
    return this.total;
  }

  /** Tufts stamped into the strips (e2e hook; one counted once per piece it reaches). */
  get baked(): number {
    let n = 0;
    for (const l of this.layers) for (const p of l.pieces) n += p.spots.length;
    return n;
  }

  /** Texels in the baked strips (report: their texture memory is 4 bytes each). */
  get bakedTexels(): number {
    let n = 0;
    for (const l of this.layers) for (const p of l.pieces) n += p.dt.width * p.dt.height;
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
    for (const l of this.layers) this.bake(l);
    return true;
  }

  /** Makes a layer's pieces (the first bake), then stamps their tufts into them. */
  private bake(l: Layer): void {
    if (l.pieces.length === 0) {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const p of l.spots) {
        x0 = Math.min(x0, p.left);
        x1 = Math.max(x1, p.right);
      }
      const left = Math.floor(x0) - 1;
      for (let cx = left; cx < x1 + 1; cx += PIECE_W) {
        const inCol = l.spots.filter((p) => p.right >= cx && p.left <= cx + PIECE_W);
        if (inCol.length === 0) continue;
        // Trimmed to the tufts' own box inside the column.
        let a = Infinity;
        let b = -Infinity;
        let t = Infinity;
        let u = -Infinity;
        for (const p of inCol) {
          a = Math.min(a, p.left);
          b = Math.max(b, p.right);
          t = Math.min(t, p.top);
          u = Math.max(u, p.bottom);
        }
        const px = Math.max(cx, Math.floor(a) - 1);
        const w = Math.min(cx + PIECE_W, Math.ceil(b) + 1) - px;
        const top = Math.floor(t) - 1;
        const h = Math.ceil(u) + 1 - top;
        const key = `namibie/veld-bake/${String(++bakeSerial)}`;
        const dt = this.scene.textures.addDynamicTexture(key, w, h);
        if (dt === null) continue;
        const img = this.scene.add.image(px, top, key).setOrigin(0, 0);
        l.pieces.push({ key, dt, img, x0: px, y0: top, w, spots: inCol });
      }
      this.strips += l.pieces.length;
      // Below the layer's fruit sprites (above its art, below its props).
      l.node.fruit.addAt(
        l.pieces.map((p) => p.img),
        0,
      );
    }
    for (const piece of l.pieces) {
      piece.dt.clear();
      for (const p of piece.spots) {
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

  /** Shows only the pieces on screen (the layers' roots are already placed for this frame). */
  update(width: number): void {
    this.ensureSheet();
    let shown = 0;
    for (const l of this.layers) {
      const r = l.node.root;
      const from = (-r.x - MARGIN) / r.scale;
      const to = (width - r.x + MARGIN) / r.scale;
      for (const p of l.pieces) {
        const on = r.visible && p.x0 + p.w >= from && p.x0 <= to;
        if (p.img.visible !== on) p.img.setVisible(on);
        if (on) shown++;
      }
    }
    this.shown = shown;
  }

  destroy(): void {
    for (const l of this.layers)
      for (const p of l.pieces) {
        // The image goes first: nothing draws the strip's key when it is removed.
        p.img.destroy();
        this.scene.textures.remove(p.key);
      }
    this.layers.length = 0;
    this.strips = 0;
  }
}
