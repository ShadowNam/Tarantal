// The six parallax layers (Tech §5, art bible §4.1) and their props. Each layer is a container
// in that layer's own coordinates; its x is set from the sim camera with the same formula the sim
// uses for hit tests (camera.ts), so what you see is exactly what a pellet hits.
//   container.x = screenCentre − planeCentreX(cx, f)
// Inside a plane layer the order is: ground tiles → props → fixtures (secret rotors and marks,
// M4) → birds (D-018: a plane's birds stand in front of its own props) → FX. The foreground layer
// sits on top of everything.
import * as Phaser from 'phaser';
import type { Biome } from '../../content/schemas';
import { planeCentreX } from '../../sim/camera';
import type { PlaneId } from '../../sim/types';
import { coreWidth } from '../../sim/world';
import type { AssetManifest } from '../assets/AssetManifest';

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

export class ParallaxView {
  readonly layers: readonly LayerNode[];
  private readonly byPlane = new Map<PlaneId, LayerNode>();

  constructor(scene: Phaser.Scene, biome: Biome, manifest: AssetManifest) {
    // Back to front: ascending scroll factor (sky 0.05 … foreground 1.2).
    const ordered = biome.layers
      .map((layer, index) => ({ layer, index }))
      .sort((a, b) => a.layer.scrollFactor - b.layer.scrollFactor || a.index - b.index);
    const nodes: LayerNode[] = [];
    for (const { layer } of ordered) {
      const root = scene.add.container(0, 0);
      const art = manifest.layer(layer.asset);
      if (art !== undefined) {
        art.tiles.forEach((key, i) => {
          root.add(
            scene.add
              .image(art.left + i * art.tileWidth, art.top, key)
              .setOrigin(0, 0)
              .setScale(art.scale),
          );
        });
      }
      for (const prop of biome.props) {
        if (prop.layer !== layer.id || !manifest.has(prop.asset)) continue;
        const o = manifest.origin(prop.asset);
        root.add(
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
    for (const l of this.layers) l.root.x = width / 2 - planeCentreX(cx, l.scrollFactor);
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
