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

interface Built {
  readonly family: string;
  readonly layer: LayerNode;
  readonly scrape: Phaser.GameObjects.Image | null;
  readonly eggs: Phaser.GameObjects.Image[];
  readonly birds: Map<number, Phaser.GameObjects.Image>;
}

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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly reducedMotion: boolean,
  ) {}

  private rect(name: string): OstrichRect | undefined {
    return this.frames.find((f) => f.name === name);
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
      b.scrape?.setTexture(OSTRICH_SHEET, 'scrape');
      for (const e of b.eggs) e.setTexture(OSTRICH_SHEET, 'egg');
      for (const img of b.birds.values()) img.setTexture(OSTRICH_SHEET, img.frame.name);
    }
    return true;
  }

  private build(f: OstrichFamilyView): Built | null {
    const layer = this.parallax.layer(f.layerId);
    if (layer === undefined) return null;
    const k = f.scale / OSTRICH_ART_SCALE / this.tk;
    let scrape: Phaser.GameObjects.Image | null = null;
    const eggs: Phaser.GameObjects.Image[] = [];
    if (f.nest !== null) {
      scrape = this.scene.add.image(f.nest.x, f.ground, OSTRICH_SHEET, 'scrape').setScale(k);
      layer.fixtures.add(scrape);
      const s = f.scale / OSTRICH_ART_SCALE;
      for (const [dx, dy] of EGG_SPOTS.slice(0, f.nest.eggs)) {
        const egg = this.scene.add
          .image(f.nest.x + dx * s, f.ground + dy * s * 0.5, OSTRICH_SHEET, 'egg')
          .setScale(k);
        layer.fixtures.add(egg);
        eggs.push(egg);
      }
    }
    const b: Built = { family: f.id, layer, scrape, eggs, birds: new Map() };
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
      const pf = prev?.ostriches.find((x) => x.id === f.id);
      const k = f.scale / OSTRICH_ART_SCALE / this.tk;
      // The sitter covers the eggs: birds drawn after them, the sitter first.
      const order = [...f.birds].sort(
        (a, c) => Number(c.sitter && c.pose === 'sit') - Number(a.sitter && a.pose === 'sit'),
      );
      for (const bird of order) {
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
        b.layer.fixtures.bringToTop(img);
        const was = pf?.birds.find((x) => x.id === bird.id);
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
        img.setFlipX(flip);
        img.setOrigin(flip ? 1 - r.ox / r.w : r.ox / r.w, r.oy / r.h);
        // The display sways a little (on sim time; reduce motion holds it still).
        const sway =
          bird.pose === 'display' && !this.reducedMotion ? Math.sin(bird.t * 0.12) * 0.05 : 0;
        img.setRotation(sway * facing);
        img.setPosition(x, f.ground).setScale(k);
      }
    }
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
      b.scrape?.destroy();
      for (const e of b.eggs) e.destroy();
      for (const img of b.birds.values()) img.destroy();
    }
    this.built.clear();
    for (const p of this.puffs) for (const img of p.imgs) img.destroy();
    this.puffs.length = 0;
  }
}
