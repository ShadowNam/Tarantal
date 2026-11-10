// 1.9.4 (D-057, art bible §4.3b) Life round each sociable-weaver family nest on screen: the
// colony's weavers coming and going, the pygmy falcon now and then, Namibië's lovebirds
// (colonyFlight.ts: pure functions of the tick and the hunt's seed). A pellet near the nest, or
// the nest shot itself (its secretPenalty: WeaverView's angry burst and the −10 stay as they
// were), scatters them; they trickle back. Rendering only: no sim state, no score. Sprites sit in
// the nest layer's prop-fruit container (above the tree, under the layer's haze and its birds,
// so they never stand in front of a shot at a bird) and take the map light's tint.
import { setFootOrigin } from '../footOrigin';
import type * as Phaser from 'phaser';
import { designSize } from '../../layout';
import { sightingVisible } from './sighting';
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
  weaverMemo,
  type ColonyNest,
  type ColonyPose,
  type Scatter,
  type WeaverMemo,
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
  /** Each weaver's cycle cache (weaverAt answers the same; it skips re-walking its cycles). */
  readonly memos: WeaverMemo[];
}

/** A pool image and what was last set on it. */
interface Slot {
  readonly img: Phaser.GameObjects.Image;
  parent: Phaser.GameObjects.Container | null;
  frame: string;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  alpha: number;
  tint: number;
  visible: boolean;
}

export interface ColonyOptions {
  readonly onSighted?: (id: string) => void;
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
  /** Pool slots: each image with what was last set on it (set only on change). */
  private readonly pool: Slot[] = [];
  /** Slots used so far this update. */
  private used = 0;
  /** Kinds already reported sighted this update. */
  private readonly sighted = new Set<string>();
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
        memos: Array.from({ length: count }, () => weaverMemo()),
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
      for (const slot of this.pool) slot.img.setTexture(COLONY_SHEET, slot.img.frame.name);
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
    const view = designSize();
    const t = this.feel.treeLife.colony;
    const tick = s.tick - 1 + alpha;
    const seed = this.o.seed();
    const shown = this.shown;
    this.used = 0;
    this.sighted.clear();
    shown.weavers = 0;
    shown.falcon = false;
    shown.lovebirds = 0;
    let nestCount = 0;
    for (const c of this.colonies) {
      const layer = this.parallax.layer(c.layerId);
      if (layer === undefined) continue;
      const root = layer.root;
      const rx = root.x;
      const ry = root.y;
      const sx = root.scaleX;
      const sy = root.scaleY;
      const nx = Math.round(rx + (c.x + c.nest.ox) * sx);
      const ny = Math.round(ry + (c.y + c.nest.oy) * sy);
      const spot = shown.nests[nestCount];
      if (spot === undefined) shown.nests.push({ x: nx, y: ny });
      else {
        spot.x = nx;
        spot.y = ny;
      }
      nestCount++;
      const tint = this.parallax.layerTint(c.layerId);
      const parent = layer.propFruit;
      const ctx = this.drawCtx;
      ctx.c = c;
      ctx.parent = parent;
      ctx.tint = tint;
      ctx.rx = rx;
      ctx.ry = ry;
      ctx.sx = sx;
      ctx.sy = sy;
      ctx.vw = view.width;
      ctx.vh = view.height;
      for (let i = 0; i < c.nest.birds; i++) {
        const p = weaverAt(t, c.nest, seed, i, tick, c.scatter, this.o.reducedMotion, c.memos[i]);
        if (p !== null) {
          this.draw(p, 'weaver', 1);
          shown.weavers++;
        }
      }
      const f = falconAt(t, c.nest, seed, Math.floor(tick), c.scatter, this.o.falconPreview);
      if (f !== null) {
        this.draw(f, 'falcon', t.falconMul);
        shown.falcon = true;
      }
      if (c.nest.lovebirds)
        for (const l of lovebirdsAt(t, c.nest, seed, tick, c.scatter)) {
          this.draw(l, 'lovebirds', 1);
          shown.lovebirds++;
        }
    }
    if (shown.nests.length !== nestCount) shown.nests.length = nestCount;
    shown.scatters = this.scatterCount;
    const pool = this.pool;
    for (let i = this.used; i < pool.length; i++) {
      const slot = pool[i];
      if (slot !== undefined && slot.visible) {
        slot.visible = false;
        slot.img.setVisible(false);
      }
    }
  }

  /** The colony being drawn and its layer's transform (reused: no closure or object a frame). */
  private readonly drawCtx: {
    c: Colony | null;
    parent: Phaser.GameObjects.Container | null;
    tint: number;
    rx: number;
    ry: number;
    sx: number;
    sy: number;
    vw: number;
    vh: number;
  } = { c: null, parent: null, tint: 0xffffff, rx: 0, ry: 0, sx: 1, sy: 1, vw: 0, vh: 0 };

  /** One bird into the next pool slot, each property set only when it changed. */
  private draw(p: ColonyPose, kind: 'weaver' | 'falcon' | 'lovebirds', mul: number): void {
    const ctx = this.drawCtx;
    const c = ctx.c;
    const parent = ctx.parent;
    if (c === null || parent === null) return;
    const x = c.x + p.x;
    const y = c.y + p.y;
    // Once a kind per update is enough (a second sighting in the same frame changes nothing).
    if (
      this.o.onSighted !== undefined &&
      !this.sighted.has(kind) &&
      sightingVisible(ctx.rx + x * ctx.sx, ctx.ry + y * ctx.sy, p.alpha, ctx.vw, ctx.vh)
    ) {
      this.sighted.add(kind);
      this.o.onSighted(kind);
    }
    const slot = this.slot(this.used++, parent);
    const img = slot.img;
    if (slot.frame !== p.frame) {
      slot.frame = p.frame;
      img.setFrame(p.frame);
    }
    // The origin at the frame's anchor, flipped or not (a custom pivot: footOrigin.ts).
    setFootOrigin(img, p.flip);
    const scale = (mul * c.k) / this.tk;
    if (slot.scale !== scale) {
      slot.scale = scale;
      img.setScale(scale);
    }
    if (slot.x !== x || slot.y !== y) {
      slot.x = x;
      slot.y = y;
      img.setPosition(x, y);
    }
    if (slot.flip !== p.flip) {
      slot.flip = p.flip;
      img.setFlipX(p.flip);
    }
    if (slot.alpha !== p.alpha) {
      slot.alpha = p.alpha;
      img.setAlpha(p.alpha);
    }
    if (slot.tint !== ctx.tint) {
      slot.tint = ctx.tint;
      img.setTint(ctx.tint);
    }
    if (!slot.visible) {
      slot.visible = true;
      img.setVisible(true);
    }
  }

  private slot(i: number, parent: Phaser.GameObjects.Container): Slot {
    let slot = this.pool[i];
    if (slot === undefined) {
      const img = this.scene.add.image(0, 0, COLONY_SHEET, 'weaver_perch');
      slot = {
        img,
        parent: null,
        frame: img.frame.name,
        x: img.x,
        y: img.y,
        scale: img.scaleX,
        flip: img.flipX,
        alpha: img.alpha,
        tint: img.tintTopLeft,
        visible: img.visible,
      };
      this.pool.push(slot);
    }
    if (slot.parent !== parent) {
      parent.add(slot.img);
      slot.parent = parent;
    }
    return slot;
  }

  get hook(): ColonyHook {
    return this.shown;
  }

  destroy(): void {
    for (const slot of this.pool) slot.img.destroy();
    this.pool.length = 0;
  }
}
