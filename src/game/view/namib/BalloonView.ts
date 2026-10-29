// v1.7d (D-059, GDD §11.3c, art bible §4.5f) Hot-air balloons, drawn from the snapshot's
// drifting non-targets (BirdView leaves them out): each balloon's envelope and basket at the
// sim's position (interpolated like the birds), its burner flaring now and then on sim time (a
// small local flame, never a flash; steady with reduce flashes) with a roar, and on a hit a long
// roar and a passenger shaking a fist. In the far plane's fixtures (behind the far birds).
import type * as Phaser from 'phaser';
import type { SimEvent } from '../../../sim/events';
import type { BirdView as SimBird, SimState } from '../../../sim/types';
import type { AudioDirector, Synth } from '../../audio/AudioDirector';
import type { ParallaxView } from '../ParallaxView';
import {
  BALLOON_ART_SCALE,
  BALLOON_SHEET,
  BURNER,
  FIST,
  balloonFrames,
  balloonTexelsPerPx,
  burnerAt,
} from './balloonSheet';

/** The creature the sim drifts (content: birds.json lugballon). */
export const BALLOON_CREATURE = 'lugballon';

export const BALLOON_SOUNDS = { burner: 'sfx/balloon_burner' } as const;

/** Stand-in until a recording is in: the burner's roar (filtered noise, a soft swell). */
export const BURNER_SYNTH: Synth = (ctx, out, noise) => {
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.12);
  g.gain.setValueAtTime(0.28, t0 + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + 1.15);
  return 1.15;
};

interface Drawn {
  readonly body: Phaser.GameObjects.Image;
  readonly flame: Phaser.GameObjects.Image;
  readonly fist: Phaser.GameObjects.Image;
  hitAt: number | null;
  flaring: boolean;
}

export class BalloonView {
  private readonly frames = balloonFrames();
  private readonly drawn = new Map<number, Drawn>();
  private sheet: Phaser.Textures.Texture | null = null;
  /** e2e hook: drifters alive in the sim now, and whether the sheet is in to draw them. */
  live = 0;
  sheetReady = false;
  private tk = 1;
  /** e2e hook: balloons drawn now (screen design px of the envelope's middle) and burner level. */
  readonly spots: { id: number; x: number; y: number; h: number; burner: number; fist: boolean }[] =
    [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly reduceFlashes: () => boolean,
    /** Plane scales (content scoring.planes). */
    private readonly scales: Readonly<Record<SimBird['plane'], number>>,
  ) {}

  private ensureSheet(): boolean {
    if (!this.scene.textures.exists(BALLOON_SHEET)) return false;
    const tex = this.scene.textures.get(BALLOON_SHEET);
    if (tex === this.sheet) return true;
    const k = balloonTexelsPerPx(tex.getSourceImage().width);
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
    for (const d of this.drawn.values())
      for (const img of [d.body, d.flame, d.fist]) img.setTexture(BALLOON_SHEET, img.frame.name);
    return true;
  }

  private add(b: SimBird): Drawn | null {
    const layer = this.parallax.plane(b.plane);
    const body = this.scene.add.image(b.x, b.y, BALLOON_SHEET, `balloon_${'abc'[b.id % 3] ?? 'a'}`);
    const flame = this.scene.add.image(b.x, b.y, BALLOON_SHEET, 'flame').setVisible(false);
    const fist = this.scene.add.image(b.x, b.y, BALLOON_SHEET, 'fist').setVisible(false);
    // The flame sits in the envelope's mouth, over the basket: drawn behind the envelope.
    layer.fixtures.add([flame, body, fist]);
    const d: Drawn = { body, flame, fist, hitAt: null, flaring: false };
    this.drawn.set(b.id, d);
    return d;
  }

  update(
    s: SimState,
    prev: SimState | null,
    alpha: number,
    audio: AudioDirector,
    width: number,
  ): void {
    this.spots.length = 0;
    const live = s.birds.filter((b) => b.creature === BALLOON_CREATURE);
    this.live = live.length;
    for (const [id, d] of this.drawn)
      if (!live.some((b) => b.id === id)) {
        d.body.destroy();
        d.flame.destroy();
        d.fist.destroy();
        this.drawn.delete(id);
      }
    this.sheetReady = this.ensureSheet();
    if (live.length === 0 || !this.sheetReady) return;
    const calm = this.reduceFlashes();
    for (const b of live) {
      const d = this.drawn.get(b.id) ?? this.add(b);
      if (d === null) continue;
      const was = prev?.birds.find((x) => x.id === b.id);
      const x = was === undefined ? b.x : was.x + (b.x - was.x) * alpha;
      const y = was === undefined ? b.y : was.y + (b.y - was.y) * alpha;
      const s0 = this.scaleOf(b) / this.tk;
      d.body.setPosition(x, y).setScale(s0);
      const level = burnerAt(b.id, s.tick, d.hitAt);
      const a = s0 * this.tk;
      // The flame: a small local glow in the mouth (steady, never pulsing, with reduce flashes).
      d.flame
        .setVisible(level > 0.02)
        .setPosition(x + BURNER.x * a, y + BURNER.y * a)
        .setScale(s0 * (calm ? 1 : 0.75 + level * 0.35))
        .setAlpha(calm ? (level > 0.02 ? 0.85 : 0) : 0.4 + level * 0.6);
      const roar = level > 0.5;
      if (roar && !d.flaring)
        audio.playExtra(BALLOON_SOUNDS.burner, this.pan(b, width), BURNER_SYNTH);
      d.flaring = roar;
      // A passenger shakes a fist for a second and a half after a hit.
      const fist = d.hitAt !== null && s.tick - d.hitAt >= 0 && s.tick - d.hitAt < 90;
      d.fist
        .setVisible(fist)
        .setPosition(x + FIST.x * a, y + FIST.y * a)
        .setScale(s0)
        .setRotation(fist ? Math.sin((s.tick - (d.hitAt ?? 0)) * 0.6) * 0.35 : 0);
      const root = this.parallax.plane(b.plane).root;
      this.spots.push({
        id: b.id,
        x: root.x + x * root.scale,
        y: root.y + y * root.scale,
        h: d.body.displayHeight * root.scale,
        burner: level,
        fist,
      });
    }
  }

  private scaleOf(b: SimBird): number {
    return this.scales[b.plane] / BALLOON_ART_SCALE;
  }

  private pan(b: SimBird, width: number): number {
    const sx = this.parallax.screenX(b.plane, b.x);
    return Math.max(-1, Math.min(1, (sx - width / 2) / (width / 2)));
  }

  /** A hit balloon roars (its burner on for a while) and a passenger shakes a fist. */
  handle(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'balloonHit') continue;
      const d = this.drawn.get(e.birdId);
      if (d !== undefined) d.hitAt = e.tick;
    }
  }

  destroy(): void {
    for (const d of this.drawn.values()) {
      d.body.destroy();
      d.flame.destroy();
      d.fist.destroy();
    }
    this.drawn.clear();
  }
}
