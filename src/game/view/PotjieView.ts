// D-051 (Karoo polish, product owner 26 Oct): "add a small bit of animation to [the potjie], as if
// … the pot is boiling a little bit. And when it's shot, at least the deksel should fall off."
// Once the HD potjie has landed (late group; ParallaxView.upgradeHd swaps the prop to the lidless
// pot), this view draws on the prop's layer, above the pot: the coals' glow, the loose lid
// (rattling every few seconds, or flying off and lying beside the pot after the lid secret) and
// soft steam wisps. Every pose comes from potjieMotion.ts on sim ticks (held frames hold; reduce
// motion is calmer). Before the HD art lands the first-download pot (lid and steam painted on)
// shows unchanged. Sound cues go to HuntScene, which plays them through the AudioDirector.
import type * as Phaser from 'phaser';
import type { Biome } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { PlaneId, SimState } from '../../sim/types';
import { coreWidth } from '../../sim/world';
import { TEX } from '../assets/AssetManifest';
import { POTJIE_LID } from '../assets/hdProps';
import type { ParallaxView } from './ParallaxView';
import {
  bubbleAt,
  coalGlow,
  LID_LANDS,
  lidPose,
  rattleClack,
  steam,
  type PotState,
} from './potjieMotion';
import type { PotjieSound } from './potjieSounds';

/** The prop this view animates (content/biomes/karoo-autumn.json). */
export const POTJIE_ASSET = 'karoo/potjie';
/** Most wisps steam() returns (pooled images). */
const MAX_WISPS = 16;
/** The coals' glow under the pot (prop px from its origin) and the steam's tint. */
// Normal blend, low on the coal bed: an additive glow over the flames' yellow cores saturated
// them to lime in play (review, 27 Oct).
const COALS = { x: -2, y: 94, sx: 0.8, sy: 0.14, alpha: 0.5 } as const;
/** TEX.smoke is a 140 px cloud: wisps show at this fraction of steam()'s scale. */
const WISP_SCALE = 0.32;
/** Wisps are stretched upright (soft columns, not round dots) and lean with the wind. */
const WISP_STRETCH = { x: 0.7, y: 1.6, lean: 0.35 } as const;
const STEAM_TINT = 0xffffff;
const GLOW_TINT = 0xff5a1e;

export interface PotjieCue {
  readonly sound: PotjieSound;
  readonly screenX: number;
}

export class PotjieView {
  /** Sounds of this frame (HuntScene plays the ones on or near the screen). */
  cues: PotjieCue[] = [];
  private readonly root: Phaser.GameObjects.Container | null = null;
  private readonly propId: string | null = null;
  private readonly x: number = 0;
  private readonly plane: PlaneId = 'near';
  private readonly y: number = 0;
  private lid: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private readonly wisps: Phaser.GameObjects.Image[] = [];
  private live = false;
  /** The tick the lid secret went off (null: lid still on). */
  private offTick: number | null = null;
  private lastTick: number | null = null;
  private rattles = 0;
  private clangs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    biome: Biome,
    private readonly parallax: ParallaxView,
  ) {
    const prop = biome.props.find((p) => p.asset === POTJIE_ASSET);
    const def = prop === undefined ? undefined : biome.layers.find((l) => l.id === prop.layer);
    const layer = prop === undefined ? undefined : parallax.layer(prop.layer);
    if (prop === undefined || def === undefined || layer === undefined) return;
    this.propId = prop.id;
    this.x = prop.u * coreWidth(def.scrollFactor);
    this.plane = def.plane ?? 'near';
    this.y = prop.y;
    this.root = scene.add.container(this.x, this.y).setVisible(false);
    // Behind the secret marks (fixtures added later), above the pot.
    layer.fixtures.addAt(this.root, 0);
  }

  /** The lid is off (the secret went off this hunt). */
  get lidOff(): boolean {
    return this.offTick !== null;
  }

  /** Test hook. */
  get hook(): {
    hd: boolean;
    lidOff: boolean;
    rattles: number;
    clangs: number;
    wisps: number;
    lid: { x: number; y: number; rot: number } | null;
  } | null {
    if (this.root === null) return null;
    const lid = this.lid;
    return {
      hd: this.live,
      lidOff: this.lidOff,
      rattles: this.rattles,
      clangs: this.clangs,
      wisps: this.wisps.filter((w) => w.visible).length,
      lid: lid === null ? null : { x: lid.x, y: lid.y, rot: lid.rotation },
    };
  }

  /** The sim's events: the lid secret going off starts the lid's flight. */
  handle(events: readonly SimEvent[]): void {
    for (const e of events)
      if (e.type === 'secretTriggered' && e.propId === this.propId && this.offTick === null)
        this.offTick = e.tick;
  }

  private build(): void {
    const root = this.root;
    if (root === null) return;
    this.glow = this.scene.add
      .image(COALS.x, COALS.y, TEX.smoke)
      .setTint(GLOW_TINT)
      .setScale(COALS.sx, COALS.sy);
    root.add(this.glow);
    for (let i = 0; i < MAX_WISPS; i++) {
      const w = this.scene.add.image(0, 0, TEX.smoke).setTint(STEAM_TINT).setVisible(false);
      this.wisps.push(w);
    }
    this.lid = this.scene.add.image(0, 0, POTJIE_LID);
    const o = this.scene.textures.get(POTJIE_LID).getSourceImage();
    // The lid's origin is its rim's middle (POTJIE_LID_SIZE); its texture is 2× (scale 0.5).
    this.lid.setOrigin(66 / 132, 40 / 56).setScale(132 / o.width);
    // Steam behind the lid while it sits on the pot rises in front of the pot body.
    root.add([...this.wisps, this.lid]);
    root.setVisible(true);
    this.live = true;
  }

  update(s: SimState, calm: boolean, screenW: number): void {
    this.cues = [];
    if (this.root === null || this.propId === null) return;
    const sec = s.secrets.find((x) => x.propId === this.propId);
    // A hunt that restored with the secret spent (or a missed event): the lid lies there.
    if (this.offTick === null && sec?.done === true) this.offTick = s.tick - LID_LANDS - 20;
    if (!this.live) {
      if (!this.parallax.hdShown(this.propId)) return;
      this.build();
    }
    const advanced = this.lastTick !== null && s.tick > this.lastTick;
    const prevTick = this.lastTick ?? s.tick;
    this.lastTick = s.tick;
    const wind = s.wind === null ? 0 : s.wind.dir * s.wind.strength;
    const st: PotState = {
      tick: s.tick,
      sinceOff: this.offTick === null ? null : s.tick - this.offTick,
      calm,
      wind,
    };
    const lid = lidPose(st);
    this.lid?.setPosition(lid.x, lid.y).setRotation(lid.rot);
    const ws = steam(st);
    this.wisps.forEach((img, i) => {
      const w = ws[i];
      if (w === undefined) {
        img.setVisible(false);
        return;
      }
      img
        .setVisible(true)
        .setPosition(w.x, w.y)
        .setScale(w.scale * WISP_SCALE * WISP_STRETCH.x, w.scale * WISP_SCALE * WISP_STRETCH.y)
        .setRotation(w.lean * WISP_STRETCH.lean)
        .setAlpha(w.alpha);
    });
    this.glow?.setAlpha(coalGlow(s.tick, calm) * COALS.alpha);
    if (!advanced) return;
    // Sounds of the ticks since the last frame (never on a held frame).
    const at = this.parallax.screenX(this.plane, this.x);
    const near = Math.abs(at - screenW / 2) <= screenW * 0.6;
    for (let t = prevTick + 1; t <= s.tick; t++) {
      if (this.offTick === null) {
        if (rattleClack(t, calm)) {
          this.rattles++;
          if (near) this.cues.push({ sound: 'rattle', screenX: at });
        }
      } else if (t - this.offTick === LID_LANDS) {
        this.clangs++;
        this.cues.push({ sound: 'clang', screenX: at });
      }
      if (near && bubbleAt(t, this.offTick !== null))
        this.cues.push({ sound: 'bubble', screenX: at });
    }
  }

  /** A hunt ended: the next one starts afresh (the objects live with the layers). */
  clear(): void {
    this.offTick = null;
    this.lastTick = null;
    this.cues = [];
  }
}
