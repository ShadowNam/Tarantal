// The six parallax layers (Tech §5, art bible §4.1) and their props. Each layer is a container
// in that layer's own coordinates; its x is set from the sim camera with the same formula the sim
// uses for hit tests (camera.ts), so what you see is exactly what a pellet hits.
//   container.x = screenCentre − planeCentreX(cx, f)
// Inside a plane layer the order is: ground tiles → water (M8 splash zones) → props → fixtures (secret rotors and marks,
// M4) → birds (D-018: a plane's birds stand in front of its own props) → FX. The foreground layer
// sits on top of everything.
import * as Phaser from 'phaser';
import type { Biome, Light } from '../../content/schemas';
import { planeCentreX } from '../../sim/camera';
import type { PlaneId } from '../../sim/types';
import { coreWidth, DESIGN_HEIGHT, LAYER_BLEED_PX } from '../../sim/world';
import { TEX, type AssetManifest } from '../assets/AssetManifest';
import {
  coverOver,
  intersect,
  tileProfile,
  uncoveredSpan,
  zoomedViewRect,
  type Band,
  type Rect,
  type SolidProfile,
} from './scopeCull';

export interface LayerNode {
  readonly id: string;
  readonly scrollFactor: number;
  readonly plane: PlaneId | null;
  readonly root: Phaser.GameObjects.Container;
  /** Every layer: things on its props (secret rotors, marks, glints), above props, below birds. */
  readonly fixtures: Phaser.GameObjects.Container;
  /** Plane layers only: birds (drawn in id order), then overlays above them. */
  readonly birds: Phaser.GameObjects.Container | null;
  readonly overlay: Phaser.GameObjects.Container | null;
}

/** Static art in a layer (tiles, water, props) and its x extent in layer coordinates. */
interface StaticArt {
  readonly img: Phaser.GameObjects.Image;
  readonly left: number;
  readonly right: number;
  /** v1.4 (#56): its y extent, and its opaque rows (delivered layer tiles only). */
  readonly top: number;
  readonly bottom: number;
  readonly solid: SolidProfile | null;
  /** The layer rect it is cropped to in a zoomed view right now, or null. */
  crop: Rect | null;
}

/** v1.4 (#56): a haze band or cloud puff in a layer, with its full (open view) geometry. */
interface ShapeArt {
  readonly shape: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Ellipse;
  /** Layer px, top-left and size as built. */
  readonly rect: Rect;
  /** Haze bands are cropped to the view; cloud puffs are only hidden outside it. */
  readonly crop: boolean;
  changed: boolean;
}

/** Off-screen culling margin (design px): camera shake and gun kick never move further. */
const CULL_MARGIN_PX = 96;

export class ParallaxView {
  readonly layers: readonly LayerNode[];
  private readonly byPlane = new Map<PlaneId, LayerNode>();
  /** Per layer (same order as `layers`): static art, hidden while off screen (M9 perf). */
  private readonly statics: StaticArt[][] = [];
  /** v1.4 (#56): per layer, its haze bands and cloud puffs (applyLight). */
  private readonly shapes: ShapeArt[][] = [];
  /** v1.4 (#56): per layer, hidden whole by the zoomed view's culling. */
  private readonly culledRoot: boolean[] = [];
  /** v1.3 (D-036): the rifle's zoom view (zoomView.ts), applied at the next update. */
  private zoom: { z: number; cx: number; cy: number; on: boolean; clip: Rect | null } = {
    z: 1,
    cx: 0,
    cy: 0,
    on: false,
    clip: null,
  };
  /** v1.4 (#56): cull what a zoomed view can't show (e2e turns it off to compare pictures). */
  cullZoomed = true;
  /** v1.4 (#56, e2e hook): measure the world layers' fill (see `fill`) on each update. */
  measureFill = false;
  /** Screens' worth of world-layer pixels drawn in the last update (art, haze, clouds). */
  fill = 0;

  constructor(
    scene: Phaser.Scene,
    biome: Biome,
    manifest: AssetManifest,
    mergeLayers: readonly (readonly [string, string])[] = [],
  ) {
    // Back to front: ascending scroll factor (sky 0.05 … foreground 1.2).
    const ordered = biome.layers
      .map((layer, index) => ({ layer, index }))
      .sort((a, b) => a.layer.scrollFactor - b.layer.scrollFactor || a.index - b.index);
    // M9 low tier: a decoration-only layer is drawn on another layer's plane (one parallax layer
    // fewer to move and composite). Its art is stretched by the two layers' core widths so it
    // still spans the panorama; only layers without props, planes or water qualify.
    const merges = new Map<string, Biome['layers'][number]>();
    for (const [from, into] of mergeLayers) {
      const src = biome.layers.find((l) => l.id === from);
      const dst = biome.layers.find((l) => l.id === into);
      const busy =
        src === undefined ||
        src.plane !== undefined ||
        biome.props.some((p) => p.layer === from) ||
        (biome.twist?.splash?.zones ?? []).some((z) => z.layer === from) ||
        // v1.3: never across a plane layer between them (the far ridge stays behind the Ver
        // plane's birds on maps that open it).
        (dst !== undefined &&
          biome.layers.some(
            (l) =>
              l.plane !== undefined &&
              l.scrollFactor > src.scrollFactor &&
              l.scrollFactor < dst.scrollFactor,
          ));
      if (!busy && dst !== undefined && dst.scrollFactor > src.scrollFactor) merges.set(into, src);
    }
    const merged = new Set([...merges.values()].map((l) => l.id));
    const nodes: LayerNode[] = [];
    for (const { layer } of ordered) {
      if (merged.has(layer.id)) continue;
      const root = scene.add.container(0, 0);
      const statics: StaticArt[] = [];
      const add = (img: Phaser.GameObjects.Image, solid: SolidProfile | null = null): void => {
        root.add(img);
        const left = img.x - img.originX * img.displayWidth;
        const top = img.y - img.originY * img.displayHeight;
        statics.push({
          img,
          left,
          right: left + img.displayWidth,
          top,
          bottom: top + img.displayHeight,
          solid,
          crop: null,
        });
      };
      // A tile's slice of the layer's opaque-row profile (delivered art at scale 1 only).
      const profileOf = (
        a: NonNullable<ReturnType<AssetManifest['layer']>>,
        i: number,
        x: number,
        sx: number,
      ): SolidProfile | null => {
        if (a.solid === undefined || a.scale !== 1) return null;
        const per = Math.max(1, Math.round(a.tileWidth / a.solid.bucket));
        return tileProfile(a.solid, x, a.top, sx, i * per, per);
      };
      this.statics.push(statics);
      this.shapes.push([]);
      this.culledRoot.push(false);
      const extra = merges.get(layer.id);
      if (extra !== undefined) {
        const art = manifest.layer(extra.asset);
        const k = coreWidth(layer.scrollFactor) / coreWidth(extra.scrollFactor);
        art?.tiles.forEach((key, i) => {
          const x = (art.left + i * art.tileWidth) * k;
          add(
            scene.add
              .image(x, art.top, key)
              .setOrigin(0, 0)
              .setScale(art.scale * k, art.scale),
            profileOf(art, i, x, k),
          );
        });
      }
      const art = manifest.layer(layer.asset);
      if (art !== undefined) {
        art.tiles.forEach((key, i) => {
          const x = art.left + i * art.tileWidth;
          add(
            scene.add.image(x, art.top, key).setOrigin(0, 0).setScale(art.scale),
            profileOf(art, i, x, 1),
          );
        });
      }
      // Water channels (Okavango) are drawn from the splash zones: where you see water is exactly
      // where a pellet splashes.
      for (const z of biome.twist?.splash?.zones ?? []) {
        if (z.layer !== layer.id) continue;
        const sh = z.shape;
        const w = sh.type === 'rect' ? sh.w : sh.rx * 2;
        const h = sh.type === 'rect' ? sh.h : sh.ry * 2;
        add(
          scene.add
            .image(z.u * coreWidth(layer.scrollFactor) + sh.ox, z.y + sh.oy, TEX.water)
            .setDisplaySize(w, h),
        );
      }
      for (const prop of biome.props) {
        if (prop.layer !== layer.id || !manifest.has(prop.asset)) continue;
        const o = manifest.origin(prop.asset);
        add(
          scene.add
            .image(prop.u * coreWidth(layer.scrollFactor), prop.y, prop.asset)
            .setOrigin(o.x, o.y),
        );
      }
      const fixtures = scene.add.container(0, 0);
      root.add(fixtures);
      const plane = layer.plane ?? null;
      let birds: Phaser.GameObjects.Container | null = null;
      let overlay: Phaser.GameObjects.Container | null = null;
      if (plane !== null) {
        birds = scene.add.container(0, 0);
        overlay = scene.add.container(0, 0);
        root.add([birds, overlay]);
      }
      const node: LayerNode = {
        id: layer.id,
        scrollFactor: layer.scrollFactor,
        plane,
        root,
        fixtures,
        birds,
        overlay,
      };
      nodes.push(node);
      if (plane !== null) this.byPlane.set(plane, node);
    }
    this.layers = nodes;
  }

  plane(p: PlaneId): LayerNode {
    const node = this.byPlane.get(p);
    if (node === undefined) throw new Error(`biome has no layer for plane ${p}`);
    return node;
  }

  /**
   * v1.3: zoom the world by z around the unzoomed screen point (cx, cy) — a raised sight. The
   * zoomed view stays inside the unzoomed screen (zoomView.ts clamps the centre), so the culling
   * below stays right. z = 1 turns it off.
   */
  setZoom(z: number, cx: number, cy: number, clip: Rect | null = null): void {
    this.zoom = { z, cx, cy, on: z !== 1, clip };
  }

  /** Positions every layer for camera centre cx on a screen `width` design px wide. */
  update(cx: number, width: number): void {
    if (this.zoom.on && this.cullZoomed) {
      this.updateCulled(cx, width);
      return;
    }
    this.restoreCulled();
    const { z, cx: zx, cy: zy, on } = this.zoom;
    this.layers.forEach((l, i) => {
      const base = width / 2 - planeCentreX(cx, l.scrollFactor);
      if (on) {
        // Screen point p shows at C + (p − c) × z (zoomView.ts).
        l.root.setPosition(width / 2 + (base - zx) * z, DESIGN_HEIGHT / 2 - zy * z).setScale(z);
      } else if (l.root.scale !== 1 || l.root.y !== 0) {
        l.root.setPosition(base, 0).setScale(1);
      } else {
        l.root.x = base;
      }
      // Static art outside the screen isn't drawn (most of a 6 000 px layer is off screen).
      // v1.3: zoomed in, only the unzoomed screen span the zoomed view shows: [c − C/z, c + C/z].
      const viewFrom = on ? zx - width / 2 / z : 0;
      const viewTo = on ? zx + width / 2 / z : width;
      const from = -base + viewFrom - CULL_MARGIN_PX;
      const to = -base + viewTo + CULL_MARGIN_PX;
      for (const a of this.statics[i] ?? []) {
        const on = a.right >= from && a.left <= to;
        if (a.img.visible !== on) a.img.setVisible(on);
      }
    });
    if (this.measureFill) this.fill = this.measure(width, z, zx, zy, on);
  }

  /**
   * v1.4 (#56, D-038): a zoomed view draws only what can show (scopeCull.ts). Front to back:
   * each layer is cropped to the view rect minus the rows nearer layers' opaque bands hide; a
   * layer hidden everywhere isn't drawn at all; its own opaque band then hides layers behind it.
   */
  private updateCulled(cx: number, width: number): void {
    const { z, cx: zx, cy: zy, clip } = this.zoom;
    const view = zoomedViewRect(z, zx, zy, width, DESIGN_HEIGHT, clip, CULL_MARGIN_PX);
    const covered: Band[] = [];
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i];
      if (l === undefined) continue;
      const base = width / 2 - planeCentreX(cx, l.scrollFactor);
      l.root.setPosition(width / 2 + (base - zx) * z, DESIGN_HEIGHT / 2 - zy * z).setScale(z);
      const span = uncoveredSpan(view.y0, view.y1, covered);
      if (span === null) {
        if (l.root.visible) l.root.setVisible(false);
        this.culledRoot[i] = true;
        continue;
      }
      if (this.culledRoot[i] === true) {
        l.root.setVisible(true);
        this.culledRoot[i] = false;
      }
      const lr: Rect = { x0: view.x0 - base, x1: view.x1 - base, y0: span.y0, y1: span.y1 };
      const profiles: SolidProfile[] = [];
      for (const a of this.statics[i] ?? []) {
        if (a.solid !== null) profiles.push(a.solid);
        const r = intersect(lr, { x0: a.left, y0: a.top, x1: a.right, y1: a.bottom });
        if (r === null) {
          if (a.img.visible) a.img.setVisible(false);
          continue;
        }
        if (!a.img.visible) a.img.setVisible(true);
        cropTo(a, r);
      }
      for (const sh of this.shapes[i] ?? []) {
        const r = intersect(lr, sh.rect);
        if (r === null) {
          if (sh.shape.visible) sh.shape.setVisible(false);
          sh.changed = true;
          continue;
        }
        if (!sh.shape.visible) sh.shape.setVisible(true);
        if (sh.crop) {
          sh.shape.setPosition(r.x0, r.y0).setSize(r.x1 - r.x0, r.y1 - r.y0);
          sh.changed = true;
        }
      }
      const cover = coverOver(profiles, lr.x0, lr.x1);
      if (cover !== null) covered.push(cover);
    }
    if (this.measureFill) this.fill = this.measure(width, z, zx, zy, true);
  }

  /** Back to the open view's drawing: no crops, every layer, haze and cloud as built. */
  private restoreCulled(): void {
    this.layers.forEach((l, i) => {
      if (this.culledRoot[i] === true) {
        l.root.setVisible(true);
        this.culledRoot[i] = false;
      }
      for (const a of this.statics[i] ?? []) {
        if (a.crop !== null) {
          a.img.setCrop();
          a.crop = null;
        }
      }
      for (const sh of this.shapes[i] ?? []) {
        if (!sh.changed) continue;
        sh.changed = false;
        sh.shape.setVisible(true);
        if (sh.crop)
          sh.shape
            .setPosition(sh.rect.x0, sh.rect.y0)
            .setSize(sh.rect.x1 - sh.rect.x0, sh.rect.y1 - sh.rect.y0);
      }
    });
  }

  /**
   * Screens' worth of world-layer pixels the last update drew: each visible image, haze band
   * and cloud puff (cropped where it is) intersected with the screen, summed, over the screen's
   * area. Birds, FX and the sight picture are not counted.
   */
  private measure(width: number, z: number, zx: number, zy: number, on: boolean): number {
    const view = on
      ? zoomedViewRect(z, zx, zy, width, DESIGN_HEIGHT, null, 0)
      : { x0: 0, y0: 0, x1: width, y1: DESIGN_HEIGHT };
    let area = 0;
    this.layers.forEach((l, i) => {
      if (!l.root.visible) return;
      const off = l.root.x / l.root.scaleX - (on ? width / 2 / z - zx : 0);
      const add = (r: Rect): void => {
        const s = intersect(view, { x0: r.x0 + off, x1: r.x1 + off, y0: r.y0, y1: r.y1 });
        if (s !== null) area += (s.x1 - s.x0) * (s.y1 - s.y0);
      };
      for (const a of this.statics[i] ?? []) {
        if (!a.img.visible) continue;
        add(a.crop ?? { x0: a.left, y0: a.top, x1: a.right, y1: a.bottom });
      }
      for (const sh of this.shapes[i] ?? []) {
        if (!sh.shape.visible) continue;
        const g = sh.shape;
        const x0 = g.x - g.originX * g.width;
        const y0 = g.y - g.originY * g.height;
        add({ x0, y0, x1: x0 + g.width, y1: y0 + g.height });
      }
    });
    return (area * z * z) / (width * DESIGN_HEIGHT);
  }

  /**
   * v1.2 (D-033): the map's light — a multiply tint on each layer's art and props, and flat haze
   * bands over a layer's art (below its fixtures and birds, so birds stay crisp). Presets apply in
   * order and compound. No textures: tints and rectangles only. Call once, after construction.
   */
  applyLight(lights: readonly Light[]): void {
    if (lights.length === 0) return;
    this.layers.forEach((l, i) => {
      let tint = 0xffffff;
      for (const light of lights) {
        const hex = light.tint?.[l.id];
        if (hex !== undefined) tint = multiplyRgb(tint, parseInt(hex.slice(1), 16));
      }
      if (tint !== 0xffffff) for (const a of this.statics[i] ?? []) a.img.setTint(tint);
      const width = coreWidth(l.scrollFactor) + LAYER_BLEED_PX * 2;
      for (const light of lights) {
        for (const h of light.haze ?? []) {
          if (h.layer !== l.id) continue;
          const top = h.top ?? 0;
          const bottom = h.bottom ?? DESIGN_HEIGHT;
          const rect = l.root.scene.add
            .rectangle(
              -LAYER_BLEED_PX,
              top,
              width,
              Math.max(0, bottom - top),
              parseInt(h.color.slice(1), 16),
              h.alpha,
            )
            .setOrigin(0, 0);
          l.root.addAt(rect, l.root.getIndex(l.fixtures));
          this.shapes[i]?.push({
            shape: rect,
            rect: { x0: -LAYER_BLEED_PX, y0: top, x1: width - LAYER_BLEED_PX, y1: bottom },
            crop: true,
            changed: false,
          });
        }
        // Clouds sit on the sky layer, spread evenly along it with a fixed jitter (the same
        // sky every time this light is drawn).
        if (l.id !== 'sky') continue;
        for (const c of light.clouds ?? []) {
          const color = parseInt(c.color.slice(1), 16);
          for (let k = 0; k < c.count; k++) {
            const j = (n: number): number => hash01(k * 7 + n + c.count * 131);
            const w = c.w[0] + (c.w[1] - c.w[0]) * j(1);
            const cx = -LAYER_BLEED_PX + ((k + 0.25 + 0.5 * j(2)) / c.count) * width;
            const cy = c.y[0] + (c.y[1] - c.y[0]) * j(3);
            const h = w * 0.28;
            // A cluster: a wide flat base and three puffs on top.
            const puffs: [number, number, number, number][] = [
              [0, 0, w, h],
              [-w * 0.22, -h * 0.35, w * 0.45, h * 1.1],
              [w * 0.08, -h * 0.55, w * 0.5, h * 1.3],
              [w * 0.3, -h * 0.25, w * 0.38, h * 0.9],
            ];
            for (const [ox, oy, ew, eh] of puffs) {
              const e = l.root.scene.add.ellipse(cx + ox, cy + oy, ew, eh, color, c.alpha);
              l.root.addAt(e, l.root.getIndex(l.fixtures));
              this.shapes[i]?.push({
                shape: e,
                rect: {
                  x0: cx + ox - ew / 2,
                  y0: cy + oy - eh / 2,
                  x1: cx + ox + ew / 2,
                  y1: cy + oy + eh / 2,
                },
                crop: false,
                changed: false,
              });
            }
          }
        }
      }
    });
  }

  /** A layer by id (secrets live on any layer). */
  layer(id: string): LayerNode | undefined {
    return this.layers.find((l) => l.id === id);
  }

  /** Screen x (design px) of a point at layer x on plane p (zoomed while a sight is up). */
  screenX(p: PlaneId, x: number): number {
    const node = this.plane(p);
    return node.root.x + x * node.root.scaleX;
  }
}

/** Channel-wise multiply of two 0xRRGGBB colours (tints compound like light filters). */
export function multiplyRgb(a: number, b: number): number {
  const ch = (shift: number): number =>
    Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A fixed pseudo-random 0..1 from an integer (cloud placement; drawn only, never the sim). */
function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** Crops an image to layer rect r (texture px, rounded outwards: never less than shows). */
function cropTo(a: StaticArt, r: Rect): void {
  const img = a.img;
  const sx = img.scaleX;
  const sy = img.scaleY;
  const x0 = Math.max(0, Math.floor((r.x0 - a.left) / sx));
  const y0 = Math.max(0, Math.floor((r.y0 - a.top) / sy));
  const x1 = Math.max(x0 + 1, Math.min(img.frame.width, Math.ceil((r.x1 - a.left) / sx)));
  const y1 = Math.max(y0 + 1, Math.min(img.frame.height, Math.ceil((r.y1 - a.top) / sy)));
  const c = a.crop;
  const next = {
    x0: a.left + x0 * sx,
    y0: a.top + y0 * sy,
    x1: a.left + x1 * sx,
    y1: a.top + y1 * sy,
  };
  if (c !== null && c.x0 === next.x0 && c.y0 === next.y0 && c.x1 === next.x1 && c.y1 === next.y1)
    return;
  img.setCrop(x0, y0, x1 - x0, y1 - y0);
  a.crop = next;
}
