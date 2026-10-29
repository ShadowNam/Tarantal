// v1.7d (D-059, GDD §11.3c, art bible §4.5d) Namibië's ostriches, drawn from the snapshot and
// the event stream (never from sim internals): each pair's scrape with its eggs, then the birds
// in the pose the sim gives them (the walk and run steps from the pose's own ticks, so a held
// frame holds), mirrored to their facing, in the fixtures of their layer (birds stand in front).
// A hit throws a puff of feathers (a nest hit: sand); the male's display booms, a hit bird
// hisses, a running pair thuds. Sounds go through the AudioDirector (stand-in synths until
// recordings are in).
import type * as Phaser from 'phaser';
import type { SimEvent } from '../../../sim/events';
import type { OstrichFamilyView, SimState } from '../../../sim/types';
import { TEX } from '../../assets/AssetManifest';
import type { AudioDirector, Synth } from '../../audio/AudioDirector';
import type { LayerNode, ParallaxView } from '../ParallaxView';
import {
  EGG_SPOTS,
  OSTRICH_ART_SCALE,
  OSTRICH_SHEET,
  ostrichFrame,
  ostrichFrames,
  ostrichTexelsPerPx,
  framePose,
  type OstrichRect,
} from './ostrichSheet';

/** Sound keys (a delivered recording under the key wins over the synth). */
export const OSTRICH_SOUNDS = {
  boom: 'sfx/ostrich_boom',
  hiss: 'sfx/ostrich_hiss',
  thud: 'sfx/ostrich_thud',
} as const;

function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  peak: number,
  len: number,
  delay = 0,
): void {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + len * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}

function noiseBurst(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  freq: number,
  q: number,
  peak: number,
  len: number,
  delay = 0,
): void {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.05, len * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + len + 0.02);
}

/** Stand-ins: the cock's deep three-part boom, a breathy hiss, heavy running footfalls. */
export const OSTRICH_SYNTH: Record<keyof typeof OSTRICH_SOUNDS, Synth> = {
  boom: (ctx, out) => {
    tone(ctx, out, 'sine', 70, 58, 0.5, 0.45);
    tone(ctx, out, 'sine', 66, 52, 0.55, 0.6, 0.5);
    tone(ctx, out, 'sine', 62, 48, 0.6, 1.1, 1.15);
    return 2.3;
  },
  hiss: (ctx, out, noise) => {
    noiseBurst(ctx, out, noise, 3200, 0.7, 0.35, 0.7);
    return 0.75;
  },
  thud: (ctx, out, noise) => {
    for (let k = 0; k < 4; k++) {
      tone(ctx, out, 'sine', 95, 55, 0.35, 0.12, k * 0.22);
      noiseBurst(ctx, out, noise, 400, 1.2, 0.15, 0.1, k * 0.22);
    }
    return 0.95;
  },
};

/** A hit's puff (ticks) and how many feathers fly. */
const PUFF_TICKS = 36;
const FEATHERS = 7;

/** The nest scrape with its eggs baked into one small texture (one image, not one per egg). */
interface Clutch {
  readonly key: string;
  readonly dt: Phaser.Textures.DynamicTexture;
  readonly img: Phaser.GameObjects.Image;
  /** Sheet texels per art px it was made for, and the eggs stamped in it. */
  readonly tk: number;
  eggs: number;
}

interface Built {
  readonly family: string;
  readonly layer: LayerNode;
  clutch: Clutch | null;
  readonly birds: Map<number, Phaser.GameObjects.Image>;
  /** Each bird's sit state, and the fixtures' child count, the draw order was set for (set
   *  again only when one changes). */
  readonly sat: Map<number, boolean>;
  children: number;
}

/** Margin (art px) round the scrape in the clutch texture. */
const CLUTCH_PAD = 2;
let clutchSerial = 0;

interface Puff {
  readonly layer: LayerNode;
  readonly tick: number;
  readonly sand: boolean;
  readonly imgs: Phaser.GameObjects.Image[];
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

export class OstrichView {
  private readonly frames = ostrichFrames();
  private readonly built = new Map<string, Built>();
  private readonly puffs: Puff[] = [];
  /** Each bird's sim pose on the last update (e2e hook). */
  private readonly poses = new Map<number, string>();
  private sheet: Phaser.Textures.Texture | null = null;
  private tk = 1;
  /** A puff went into the fixtures: the birds go back on top of it on the next update. */
  private reorder = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly reducedMotion: boolean,
  ) {}

  private readonly byName = new Map(this.frames.map((f) => [f.name, f]));

  private rect(name: string): OstrichRect | undefined {
    return this.byName.get(name);
  }

  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(OSTRICH_SHEET)) return false;
    const tex = this.scene.textures.get(OSTRICH_SHEET);
    if (tex === this.sheet) return true;
    const k = ostrichTexelsPerPx(tex.getSourceImage().width);
    for (const f of this.frames) {
      const fr = tex.has(f.name)
        ? tex.get(f.name)
        : tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
      if (fr === null) continue;
      fr.customPivot = true;
      fr.pivotX = f.ox / f.w;
      fr.pivotY = f.oy / f.h;
    }
    this.tk = k;
    this.sheet = tex;
    for (const b of this.built.values()) {
      if (b.clutch !== null) this.bakeClutch(b, b.clutch.eggs, true);
      for (const img of b.birds.values()) img.setTexture(OSTRICH_SHEET, img.frame.name);
    }
    return true;
  }

  /**
   * Stamps the scrape and its first `eggs` eggs into the family's clutch texture (made on the
   * first call, or again when the sheet's resolution changed), in sheet texels; the image shows
   * it at the family's scale with its origin on the scrape's middle.
   */
  private bakeClutch(b: Built, eggs: number, force = false): void {
    const sc = this.rect('scrape');
    const eg = this.rect('egg');
    const c0 = b.clutch;
    if (sc === undefined || eg === undefined || c0 === null) return;
    if (!force && c0.eggs === eggs && c0.tk === this.tk) return;
    let c = c0;
    const tk = this.tk;
    if (c.tk !== tk) {
      // Another resolution: a new texture of the new size, the old one freed once undrawn.
      const fresh = this.makeClutch(c.img.x, c.img.y);
      if (fresh === null) return;
      b.layer.fixtures.addAt(fresh.img, b.layer.fixtures.getIndex(c.img));
      c.img.destroy();
      this.scene.textures.remove(c.key);
      b.clutch = fresh;
      c = fresh;
    }
    c.eggs = eggs;
    const ox = sc.ox + CLUTCH_PAD;
    const oy = sc.oy + CLUTCH_PAD;
    c.dt.clear();
    c.dt.stamp(OSTRICH_SHEET, 'scrape', ox * tk, oy * tk, {
      originX: sc.ox / sc.w,
      originY: sc.oy / sc.h,
    });
    for (const [dx, dy] of EGG_SPOTS.slice(0, eggs))
      c.dt.stamp(OSTRICH_SHEET, 'egg', (ox + dx) * tk, (oy + dy * 0.5) * tk, {
        originX: eg.ox / eg.w,
        originY: eg.oy / eg.h,
      });
    c.dt.render();
  }

  private makeClutch(x: number, y: number): Clutch | null {
    const sc = this.rect('scrape');
    if (sc === undefined) return null;
    const tk = this.tk;
    const key = `namibie/ostrich-clutch/${String(++clutchSerial)}`;
    const w = sc.w + CLUTCH_PAD * 2;
    const h = sc.h + CLUTCH_PAD * 2;
    const dt = this.scene.textures.addDynamicTexture(key, Math.ceil(w * tk), Math.ceil(h * tk));
    if (dt === null) return null;
    const img = this.scene.add
      .image(x, y, key)
      .setOrigin((sc.ox + CLUTCH_PAD) / w, (sc.oy + CLUTCH_PAD) / h);
    // Not baked yet: bakeClutch stamps it.
    return { key, dt, img, tk, eggs: -1 };
  }

  private build(f: OstrichFamilyView): Built | null {
    const layer = this.parallax.layer(f.layerId);
    if (layer === undefined) return null;
    const k = f.scale / OSTRICH_ART_SCALE / this.tk;
    const clutch = f.nest === null ? null : this.makeClutch(f.nest.x, f.ground);
    if (clutch !== null) {
      clutch.img.setScale(k);
      layer.fixtures.add(clutch.img);
    }
    const b: Built = {
      family: f.id,
      layer,
      clutch,
      birds: new Map(),
      sat: new Map(),
      children: -1,
    };
    if (f.nest !== null) this.bakeClutch(b, f.nest.eggs);
    this.built.set(f.id, b);
    return b;
  }

  /** e2e hook: each bird on screen this frame (design px of its layer) and its pose. */
  spots(): {
    family: string;
    id: number;
    male: boolean;
    pose: string;
    frame: string;
    x: number;
    y: number;
    h: number;
  }[] {
    const out: {
      family: string;
      id: number;
      male: boolean;
      pose: string;
      frame: string;
      x: number;
      y: number;
      h: number;
    }[] = [];
    for (const b of this.built.values())
      for (const [id, img] of b.birds)
        out.push({
          family: b.family,
          id,
          male: img.frame.name.startsWith('m_'),
          // The sim's pose (sit, walk, run…) and the frame drawn (walk_2, run_1…).
          pose: this.poses.get(id) ?? '',
          frame: img.frame.name.slice(2),
          x: b.layer.root.x + img.x * b.layer.root.scale,
          y: b.layer.root.y + img.y * b.layer.root.scale,
          h: img.displayHeight * b.layer.root.scale,
        });
    return out;
  }

  update(s: SimState, prev: SimState | null, alpha: number): void {
    if (s.ostriches.length === 0 || !this.ensureSheet()) return;
    for (const f of s.ostriches) {
      const b = this.built.get(f.id) ?? this.build(f);
      if (b === null) continue;
      let pf: OstrichFamilyView | undefined;
      if (prev !== null)
        for (const x of prev.ostriches)
          if (x.id === f.id) {
            pf = x;
            break;
          }
      const k = f.scale / OSTRICH_ART_SCALE / this.tk;
      if (f.nest !== null && b.clutch !== null) {
        this.bakeClutch(b, f.nest.eggs);
        if (b.clutch.img.scaleX !== k) b.clutch.img.setScale(k);
      }
      // The sitter covers the eggs: birds drawn after them, the sitter first (two passes, no
      // sorted copy). The order is set again only when a bird comes or its sitting changes.
      let reorder = this.reorder || b.layer.fixtures.length !== b.children;
      for (const bird of f.birds) {
        const sitting = bird.sitter && bird.pose === 'sit';
        if (b.sat.get(bird.id) !== sitting) {
          b.sat.set(bird.id, sitting);
          reorder = true;
        }
      }
      for (let pass = 0; pass < 2; pass++)
        for (const bird of f.birds) {
          const sitting = bird.sitter && bird.pose === 'sit';
          if ((pass === 0) !== sitting) continue;
          let img = b.birds.get(bird.id);
          if (img === undefined) {
            img = this.scene.add.image(
              bird.x,
              f.ground,
              OSTRICH_SHEET,
              ostrichFrame(bird.male, 'stand'),
            );
            b.layer.fixtures.add(img);
            b.birds.set(bird.id, img);
          }
          if (reorder) b.layer.fixtures.bringToTop(img);
          let was: (typeof f.birds)[number] | undefined;
          if (pf !== undefined)
            for (const x of pf.birds)
              if (x.id === bird.id) {
                was = x;
                break;
              }
          const x = was === undefined ? bird.x : was.x + (bird.x - was.x) * alpha;
          this.poses.set(bird.id, bird.pose);
          const pose = framePose(bird);
          const name = ostrichFrame(bird.male, pose);
          const r = this.rect(name);
          if (r === undefined) continue;
          if (img.frame.name !== name) img.setFrame(name);
          // A looking bird turns its head the way it looks; else it faces where it goes.
          const facing = bird.pose === 'look' && bird.look !== 0 ? bird.look : bird.facing;
          const flip = facing < 0;
          // Set only on change (review: unchanged setters every frame showed in the profile).
          const ox = flip ? 1 - r.ox / r.w : r.ox / r.w;
          const oy = r.oy / r.h;
          if (img.flipX !== flip) img.setFlipX(flip);
          if (img.originX !== ox || img.originY !== oy) img.setOrigin(ox, oy);
          // The display sways a little (on sim time; reduce motion holds it still).
          const sway =
            bird.pose === 'display' && !this.reducedMotion ? Math.sin(bird.t * 0.12) * 0.05 : 0;
          const rot = sway * facing;
          if (img.rotation !== rot) img.setRotation(rot);
          if (img.x !== x || img.y !== f.ground) img.setPosition(x, f.ground);
          if (img.scaleX !== k || img.scaleY !== k) img.setScale(k);
        }
      b.children = b.layer.fixtures.length;
    }
    this.reorder = false;
    this.drawPuffs(s.tick);
  }

  /** Puffs on hits and the pair's sounds. */
  handle(events: readonly SimEvent[], state: SimState, audio: AudioDirector, width: number): void {
    for (const e of events) {
      if (e.type === 'ostrichHit') {
        const f = state.ostriches.find((x) => x.id === e.familyId);
        const layer = f === undefined ? undefined : this.parallax.layer(f.layerId);
        if (f === undefined || layer === undefined) continue;
        this.puff(
          layer,
          e.tick,
          e.x,
          e.nest ? e.y - 4 * f.scale : e.y - 300 * f.scale,
          e.nest,
          f.scale,
        );
        audio.playExtra(OSTRICH_SOUNDS.hiss, this.pan(e.plane, e.x, width), OSTRICH_SYNTH.hiss);
      } else if (e.type === 'ostrichesRan') {
        audio.playExtra(OSTRICH_SOUNDS.thud, this.pan(e.plane, e.x, width), OSTRICH_SYNTH.thud);
      } else if (e.type === 'ostrichCall' && e.call === 'display') {
        audio.playExtra(OSTRICH_SOUNDS.boom, this.pan(e.plane, e.x, width), OSTRICH_SYNTH.boom);
      }
    }
  }

  private pan(plane: SimState['ostriches'][number]['plane'], x: number, width: number): number {
    const sx = this.parallax.screenX(plane, x);
    return Math.max(-1, Math.min(1, (sx - width / 2) / (width / 2)));
  }

  private puff(
    layer: LayerNode,
    tick: number,
    x: number,
    y: number,
    sand: boolean,
    scale: number,
  ): void {
    const imgs: Phaser.GameObjects.Image[] = [];
    const n = sand ? 3 : FEATHERS;
    for (let i = 0; i < n; i++) {
      const img = this.scene.add.image(x, y, sand ? TEX.dust : TEX.feather);
      if (!sand) img.setTint(i % 2 === 0 ? 0x2a2420 : 0xf2eee6);
      layer.fixtures.add(img);
      imgs.push(img);
    }
    // As before the birds are drawn over a puff (they are raised once, not every frame).
    this.reorder = true;
    this.puffs.push({ layer, tick, sand, imgs, x, y, k: scale / OSTRICH_ART_SCALE });
  }

  private drawPuffs(tick: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      if (p === undefined) continue;
      const age = tick - p.tick;
      if (age >= PUFF_TICKS || age < 0) {
        for (const img of p.imgs) img.destroy();
        this.puffs.splice(i, 1);
        continue;
      }
      const t = age / PUFF_TICKS;
      p.imgs.forEach((img, j) => {
        // Each piece flies out on its own angle and drifts down (on sim time).
        const a = (j / p.imgs.length) * Math.PI * 2 + j * 0.7;
        const r = (p.sand ? 22 : 40) * p.k * Math.sqrt(t);
        img
          .setPosition(
            p.x + Math.cos(a) * r,
            p.y + Math.sin(a) * r * 0.6 + (p.sand ? 0 : 30 * p.k * t * t),
          )
          .setScale((p.sand ? 0.9 + t * 1.2 : 0.5) * p.k)
          .setRotation(p.sand ? 0 : a + t * 4)
          .setAlpha(1 - t);
      });
    }
  }

  destroy(): void {
    for (const b of this.built.values()) {
      if (b.clutch !== null) {
        // The image goes first: nothing draws the clutch's key when it is removed.
        b.clutch.img.destroy();
        this.scene.textures.remove(b.clutch.key);
      }
      for (const img of b.birds.values()) img.destroy();
    }
    this.built.clear();
    for (const p of this.puffs) for (const img of p.imgs) img.destroy();
    this.puffs.length = 0;
  }
}
