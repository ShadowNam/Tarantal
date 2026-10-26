// v1.8 (D-050, GDD §11.3) Blikkies: the day's fence and its tin cans, drawn from the snapshot and
// the event stream (never from sim internals). The posts and wire are fixtures of the fence's plane
// layer (birds stand in front, as they do of props); each can is a container that turns with the
// sim's angle, holding the can's image (its motion-blurred twin at a fast spin) and its dents —
// one per pellet that struck it, where it struck (the event's marks, in the can's own frame), kept
// for the hunt. A soft shadow on the ground follows a can low in the air or lying there. Every
// frame comes from one small shared sheet (canSheet.ts). Sounds go through the AudioDirector
// (common recordings, the clink pitched up with the chain).
import * as Phaser from 'phaser';
import type { Feel } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { CanView as CanState, CansView, PlaneId, SimState } from '../../../sim/types';
import type { AssetManifest } from '../../assets/AssetManifest';
import type { AudioDirector, Synth } from '../../audio/AudioDirector';
import type { ParallaxView } from '../ParallaxView';
import {
  CAN_SHEET,
  CAN_SOUNDS,
  canFrames,
  POST_FRAME_H,
  type CanFrame,
  type CanRect,
} from './canSheet';

type CanLook = Feel['cans'];

interface DrawnCan {
  readonly root: Phaser.GameObjects.Container;
  readonly img: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly marks: Phaser.GameObjects.Image[];
}

/** Stand-ins until the recordings are in (a short metallic clink, a rattle, a falling whistle). */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  f0: number,
  f1: number,
  peak: number,
  len: number,
): void {
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}
const SYNTH: Record<keyof typeof CAN_SOUNDS, Synth> = {
  tink: (ctx, out) => {
    tone(ctx, out, 2600, 2400, 0.25, 0.18);
    tone(ctx, out, 3900, 3700, 0.12, 0.12);
    return 0.2;
  },
  knock: (ctx, out) => {
    tone(ctx, out, 1500, 900, 0.3, 0.22);
    return 0.24;
  },
  rattle: (ctx, out) => {
    for (let i = 0; i < 3; i++) tone(ctx, out, 900 - i * 120, 700, 0.12, 0.08 + i * 0.05);
    return 0.25;
  },
  whistle: (ctx, out) => {
    tone(ctx, out, 1800, 600, 0.12, 0.9);
    return 0.9;
  },
};

export class CanView {
  private readonly frames: readonly CanRect[] = canFrames();
  private sheet: Phaser.Textures.Texture | null = null;
  private fence: {
    plane: PlaneId;
    /** Where its posts stand (a fence that moves is built again). */
    key: string;
    posts: Phaser.GameObjects.Image[];
    wire: Phaser.GameObjects.Graphics;
  } | null = null;
  private readonly cans = new Map<number, DrawnCan>();
  private last: CansView | null = null;
  /** ms the cans took to draw this frame (e2e perf). */
  ms = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly manifest: AssetManifest,
    private readonly parallax: ParallaxView,
    private readonly look: CanLook,
    private readonly planeScale: Readonly<Record<PlaneId, number>>,
    private readonly lineWeight: Readonly<Record<PlaneId, number>>,
  ) {}

  private ensureFrames(): boolean {
    if (!this.scene.textures.exists(CAN_SHEET)) return false;
    const tex = this.scene.textures.get(CAN_SHEET);
    if (tex === this.sheet) return true;
    // A delivered sheet replaced the one drawn so far: rebuild the images on it.
    if (this.sheet !== null) this.clear();
    const k = 1 / this.manifest.displayScale(CAN_SHEET);
    for (const f of this.frames) {
      if (tex.has(f.name)) continue;
      tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
    }
    this.sheet = tex;
    return true;
  }

  private rect(name: CanFrame): CanRect | undefined {
    return this.frames.find((f) => f.name === name);
  }

  private image(name: CanFrame): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, CAN_SHEET, name);
    const r = this.rect(name);
    if (r !== undefined) img.setOrigin(r.ox / r.w, r.oy / r.h);
    return img;
  }

  /** One frame: the fence (built once) and every can, interpolated between the last two ticks. */
  update(s: SimState, prev: SimState | null, alpha: number): void {
    const t0 = performance.now();
    const c = s.cans;
    this.last = c ?? null;
    if (c === undefined || !this.ensureFrames()) {
      this.ms = performance.now() - t0;
      return;
    }
    const node = this.parallax.plane(c.plane);
    const k = this.manifest.displayScale(CAN_SHEET);
    const scale = this.planeScale[c.plane];
    const key = `${c.plane}:${c.posts.map((p) => `${p.x.toFixed(1)},${p.top.toFixed(1)}`).join(';')}`;
    if (this.fence !== null && this.fence.key !== key) {
      for (const p of this.fence.posts) p.destroy();
      this.fence.wire.destroy();
      this.fence = null;
    }
    if (this.fence === null) this.buildFence(c, node.fixtures, scale, k, key);
    const before = new Map((prev?.cans?.cans ?? []).map((x) => [x.id, x]));
    const blur = (this.look.blurDegPerSec * Math.PI) / 180 / 60;
    // The Skietbaan puts up fresh cans (new ids): the old ones go.
    if (this.cans.size > c.cans.length)
      for (const [id, d] of this.cans)
        if (!c.cans.some((x) => x.id === id)) {
          d.root.destroy();
          d.shadow.destroy();
          this.cans.delete(id);
        }
    for (const can of c.cans) {
      let d = this.cans.get(can.id);
      if (d === undefined) {
        const root = this.scene.add.container(can.x, can.y);
        const img = this.image(`can_${can.type}`);
        root.add(img);
        const shadow = this.image('shadow');
        node.fixtures.add(shadow);
        node.fixtures.add(root);
        d = { root, img, shadow, marks: [] };
        this.cans.set(can.id, d);
      }
      if (can.state === 'gone') {
        d.root.setVisible(false);
        d.shadow.setVisible(false);
        continue;
      }
      const p = before.get(can.id);
      const x = p === undefined ? can.x : p.x + (can.x - p.x) * alpha;
      const y = p === undefined ? can.y : p.y + (can.y - p.y) * alpha;
      const a = p === undefined ? can.angle : p.angle + (can.angle - p.angle) * alpha;
      d.root.setPosition(x, y).setRotation(a);
      const fast = Math.abs(can.spin) > blur;
      const frame: CanFrame = fast ? `can_${can.type}_blur` : `can_${can.type}`;
      if (d.img.frame.name !== frame) d.img.setFrame(frame);
      d.img.setScale(scale * k);
      for (const m of d.marks) m.setScale(scale * k);
      // The shadow: on the ground under a can that is low or lying there (never on the post).
      const height = c.groundY - y;
      const fade = this.look.shadowFadePx * scale;
      const on = can.state !== 'rest' && height < fade;
      d.shadow.setVisible(on);
      if (on)
        d.shadow
          .setPosition(x, c.groundY)
          .setScale(scale * k * (can.r / 20) * (1 - (0.4 * height) / fade))
          .setAlpha(0.55 * (1 - height / fade));
    }
    this.ms = performance.now() - t0;
  }

  private buildFence(
    c: CansView,
    layer: Phaser.GameObjects.Container,
    scale: number,
    k: number,
    key: string,
  ): void {
    const frame: CanFrame =
      c.kind === 'wood' ? 'post_wood' : c.kind === 'dropper' ? 'post_dropper' : 'post_kraal';
    const wire = this.scene.add.graphics();
    const lw = Math.max(1, this.lineWeight[c.plane] * 0.5);
    const color = c.kind === 'kraal' ? 0x6b4f32 : 0x8a8e90;
    wire.lineStyle(c.kind === 'kraal' ? lw * 2.5 : lw, color, c.kind === 'kraal' ? 1 : 0.85);
    for (const share of this.look.wire) {
      wire.beginPath();
      c.posts.forEach((p, i) => {
        const wy = c.groundY - (c.groundY - p.top) * share;
        if (i === 0) wire.moveTo(p.x, wy);
        else {
          // A slight sag between posts.
          const q = c.posts[i - 1];
          if (q === undefined) return;
          const qy = c.groundY - (c.groundY - q.top) * share;
          const mx = (p.x + q.x) / 2;
          const my = (wy + qy) / 2 + 2 * scale;
          wire.lineTo(mx, my);
          wire.lineTo(p.x, wy);
        }
      });
      wire.strokePath();
    }
    layer.add(wire);
    const posts = c.posts.map((p) => {
      const img = this.image(frame);
      img.setPosition(p.x, c.groundY).setScale(scale * k, ((c.groundY - p.top) / POST_FRAME_H) * k);
      layer.add(img);
      return img;
    });
    this.fence = { plane: c.plane, key, posts, wire };
  }

  /** This frame's events: dents where the pellets struck, and the sounds. */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    const half = width / 2;
    for (const e of events) {
      if (e.type === 'canKnocked' || e.type === 'canJuggled') {
        const d = this.cans.get(e.canId);
        if (d !== undefined) this.dent(d, e.marks, e.pellets);
        const pan = (this.parallax.screenX(e.plane, e.x) - half) / half;
        const rate = Math.min(this.look.pitchMax, 1 + this.look.pitchPerChain * e.chain);
        if (e.type === 'canKnocked') audio.playExtra(CAN_SOUNDS.knock, pan, SYNTH.knock);
        audio.playExtra(CAN_SOUNDS.tink, pan, SYNTH.tink, rate);
      } else if (e.type === 'canLanded') {
        if (!e.final) {
          const pan = (this.parallax.screenX(e.plane, e.x) - half) / half;
          audio.playExtra(CAN_SOUNDS.rattle, pan, SYNTH.rattle, 1.3);
        }
      } else if (e.type === 'canGone') {
        const pan = (this.parallax.screenX(e.plane, e.x) - half) / half;
        audio.playExtra(CAN_SOUNDS.whistle, pan, SYNTH.whistle, 1.4);
      }
    }
  }

  /** Dents (a shot pellet) or holes (a single bullet), never removed during the hunt. */
  private dent(d: DrawnCan, marks: readonly { lx: number; ly: number }[], pellets: number): void {
    const frame: CanFrame = pellets === 1 ? 'hole' : 'dent';
    for (const m of marks) {
      const img = this.image(frame);
      img.setPosition(m.lx, m.ly);
      d.root.add(img);
      d.marks.push(img);
      if (d.marks.length > this.look.maxMarks) d.marks.shift()?.destroy();
    }
  }

  /** e2e hook: each can on screen (design px), its hit radius, state and chain. */
  spots(): {
    id: number;
    x: number;
    y: number;
    r: number;
    state: string;
    chain: number;
    marks: number;
  }[] {
    const c = this.last;
    if (c === null) return [];
    return c.cans.map((can: CanState) => ({
      id: can.id,
      x: Math.round(this.parallax.screenX(c.plane, can.x) * 10) / 10,
      y: Math.round(can.y * 10) / 10,
      r: Math.round(can.hitR * 10) / 10,
      state: can.state,
      chain: can.chain,
      marks: this.cans.get(can.id)?.marks.length ?? 0,
    }));
  }

  clear(): void {
    for (const d of this.cans.values()) {
      d.root.destroy();
      d.shadow.destroy();
    }
    this.cans.clear();
    if (this.fence !== null) {
      for (const p of this.fence.posts) p.destroy();
      this.fence.wire.destroy();
      this.fence = null;
    }
  }
}
