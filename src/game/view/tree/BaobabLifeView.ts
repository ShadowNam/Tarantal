// 1.9.4 (D-057, art bible §4.2c) The baobab's residents on screen: each one shows itself at its
// hollow now and then (baobabResidents.ts: a pure function of the tick and the hunt's seed), the
// bees swirl at their crack, and a near shot (a pelletImpact on the baobab's layer close to one)
// makes it duck back or fly off. Rendering only: no sim state, no score; the residents sit under
// the layer's birds, so they never stand in front of a shot at a bird. Sprites go in the layer's
// prop-fruit container (above the tree, under its haze) and take the map light's tint.
import { setFootOrigin } from '../footOrigin';
import type * as Phaser from 'phaser';
import type { Biome } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import { coreWidth } from '../../../sim/world';
import type { ParallaxView } from '../ParallaxView';
import { pelletsOnLayer, type Impact, type PelletStop } from '../fruit/fruitHits';
import {
  RESIDENT_IDS,
  beeSprites,
  residentPose,
  visitAt,
  type ResidentId,
  type ResidentSprite,
  type TreeLifeTuning,
} from './baobabResidents';
import { HOLLOWS } from './baobabShape';
import { RESIDENT_SHEET, residentFrames, residentTexelsPerPx } from './residentSheet';

/** The prop the residents live in. */
export const BAOBAB_ASSET = 'bushveld/baobab';

export interface BaobabLifeOptions {
  /** The hunt's seed (the residents' schedule hashes it). */
  readonly seed: () => number;
  /** Dawn, dusk or golden light: the bushbaby comes out more. */
  readonly dusk: boolean;
  readonly reducedMotion: boolean;
  /** Test build only (?treeLife=<id>): that resident is out almost all the time. */
  readonly preview: ResidentId | null;
  /** The far plane's scroll factor (pelletsOnLayer) and the camera at a tick. */
  readonly farFactor: number;
  readonly cameraAt: (tick: number) => number | null;
}

/** e2e: a resident on screen (design px) and its frame. */
export interface ResidentHook {
  readonly id: ResidentId;
  readonly frame: string;
  readonly x: number;
  readonly y: number;
}

export class BaobabLifeView {
  private readonly layerId: string;
  private readonly factor: number;
  private readonly x: number;
  private readonly y: number;
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private sheet: Phaser.Textures.Texture | null = null;
  /** Texture px per prop px of the sheet under the key (1 Standard, 2 HD). */
  private k = 1;
  /** The near shot that startled each resident: the visit's start and the shot's tick. */
  private readonly ducks = new Map<ResidentId, { start: number; tick: number }>();
  private beeScatter: number | null = null;
  private shown: ResidentHook[] = [];
  /** e2e: residents startled by near shots this hunt. */
  duckCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly t: TreeLifeTuning,
    biome: Biome,
    private readonly parallax: ParallaxView,
    private readonly o: BaobabLifeOptions,
  ) {
    const prop = biome.props.find((p) => p.asset === BAOBAB_ASSET);
    const layer = biome.layers.find((l) => l.id === prop?.layer);
    this.layerId = layer?.id ?? 'mid';
    this.factor = layer?.scrollFactor ?? 1;
    this.x = prop === undefined ? 0 : prop.u * coreWidth(this.factor);
    this.y = prop?.y ?? 0;
  }

  /** True when this map has the baobab. */
  static wants(biome: Biome): boolean {
    return biome.props.some((p) => p.asset === BAOBAB_ASSET);
  }

  /** The sheet as last cut: cut again (and every sprite moved over) after a texture swap. */
  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(RESIDENT_SHEET)) return false;
    const tex = this.scene.textures.get(RESIDENT_SHEET);
    if (tex !== this.sheet) {
      // Cut by the file under the key (1× Standard, 2× HD), not by the manifest's display scale.
      const k = residentTexelsPerPx(tex.getSourceImage().width);
      for (const f of residentFrames()) {
        const fr = tex.has(f.name)
          ? tex.get(f.name)
          : tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
        if (fr === null) continue;
        // Each frame's origin is its hole's centre or the animal's feet (residentSheet.ts).
        fr.customPivot = true;
        fr.pivotX = f.ox / f.w;
        fr.pivotY = f.oy / f.h;
      }
      this.k = k;
      for (const img of this.pool) img.setTexture(RESIDENT_SHEET, img.frame.name);
      this.sheet = tex;
    }
    return true;
  }

  /** Near shots: pellets on the baobab's layer close to a resident that is out (or the bees). */
  handle(
    events: readonly SimEvent[],
    state: SimState,
    stopOf: (e: Extract<SimEvent, { type: 'pelletImpact' }>) => PelletStop | null,
  ): void {
    const shots = new Map<number, Extract<SimEvent, { type: 'pelletImpact' }>[]>();
    for (const e of events) {
      if (e.type !== 'pelletImpact' || e.paperId !== undefined) continue;
      const list = shots.get(e.shotId) ?? [];
      list.push(e);
      shots.set(e.shotId, list);
    }
    const r2 = this.t.duckRadiusPx * this.t.duckRadiusPx;
    for (const list of shots.values()) {
      const tick = list[0]?.tick ?? state.tick;
      const impacts: Impact[] = list.map((e) => ({
        dx: e.dx,
        sy: e.sy,
        ...(e.cx === undefined ? {} : { cx: e.cx }),
        stop: stopOf(e),
      }));
      // The wind's drift (far plane and behind) is left out: it never reaches this layer's
      // pellets by more than a few px, and the residents only need "near".
      const pellets = pelletsOnLayer(impacts, this.factor, {
        camX: this.o.cameraAt(tick) ?? state.cameraX,
        drift: 0,
        farFactor: this.o.farFactor,
      });
      if (pellets.length === 0) continue;
      const near = (px: number, py: number): boolean =>
        pellets.some((p) => {
          const dx = p.x - (this.x + px);
          const dy = p.y - (this.y + py);
          return dx * dx + dy * dy <= r2;
        });
      for (const id of RESIDENT_IDS) {
        const v = visitAt(this.t, id, this.o.seed(), tick, this.o.dusk, this.o.preview === id);
        if (v === null) continue;
        const prev = this.ducks.get(id);
        if (prev !== undefined && prev.start === v.start) continue;
        const at = residentPose(this.t, v, tick, null).at;
        if (at === null || !near(at[0], at[1])) continue;
        this.ducks.set(id, { start: v.start, tick });
        this.duckCount++;
      }
      if (near(HOLLOWS.bees.x, HOLLOWS.bees.y)) this.beeScatter = tick;
    }
  }

  /** Draws the residents out at this tick (fractional: interpolated like the birds). */
  update(s: SimState, alpha: number): void {
    const layer = this.parallax.layer(this.layerId);
    if (layer === undefined || !this.ensureSheet()) return;
    const tick = s.tick - 1 + alpha;
    const whole = Math.floor(tick);
    const sprites: { id: ResidentId | null; s: ResidentSprite }[] = [];
    for (const id of RESIDENT_IDS) {
      const v = visitAt(this.t, id, this.o.seed(), whole, this.o.dusk, this.o.preview === id);
      if (v === null) continue;
      const d = this.ducks.get(id);
      const duck = d !== undefined && d.start === v.start ? d.tick : null;
      for (const sp of residentPose(this.t, v, tick, duck).sprites) sprites.push({ id, s: sp });
    }
    for (const sp of beeSprites(this.t, this.o.seed(), tick, this.beeScatter, this.o.reducedMotion))
      sprites.push({ id: null, s: sp });
    const tint = this.parallax.layerTint(this.layerId);
    const shown: ResidentHook[] = [];
    sprites.forEach(({ id, s: sp }, i) => {
      const img = this.sprite(i, layer.propFruit);
      img.setFrame(sp.frame);
      // The origin at the frame's anchor, flipped or not (a custom pivot: footOrigin.ts).
      setFootOrigin(img, sp.flip);
      img
        .setScale(1 / this.k)
        .setPosition(this.x + sp.x, this.y + sp.y)
        .setFlipX(sp.flip)
        .setRotation(sp.rot)
        .setAlpha(sp.alpha)
        .setTint(tint)
        .setVisible(true);
      if (id !== null)
        shown.push({
          id,
          frame: sp.frame,
          x: Math.round(layer.root.x + (this.x + sp.x) * layer.root.scaleX),
          y: Math.round(layer.root.y + (this.y + sp.y) * layer.root.scaleY),
        });
    });
    for (let i = sprites.length; i < this.pool.length; i++) this.pool[i]?.setVisible(false);
    this.shown = shown;
  }

  private sprite(i: number, parent: Phaser.GameObjects.Container): Phaser.GameObjects.Image {
    let img = this.pool[i];
    if (img === undefined) {
      img = this.scene.add.image(0, 0, RESIDENT_SHEET, 'bee');
      parent.add(img);
      this.pool.push(img);
    }
    return img;
  }

  /** e2e: the residents on screen now (bees left out). */
  get residents(): readonly ResidentHook[] {
    return this.shown;
  }

  destroy(): void {
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
  }
}
