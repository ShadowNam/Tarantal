// v1.7e (D-061, GDD §11.1c, art bible §5.2) The secrets' tell animals on screen (a lazy chunk: not
// in the first download). Each tell is one sprite in its prop's layer (above the props, under the
// layer's haze, in the map light's tint) drawn from the sim's snapshot: rest; its small action
// (act_a / act_b in turn, a few frames each); after a hit, the flee frame moving off for a moment,
// then nothing until the sim brings it back. Everything is on sim time (held frames hold). When
// the secrets are lit (Oupa se Kaart, a dusk map, the Meerkat Spotter) a second sprite behind it,
// a little bigger and filled warm, gives it a soft warm outline. Phone rules (D-059): two images
// per tell at most, properties set only when they change, no per-frame allocations, and its own
// timer (tellMs) for the perf test.
import { setFootOrigin } from '../footOrigin';
import * as Phaser from 'phaser';
import type { Biome } from '../../../content/schemas';
import type { SimState, TellView as SimTell } from '../../../sim/types';
import type { ParallaxView } from '../ParallaxView';
import { TELL_SHEET, tellFrameName, tellFrames, tellTexelsPerPx, type TellPose } from './tellSheet';

/** Ticks each action frame shows before the other. */
const ACT_FRAME_TICKS = 8;
/** Ticks the flee frame shows (moving off) after a hit. */
const FLEE_TICKS = 18;
/** Flee speed (prop px per tick) and climb for a bird. */
const FLEE_PX = 3;
/** Ticks a tell fades in after it comes back (or the hunt starts). */
const FADE_IN_TICKS = 12;
/** The warm outline: colour, alpha, how much bigger than the animal. */
const GLOW_TINT = 0xffc46a;
const GLOW_ALPHA = 0.55;
const GLOW_GROW = 1.18;
/** Species that crawl or run away along the ground (the rest fly). */
const GROUND: ReadonlySet<string> = new Set([
  'rock_agama',
  'striped_skink',
  'flap_necked_chameleon',
  'striped_mouse',
]);

/** e2e: one tell on screen (design px) and what it shows. */
export interface TellHook {
  readonly species: string;
  readonly propId: string;
  readonly frame: string | null;
  /** Feet on screen (design px). */
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly glow: boolean;
  /** The sprite's alpha now (1 except fading in, or fleeing). */
  readonly alpha: number;
}

interface Slot {
  readonly img: Phaser.GameObjects.Image;
  readonly glow: Phaser.GameObjects.Image;
  readonly layerId: string;
  /** Review R9: the species' drawing scale (birds.json tells.species[].scale). */
  readonly scale: number;
  frame: string;
  x: number;
  y: number;
  alpha: number;
  shown: boolean;
  lit: boolean;
  /** The sim phase last seen, and whether this rest is a fade-in (review R6: only at the start
   *  of the hunt or back from 'gone', never after its own action). */
  phase: string | null;
  fadeIn: boolean;
  hook: TellHook;
}

/** What TellView needs of the AssetManifest (review R11: the late sheet arrives mid-hunt). */
export interface TellSheetSource {
  /** True once the delivered sheet (or its HD twin) is the texture under the key. */
  delivered(textures: Phaser.Textures.TextureManager, key: string): boolean;
  /** Swaps a placeholder for the delivered file once it has arrived. */
  upgrade(textures: Phaser.Textures.TextureManager, prefix: string): string[];
}

/** Frames between looks for the delivered sheet while it hasn't landed. */
const SHEET_POLL_FRAMES = 30;

/** True when this map has a secret with a tell. */
export function wantsTells(biome: Biome): boolean {
  return biome.props.some((p) => p.secret?.tell !== undefined);
}

export class TellView {
  private readonly slots = new Map<number, Slot>();
  private sheet: Phaser.Textures.Texture | null = null;
  /** Texture px per prop px of the sheet under the key (2: the delivered 2× art). */
  private k = 2;
  private hooks: TellHook[] = [];
  /** Frames since the hunt began waiting for the delivered sheet (polls every 30). */
  private waitFrames = 0;
  /** Milliseconds the last update took (perf.spec: tellMs). */
  lastMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly now: () => number,
    /** The hunt's manifest: the sheet is ready only once the delivered file is under the key. */
    private readonly manifest: TellSheetSource,
    /** The species (birds.json → tells.species): each one's drawing scale. */
    private readonly species: readonly {
      readonly id: string;
      readonly scale?: number | undefined;
    }[] = [],
    /** v1.12 (polish a): props whose tell is drawn above the layer's fixtures — a prop with a
     *  turning rotor and its target discs (the Karoo windpomp's kestrel): under them, every disc
     *  that came round hid the bird. */
    private readonly aboveFixtures: ReadonlySet<string> = new Set(),
    /** The e2e hooks are on: `__TM_TELL_UNDER__(on)` puts those tells back under the fixtures
     *  (the screenshot spec's "before" of polish a). */
    hooks = false,
  ) {
    if (hooks && aboveFixtures.size > 0)
      (window as { __TM_TELL_UNDER__?: (on: boolean) => void }).__TM_TELL_UNDER__ = (on) => {
        for (const s of this.slots.values()) {
          if (!this.aboveFixtures.has(s.hook.propId)) continue;
          const layer = this.parallax.layer(s.layerId);
          if (layer !== undefined) (on ? layer.propFruit : layer.fixtures).add([s.glow, s.img]);
        }
      };
  }

  /**
   * Review R11: true once the delivered sheet (Standard or its HD twin) is under the key. The
   * placeholder install() draws is an EMPTY canvas at full size: cutting frames from it showed
   * nothing while the hook said the tells were visible. While the late group hasn't landed, look
   * for it every SHEET_POLL_FRAMES frames and swap it in (as FruitView does).
   */
  sheetReady(): boolean {
    const tx = this.scene.textures;
    if (!this.manifest.delivered(tx, TELL_SHEET)) {
      if (this.waitFrames++ % SHEET_POLL_FRAMES !== 0) return false;
      this.manifest.upgrade(tx, TELL_SHEET);
      if (!this.manifest.delivered(tx, TELL_SHEET)) return false;
    }
    return this.ensureSheet();
  }

  /** The sheet as last cut: cut again (and every sprite moved over) after a texture swap. */
  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(TELL_SHEET)) return false;
    const tex = this.scene.textures.get(TELL_SHEET);
    if (tex === this.sheet) return true;
    const w = tex.getSourceImage().width;
    const k = tellTexelsPerPx(w);
    for (const f of tellFrames()) {
      const fr = tex.has(f.name)
        ? tex.get(f.name)
        : tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
      if (fr === null) continue;
      fr.customPivot = true;
      fr.pivotX = f.ox / f.w;
      fr.pivotY = f.oy / f.h;
    }
    this.k = k;
    for (const s of this.slots.values()) {
      s.img.setTexture(TELL_SHEET, s.frame).setScale(s.scale / k);
      s.glow.setTexture(TELL_SHEET, s.frame).setScale((GLOW_GROW * s.scale) / k);
    }
    this.sheet = tex;
    return true;
  }

  private slot(t: SimTell): Slot | null {
    let s = this.slots.get(t.id);
    if (s !== undefined) return s;
    const layer = this.parallax.layer(t.layerId);
    if (layer === undefined) return null;
    const frame = tellFrameName(t.species, 'rest');
    const scale = this.species.find((x) => x.id === t.species)?.scale ?? 1;
    const glow = this.scene.add
      .image(t.x, t.y, TELL_SHEET, frame)
      .setScale((GLOW_GROW * scale) / this.k)
      .setTint(GLOW_TINT)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(GLOW_ALPHA)
      .setVisible(false);
    const img = this.scene.add
      .image(t.x, t.y, TELL_SHEET, frame)
      .setScale(scale / this.k)
      .setVisible(false);
    const tint = this.parallax.layerTint(t.layerId);
    if (tint !== 0xffffff) img.setTint(tint);
    if (t.facing === -1) {
      img.setFlipX(true);
      glow.setFlipX(true);
    }
    (this.aboveFixtures.has(t.propId) ? layer.fixtures : layer.propFruit).add([glow, img]);
    s = {
      img,
      glow,
      layerId: t.layerId,
      scale,
      frame,
      x: t.x,
      y: t.y,
      alpha: 1,
      shown: false,
      lit: false,
      phase: null,
      fadeIn: false,
      hook: {
        species: t.species,
        propId: t.propId,
        frame: null,
        x: 0,
        y: 0,
        visible: false,
        glow: false,
        alpha: 0,
      },
    };
    this.slots.set(t.id, s);
    return s;
  }

  /** Draws the tells at this tick; `lit`: the secrets glow (warm outline). */
  update(state: SimState, lit: boolean): void {
    const t0 = this.now();
    if (!this.sheetReady()) {
      // Not delivered yet: nothing is drawn, and the hook says so (frame null, not visible).
      if (this.hooks.length !== state.tells.length)
        this.hooks = state.tells.map((t) => ({
          species: t.species,
          propId: t.propId,
          frame: null,
          x: 0,
          y: 0,
          visible: false,
          glow: false,
          alpha: 0,
        }));
      for (const s of this.slots.values())
        if (s.shown) {
          s.img.setVisible(false);
          s.glow.setVisible(false);
          s.shown = false;
          s.lit = false;
        }
      this.lastMs = this.now() - t0;
      return;
    }
    if (this.hooks.length !== state.tells.length) this.hooks = [];
    let i = 0;
    for (const t of state.tells) {
      const s = this.slot(t);
      if (s === null) continue;
      let pose: TellPose | null = 'rest';
      let x = t.x;
      let y = t.y;
      let alpha = 1;
      if (t.phase !== s.phase) {
        s.fadeIn = t.phase === 'rest' && s.phase !== 'act';
        s.phase = t.phase;
      }
      if (t.phase === 'act') pose = Math.floor(t.t / ACT_FRAME_TICKS) % 2 === 0 ? 'act_a' : 'act_b';
      else if (t.phase === 'gone') {
        if (t.t >= FLEE_TICKS) pose = null;
        else {
          pose = 'flee';
          // Away from the camera's side it faces: behind the prop, up for a bird.
          x -= t.facing * t.t * FLEE_PX;
          if (!GROUND.has(t.species)) y -= t.t * FLEE_PX * 0.6;
          alpha = Math.max(0, 1 - Math.max(0, t.t - (FLEE_TICKS - 6)) / 6);
        }
      } else if (s.fadeIn && t.t < FADE_IN_TICKS) alpha = t.t / FADE_IN_TICKS;
      const show = pose !== null && alpha > 0;
      if (show !== s.shown) {
        s.img.setVisible(show);
        s.shown = show;
      }
      const glowOn = show && lit;
      if (glowOn !== s.lit) {
        s.glow.setVisible(glowOn);
        s.lit = glowOn;
      }
      if (pose !== null) {
        const frame = tellFrameName(t.species, pose);
        if (frame !== s.frame) {
          s.img.setFrame(frame);
          s.glow.setFrame(frame);
          // The origin at the frame's feet, flipped or not (a custom pivot: footOrigin.ts).
          setFootOrigin(s.img, t.facing === -1);
          setFootOrigin(s.glow, t.facing === -1);
          s.frame = frame;
        }
        if (x !== s.x || y !== s.y) {
          s.img.setPosition(x, y);
          s.glow.setPosition(x, y);
          s.x = x;
          s.y = y;
        }
        if (alpha !== s.alpha) {
          s.img.setAlpha(alpha);
          s.glow.setAlpha(alpha * GLOW_ALPHA);
          s.alpha = alpha;
        }
      }
      const layer = this.parallax.layer(s.layerId);
      if (layer !== undefined) {
        const hx = Math.round(layer.root.x + x * layer.root.scaleX);
        const hy = Math.round(layer.root.y + y * layer.root.scaleY);
        const h = s.hook;
        const f = show ? s.frame : null;
        const a = show ? alpha : 0;
        if (
          h.x !== hx ||
          h.y !== hy ||
          h.visible !== show ||
          h.glow !== glowOn ||
          h.frame !== f ||
          h.alpha !== a
        )
          s.hook = { ...h, x: hx, y: hy, visible: show, glow: glowOn, frame: f, alpha: a };
      }
      this.hooks[i++] = s.hook;
    }
    this.lastMs = this.now() - t0;
  }

  /** e2e: every tell of the hunt (shown or not). */
  get tells(): readonly TellHook[] {
    return this.hooks;
  }

  destroy(): void {
    for (const s of this.slots.values()) {
      s.img.destroy();
      s.glow.destroy();
    }
    this.slots.clear();
  }
}
