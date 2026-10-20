// Juice pass 1 (GDD §17): feather burst + POOF bubble + score pop on a bag, pellet puffs on misses,
// camera shake per weapon, hit-stop through the runner. Driven only by sim events.
import * as Phaser from 'phaser';
import type { Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { PlaneId } from '../../sim/types';
import { t } from '../../i18n/i18n';
import { TEX } from '../assets/AssetManifest';
import { formatAward, popParts } from '../ui/format';
import type { ParallaxView } from './ParallaxView';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

interface BagSpot {
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
}

export class Fx {
  private readonly scene: Phaser.Scene;
  private readonly feel: Feel;
  private readonly parallax: ParallaxView;
  private readonly feathers = new Map<PlaneId, Phaser.GameObjects.Particles.ParticleEmitter>();
  private readonly puffs: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Where each bird was bagged this frame, so its score pop appears there. */
  private readonly bagged = new Map<number, BagSpot>();
  private readonly locate: (birdId: number) => BagSpot | null;

  constructor(
    scene: Phaser.Scene,
    feel: Feel,
    parallax: ParallaxView,
    screenLayer: Phaser.GameObjects.Container,
    locate: (birdId: number) => BagSpot | null,
  ) {
    this.scene = scene;
    this.locate = locate;
    this.feel = feel;
    this.parallax = parallax;
    for (const plane of ['near', 'mid', 'far'] as const) {
      const scale = plane === 'near' ? 1.4 : plane === 'mid' ? 0.9 : 0.5;
      const emitter = scene.add.particles(0, 0, TEX.feather, {
        emitting: false,
        speed: { min: 120 * scale, max: 520 * scale },
        angle: { min: 0, max: 360 },
        rotate: { min: -180, max: 180 },
        gravityY: 520 * scale,
        lifespan: feel.juice.featherLifeMs,
        scale: { start: scale, end: scale * 0.6 },
        alpha: { start: 1, end: 0 },
      });
      this.parallax.plane(plane).overlay?.add(emitter);
      this.feathers.set(plane, emitter);
    }
    this.puffs = scene.add.particles(0, 0, TEX.puff, {
      emitting: false,
      speed: { min: 10, max: 40 },
      lifespan: 380,
      scale: { start: 0.5, end: 1.1 },
      alpha: { start: 0.9, end: 0 },
    });
    screenLayer.add(this.puffs);
  }

  handle(events: readonly SimEvent[], width: number): void {
    this.bagged.clear();
    for (const e of events) {
      switch (e.type) {
        case 'targetBagged':
          this.bagged.set(e.birdId, { plane: e.plane, x: e.x, y: e.y });
          this.featherBurst(e.plane, e.x, e.y);
          this.poof(e.plane, e.x, e.y);
          break;
        case 'scoreAwarded': {
          const at = this.bagged.get(e.birdId);
          if (at) this.scorePop(at, popParts(e.points, e.mult), formatAward(e.award), '#F3EAD3');
          break;
        }
        case 'penaltyApplied': {
          // Non-targets have no targetBagged event; use where the bird was last drawn.
          const at = this.locate(e.birdId);
          if (at) {
            this.featherBurst(at.plane, at.x, at.y);
            this.scorePop(at, formatAward(e.points), formatAward(e.points), '#FF6B5A');
          }
          break;
        }
        case 'pelletImpact':
          if (e.birdId === null) this.puffs.explode(1, width / 2 + e.dx, e.sy);
          break;
        default:
          break;
      }
    }
  }

  private featherBurst(plane: PlaneId, x: number, y: number): void {
    const [lo, hi] = this.feel.juice.featherCount;
    const n = Math.round((lo + Math.random() * (hi - lo)) * this.feel.quality.particleScale);
    this.feathers.get(plane)?.explode(Math.max(1, n), x, y);
  }

  private poof(plane: PlaneId, x: number, y: number): void {
    const layer = this.parallax.plane(plane).overlay;
    if (!layer) return;
    const s = plane === 'near' ? 0.9 : plane === 'mid' ? 0.6 : 0.4;
    const rot = Phaser.Math.DegToRad((Math.random() - 0.5) * 16);
    const bubble = this.scene.add
      .image(x, y - 40 * s, TEX.bubble)
      .setScale(0.2 * s)
      .setRotation(rot);
    const label = this.scene.add
      .text(x, y - 40 * s, t('fx.poof'), {
        fontFamily: FONT,
        fontSize: '64px',
        fontStyle: '900',
        color: '#C8302A',
        stroke: '#1B1410',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScale(0.2 * s)
      .setRotation(rot);
    layer.add([bubble, label]);
    this.scene.tweens.add({
      targets: [bubble, label],
      scale: s,
      duration: this.feel.juice.poofMs * 0.3,
      ease: 'Back.Out',
    });
    this.scene.tweens.add({
      targets: [bubble, label],
      alpha: 0,
      delay: this.feel.juice.poofMs * 0.6,
      duration: this.feel.juice.poofMs * 0.4,
      onComplete: () => {
        bubble.destroy();
        label.destroy();
      },
    });
  }

  /** "10 ×2" rising, then resolving to "+20" (GDD §5.3, §17: 60 px over 600 ms). */
  private scorePop(at: BagSpot, parts: string, award: string, color: string): void {
    const layer = this.parallax.plane(at.plane).overlay;
    if (!layer) return;
    const s = at.plane === 'near' ? 1 : at.plane === 'mid' ? 0.8 : 0.65;
    const text = this.scene.add
      .text(at.x, at.y - 110 * s, parts, {
        fontFamily: FONT,
        fontSize: '52px',
        fontStyle: '900',
        color,
        stroke: '#1B1410',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScale(s);
    layer.add(text);
    const { scorePopMs, scorePopRisePx } = this.feel.juice;
    // Resolve "10 ×2" → "+20" from the rise tween's own progress. (A scene-clock timer runs on
    // Phaser's smoothed frame delta while tweens follow real time; on slow frames the fade could
    // destroy the text before the timer fired.)
    let resolved = false;
    this.scene.tweens.add({
      targets: text,
      y: text.y - scorePopRisePx,
      duration: scorePopMs,
      ease: 'Cubic.Out',
      onUpdate: (tween) => {
        if (resolved || tween.progress < 0.45 || !text.active) return;
        resolved = true;
        text.setText(award).setColor(color === '#F3EAD3' ? '#FFD25A' : color);
      },
    });
    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      delay: scorePopMs * 0.75,
      duration: scorePopMs * 0.5,
      onComplete: () => {
        text.destroy();
      },
    });
  }
}
