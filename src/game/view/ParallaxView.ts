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
}

/** Off-screen culling margin (design px): camera shake and gun kick never move further. */
const CULL_MARGIN_PX = 96;

export class ParallaxView {
  readonly layers: readonly LayerNode[];
  private readonly byPlane = new Map<PlaneId, LayerNode>();
  /** Per layer (same order as `layers`): static art, hidden while off screen (M9 perf). */
  private readonly statics: StaticArt[][] = [];

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
        (biome.twist?.splash?.zones ?? []).some((z) => z.layer === from);
      if (!busy && dst !== undefined && dst.scrollFactor > src.scrollFactor) merges.set(into, src);
    }
    const merged = new Set([...merges.values()].map((l) => l.id));
    const nodes: LayerNode[] = [];
    for (const { layer } of ordered) {
      if (merged.has(layer.id)) continue;
      const root = scene.add.container(0, 0);
      const statics: StaticArt[] = [];
      const add = (img: Phaser.GameObjects.Image): void => {
        root.add(img);
        const left = img.x - img.originX * img.displayWidth;
        statics.push({ img, left, right: left + img.displayWidth });
      };
      this.statics.push(statics);
      const extra = merges.get(layer.id);
      if (extra !== undefined) {
        const art = manifest.layer(extra.asset);
        const k = coreWidth(layer.scrollFactor) / coreWidth(extra.scrollFactor);
        art?.tiles.forEach((key, i) => {
          add(
            scene.add
              .image((art.left + i * art.tileWidth) * k, art.top, key)
              .setOrigin(0, 0)
              .setScale(art.scale * k, art.scale),
          );
        });
      }
      const art = manifest.layer(layer.asset);
      if (art !== undefined) {
        art.tiles.forEach((key, i) => {
          add(
            scene.add
              .image(art.left + i * art.tileWidth, art.top, key)
              .setOrigin(0, 0)
              .setScale(art.scale),
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

  /** Positions every layer for camera centre cx on a screen `width` design px wide. */
  update(cx: number, width: number): void {
    this.layers.forEach((l, i) => {
      l.root.x = width / 2 - planeCentreX(cx, l.scrollFactor);
      // Static art outside the screen isn't drawn (most of a 6 000 px layer is off screen).
      const from = -l.root.x - CULL_MARGIN_PX;
      const to = -l.root.x + width + CULL_MARGIN_PX;
      for (const a of this.statics[i] ?? []) {
        const on = a.right >= from && a.left <= to;
        if (a.img.visible !== on) a.img.setVisible(on);
      }
    });
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

  /** Screen x (design px) of a point at layer x on plane p. */
  screenX(p: PlaneId, x: number): number {
    const node = this.plane(p);
    return node.root.x + x;
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
