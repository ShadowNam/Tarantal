// 1.9.3 (D-056, GDD §11.3b, art bible §4.2b) The day's makalani palms and their nuts, drawn from
// the snapshot and the event stream (never from sim internals). Each palm group is built from the
// plane's one trunk and one crown texture (makalaniSheet.ts): every trunk turned to its lean and
// stretched to its height, a crown on top that sways a little around its base. A group by water is
// mirrored below the water line, squashed into the channel, with a gentle ripple. Sway and ripple
// run on sim time (ticks): a held frame holds; reduce motion calms the sway. The fixtures of the
// plane's layer hold it all, so birds stand in front. Each nut hangs on a knotted, branched stalk
// from its trunk's top; shot off, it tumbles (a blurred frame at a fast spin), throws a shadow
// near the ground, bounces and rolls. A crack-off sheds a few fibre bits; a pop bursts into husk
// fibre and pale ivory chips (a small local puff, no flash). Sounds go through the AudioDirector.
import * as Phaser from 'phaser';
import type { Feel } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { NutsView, NutView, PalmView, PlaneId, SimState } from '../../../sim/types';
import type { AssetManifest } from '../../assets/AssetManifest';
import type { AudioDirector, Synth } from '../../audio/AudioDirector';
import { CAN_SHEET, canFrames } from '../cans/canSheet';
import type { ParallaxView } from '../ParallaxView';
import {
  CROWN,
  NUT_SHEET,
  NUT_SOUNDS,
  PALM_ART_SCALE,
  nutFrames,
  palmCrownKey,
  palmFrames,
  palmTrunkKey,
  crownBaseOf,
  trunkTopOf,
  trunkTransform,
  type NutFrame,
} from './makalaniSheet';

type Look = Feel['makalani'];
const TICKS = 60;

interface BuiltPalm {
  readonly view: PalmView;
  readonly trunks: Phaser.GameObjects.Image[];
  readonly crowns: { img: Phaser.GameObjects.Image; base: number; phase: number }[];
  readonly reflection: Phaser.GameObjects.Container | null;
  readonly reflectCrowns: { img: Phaser.GameObjects.Image; base: number; phase: number }[];
  readonly stalks: Phaser.GameObjects.Graphics;
  /** The nuts still on their stalks when the stalks were drawn. */
  hanging: string;
}

interface DrawnNut {
  readonly img: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
}

interface Bit {
  readonly img: Phaser.GameObjects.Image;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly t0: number;
  readonly plane: PlaneId;
}

/** e2e hook: one palm group (see MakalaniView.palmSpot). */
export interface PalmSpot {
  plane: string;
  x: number;
  footY: number;
  built: boolean;
  trunks: { trunkTop: { x: number; y: number }; crownBase: { x: number; y: number } }[];
  reflection: { visible: boolean; waterY: number; y: number } | null;
}

/** A small deterministic sequence for the bits (the same event, the same burst). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  peak: number,
  len: number,
): void {
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}
/** Stand-ins until recordings are in: a hollow woody tok, a dry krak, a hard click-bounce. */
const SYNTH: Record<keyof typeof NUT_SOUNDS, Synth> = {
  tok: (ctx, out) => {
    tone(ctx, out, 'sine', 820, 520, 0.4, 0.09);
    tone(ctx, out, 'triangle', 1650, 1100, 0.12, 0.05);
    return 0.12;
  },
  krak: (ctx, out, noise) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    src.connect(f).connect(g).connect(out);
    src.start(t0);
    src.stop(t0 + 0.18);
    tone(ctx, out, 'square', 420, 160, 0.12, 0.1);
    return 0.2;
  },
  bounce: (ctx, out) => {
    tone(ctx, out, 'sine', 1100, 700, 0.3, 0.06);
    return 0.08;
  },
  whistle: (ctx, out) => {
    tone(ctx, out, 'triangle', 1700, 600, 0.1, 0.8);
    return 0.8;
  },
};

export class MakalaniView {
  private readonly palms = new Map<number, BuiltPalm>();
  private readonly nuts = new Map<number, DrawnNut>();
  private bits: Bit[] = [];
  private last: NutsView | null = null;
  private tick = 0;
  private sheet: Phaser.Textures.Texture | null = null;
  private canSheet: Phaser.Textures.Texture | null = null;
  /** The manifest's hdEpoch the palms were built for. */
  private epoch = -1;
  /** ms the palms and nuts took to draw this frame (e2e perf). */
  ms = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly manifest: AssetManifest,
    private readonly parallax: ParallaxView,
    private readonly look: Look,
    private readonly planeScale: Readonly<Record<PlaneId, number>>,
    private readonly lineWeight: Readonly<Record<PlaneId, number>>,
    private readonly reducedMotion: boolean,
  ) {}

  /** The nut sheet (and the cans' sheet for the shadow) as last cut: a texture swapped since
   *  (an HD pack landing mid-hunt, review M5) gets its frames cut again and the images move over. */
  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(NUT_SHEET)) return false;
    const tex = this.scene.textures.get(NUT_SHEET);
    if (tex !== this.sheet) {
      const k = 1 / this.manifest.displayScale(NUT_SHEET);
      for (const f of nutFrames())
        if (!tex.has(f.name)) tex.add(f.name, 0, f.x * k, f.y * k, f.w * k, f.h * k);
      if (this.sheet !== null) {
        for (const d of this.nuts.values()) d.img.setTexture(NUT_SHEET, d.img.frame.name);
        for (const b of this.bits) b.img.setTexture(NUT_SHEET, b.img.frame.name);
      }
      this.sheet = tex;
    }
    // The ground shadow is the cans' (common group).
    if (this.scene.textures.exists(CAN_SHEET)) {
      const cans = this.scene.textures.get(CAN_SHEET);
      if (cans !== this.canSheet) {
        const s = canFrames().find((f) => f.name === 'shadow');
        const kc = 1 / this.manifest.displayScale(CAN_SHEET);
        if (s !== undefined && !cans.has('shadow'))
          cans.add('shadow', 0, s.x * kc, s.y * kc, s.w * kc, s.h * kc);
        if (this.canSheet !== null)
          for (const d of this.nuts.values()) d.shadow.setTexture(CAN_SHEET, 'shadow');
        this.canSheet = cans;
      }
    }
    return true;
  }

  private nutImage(name: NutFrame): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, NUT_SHEET, name);
    img.setOrigin(0.5, 0.5);
    return img;
  }

  /** One frame: the palms (built once), sway and ripple, the nuts between the last two ticks. */
  update(s: SimState, prev: SimState | null, alpha: number): void {
    const t0 = performance.now();
    const v = s.nuts;
    this.last = v ?? null;
    this.tick = s.tick + alpha;
    if (v === undefined || !this.ensureSheet()) {
      this.ms = performance.now() - t0;
      return;
    }
    const secs = this.tick / TICKS;
    // An HD pack landed (or was dropped): build the palms again on the swapped trunk and crown
    // textures and their display scale (review M5, as FaunaView does).
    if (this.epoch !== this.manifest.hdEpoch) {
      this.clearPalms();
      this.epoch = this.manifest.hdEpoch;
    }
    for (const p of v.palms) {
      let b = this.palms.get(p.index);
      if (b === undefined) {
        const built = this.build(p);
        if (built === null) continue;
        b = built;
        this.palms.set(p.index, b);
      }
      this.sway(b, secs);
      this.drawStalks(b, v.nuts);
    }
    this.drawNuts(v, prev?.nuts ?? null, alpha);
    this.moveBits(secs);
    this.ms = performance.now() - t0;
  }

  /** A palm group from the plane's trunk and crown (null until both textures are in). */
  private build(p: PalmView): BuiltPalm | null {
    const tk = palmTrunkKey(p.plane);
    const ck = palmCrownKey(p.plane);
    if (!this.scene.textures.exists(tk) || !this.scene.textures.exists(ck)) return null;
    const node = this.parallax.plane(p.plane);
    const parts = this.groupParts(p, tk, ck);
    let reflection: Phaser.GameObjects.Container | null = null;
    const reflectCrowns: BuiltPalm['reflectCrowns'] = [];
    if (p.waterY !== null) {
      // Mirrored at the water line and squashed into the channel; darker, see-through.
      reflection = this.scene.add.container(0, 0);
      const mirror = this.groupParts(p, tk, ck);
      // Children relative to the palm's x, so the shimmer scales about the palm (review M4).
      for (const t of mirror.trunks) reflection.add(t.setTint(0x55666a).setX(t.x - p.x));
      for (const c of mirror.crowns) reflection.add(c.img.setTint(0x55666a).setX(c.img.x - p.x));
      reflectCrowns.push(...mirror.crowns);
      reflection.setAlpha(this.look.reflectAlpha);
      node.fixtures.add(reflection);
    }
    for (const t of parts.trunks) node.fixtures.add(t);
    for (const c of parts.crowns) node.fixtures.add(c.img);
    const stalks = this.scene.add.graphics();
    node.fixtures.add(stalks);
    return {
      view: p,
      trunks: parts.trunks,
      crowns: parts.crowns,
      reflection,
      reflectCrowns,
      stalks,
      hanging: '',
    };
  }

  private groupParts(
    p: PalmView,
    tk: string,
    ck: string,
  ): {
    trunks: Phaser.GameObjects.Image[];
    crowns: { img: Phaser.GameObjects.Image; base: number; phase: number }[];
  } {
    const art = PALM_ART_SCALE[p.plane];
    const fit = p.scale / art;
    const kt = this.manifest.displayScale(tk);
    const kc = this.manifest.displayScale(ck);
    const trunks: Phaser.GameObjects.Image[] = [];
    const crowns: { img: Phaser.GameObjects.Image; base: number; phase: number }[] = [];
    p.trunks.forEach((t, i) => {
      const { footX, topX: tx, topY: ty } = t;
      // Review M11: the origin at the foot (Phaser's default, the centre, sank half the trunk).
      const tf = trunkTransform({ x: footX, y: p.footY }, { x: tx, y: ty }, p.plane, p.scale, kt);
      const trunk = this.scene.add.image(footX, p.footY, tk);
      trunk
        .setOrigin(tf.originX, tf.originY)
        .setScale(tf.scaleX, tf.scaleY)
        .setRotation(tf.rotation);
      if (i % 2 === 1) trunk.setFlipX(true);
      trunks.push(trunk);
      const crown = this.scene.add.image(tx, ty, ck);
      const cf = palmFrames(p.plane).crown;
      crown.setOrigin(cf.ox / cf.w, cf.oy / cf.h);
      const size = fit * kc * (1 - 0.06 * (i % 3));
      crown.setScale(size).setFlipX((i + (p.flip ? 1 : 0)) % 2 === 1);
      const base = tf.rotation * 0.5;
      crowns.push({ img: crown, base, phase: p.index * 1.7 + i * 2.3 });
    });
    return { trunks, crowns };
  }

  private sway(b: BuiltPalm, secs: number): void {
    const amp =
      ((this.look.swayDeg * Math.PI) / 180) * (this.reducedMotion ? this.look.reducedSwayMul : 1);
    const w = (2 * Math.PI) / this.look.swayPeriodSeconds;
    for (const c of b.crowns) c.img.setRotation(c.base + amp * Math.sin(secs * w + c.phase));
    if (b.reflection === null) return;
    const p = b.view;
    const water = p.waterY ?? p.footY;
    const depth = this.look.reflectDepth;
    // Mirror around the water line: y' = water + (water − y) × depth.
    // Reduce motion calms the ripple and the shimmer as it calms the sway.
    const calm = this.reducedMotion ? this.look.reducedSwayMul : 1;
    const ripple =
      this.look.rippleAmpPx *
      p.scale *
      calm *
      Math.sin((secs * 2 * Math.PI) / this.look.ripplePeriodSeconds);
    const shimmer =
      this.look.shimmerScale *
      calm *
      Math.sin((secs * 2 * Math.PI) / this.look.shimmerPeriodSeconds);
    b.reflection.setPosition(p.x + ripple, water + water * depth).setScale(1 + shimmer, -depth);
    for (const c of b.reflectCrowns) c.img.setRotation(c.base + amp * Math.sin(secs * w + c.phase));
  }

  /** The stalks: from each trunk top down to its cluster, a knotted branch to each hanging nut. */
  private drawStalks(b: BuiltPalm, nuts: readonly NutView[]): void {
    const mine = nuts.filter((n) => n.palm === b.view.index && n.state === 'rest');
    const key = mine.map((n) => n.id).join(',');
    if (key === b.hanging && b.hanging !== '') return;
    b.hanging = key;
    const g = b.stalks;
    const p = b.view;
    const lw = Math.max(1, this.lineWeight[p.plane] * 0.45);
    g.clear();
    p.clusters.forEach((c, ci) => {
      g.lineStyle(lw * 1.6, 0x6b4a2a, 1);
      g.beginPath();
      g.moveTo(c.fromX, c.fromY);
      const midX = (c.fromX + c.x) / 2 + (c.x > c.fromX ? -4 : 4) * p.scale;
      const midY = (c.fromY + c.y) / 2;
      g.lineTo(midX, midY);
      g.lineTo(c.x, c.y);
      g.strokePath();
      // Knots along the stalk.
      g.fillStyle(0x4e3420, 1);
      g.fillCircle(midX, midY, lw * 1.2);
      g.fillCircle(c.x, c.y, lw * 1.3);
      // Every nut of the cluster that hung there keeps its branch (picked bare once it is off).
      g.lineStyle(lw, 0x7a5532, 1);
      for (const n of nuts.filter((x) => x.palm === p.index && x.cluster === ci)) {
        g.beginPath();
        g.moveTo(c.x, c.y);
        g.lineTo(n.hangX, n.hangY - n.r * 0.8);
        g.strokePath();
      }
    });
  }

  private drawNuts(v: NutsView, prev: NutsView | null, alpha: number): void {
    const before = new Map((prev?.nuts ?? []).map((n) => [n.id, n]));
    const blur = (this.look.blurDegPerSec * Math.PI) / 180 / TICKS;
    for (const n of v.nuts) {
      let d = this.nuts.get(n.id);
      if (d === undefined) {
        const node = this.parallax.plane(n.plane);
        const img = this.nutImage(`nut_${n.colour}`);
        const shadow = this.scene.add.image(0, 0, CAN_SHEET, 'shadow');
        node.fixtures.add(shadow);
        node.fixtures.add(img);
        d = { img, shadow };
        this.nuts.set(n.id, d);
      }
      if (n.state === 'gone' || n.state === 'popped') {
        d.img.setVisible(false);
        d.shadow.setVisible(false);
        continue;
      }
      const p = before.get(n.id);
      const x = p === undefined ? n.x : p.x + (n.x - p.x) * alpha;
      const y = p === undefined ? n.y : p.y + (n.y - p.y) * alpha;
      const a = p === undefined ? n.angle : p.angle + (n.angle - p.angle) * alpha;
      const k = this.manifest.displayScale(NUT_SHEET);
      const fast = Math.abs(n.spin) > blur;
      const frame: NutFrame = fast ? `nut_${n.colour}_blur` : `nut_${n.colour}`;
      if (d.img.frame.name !== frame) d.img.setFrame(frame);
      const scale = this.planeScale[n.plane];
      d.img
        .setPosition(x, y)
        .setRotation(a)
        .setScale(scale * k);
      const ground = v.palms.find((q) => q.index === n.palm)?.footY ?? n.y + n.r;
      const height = ground - n.r - y;
      const fade = this.look.shadowFadePx * scale;
      const on = n.state !== 'rest' && height < fade;
      d.shadow.setVisible(on);
      if (on)
        d.shadow
          .setPosition(x, ground)
          .setScale(
            scale *
              this.manifest.displayScale(CAN_SHEET) *
              (n.r / 20) *
              (1 - (0.4 * height) / fade),
          )
          .setAlpha(0.5 * (1 - height / fade));
    }
  }

  private moveBits(secs: number): void {
    const life = this.look.bitSeconds;
    const g = this.look.bitGravityPxPerSec2;
    this.bits = this.bits.filter((b) => {
      const t = secs - b.t0;
      if (t > life || t < 0) {
        if (t > life) b.img.destroy();
        else b.img.setVisible(false);
        return t <= life;
      }
      const s = this.planeScale[b.plane] / 0.5;
      b.img
        .setVisible(true)
        .setPosition(b.x + b.vx * t * s, b.y + (b.vy * t + 0.5 * g * t * t) * s)
        .setRotation(b.spin * t)
        .setAlpha(1 - (t / life) ** 2);
      return true;
    });
  }

  private burst(
    plane: PlaneId,
    x: number,
    y: number,
    seed: number,
    n: number,
    frames: readonly NutFrame[],
  ): void {
    const rnd = lcg(seed);
    const node = this.parallax.plane(plane);
    const k = this.manifest.displayScale(NUT_SHEET);
    const sp = this.look.bitSpeedPxPerSec;
    for (let i = 0; i < n; i++) {
      const img = this.nutImage(frames[i % frames.length] ?? 'fibre');
      img.setScale(this.planeScale[plane] * k * (0.7 + 0.6 * rnd()));
      node.fixtures.add(img);
      const ang = rnd() * Math.PI * 2;
      const v = sp * (0.4 + 0.6 * rnd());
      this.bits.push({
        img,
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - sp * 0.4,
        spin: (rnd() - 0.5) * 20,
        t0: this.tick / TICKS,
        plane,
      });
    }
  }

  /** This frame's events: bits and sounds. */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    const half = width / 2;
    const pan = (plane: PlaneId, x: number): number =>
      (this.parallax.screenX(plane, x) - half) / half;
    for (const e of events) {
      if (e.type === 'nutKnocked' || e.type === 'nutJuggled') {
        const rate = Math.min(this.look.pitchMax, 1 + this.look.pitchPerChain * e.chain);
        audio.playExtra(NUT_SOUNDS.tok, pan(e.plane, e.x), SYNTH.tok, 1.9 * rate);
        if (e.type === 'nutKnocked')
          this.burst(e.plane, e.x, e.y, e.nutId + e.tick, this.look.fibreBits, ['fibre']);
      } else if (e.type === 'nutPopped') {
        audio.playExtra(NUT_SOUNDS.krak, pan(e.plane, e.x), SYNTH.krak, 1.2);
        this.burst(e.plane, e.x, e.y, e.nutId * 7 + e.tick, this.look.popBits, [
          'husk',
          'chip',
          'fibre',
          'chip',
        ]);
      } else if (e.type === 'nutLanded') {
        if (!e.final) audio.playExtra(NUT_SOUNDS.bounce, pan(e.plane, e.x), SYNTH.bounce, 1.6);
      } else if (e.type === 'nutGone') {
        audio.playExtra(NUT_SOUNDS.whistle, pan(e.plane, e.x), SYNTH.whistle, 1.5);
      }
    }
  }

  /** e2e hook: each nut on screen (design px), its hit radius, state and chain; the palms. */
  spots(): {
    nuts: {
      id: number;
      plane: string;
      x: number;
      y: number;
      r: number;
      state: string;
      chain: number;
    }[];
    palms: PalmSpot[];
  } {
    const v = this.last;
    if (v === null) return { nuts: [], palms: [] };
    return {
      nuts: v.nuts.map((n) => ({
        id: n.id,
        plane: n.plane,
        x: Math.round(this.parallax.screenX(n.plane, n.x) * 10) / 10,
        y: Math.round(n.y * 10) / 10,
        r: Math.round(n.hitR * 10) / 10,
        state: n.state,
        chain: n.chain,
      })),
      palms: v.palms.map((p) => this.palmSpot(p)),
    };
  }

  private clearPalms(): void {
    for (const b of this.palms.values()) {
      for (const t of b.trunks) t.destroy();
      for (const c of b.crowns) c.img.destroy();
      b.reflection?.destroy();
      b.stalks.destroy();
    }
    this.palms.clear();
  }

  /** e2e hook (review M11, M12): a palm on screen — each trunk's drawn top and its crown's base
   *  (screen px, from the images as placed), and its reflection (shown, its water-line y). */
  private palmSpot(p: PalmView): PalmSpot {
    const b = this.palms.get(p.index);
    const r1 = (n: number): number => Math.round(n * 10) / 10;
    const sx = (x: number): number => r1(this.parallax.screenX(p.plane, x));
    const tops =
      b === undefined
        ? []
        : b.trunks.map((t, i) => {
            const kt = this.manifest.displayScale(t.texture.key);
            const top = trunkTopOf(t, p.plane, t.frame.realHeight, kt);
            const c = b.crowns[i]?.img;
            const kc = c === undefined ? 1 : this.manifest.displayScale(c.texture.key);
            const base =
              c === undefined
                ? top
                : crownBaseOf(c, p.plane, c.frame.realWidth, c.frame.realHeight, kc);
            return {
              trunkTop: { x: sx(top.x), y: r1(top.y) },
              crownBase: { x: sx(base.x), y: r1(base.y) },
            };
          });
    const refl = b?.reflection ?? null;
    return {
      plane: p.plane,
      x: sx(p.x),
      footY: p.footY,
      built: b !== undefined,
      trunks: tops,
      reflection:
        refl === null
          ? null
          : {
              visible: refl.visible && refl.alpha > 0 && refl.list.length > 0,
              waterY: p.waterY ?? p.footY,
              // The palm's foot as mirrored (the container flips about the water line).
              y: r1(refl.y + refl.scaleY * p.footY),
            },
    };
  }

  clear(): void {
    this.clearPalms();
    for (const d of this.nuts.values()) {
      d.img.destroy();
      d.shadow.destroy();
    }
    this.nuts.clear();
    for (const b of this.bits) b.img.destroy();
    this.bits = [];
    this.sheet = null;
    this.canSheet = null;
  }
}

/** The crown frame's design size at plane scale 1 (for the art tool and tests). */
export const CROWN_SIZE = CROWN;
