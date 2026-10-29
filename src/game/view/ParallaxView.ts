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
import { isHdTexture, TEX, type AssetManifest } from '../assets/AssetManifest';
import { HD_PARTS, hdKeyOf } from '../assets/hdProps';
import { FAUNA_HERDS } from './faunaHerds';
import { hazeBelowProps } from './hazeOrder';
import { FaunaView, type FaunaOptions } from './FaunaView';
import type { FaunaProbe } from '../GameContext';
import { lightTint } from './lightTint';
import {
  CLOUD_DECKS,
  CLOUD_SPRITE_SCALE,
  CLOUD_TEX,
  driftX,
  gloomTint,
  layoutDeck,
  type CloudPlace,
} from './clouds';
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
  /** v1.7c (D-047): fruit of the layer's own art (above its art, below its props) and fruit of
   *  its props (above the props, below haze and fixtures). */
  readonly fruit: Phaser.GameObjects.Container;
  readonly propFruit: Phaser.GameObjects.Container;
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
  /** v1.7c (D-047): the light's tint per layer id (applyLight), for sprites added later. */
  private readonly tints = new Map<string, number>();
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

  /** v1.6 (D-042): drifting clouds on the sky layer (clouds.ts), and how grey the weather is. */
  private readonly clouds: { img: Phaser.GameObjects.Image; place: CloudPlace }[] = [];
  private cloudSpan = { left: 0, span: 1 };
  private gloom = 0;
  private lastCloudTick: number | null = null;

  /** D-051: props still on their first-download art that have an HD texture to come. */
  private readonly hdPending: {
    readonly propId: string;
    readonly art: StaticArt;
    readonly hd: string;
    readonly parts: readonly string[];
  }[] = [];
  /** D-051: props showing their HD texture (and holding their HD pieces). */
  private readonly hdLive = new Set<string>();
  /** D-053: each layer's tile images (refreshHd swaps them for the art the manifest serves now). */
  private readonly tileSets: {
    readonly index: number;
    readonly asset: string;
    /** Stretch of a low-tier merged layer (1 otherwise). */
    readonly k: number;
    arts: StaticArt[];
    keys: readonly string[];
  }[] = [];
  /** D-053: prop and far-animal images, re-set when HD art swaps in or out. */
  private readonly keyed: {
    readonly art: StaticArt;
    readonly key: string;
    readonly extra: number;
  }[] = [];
  /** D-053: builds a layer's tile images (set while constructing; refreshHd reuses it). */
  private makeTiles:
    ((art: NonNullable<ReturnType<AssetManifest['layer']>>, k: number) => StaticArt[]) | null =
    null;
  /** D-053: the manifest's hdEpoch these images were made with. */
  private hdEpoch: number;
  /** D-054: the far animals, one view per layer that has herds. */
  private readonly fauna: FaunaView[] = [];
  /** D-051: every prop with an HD texture (test hook: where it is, whether it shows HD). */
  private readonly hdArt: { readonly propId: string; readonly art: StaticArt }[] = [];

  constructor(
    scene: Phaser.Scene,
    biome: Biome,
    private readonly manifest: AssetManifest,
    mergeLayers: readonly (readonly [string, string])[] = [],
    /** D-054: the far animals (null: none, e.g. a test without feel). */
    fauna: FaunaOptions | null = null,
  ) {
    this.hdEpoch = manifest.hdEpoch;
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
        statics.push(staticOf(img, solid));
      };
      // A tile's slice of the layer's opaque-row profile (delivered art at scale 1 only).
      const profileOf = (
        a: NonNullable<ReturnType<AssetManifest['layer']>>,
        i: number,
        x: number,
        sx: number,
      ): SolidProfile | null => {
        if (a.solid === undefined || (a.scale !== 1 && a.solidDesignPx !== true)) return null;
        const per = Math.max(1, Math.round(a.tileWidth / a.solid.bucket));
        return tileProfile(a.solid, x, a.top, sx, i * per, per);
      };
      this.statics.push(statics);
      this.shapes.push([]);
      this.culledRoot.push(false);
      const layerIndex = this.statics.length - 1;
      /** D-053: a layer's tiles as images (also refreshHd's, with the art served then). */
      const tilesOf = (
        art: NonNullable<ReturnType<AssetManifest['layer']>>,
        k: number,
      ): StaticArt[] =>
        art.tiles.map((key, i) => {
          const x = (art.left + i * art.tileWidth) * k;
          const img = scene.add
            .image(x, art.top, key)
            .setOrigin(0, 0)
            .setScale(art.scale * k, art.scale);
          return staticOf(img, profileOf(art, i, x, k));
        });
      this.makeTiles = tilesOf;
      const extra = merges.get(layer.id);
      if (extra !== undefined) {
        const art = manifest.layer(extra.asset);
        const k = coreWidth(layer.scrollFactor) / coreWidth(extra.scrollFactor);
        if (art !== undefined) {
          const arts = tilesOf(art, k);
          for (const a of arts) add(a.img, a.solid);
          this.tileSets.push({
            index: layerIndex,
            asset: extra.asset,
            k,
            arts: statics.slice(-arts.length),
            keys: art.tiles,
          });
        }
      }
      const art = manifest.layer(layer.asset);
      if (art !== undefined) {
        const arts = tilesOf(art, 1);
        for (const a of arts) add(a.img, a.solid);
        this.tileSets.push({
          index: layerIndex,
          asset: layer.asset,
          k: 1,
          arts: statics.slice(-arts.length),
          keys: art.tiles,
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
      // D-054: the far animals (FaunaView: one sheet per herd, parts that move on sim time).
      const herds = (FAUNA_HERDS[biome.id] ?? []).filter((h) => h.layer === layer.id);
      if (fauna !== null && herds.length > 0) {
        const holder = scene.add.container(0, 0);
        root.add(holder);
        this.fauna.push(
          new FaunaView(scene, manifest, herds, coreWidth(layer.scrollFactor), holder, fauna),
        );
      }
      const fruit = scene.add.container(0, 0);
      root.add(fruit);
      for (const prop of biome.props) {
        if (prop.layer !== layer.id || !manifest.has(prop.asset)) continue;
        const o = manifest.origin(prop.asset);
        add(
          scene.add
            .image(prop.u * coreWidth(layer.scrollFactor), prop.y, prop.asset)
            .setOrigin(o.x, o.y)
            .setScale(manifest.displayScale(prop.asset)),
        );
        const pa = statics[statics.length - 1];
        if (pa !== undefined) this.keyed.push({ art: pa, key: prop.asset, extra: 1 });
        // D-051: switched to its HD texture once that lands (upgradeHd).
        const hd = hdKeyOf(prop.asset);
        const art = statics[statics.length - 1];
        if (hd !== undefined && manifest.has(hd) && art !== undefined)
          this.hdArt.push({ propId: prop.id, art });
        if (hd !== undefined && manifest.has(hd) && art !== undefined)
          this.hdPending.push({
            propId: prop.id,
            art,
            hd,
            parts: HD_PARTS[prop.asset] ?? [],
          });
      }
      const propFruit = scene.add.container(0, 0);
      root.add(propFruit);
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
        fruit,
        propFruit,
        birds,
        overlay,
      };
      nodes.push(node);
      if (plane !== null) this.byPlane.set(plane, node);
    }
    this.layers = nodes;
    // v1.6 (D-042): the biome's fair-weather cloud deck on the sky layer.
    const sky = nodes.find((n) => n.id === 'sky');
    if (sky !== undefined) {
      const left = -LAYER_BLEED_PX;
      const span = coreWidth(sky.scrollFactor) + LAYER_BLEED_PX * 2;
      this.cloudSpan = { left, span };
      let seed = 7;
      for (let k = 0; k < biome.id.length; k++) seed = (seed * 31 + biome.id.charCodeAt(k)) % 99991;
      for (const c of layoutDeck(CLOUD_DECKS[biome.id] ?? [], left, span, seed))
        this.addCloud(sky, c);
    }
  }

  private addCloud(sky: LayerNode, place: CloudPlace): void {
    const key = CLOUD_TEX[place.kind];
    const img = sky.root.scene.add.image(place.x, place.y, key).setOrigin(0.5, 0.75);
    const k = place.w / Math.max(1, img.width * CLOUD_SPRITE_SCALE);
    img
      .setScale(k * CLOUD_SPRITE_SCALE)
      .setTint(Number.parseInt(place.tint.slice(1), 16))
      .setAlpha(place.alpha);
    sky.root.addAt(img, sky.root.getIndex(sky.fixtures));
    this.clouds.push({ img, place });
  }

  /**
   * v1.6 (D-042): moves the clouds to sim time `tick` (a held frame holds still) and greys them
   * toward the rain colour while `weather` is on (rain or a storm), easing over a few seconds.
   */
  driftClouds(tick: number, weather: boolean): void {
    const dt = this.lastCloudTick === null ? 0 : Math.max(0, tick - this.lastCloudTick) / 60;
    this.lastCloudTick = tick;
    const target = weather ? 1 : 0;
    const before = this.gloom;
    this.gloom = target + (this.gloom - target) * Math.exp(-0.6 * dt);
    const seconds = tick / 60;
    for (const c of this.clouds) {
      c.img.x = driftX(c.place.x, c.place.speed, seconds, this.cloudSpan.left, this.cloudSpan.span);
      if (Math.abs(this.gloom - before) > 1e-4) c.img.setTint(gloomTint(c.place.tint, this.gloom));
    }
  }

  /** D-054: builds herds whose sheets landed and follows HD swaps, without posing them. */
  /** v1.7d (D-059): shows or hides one far herd by its key. */
  setHerdVisible(key: string, on: boolean): void {
    for (const f of this.fauna) f.setHerdVisible(key, on);
  }

  refreshFauna(): void {
    for (const f of this.fauna) f.refresh(true);
  }

  /** D-054: poses the far animals for sim tick `tick` (a held frame holds still). */
  animateFauna(tick: number, calm: boolean, viewWidth = Infinity): void {
    for (const f of this.fauna) f.update(tick, calm, viewWidth);
  }

  /** D-054 (test hook): every far-animal part as drawn. */
  faunaProbe(): FaunaProbe[] {
    return this.fauna.flatMap((f) => f.probe());
  }

  /** D-054 (test hook): far animals drawn now. */
  faunaCount(): number {
    return this.fauna.reduce((n, f) => n + f.animalCount(), 0);
  }

  /**
   * D-053 (test hook): the on-screen boxes (design px, rounded) of each layer's first tile and of
   * every prop and far animal: the same with Standard and HD art. `hd`: it draws an HD file.
   */
  boundsSample(): { key: string; x: number; y: number; w: number; h: number; hd: boolean }[] {
    const out: { key: string; x: number; y: number; w: number; h: number; hd: boolean }[] = [];
    const box = (key: string, a: StaticArt): void => {
      const b = a.img.getBounds();
      out.push({
        key,
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
        hd: isHdTexture(a.img.texture),
      });
    };
    for (const set of this.tileSets) {
      const a = set.arts[0];
      // Tiles differ in count (2048 texture px each); their union is what must match.
      if (a === undefined) continue;
      const last = set.arts[set.arts.length - 1] ?? a;
      const b0 = a.img.getBounds();
      const b1 = last.img.getBounds();
      out.push({
        key: `layer:${set.asset}`,
        x: Math.round(b0.x),
        y: Math.round(b0.y),
        w: Math.round(b1.right - b0.x),
        h: Math.round(b0.height),
        hd: isHdTexture(a.img.texture),
      });
    }
    for (const { art, key } of this.keyed) box(key, art);
    for (const f of this.fauna) out.push(...f.bounds());
    return out;
  }

  /**
   * D-053: when the manifest swapped art in or out since (AssetManifest.applyHd: HD landed
   * after "Play now in Standard"), puts each layer's tiles, each prop and far animal on the art
   * it serves now, in place: same positions, same on-screen size, same order. Returns true when
   * anything changed.
   */
  refreshHd(): boolean {
    // D-054: the herds too (also between hunts, when no world update poses them: the title's
    // herds are built once their sheets land, and follow an HD/Standard switch).
    this.refreshFauna();
    if (this.manifest.hdEpoch === this.hdEpoch) return false;
    this.hdEpoch = this.manifest.hdEpoch;
    this.restoreCulled();
    for (const set of this.tileSets) {
      const art = this.manifest.layer(set.asset);
      const make = this.makeTiles;
      const statics = this.statics[set.index];
      const first = set.arts[0];
      if (art === undefined || make === null || statics === undefined || first === undefined)
        continue;
      if (art.tiles.length === set.keys.length && art.tiles.every((k, i) => k === set.keys[i]))
        continue;
      const root = first.img.parentContainer as Phaser.GameObjects.Container | null;
      if (root === null) continue;
      const at = root.getIndex(first.img);
      const tint = first.img.tintTopLeft;
      const next = make(art, set.k);
      next.forEach((a, i) => {
        root.addAt(a.img, at + i);
        if (tint !== 0xffffff) a.img.setTint(tint);
      });
      const from = statics.indexOf(first);
      statics.splice(from, set.arts.length, ...next);
      for (const a of set.arts) a.img.destroy();
      set.arts = next;
      set.keys = art.tiles;
    }
    for (const { art, key, extra } of this.keyed) {
      const img = art.img;
      // A D-051 prop already on its HD stand-in keeps it.
      if (img.texture.key === hdKeyOf(key)) continue;
      const o = this.manifest.origin(key);
      img
        .setTexture(key)
        .setOrigin(o.x, o.y)
        .setScale(this.manifest.displayScale(key) * extra);
    }
    return true;
  }

  /**
   * D-051: swaps the props whose HD texture (and pieces) have landed since onto it:
   * AssetManifest.upgrade() renames the placeholder away (never removes it), then the prop image
   * takes the HD key. Cheap once nothing is pending. Returns the prop ids switched now.
   */
  upgradeHd(textures: Phaser.Textures.TextureManager): string[] {
    if (this.hdPending.length === 0) return [];
    const out: string[] = [];
    for (let i = this.hdPending.length - 1; i >= 0; i--) {
      const p = this.hdPending[i];
      if (p === undefined) continue;
      const keys = [p.hd, ...p.parts];
      for (const k of keys) this.manifest.upgrade(textures, k);
      if (!keys.every((k) => this.manifest.delivered(textures, k))) continue;
      const img = p.art.img;
      const o = this.manifest.origin(p.hd);
      img.setCrop();
      p.art.crop = null;
      img.setTexture(p.hd).setOrigin(o.x, o.y).setScale(this.manifest.displayScale(p.hd));
      this.hdPending.splice(i, 1);
      this.hdLive.add(p.propId);
      out.push(p.propId);
    }
    return out;
  }

  /** D-051 (test hook): each HD-capable prop's origin on screen (design px) and whether it shows
   *  its HD texture yet. */
  hdSpots(): { id: string; hd: boolean; x: number; y: number }[] {
    return this.hdArt.map(({ propId, art }) => {
      const img = art.img;
      const c = img.parentContainer as Phaser.GameObjects.Container | null;
      const sx = c?.scaleX ?? 1;
      const sy = c?.scaleY ?? 1;
      return {
        id: propId,
        hd: this.hdLive.has(propId),
        x: (c?.x ?? 0) + img.x * sx,
        y: (c?.y ?? 0) + img.y * sy,
      };
    });
  }

  /** D-051: the display scale of a texture (its delivered master; 1 for a placeholder). */
  displayScale(key: string): number {
    return this.manifest.displayScale(key);
  }

  /** D-051: true once a prop shows its HD texture. */
  hdShown(propId: string): boolean {
    return this.hdLive.has(propId);
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
      const tint = lightTint(lights, l.id);
      this.tints.set(l.id, tint);
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
          // A band with an edge (mist lying on the veld) goes under the layer's props, so a tall
          // prop never shows a hard light band where the mist starts (D-057); a whole-layer
          // distance haze has no edge and stays over the props, which are as far away as the art.
          const under = l.plane !== null && hazeBelowProps(h);
          l.root.addAt(rect, under ? l.root.getIndex(l.fruit) + 1 : l.root.getIndex(l.fixtures));
          this.shapes[i]?.push({
            shape: rect,
            rect: { x0: -LAYER_BLEED_PX, y0: top, x1: width - LAYER_BLEED_PX, y1: bottom },
            crop: true,
            changed: false,
          });
        }
        // Clouds sit on the sky layer, spread evenly along it with a fixed jitter (the same
        // sky every time this light is drawn). v1.6 (D-042): soft cloud sprites, drifting, in
        // the light's colour (heavy grey decks use the wide cumulus).
        if (l.id !== 'sky') continue;
        for (const c of light.clouds ?? []) {
          for (let k = 0; k < c.count; k++) {
            const j = (n: number): number => hash01(k * 7 + n + c.count * 131);
            this.addCloud(l, {
              kind: c.alpha >= 0.9 && c.color !== '#FFFFFF' ? 'wide' : 'cumulus',
              x: -LAYER_BLEED_PX + ((k + 0.25 + 0.5 * j(1)) / c.count) * width,
              y: c.y[0] + (c.y[1] - c.y[0]) * j(3),
              w: c.w[0] + (c.w[1] - c.w[0]) * j(2),
              speed: 4 + 3 * j(4),
              tint: c.color,
              alpha: c.alpha,
            });
          }
        }
      }
    });
  }

  /** v1.7c (D-047): the map light's tint on a layer (0xFFFFFF without one). */
  layerTint(id: string): number {
    return this.tints.get(id) ?? 0xffffff;
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

export { multiplyRgb } from './lightTint';

/** A fixed pseudo-random 0..1 from an integer (cloud placement; drawn only, never the sim). */
function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** A static image's layer-space box (its crop state starts empty). */
function staticOf(img: Phaser.GameObjects.Image, solid: SolidProfile | null): StaticArt {
  const left = img.x - img.originX * img.displayWidth;
  const top = img.y - img.originY * img.displayHeight;
  return {
    img,
    left,
    right: left + img.displayWidth,
    top,
    bottom: top + img.displayHeight,
    solid,
    crop: null,
  };
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
