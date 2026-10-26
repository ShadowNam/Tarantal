// v1.7c (D-047, product owner 25 Oct: "When shooting these fruits, make them swing or drop
// down"): the hanging and fallen fruit, pods and flowers as sprites on their layers. A shot that
// lands on or near one swings it about its stalk; a hard hit snaps it off: it falls, bounces on
// its ground line with a dust puff, rolls a little and lies there for the rest of the hunt.
// Rendering only: hits come from the sim's pelletImpact events and every pose is a function of
// sim ticks (fruitMotion.ts), so replays and held frames draw the same. The sim never knows the
// fruit exist: no score, no penalty, no effect on any hit test. HuntScene loads this module
// lazily (it is not in the first download).
import * as Phaser from 'phaser';
import type { Biome, Feel } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import { coreWidth } from '../../../sim/world';
import type { AssetManifest } from '../../assets/AssetManifest';
import { TEX } from '../../assets/AssetManifest';
import type { AudioDirector } from '../../audio/AudioDirector';
import type { ParallaxView } from '../ParallaxView';
import {
  blocked,
  pelletOnLayer,
  shotOnFruit,
  type LayerPellet,
  type PelletStop,
} from './fruitHits';
import {
  RESTING,
  fruitPose,
  hitFruit,
  landTick,
  swingEnvelope,
  type FruitState,
  type FruitTuning,
} from './fruitMotion';
import { playFruitSound } from './fruitSounds';
import { fruitSheetKey, type FruitSpot } from './fruitTypes';

const SPOT_FILES = import.meta.glob<readonly FruitSpot[]>('./spots/*.json', { import: 'default' });

/** The biome's fruit spots (empty when it has none). */
export async function loadFruitSpots(biome: string): Promise<readonly FruitSpot[]> {
  const load = SPOT_FILES[`./spots/${biome}.json`];
  return load === undefined ? [] : load();
}

interface Fruit {
  readonly index: number;
  readonly spot: FruitSpot;
  /** Its frame on the sheet. */
  readonly frame: string;
  readonly layerId: string;
  readonly factor: number;
  /** Where the spot's pivot is on the layer (prop position added). */
  readonly x: number;
  readonly y: number;
  readonly ground: number;
  readonly img: Phaser.GameObjects.Image;
  readonly puff: Phaser.GameObjects.Image;
  state: FruitState;
  /** Last hit (for the leaf puff) and the land tick already played. */
  hitTick: number | null;
  thudAt: number | null;
}

/** What the e2e test hook reads (screen design px). */
export interface FruitHookSpot {
  readonly i: number;
  readonly species: string;
  readonly x: number;
  readonly y: number;
  /** Centre of the fruit's frame on screen (where to aim). */
  readonly aimX: number;
  readonly aimY: number;
  readonly angle: number;
  readonly dropped: boolean;
  readonly landed: boolean;
  readonly hits: number;
}

export class FruitView {
  private readonly fruit: Fruit[] = [];
  private spotList: readonly FruitSpot[] = [];
  private readonly key: string;
  private readonly tuning: FruitTuning;
  private lastTick = -1;
  private tick = 0;
  /** True while the sheet is the empty placeholder (the late group may still bring it). */
  private waiting: boolean;
  /** Hits counted this hunt (all fruit), for the hook. */
  hitCount = 0;
  dropCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    feel: Feel,
    biome: Biome,
    private readonly parallax: ParallaxView,
    private readonly manifest: AssetManifest,
    spots: readonly FruitSpot[],
    private readonly audio: AudioDirector,
    /** Settings → reduce motion. */
    private readonly reduced: boolean,
  ) {
    this.tuning = feel.juice.fruit;
    this.key = fruitSheetKey(biome.id);
    this.waiting = this.isPlaceholder();
    this.addFrames(spots);
    const place = (i: number, spot: FruitSpot, layerId: string, x: number, y: number): void => {
      const layer = parallax.layer(layerId);
      const def = biome.layers.find((l) => l.id === layerId);
      if (layer === undefined || def === undefined) return;
      const index = this.fruit.length;
      const img = scene.add
        .image(x + spot.x, y + spot.y, this.key, frameName(i))
        .setOrigin(spot.ox / spot.fw, spot.oy / spot.fh);
      const puff = scene.add.image(0, 0, TEX.dust).setVisible(false);
      layer.fixtures.add([img, puff]);
      this.fruit.push({
        index,
        spot,
        frame: frameName(i),
        layerId,
        factor: def.scrollFactor,
        x: x + spot.x,
        y: y + spot.y,
        ground: y + spot.ground,
        img,
        puff,
        state: RESTING,
        hitTick: null,
        thudAt: null,
      });
    };
    this.spotList = spots;
    spots.forEach((spot, i) => {
      if (!spot.prop) {
        place(i, spot, spot.on, 0, 0);
        return;
      }
      for (const prop of biome.props) {
        if (prop.asset !== spot.on) continue;
        const def = biome.layers.find((l) => l.id === prop.layer);
        if (def === undefined) continue;
        place(i, spot, prop.layer, prop.u * coreWidth(def.scrollFactor), prop.y);
      }
    });
  }

  get count(): number {
    return this.fruit.length;
  }

  private isPlaceholder(): boolean {
    const t = this.scene.textures;
    return !t.exists(this.key) || t.get(this.key).getSourceImage() instanceof HTMLCanvasElement;
  }

  /** Frame names on the sheet (one per spot). */
  private addFrames(spots: readonly FruitSpot[]): void {
    if (!this.scene.textures.exists(this.key)) return;
    const tex = this.scene.textures.get(this.key);
    spots.forEach((s, i) => {
      if (!tex.has(frameName(i))) tex.add(frameName(i), 0, s.fx, s.fy, s.fw, s.fh);
    });
  }

  /** The late group's sheet arrived (Karoo, Kalahari): swap it in and re-point the sprites. */
  private upgrade(): void {
    if (!this.manifest.lateDone) return;
    if (this.manifest.upgrade(this.scene.textures, this.key).length === 0) {
      this.waiting = this.isPlaceholder();
      return;
    }
    this.addFrames(this.spotList);
    for (const f of this.fruit) f.img.setTexture(this.key, f.frame);
    this.waiting = false;
  }

  /** Pellet impacts of this batch of events: hits, near misses, drops, sounds. */
  handle(
    events: readonly SimEvent[],
    state: SimState,
    stopOf: (e: Extract<SimEvent, { type: 'pelletImpact' }>) => PelletStop | null,
    width: number,
  ): void {
    if (this.fruit.length === 0) return;
    const shots = new Map<number, Extract<SimEvent, { type: 'pelletImpact' }>[]>();
    for (const e of events) {
      if (e.type !== 'pelletImpact' || e.paperId !== undefined) continue;
      const list = shots.get(e.shotId) ?? [];
      list.push(e);
      shots.set(e.shotId, list);
    }
    for (const impacts of shots.values()) {
      const tick = impacts[0]?.tick ?? state.tick;
      const byFactor = new Map<number, LayerPellet[]>();
      const pelletsOn = (factor: number): LayerPellet[] => {
        let list = byFactor.get(factor);
        if (list === undefined) {
          list = impacts
            .filter((e) => !blocked(stopOf(e), factor))
            .map((e) => pelletOnLayer(e.cx ?? state.cameraX, factor, e.dx, e.sy));
          byFactor.set(factor, list);
        }
        return list;
      };
      let knocked: Fruit | null = null;
      for (const f of this.fruit) {
        if (f.state.dropTick !== null) continue;
        const pose = fruitPose(f.spot, f.state, tick, this.tuning, this.reduced);
        const box = {
          left: f.x + pose.dx - f.spot.ox,
          top: f.y + pose.dy - f.spot.oy,
          w: f.spot.fw,
          h: f.spot.fh,
        };
        const shot = shotOnFruit(box, pelletsOn(f.factor), tick, this.tuning);
        const next = hitFruit(f.state, f.spot.motion, shot, this.tuning, this.reduced);
        if (next === f.state) continue;
        if (shot.pellets > 0) {
          this.hitCount++;
          f.hitTick = tick;
          knocked = f;
        }
        if (next.dropTick !== null) this.dropCount++;
        f.state = next;
      }
      if (knocked !== null) playFruitSound(this.audio, 'thock', this.pan(knocked, width));
    }
  }

  private pan(f: Fruit, width: number): number {
    const node = this.parallax.layer(f.layerId);
    const x = node === undefined ? width / 2 : node.root.x + f.x * node.root.scaleX;
    return (x - width / 2) / (width / 2);
  }

  /** Poses every fruit for the sim tick (held frames hold still). */
  update(s: SimState, width: number): void {
    this.tick = s.tick;
    if (this.waiting && s.tick % 30 === 0) this.upgrade();
    const t = this.tuning;
    const puffTicks = Math.max(1, Math.round(t.puffSeconds * 60));
    for (const f of this.fruit) {
      const pose = fruitPose(f.spot, f.state, s.tick, t, this.reduced);
      f.img
        .setPosition(f.x + pose.dx, f.y + pose.dy)
        .setRotation(pose.angle)
        .setAlpha(pose.alpha)
        .setVisible(pose.alpha > 0);
      // A thud once, when it first lands (not again on a replayed or held tick).
      const land = landTick(f.spot, f.state, t, this.reduced);
      if (land !== null && f.thudAt !== land && this.lastTick < land && s.tick >= land) {
        f.thudAt = land;
        if (s.tick - land < 10) playFruitSound(this.audio, 'thud', this.pan(f, width));
      }
      // The puff: leaves on a hit, dust where it lands (small and local; scaled on sim time).
      const since =
        pose.landedTicks !== null
          ? pose.landedTicks
          : f.hitTick !== null
            ? s.tick - f.hitTick
            : null;
      if (since === null || since < 0 || since >= puffTicks) {
        f.puff.setVisible(false);
        continue;
      }
      const p = since / puffTicks;
      const landed = pose.landedTicks !== null;
      const size = t.puffPx * (0.4 + p * 0.8) * (landed ? 1 : 0.7);
      f.puff
        .setTexture(landed ? TEX.dust : TEX.leaf)
        .setPosition(
          f.x + pose.dx,
          landed ? f.ground - 4 : f.y + pose.dy + f.spot.fh * 0.4 - f.spot.oy * 0.4,
        )
        .setDisplaySize(size, size * (landed ? 0.55 : 1))
        .setRotation(landed ? 0 : p * 2)
        .setAlpha((1 - p) * 0.8)
        .setVisible(true);
    }
    this.lastTick = s.tick;
  }

  /** On-screen fruit for the e2e hook (at most 60). */
  spots(): FruitHookSpot[] {
    const out: FruitHookSpot[] = [];
    for (const f of this.fruit) {
      const node = this.parallax.layer(f.layerId);
      if (node === undefined) continue;
      const sx = (x: number): number => node.root.x + x * node.root.scaleX;
      const sy = (y: number): number => node.root.y + y * node.root.scaleY;
      const x = sx(f.img.x);
      if (x < -50 || x > this.scene.scale.width + 2000 || out.length >= 60) continue;
      const cy = f.img.y - f.spot.oy + f.spot.fh / 2;
      const cx = f.img.x - f.spot.ox + f.spot.fw / 2;
      const land = landTick(f.spot, f.state, this.tuning, this.reduced);
      out.push({
        i: f.index,
        species: f.spot.species,
        x,
        y: sy(f.img.y),
        aimX: sx(cx),
        aimY: sy(cy),
        angle: f.img.rotation,
        dropped: f.state.dropTick !== null,
        landed: land !== null && this.tick >= land,
        hits: f.state.hits.length,
      });
    }
    return out;
  }

  /** Fruit swinging now (envelope above a degree), for the hook. */
  get swinging(): number {
    return this.fruit.filter((f) => swingEnvelope(f.state.hits, this.tick, this.tuning) > 0.017)
      .length;
  }

  /** A hunt ended: every fruit back on its tree. */
  clear(): void {
    for (const f of this.fruit) {
      f.state = RESTING;
      f.hitTick = null;
      f.thudAt = null;
    }
    this.lastTick = -1;
    this.hitCount = 0;
    this.dropCount = 0;
  }

  /** The views were rebuilt (another biome or map): drop the sprites. */
  destroy(): void {
    for (const f of this.fruit) {
      f.img.destroy();
      f.puff.destroy();
    }
    this.fruit.length = 0;
  }
}

function frameName(i: number): string {
  return `f${i}`;
}
