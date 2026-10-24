// v1.4 B (D-039): angry sociable weavers. When a family nest is shot (its secretPenalty event), a
// burst of small weavers pours out of the entrance holes, swirls round the nest, a few dart at the
// camera, and after ~3–4 s they settle back in; another hit while they are out keeps them out.
// Rendering only: bursts come from the event stream and move on sim time (weaverFlight.ts), so a
// replay or a held frame draws the same birds. A fixed pool of sprites caps the cost on phones.
import * as Phaser from 'phaser';
import type { Biome, Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { PlaneId, SimState } from '../../sim/types';
import { TICKS_PER_SECOND } from '../../sim/clock';
import { coreWidth } from '../../sim/world';
import { TEX } from '../assets/AssetManifest';
import type { ParallaxView } from './ParallaxView';
import {
  burstBirds,
  burstSeed,
  weaverPose,
  type NestShape,
  type WeaverBird,
  type WeaverTuning,
} from './weaverFlight';

interface Nest {
  readonly propId: string;
  readonly layerId: string;
  readonly plane: PlaneId;
  /** Prop position on its layer. */
  readonly x: number;
  readonly y: number;
  readonly shape: NestShape;
  /** Wingspan on this plane (design px). */
  readonly size: number;
}

interface Burst {
  readonly nest: Nest;
  readonly startTick: number;
  /** Ticks after the start when the swirl ends (a hit while they're out pushes it back). */
  swirlEndTicks: number;
  readonly birds: readonly WeaverBird[];
}

export class WeaverView {
  private readonly tuning: WeaverTuning;
  private readonly nests = new Map<string, Nest>();
  private readonly bursts: Burst[] = [];
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly layerOf = new Map<Phaser.GameObjects.Image, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    feel: Feel,
    biome: Biome,
    private readonly parallax: ParallaxView,
    planeScale: Readonly<Record<PlaneId, number>>,
  ) {
    this.tuning = feel.juice.weavers;
    for (const prop of biome.props) {
      const sec = prop.secret;
      if (sec?.type !== 'singleHit' || sec.reward.barkKey !== this.tuning.barkKey) continue;
      const layer = biome.layers.find((l) => l.id === prop.layer);
      const plane = layer?.plane;
      if (layer === undefined || plane === undefined) continue;
      const sh = sec.part.shape;
      const rx = sh.type === 'ellipse' ? sh.rx : sh.w / 2;
      const ry = sh.type === 'ellipse' ? sh.ry : sh.h / 2;
      this.nests.set(prop.id, {
        propId: prop.id,
        layerId: prop.layer,
        plane,
        x: prop.u * coreWidth(layer.scrollFactor),
        y: prop.y,
        shape: { ox: sh.ox, oy: sh.oy, rx, ry },
        size: this.tuning.sizePx * planeScale[plane],
      });
    }
  }

  /** True when this biome has a family nest (no nest, no pool). */
  get active(): boolean {
    return this.nests.size > 0;
  }

  /** Bursts started (or kept out) by this frame's events, with the nest's screen x (sound pan). */
  handle(events: readonly SimEvent[]): { propId: string; screenX: number }[] {
    const started: { propId: string; screenX: number }[] = [];
    for (const e of events) {
      if (e.type !== 'secretPenalty') continue;
      const nest = this.nests.get(e.propId);
      if (nest === undefined) continue;
      const t = this.tuning;
      const swirlTicks = Math.round(((t.outMs + t.swirlMs) / 1000) * TICKS_PER_SECOND);
      const live = this.bursts.find(
        (b) => b.nest.propId === nest.propId && e.tick - b.startTick < b.swirlEndTicks,
      );
      if (live !== undefined) {
        // Hit again while they're out: they stay out (the swirl restarts from now).
        live.swirlEndTicks = e.tick - live.startTick + swirlTicks;
      } else {
        this.bursts.push({
          nest,
          startTick: e.tick,
          swirlEndTicks: swirlTicks,
          birds: burstBirds(t, nest.plane, burstSeed(nest.propId, e.tick), nest.shape, nest.size),
        });
      }
      const root = this.parallax.layer(nest.layerId)?.root.x ?? 0;
      started.push({ propId: nest.propId, screenX: root + nest.x });
    }
    return started;
  }

  /** Draws every live burst at the sim's tick. */
  update(s: SimState): void {
    if (this.bursts.length === 0 && this.pool.every((p) => !p.visible)) return;
    const t = this.tuning;
    const endTicks = Math.round(((t.settleMs + t.outMs) / 1000) * TICKS_PER_SECOND);
    // Drop bursts that have settled.
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      if (b !== undefined && s.tick - b.startTick > b.swirlEndTicks + endTicks)
        this.bursts.splice(i, 1);
    }
    let used = 0;
    for (const b of this.bursts) {
      const layer = this.parallax.layer(b.nest.layerId);
      if (layer === undefined) continue;
      const parent = layer.overlay ?? layer.fixtures;
      const ts = (s.tick - b.startTick) / TICKS_PER_SECOND;
      const swirlEnd = b.swirlEndTicks / TICKS_PER_SECOND;
      for (const bird of b.birds) {
        if (used >= t.poolCap) break;
        const pose = weaverPose(t, bird, ts, swirlEnd, s.tick);
        if (!pose.visible) continue;
        const img = this.sprite(used++, parent, b.nest.layerId);
        img
          .setTexture(pose.wingsUp ? TEX.weaverUp : TEX.weaverDown)
          .setPosition(b.nest.x + pose.x, b.nest.y + pose.y)
          .setScale((pose.scale * b.nest.size) / img.width)
          .setFlipX(pose.facing < 0)
          .setVisible(true);
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]?.setVisible(false);
  }

  /** Pool sprite `i`, parented to the burst's layer (moved when another layer needs it). */
  private sprite(
    i: number,
    parent: Phaser.GameObjects.Container,
    layerId: string,
  ): Phaser.GameObjects.Image {
    let img = this.pool[i];
    if (img === undefined) {
      img = this.scene.add.image(0, 0, TEX.weaverUp).setVisible(false);
      this.pool.push(img);
    }
    if (this.layerOf.get(img) !== layerId) {
      parent.add(img);
      this.layerOf.set(img, layerId);
    }
    return img;
  }

  /** e2e: weavers on screen now. */
  get visibleCount(): number {
    return this.pool.filter((p) => p.visible).length;
  }

  clear(): void {
    this.bursts.length = 0;
    for (const p of this.pool) p.destroy();
    this.pool.length = 0;
    this.layerOf.clear();
  }
}
