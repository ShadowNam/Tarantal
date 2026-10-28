// v1.7c (D-047, product owner 25 Oct: "When shooting these fruits, make them swing or drop
// down"): the hanging and fallen fruit, pods and flowers as sprites on their layers. A shot that
// lands on or near one swings it about its stalk; a hard hit snaps it off: it falls, bounces on
// its ground line with a dust puff, rolls a little and lies there for the rest of the hunt.
// Rendering only: hits come from the sim's pelletImpact events and every pose is a function of
// sim ticks (fruitMotion.ts), so replays and held frames draw the same. The sim never knows the
// fruit exist: no score, no penalty, no effect on any hit test. HuntScene loads this module
// lazily (it is not in the first download).
import * as Phaser from 'phaser';
import type { Biome, Charm, Feel, Weapon } from '../../../content/schemas';
import { passivesOf } from '../../../sim/charms/interpreter';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import { coreWidth } from '../../../sim/world';
import type { AssetManifest } from '../../assets/AssetManifest';
import { TEX } from '../../assets/AssetManifest';
import type { AudioDirector } from '../../audio/AudioDirector';
import type { ParallaxView } from '../ParallaxView';
import {
  fruitShot,
  fruitAim,
  pelletsOnLayer,
  shotDriftPx,
  type Impact,
  type LayerPellet,
  type PelletStop,
  type ShotFrame,
} from './fruitHits';
import {
  RESTING,
  fruitPose,
  hitFruit,
  landTick,
  swingEnvelope,
  type FruitState,
  type FruitTuning,
  withFall,
} from './fruitMotion';
import { playFruitSound } from './fruitSounds';
import { fruitSheetKey, type FruitSpot } from './fruitTypes';

const SPOT_FILES = import.meta.glob<readonly FruitSpot[]>('./spots/*.json', { import: 'default' });

/** The biome's fruit spots (empty when it has none). */
export async function loadFruitSpots(biome: string): Promise<readonly FruitSpot[]> {
  const load = SPOT_FILES[`./spots/fruit-${biome}.json`];
  return load === undefined ? [] : load();
}

interface Fruit {
  readonly index: number;
  readonly spot: FruitSpot;
  /** Its frames on the sheet. */
  readonly frame: string;
  readonly stalkFrame: string;
  readonly layerId: string;
  readonly factor: number;
  /** Where the spot's pivot is on the layer (prop position added). */
  readonly x: number;
  readonly y: number;
  readonly ground: number;
  /** The fruit, and the stalk it hangs from (stays on the tree when it snaps off). */
  readonly img: Phaser.GameObjects.Image;
  readonly stalk: Phaser.GameObjects.Image | null;
  /** A soft contact shadow under it once it lies on the ground. */
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly puff: Phaser.GameObjects.Image;
  state: FruitState;
  /** Posed at rest and nothing moving (update skips it until it is hit). */
  still: boolean;
  /** Drawn (on screen); hidden while off screen. */
  shown: boolean;
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
  /** Where to aim at its body on screen. */
  readonly aimX: number;
  readonly aimY: number;
  readonly angle: number;
  readonly dropped: boolean;
  readonly landed: boolean;
  readonly hits: number;
}

/** What FruitView needs of the hunt to see shots as the sim did. */
export interface FruitWorld {
  readonly weapons: readonly Weapon[];
  readonly charms: readonly Charm[];
  /** The map's wind drift at the far plane (0 without wind), and the far plane's scroll factor. */
  readonly driftPxAtFar: number;
  readonly farFactor: number;
  /** The camera centre the sim resolved a tick's shots with (null once out of memory). */
  cameraAt(tick: number): number | null;
}

export class FruitView {
  private readonly shotWeapon = new Map<number, string>();
  private charmKey: string | null = null;
  private charmMul = 1;
  private readonly fruit: Fruit[] = [];
  private spotList: readonly FruitSpot[] = [];
  private readonly key: string;
  private readonly tuning: FruitTuning;
  private lastTick = -1;
  private tick = 0;
  /** True while the sheet is the empty placeholder (the late group may still bring it). */
  private waiting: boolean;
  /** Frames drawn while waiting (the sheet is looked for every 30). */
  private frames = 0;
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
    private readonly world: FruitWorld,
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
      const k = 1 / spot.res;
      const st = spot.stalk;
      const stalk =
        st === null
          ? null
          : scene.add
              .image(x + spot.x, y + spot.y, this.key, stalkName(i))
              .setOrigin(st.ox / st.fw, st.oy / st.fh)
              .setScale(k);
      const shadow = scene.add.ellipse(0, 0, 10, 4, 0x2a1a14, 0.3).setVisible(false);
      const img = scene.add
        .image(x + spot.x + spot.ax, y + spot.y + spot.ay, this.key, frameName(i))
        .setOrigin(spot.ox / spot.fw, spot.oy / spot.fh)
        .setScale(k);
      const puff = scene.add.image(0, 0, TEX.dust).setVisible(false);
      // Below the layer's haze and fixtures (meerkats, secret marks): layer fruit right over the
      // layer art (props stand in front of them), prop fruit right over the props.
      (spot.prop ? layer.propFruit : layer.fruit).add([
        ...(stalk === null ? [] : [stalk]),
        shadow,
        img,
        puff,
      ]);
      // The map light's colour, as on the tree they hang from (they used to be part of its art).
      const tint = parallax.layerTint(layerId);
      if (tint !== 0xffffff) {
        img.setTint(tint);
        stalk?.setTint(tint);
        puff.setTint(tint);
      }
      this.fruit.push({
        index,
        spot,
        frame: frameName(i),
        stalkFrame: stalkName(i),
        stalk,
        shadow,
        layerId,
        factor: def.scrollFactor,
        x: x + spot.x,
        y: y + spot.y,
        ground: y + spot.ground,
        img,
        puff,
        state: RESTING,
        still: false,
        shown: false,
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
      if (!tex.has(frameName(i))) tex.add(frameName(i), 0, s.fx, s.fy, s.tw, s.th);
      const st = s.stalk;
      if (st !== null && !tex.has(stalkName(i)))
        tex.add(stalkName(i), 0, st.fx, st.fy, st.tw, st.th);
    });
  }

  /** The late group's sheet arrived (Karoo, Kalahari): swap it in and re-point the sprites. */
  private upgrade(): void {
    if (!this.manifest.lateDone) return;
    if (this.manifest.upgrade(this.scene.textures, this.key).length === 0) {
      // Nothing arrived for it (no delivery, or the file failed): stop looking, show none.
      this.waiting = this.isPlaceholder();
      if (this.waiting) this.frames = Number.NEGATIVE_INFINITY;
      return;
    }
    this.addFrames(this.spotList);
    for (const f of this.fruit) {
      f.img.setTexture(this.key, f.frame);
      f.stalk?.setTexture(this.key, f.stalkFrame);
    }
    this.waiting = false;
    for (const f of this.fruit) f.still = false;
  }

  /** Pellet impacts of this batch of events: hits, near misses, drops, sounds. */
  handle(
    events: readonly SimEvent[],
    state: SimState,
    stopOf: (e: Extract<SimEvent, { type: 'pelletImpact' }>) => PelletStop | null,
    width: number,
  ): void {
    if (this.fruit.length === 0) return;
    // Which gun fired each shot (a stone lands ticks after its shotFired).
    for (const e of events) if (e.type === 'shotFired') this.shotWeapon.set(e.shotId, e.weapon);
    if (this.shotWeapon.size > 64) {
      const old = [...this.shotWeapon.keys()].slice(0, this.shotWeapon.size - 64);
      for (const k of old) this.shotWeapon.delete(k);
    }
    // Nothing to see yet (the late sheet is not in): nothing reacts or sounds either.
    if (this.waiting) return;
    const shots = new Map<number, Extract<SimEvent, { type: 'pelletImpact' }>[]>();
    for (const e of events) {
      if (e.type !== 'pelletImpact' || e.paperId !== undefined) continue;
      const list = shots.get(e.shotId) ?? [];
      list.push(e);
      shots.set(e.shotId, list);
    }
    for (const [shotId, list] of shots) {
      const tick = list[0]?.tick ?? state.tick;
      const impacts: Impact[] = list.map((e) => ({
        dx: e.dx,
        sy: e.sy,
        ...(e.cx === undefined ? {} : { cx: e.cx }),
        stop: stopOf(e),
      }));
      const weapon = this.world.weapons.find((w) => w.id === this.shotWeapon.get(shotId));
      const frame: ShotFrame = {
        camX: this.world.cameraAt(tick) ?? state.cameraX,
        drift: shotDriftPx(
          state.wind,
          this.world.driftPxAtFar,
          weapon?.windSensitivity ?? 1,
          this.windDriftMul(state.season?.charms ?? []),
        ),
        farFactor: this.world.farFactor,
      };
      const byFactor = new Map<number, LayerPellet[]>();
      const pelletsOn = (factor: number): LayerPellet[] => {
        let pellets = byFactor.get(factor);
        if (pellets === undefined) {
          pellets = pelletsOnLayer(impacts, factor, frame);
          byFactor.set(factor, pellets);
        }
        return pellets;
      };
      let knocked: Fruit | null = null;
      for (const f of this.fruit) {
        if (f.state.dropTick !== null) continue;
        const pose = fruitPose(f.spot, f.state, tick, this.tuning, this.reduced);
        // The thin stalk takes no hits: only the fruit's own frame, where it is drawn.
        const pivot = { x: f.x + pose.bx, y: f.y + pose.by };
        const shot = fruitShot(f.spot, pivot, pose.angle, pelletsOn(f.factor), tick, this.tuning);
        const next = hitFruit(f.state, f.spot.motion, shot, this.tuning, this.reduced);
        if (next === f.state) continue;
        if (shot.pellets > 0) {
          this.hitCount++;
          f.hitTick = tick;
          knocked = f;
        }
        if (next.dropTick !== null) this.dropCount++;
        // A drop works its fall out once (poses reuse it every frame).
        f.state = withFall(f.spot, next, this.tuning, this.reduced);
        f.still = false;
      }
      if (knocked !== null) playFruitSound(this.audio, 'thock', this.pan(knocked, width));
    }
  }

  /** The charms' wind drift multiplier (Season Run), as the sim works it out. */
  private windDriftMul(ids: readonly string[]): number {
    const key = ids.join(',');
    if (key !== this.charmKey) {
      this.charmKey = key;
      const defs = ids.flatMap((id) => this.world.charms.filter((c) => c.id === id));
      this.charmMul = passivesOf(defs).windDriftMul;
    }
    return this.charmMul;
  }

  private pan(f: Fruit, width: number): number {
    const node = this.parallax.layer(f.layerId);
    const x = node === undefined ? width / 2 : node.root.x + f.x * node.root.scaleX;
    return (x - width / 2) / (width / 2);
  }

  /**
   * Poses every fruit for the sim time `at` (the snapshot's tick − 1 + the frame's interpolation,
   * like the birds and the camera; a held frame keeps it fixed). Fruit off screen are hidden and
   * skipped; fruit at rest are posed once and then left alone until something moves them.
   */
  update(s: SimState, width: number, at: number = s.tick): void {
    this.tick = s.tick;
    if (this.waiting && ++this.frames % 30 === 0) this.upgrade();
    const t = this.tuning;
    const puffTicks = Math.max(1, Math.round(t.puffSeconds * 60));
    const settleTicks = (t.swingSeconds + t.rollSeconds * 5) * 60;
    for (const f of this.fruit) {
      // A thud once, when it first lands (not again on a replayed or held tick), seen or not.
      if (f.state.dropTick !== null) {
        const land = landTick(f.spot, f.state, t, this.reduced);
        if (land !== null && f.thudAt !== land && this.lastTick < land && s.tick >= land) {
          f.thudAt = land;
          if (s.tick - land < 10) playFruitSound(this.audio, 'thud', this.pan(f, width));
        }
      }
      if (!this.onScreen(f, width)) {
        if (f.shown) this.hide(f);
        continue;
      }
      if (!f.shown) {
        f.shown = true;
        f.still = false;
      }
      if (f.still) continue;
      const pose = fruitPose(f.spot, f.state, at, t, this.reduced);
      const bx = f.x + pose.bx;
      const by = f.y + pose.by;
      f.img
        .setPosition(bx, by)
        .setRotation(pose.angle)
        .setAlpha(pose.alpha)
        .setVisible(!this.waiting && pose.alpha > 0);
      f.stalk?.setRotation(pose.stalkAngle).setVisible(!this.waiting);
      // The body's centre (the dust and the shadow sit under it, not under a long stalk).
      const body = rotate(
        { x: bx - f.spot.ox + f.spot.fw / 2, y: by - f.spot.oy + f.spot.fh / 2 },
        bx,
        by,
        pose.angle,
      );
      if (pose.landedTicks !== null && !this.waiting) {
        // Lying: as wide as it lies, flattened; it fades with the fruit.
        const across = Math.abs(Math.sin(pose.angle));
        const w = (f.spot.fw * (1 - across) + f.spot.fh * across) * 0.95;
        const lift = Math.max(0, f.ground - (by + (f.spot.fh - f.spot.oy) * (1 - across)));
        f.shadow
          .setPosition(body.x, f.ground - 1)
          .setSize(w, Math.max(3, w * 0.14))
          .setAlpha(pose.alpha * Math.max(0.1, 0.32 - lift * 0.01))
          .setVisible(pose.alpha > 0);
      } else f.shadow.setVisible(false);
      // The puff: leaves on a hit, dust where it lands (small and local; scaled on sim time).
      const since =
        pose.landedTicks !== null ? pose.landedTicks : f.hitTick !== null ? at - f.hitTick : null;
      const puffing = since !== null && since >= 0 && since < puffTicks;
      if (!puffing) f.puff.setVisible(false);
      else {
        const p = since / puffTicks;
        const landed = pose.landedTicks !== null;
        const size = t.puffPx * (0.4 + p * 0.8) * (landed ? 1 : 0.7);
        f.puff
          .setTexture(landed ? TEX.dust : TEX.leaf)
          .setPosition(body.x, landed ? f.ground - 4 : body.y)
          .setDisplaySize(size, size * (landed ? 0.55 : 1))
          .setRotation(landed ? 0 : p * 2)
          .setAlpha((1 - p) * 0.8)
          .setVisible(true);
      }
      // Nothing more will move it: at rest, faded out, or its swing and roll have died down.
      const last = f.state.hits[f.state.hits.length - 1];
      f.still =
        !puffing &&
        !this.waiting &&
        (f.state === RESTING ||
          (f.state.dropTick !== null && pose.alpha === 0) ||
          (f.state.dropTick === null && last !== undefined && at - last.tick > settleTicks));
    }
    this.lastTick = s.tick;
  }

  /** Inside the view (with room for the fruit's reach) on its layer now. */
  private onScreen(f: Fruit, width: number): boolean {
    const node = this.parallax.layer(f.layerId);
    if (node === undefined) return false;
    const pad = (Math.max(f.spot.fh, f.spot.stalk?.fh ?? 0) + f.spot.fw + 80) * node.root.scaleX;
    const x = node.root.x + f.x * node.root.scaleX;
    return x > -pad && x < width + pad;
  }

  private hide(f: Fruit): void {
    f.shown = false;
    f.img.setVisible(false);
    f.stalk?.setVisible(false);
    f.shadow.setVisible(false);
    f.puff.setVisible(false);
  }

  /** Every fruit for the e2e hook, on screen or not (at most 200), in screen design px. */
  spots(): FruitHookSpot[] {
    const out: FruitHookSpot[] = [];
    for (const f of this.fruit) {
      const node = this.parallax.layer(f.layerId);
      if (node === undefined) continue;
      const sx = (x: number): number => node.root.x + x * node.root.scaleX;
      const sy = (y: number): number => node.root.y + y * node.root.scaleY;
      const x = sx(f.img.x);
      if (out.length >= 200) break;
      // Aim at the body's middle, turned with the swing (fruitAim: inside its hit area).
      const aim = fruitAim(f.spot, { x: f.img.x, y: f.img.y }, f.img.rotation);
      const cx = aim.x;
      const cy = aim.y;
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
      f.still = false;
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
      f.stalk?.destroy();
      f.shadow.destroy();
      f.puff.destroy();
    }
    this.fruit.length = 0;
  }
}

/** `p` turned by `a` (radians, clockwise on screen) about (cx, cy). */
function rotate(p: LayerPellet, cx: number, cy: number, a: number): LayerPellet {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function frameName(i: number): string {
  return `f${i}`;
}

function stalkName(i: number): string {
  return `s${i}`;
}
