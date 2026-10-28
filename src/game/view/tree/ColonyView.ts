// 1.9.4 (D-057, art bible §4.3b) Life round each sociable-weaver family nest on screen: the
// colony's weavers coming and going, the pygmy falcon now and then, Namibië's lovebirds
// (colonyFlight.ts: pure functions of the tick and the hunt's seed). A pellet near the nest, or
// the nest shot itself (its secretPenalty: WeaverView's angry burst and the −10 stay as they
// were), scatters them; they trickle back. Rendering only: no sim state, no score. Sprites sit in
// the nest layer's prop-fruit container (above the tree, under the layer's haze and its birds,
// so they never stand in front of a shot at a bird) and take the map light's tint.
import type * as Phaser from 'phaser';
import type { Biome, Feel } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { PlaneId, SimState } from '../../../sim/types';
import { TICKS_PER_SECOND } from '../../../sim/clock';
import { coreWidth } from '../../../sim/world';
import type { ParallaxView } from '../ParallaxView';
import { pelletsOnLayer, type Impact, type PelletStop } from '../fruit/fruitHits';
import {
  falconAt,
  lovebirdsAt,
  weaverAt,
  type ColonyNest,
  type ColonyPose,
  type Scatter,
  COLONY_FALCON_PERCH,
} from './colonyFlight';
import { COLONY_SHEET, COLONY_WINGSPAN, colonyFrames, colonyTexelsPerPx } from './colonySheet';

interface Colony {
  readonly propId: string;
  readonly layerId: string;
  readonly factor: number;
  readonly x: number;
  readonly y: number;
  readonly nest: ColonyNest;
  /** Frame scale: the weavers' size on this plane over the sheet's. */
  readonly k: number;
  scatter: Scatter | null;
}

export interface ColonyOptions {
  readonly seed: () => number;
  readonly reducedMotion: boolean;
  readonly planeScale: Readonly<Record<PlaneId, number>>;
  /** Test build only (?treeLife=falcon): the falcon is there almost all the time. */
  readonly falconPreview: boolean;
  readonly farFactor: number;
  readonly cameraAt: (tick: number) => number | null;
}

/** e2e hook: birds of the colonies on screen now, and scatters this hunt. */
export interface ColonyHook {
  weavers: number;
  falcon: boolean;
  lovebirds: number;
  scatters: number;
  /** Each colony's nest on screen (design px), for aiming. */
  nests: { x: number; y: number }[];
}

const S = TICKS_PER_SECOND;

export class ColonyView {
  private readonly colonies: Colony[] = [];
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly parentOf = new Map<Phaser.GameObjects.Image, Phaser.GameObjects.Container>();
  private sheet: Phaser.Textures.Texture | null = null;
  private tk = 1;
  private readonly burstTicks: number;
  private shown: ColonyHook = { weavers: 0, falcon: false, lovebirds: 0, scatters: 0, nests: [] };
  /** e2e: scatters this hunt (near shots and nest shots). */
  scatterCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly feel: Feel,
    biome: Biome,
    private readonly parallax: ParallaxView,
    private readonly o: ColonyOptions,
  ) {
    const t = feel.treeLife.colony;
    const w = feel.juice.weavers;
    this.burstTicks = Math.round(((w.outMs + w.swirlMs + w.settleMs) / 1000) * S);
    biome.props.forEach((prop, idx) => {
      const sec = prop.secret;
      if (sec?.type !== 'singleHit' || sec.reward.barkKey !== w.barkKey) return;
      const layer = biome.layers.find((l) => l.id === prop.layer);
      const plane = layer?.plane;
      if (layer === undefined || plane === undefined) return;
      const sh = sec.part.shape;
      const occ = prop.occluder;
      const foot =
        occ?.type === 'rect' ? occ.oy + occ.h / 2 : occ !== undefined ? occ.oy + occ.ry : 200;
      const scale = o.planeScale[plane];
      const count = Math.round(t.birds[plane] * (o.reducedMotion ? t.reducedCountMul : 1));
      this.colonies.push({
        propId: prop.id,
        layerId: layer.id,
        factor: layer.scrollFactor,
        x: prop.u * coreWidth(layer.scrollFactor),
        y: prop.y,
        nest: {
          ox: sh.ox,
          oy: sh.oy,
          rx: sh.type === 'ellipse' ? sh.rx : sh.w / 2,
          ry: sh.type === 'ellipse' ? sh.ry : sh.h / 2,
          foot,
          scale,
          birds: count,
          lovebirds: biome.id === 'namibie',
          salt: idx * 7919 + 1,
          ...(COLONY_FALCON_PERCH[prop.asset] === undefined
            ? {}
            : { falcon: COLONY_FALCON_PERCH[prop.asset] }),
        },
        // Review R4: a set drawn wingspan per plane (about 1.3× true size against the tree).
        k: t.wingspanPx[plane] / COLONY_WINGSPAN,
        scatter: null,
      });
    });
  }

  /** True when this map has a sociable-weaver family nest. */
  static wants(biome: Biome, feel: Feel): boolean {
    return biome.props.some(
      (p) =>
        p.secret?.type === 'singleHit' && p.secret.reward.barkKey === feel.juice.weavers.barkKey,
    );
  }

  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(COLONY_SHEET)) return false;
    const tex = this.scene.textures.get(COLONY_SHEET);
    if (tex !== this.sheet) {
      const k = colonyTexelsPerPx(tex.getSourceImage().width);
      for (const f of colonyFrames()) {
        const fr = tex.has(f.name)
          ? tex.get(f.name)
          : tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
        if (fr === null) continue;
        fr.customPivot = true;
        fr.pivotX = f.ox / f.w;
        fr.pivotY = f.oy / f.h;
      }
      this.tk = k;
      for (const img of this.pool) img.setTexture(COLONY_SHEET, img.frame.name);
      this.sheet = tex;
    }
    return true;
  }

  /** The nest shot (secretPenalty) and pellets near a nest scatter its colony. */
  handle(
    events: readonly SimEvent[],
    state: SimState,
    stopOf: (e: Extract<SimEvent, { type: 'pelletImpact' }>) => PelletStop | null,
  ): void {
    const t = this.feel.treeLife.colony;
    const shots = new Map<number, Extract<SimEvent, { type: 'pelletImpact' }>[]>();
    for (const e of events) {
      if (e.type === 'secretPenalty') {
        const c = this.colonies.find((x) => x.propId === e.propId);
        if (c !== undefined) this.scatter(c, e.tick, e.tick + this.burstTicks);
        continue;
      }
      if (e.type !== 'pelletImpact' || e.paperId !== undefined) continue;
      const list = shots.get(e.shotId) ?? [];
      list.push(e);
      shots.set(e.shotId, list);
    }
    for (const list of shots.values()) {
      const tick = list[0]?.tick ?? state.tick;
      const impacts: Impact[] = list.map((e) => ({
        dx: e.dx,
        sy: e.sy,
        ...(e.cx === undefined ? {} : { cx: e.cx }),
        stop: stopOf(e),
      }));
      for (const c of this.colonies) {
        const pellets = pelletsOnLayer(impacts, c.factor, {
          camX: this.o.cameraAt(tick) ?? state.cameraX,
          drift: 0,
          farFactor: this.o.farFactor,
        });
        const pad = t.nearShotPx * c.nest.scale;
        const near = pellets.some((p) => {
          const dx = (p.x - (c.x + c.nest.ox)) / (c.nest.rx + pad);
          const dy = (p.y - (c.y + c.nest.oy)) / (c.nest.ry + pad);
          return dx * dx + dy * dy <= 1;
        });
        if (near) this.scatter(c, tick, tick + Math.round(t.scatterSeconds * S));
      }
    }
  }

  private scatter(c: Colony, start: number, end: number): void {
    const back = (c.scatter?.end ?? -1) + this.feel.treeLife.colony.trickleSeconds * S + S;
    // Still away from the last one: they stay away longer (the flight off isn't replayed).
    if (c.scatter !== null && start <= back)
      c.scatter = { start: c.scatter.start, end: Math.max(end, c.scatter.end) };
    else c.scatter = { start, end };
    this.scatterCount++;
  }

  update(s: SimState, alpha: number): void {
    if (this.colonies.length === 0 || !this.ensureSheet()) return;
    const t = this.feel.treeLife.colony;
    const tick = s.tick - 1 + alpha;
    const seed = this.o.seed();
    let used = 0;
    let weavers = 0;
    let falcon = false;
    let lovebirds = 0;
    const nests: { x: number; y: number }[] = [];
    for (const c of this.colonies) {
      const layer = this.parallax.layer(c.layerId);
      if (layer === undefined) continue;
      nests.push({
        x: Math.round(layer.root.x + (c.x + c.nest.ox) * layer.root.scaleX),
        y: Math.round(layer.root.y + (c.y + c.nest.oy) * layer.root.scaleY),
      });
      const poses: ColonyPose[] = [];
      for (let i = 0; i < c.nest.birds; i++) {
        const p = weaverAt(t, c.nest, seed, i, tick, c.scatter, this.o.reducedMotion);
        if (p !== null) {
          poses.push(p);
          weavers++;
        }
      }
      const f = falconAt(t, c.nest, seed, Math.floor(tick), c.scatter, this.o.falconPreview);
      if (f !== null) {
        poses.push(f);
        falcon = true;
      }
      for (const l of lovebirdsAt(t, c.nest, seed, tick, c.scatter)) {
        poses.push(l);
        lovebirds++;
      }
      const tint = this.parallax.layerTint(c.layerId);
      for (const p of poses) {
        const img = this.sprite(used++, layer.propFruit);
        img.setFrame(p.frame);
        // Phaser flips round the texture's centre: mirror the origin with it.
        if (p.flip) img.setOrigin(1 - img.frame.pivotX, img.frame.pivotY);
        img
          .setScale(((p.frame.startsWith('falcon') ? t.falconMul : 1) * c.k) / this.tk)
          .setPosition(c.x + p.x, c.y + p.y)
          .setFlipX(p.flip)
          .setAlpha(p.alpha)
          .setTint(tint)
          .setVisible(true);
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]?.setVisible(false);
    this.shown = { weavers, falcon, lovebirds, scatters: this.scatterCount, nests };
  }

  private sprite(i: number, parent: Phaser.GameObjects.Container): Phaser.GameObjects.Image {
    let img = this.pool[i];
    if (img === undefined) {
      img = this.scene.add.image(0, 0, COLONY_SHEET, 'weaver_perch');
      this.pool.push(img);
    }
    if (this.parentOf.get(img) !== parent) {
      parent.add(img);
      this.parentOf.set(img, parent);
    }
    return img;
  }

  get hook(): ColonyHook {
    return this.shown;
  }

  destroy(): void {
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
    this.parentOf.clear();
  }
}
