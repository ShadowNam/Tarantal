// v1.19 (D-084): the special shells' effects (a lazy chunk: HuntScene loads it when a shell is
// picked up). Dragon's Breath throws a short (≤ 0.3 s) orange-yellow cone of fire from the muzzle
// toward the aim, with sparks: a LARGE flash, so it asks the shared flash budget (≤ 3 a second,
// GDD §18.3) and is drawn as a smaller, dimmer cone when refused or with "reduce flashes". Birds it
// brings down get a singed puff of dark smoke and a few embers (no gore, nothing left burning).
// The Slug: a small, tight muzzle flash (WeaponView) and a heavy boom. No textures of its own: the
// cone is Graphics, the sparks and puffs reuse fx/spark and fx/puff.
import type * as Phaser from 'phaser';
import { TEX } from '../../assets/AssetManifest';
import type { Synth } from '../../audio/AudioDirector';
import type { LivePrefs } from '../../prefs';
import type { FlashLimiter } from '../flashLimit';
import { coneShape, type ConeShape } from './cone';

/** What the test hook sees (e2e: the flash rule, the screenshot moments). */
export interface ShellFxStats {
  cones: number;
  big: number;
  small: number;
  /** performance.now() of each big cone (the last 20). */
  bigAt: number[];
  slugs: number;
  singes: number;
  /** Time spent building the effects (ms, performance.now; the e2e perf case). */
  ms: number;
  /** The cone on screen now (design px), or null. */
  live: { x: number; y: number; len: number; big: boolean } | null;
}

export interface ShellFxHost {
  readonly scene: Phaser.Scene;
  /** The gun's layer: the cone goes under the gun, puffs and sparks with it. */
  readonly layer: Phaser.GameObjects.Container;
  readonly prefs: LivePrefs;
  readonly flashes: FlashLimiter;
  playExtra(key: string, pan: number, synth: Synth): void;
  stats?: ShellFxStats;
}

/** How long the cone shows (ms): ≤ 0.3 s (D-084). */
const CONE_MS = 260;
const ROAR = 'sfx/shell_dragon';
const BOOM = 'sfx/shell_slug';

export function newShellFxStats(): ShellFxStats {
  return { cones: 0, big: 0, small: 0, bigAt: [], slugs: 0, singes: 0, ms: 0, live: null };
}

export class ShellFx {
  constructor(private readonly host: ShellFxHost) {}

  /** Dragon's Breath: the cone from the muzzle toward the aim point (design px). */
  dragon(muzzle: { x: number; y: number }, aim: { x: number; y: number }, pan: number): void {
    const { scene, prefs } = this.host;
    const now = performance.now();
    const t0 = now;
    // A large flash: only within the shared budget, never with "reduce flashes".
    const big = !prefs.reduceFlashes && this.host.flashes.start(now);
    const shape = coneShape(muzzle, aim, big);
    const g = scene.add.graphics();
    g.setBlendMode('ADD');
    drawCone(g, shape, big ? 1 : 0.55 * prefs.flashAlpha);
    this.host.layer.addAt(g, 0);
    scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: CONE_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        g.destroy();
        if (this.host.stats !== undefined) this.host.stats.live = null;
      },
    });
    this.sparks(shape, big);
    const st = this.host.stats;
    if (st !== undefined) {
      st.cones++;
      if (big) {
        st.big++;
        st.bigAt.push(now);
        if (st.bigAt.length > 20) st.bigAt.shift();
      } else st.small++;
      st.live = { x: shape.tipX, y: shape.tipY, len: shape.len, big };
    }
    this.host.playExtra(ROAR, pan, roar);
    if (st !== undefined) st.ms += performance.now() - t0;
  }

  /** The Slug: the heavy boom (WeaponView draws the small, tight flash). */
  slug(pan: number): void {
    if (this.host.stats !== undefined) this.host.stats.slugs++;
    this.host.playExtra(BOOM, pan, boom);
  }

  /** A bird Dragon's Breath brought down: a singed puff of dark smoke and a few embers. */
  singe(x: number, y: number, scale: number): void {
    const { scene, prefs } = this.host;
    const puff = scene.add
      .image(x, y, TEX.puff)
      .setTint(0x4a3a30)
      .setAlpha(0.85)
      .setScale(0.5 * scale);
    this.host.layer.addAt(puff, 0);
    scene.tweens.add({
      targets: puff,
      y: y - 30 * scale,
      scale: 0.9 * scale,
      alpha: 0,
      duration: 520,
      onComplete: () => {
        puff.destroy();
      },
    });
    const n = Math.max(1, Math.round(3 * prefs.particleScale));
    for (let k = 0; k < n; k++) {
      const e = scene.add
        .image(x, y, TEX.spark)
        .setTint(k % 2 === 0 ? 0xff8a2a : 0xffd04a)
        .setScale(0.25 * scale)
        .setAlpha(prefs.flashAlpha);
      this.host.layer.addAt(e, 0);
      scene.tweens.add({
        targets: e,
        x: x + (k - (n - 1) / 2) * 14 * scale,
        y: y - (20 + k * 9) * scale,
        alpha: 0,
        duration: 360 + k * 40,
        onComplete: () => {
          e.destroy();
        },
      });
    }
    if (this.host.stats !== undefined) this.host.stats.singes++;
  }

  private sparks(shape: ConeShape, big: boolean): void {
    const { scene, prefs } = this.host;
    const n = Math.max(1, Math.round((big ? 8 : 4) * prefs.particleScale));
    for (let k = 0; k < n; k++) {
      const t = 0.35 + (k / n) * 0.6;
      const side = ((k % 3) - 1) * 0.6;
      const x = shape.x + (shape.tipX - shape.x) * t + shape.nx * shape.half * t * side;
      const y = shape.y + (shape.tipY - shape.y) * t + shape.ny * shape.half * t * side;
      const s = scene.add
        .image(shape.x, shape.y, TEX.spark)
        .setTint(k % 2 === 0 ? 0xffb23a : 0xfff0a0)
        .setScale(0.3)
        .setAlpha(big ? 1 : prefs.flashAlpha);
      this.host.layer.addAt(s, 0);
      scene.tweens.add({
        targets: s,
        x,
        y,
        alpha: 0,
        duration: CONE_MS + 40,
        onComplete: () => {
          s.destroy();
        },
      });
    }
  }
}

/** Three nested tongues of flame: orange outside, yellow, a pale hot core near the muzzle. */
function drawCone(g: Phaser.GameObjects.Graphics, c: ConeShape, alpha: number): void {
  const layers: readonly [number, number, number, number][] = [
    // [colour, alpha, width share, length share]
    [0xe0461a, 0.55, 1, 1],
    [0xff8a1e, 0.6, 0.72, 0.86],
    [0xffc93a, 0.7, 0.46, 0.66],
    [0xfff3b0, 0.8, 0.2, 0.4],
  ];
  for (const [colour, a, w, l] of layers) {
    const tx = c.x + (c.tipX - c.x) * l;
    const ty = c.y + (c.tipY - c.y) * l;
    const h = c.half * w * l;
    g.fillStyle(colour, a * alpha);
    g.beginPath();
    g.moveTo(c.x + c.nx * c.root, c.y + c.ny * c.root);
    g.lineTo(tx + c.nx * h, ty + c.ny * h);
    // A ragged front: three points across the end of the tongue.
    g.lineTo(tx + (c.tipX - c.x) * 0.06 * l, ty + (c.tipY - c.y) * 0.06 * l);
    g.lineTo(tx - c.nx * h, ty - c.ny * h);
    g.lineTo(c.x - c.nx * c.root, c.y - c.ny * c.root);
    g.closePath();
    g.fillPath();
  }
}

/** A roaring whoosh: filtered noise that swells and falls, with a low rumble under it. */
const roar: Synth = (ctx, out, noise) => {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(1600, t + 0.12);
  bp.frequency.exponentialRampToValueAtTime(380, t + 0.55);
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  src.connect(bp).connect(g).connect(out);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(lp).connect(og).connect(out);
  src.start(t);
  src.stop(t + 0.62);
  o.start(t);
  o.stop(t + 0.52);
  return 0.62;
};

/** A heavy boom: a deep thump under a short dull crack. */
const boom: Synth = (ctx, out, noise) => {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(1, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(og).connect(out);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.6, t + 0.005);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.connect(lp).connect(ng).connect(out);
  o.start(t);
  o.stop(t + 0.56);
  src.start(t);
  src.stop(t + 0.2);
  return 0.56;
};
