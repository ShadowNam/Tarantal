// Juice (GDD §17): feather burst + POOF bubble + score pop on a bag, pellet puffs on misses,
// camera shake per weapon, hit-stop through the runner (pass 1); "KEK!" when a flock is alerted
// and one synchronised "KEK-KEK-KEK!" per flock when it flushes (pass 2). Driven only by sim
// events. Bubbles are also captions for the alarm calls (accessibility, GDD §17). M4: sparks and
// "TING!" on secret parts, a burst when a secret pays out (with its event's caption: car alarm,
// reservoir splash), the Generaal's CLANG as his pot flies off, "KWÊ-KWÊ!" from a perched
// kwêvoël, and a burst where a crate opens.
import * as Phaser from 'phaser';
import type { LivePrefs } from '../prefs';
import type { Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { PlaneId, SimState } from '../../sim/types';
import { t, tOr } from '../../i18n/i18n';
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
  /** FTUE: the flock Bles is about to spook. */
  /** A farmDog world event just fired: bark at the flock it sends running. */
  private blesNext = false;
  private blesFlock: number | null = null;
  private readonly scene: Phaser.Scene;
  private readonly feel: Feel;
  private readonly parallax: ParallaxView;
  private readonly feathers = new Map<PlaneId, Phaser.GameObjects.Particles.ParticleEmitter>();
  private readonly puffs: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Where each bird was bagged this frame, so its score pop appears there. */
  private readonly bagged = new Map<number, BagSpot>();
  private readonly locate: (birdId: number) => BagSpot | null;
  private readonly locatePot: (
    birdId: number,
  ) => { plane: PlaneId; x: number; y: number; scaleX: number } | null;
  /** The plane crates land on (powerups.json). */
  private readonly cratePlane: PlaneId;

  constructor(
    scene: Phaser.Scene,
    feel: Feel,
    parallax: ParallaxView,
    screenLayer: Phaser.GameObjects.Container,
    locate: (birdId: number) => BagSpot | null,
    locatePot: (birdId: number) => { plane: PlaneId; x: number; y: number; scaleX: number } | null,
    cratePlane: PlaneId,
    private readonly prefs: LivePrefs,
  ) {
    this.scene = scene;
    this.locate = locate;
    this.locatePot = locatePot;
    this.cratePlane = cratePlane;
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

  handle(events: readonly SimEvent[], width: number, state: SimState): void {
    this.bagged.clear();
    /** Where the last secret of this frame went off (its event caption appears there). */
    let secretSpot: { layer: Phaser.GameObjects.Container; x: number; y: number } | null = null;
    const partSpot = (
      propId: string,
      partId: string,
    ): { layer: Phaser.GameObjects.Container; x: number; y: number } | null => {
      const sec = state.secrets.find((x) => x.propId === propId);
      const part = sec?.parts.find((p) => p.id === partId);
      const layer = sec === undefined ? undefined : this.parallax.layer(sec.layerId)?.fixtures;
      return part === undefined || layer === undefined ? null : { layer, x: part.x, y: part.y };
    };
    for (const e of events) {
      switch (e.type) {
        case 'secretPartHit': {
          const at = partSpot(e.propId, e.partId);
          if (at) {
            this.spark(at.layer, at.x, at.y, 0.7);
            this.label(at.layer, at.x, at.y - 50, t('fx.ting'), '#F3EAD3', 0.6);
          }
          break;
        }
        case 'secretTriggered': {
          const at = partSpot(e.propId, e.partId);
          if (at) {
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2;
              this.spark(at.layer, at.x + Math.cos(a) * 40, at.y + Math.sin(a) * 40, 1.1);
            }
            secretSpot = at;
          }
          break;
        }
        case 'worldEvent':
          // Bles die Plaashond (charm): the next flock that runs this tick is his.
          if (e.event === 'farmDog') this.blesNext = true;
          // Secret events (car alarm, reservoir) get a caption where the secret went off.
          if (secretSpot !== null) {
            const text = tOr(`fx.event.${e.event}`, '');
            if (text !== '')
              this.label(secretSpot.layer, secretSpot.x, secretSpot.y - 120, text, '#FFD25A', 1);
          }
          break;
        case 'armorKnocked': {
          const pot = this.locatePot(e.birdId);
          if (pot) this.knockPot(pot);
          break;
        }
        case 'birdCalled': {
          const at = this.locate(e.birdId);
          if (at) this.bubble(at.plane, at.x, at.y - 60, t('fx.kwe'), false);
          break;
        }
        case 'crateOpened': {
          const layer = this.parallax.plane(this.cratePlane).overlay;
          if (layer) {
            this.spark(layer, e.x, e.y, 1.2);
            this.label(layer, e.x, e.y - 80, tOr(`item.${e.item}`, e.item), '#FFD25A', 0.8);
          }
          break;
        }
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
        case 'tutorialBeat':
          // FTUE: Oupa's dog Bles barks at the flock it spooks (GDD §16 step 3).
          if (e.beat === 'spook') this.blesFlock = e.flockId;
          break;
        case 'flockStateChanged':
          if (
            e.to === 'run' &&
            (e.flockId === this.blesFlock || (this.blesNext && e.cause === 'event'))
          ) {
            this.blesNext = false;
            this.bubble(e.plane, e.x, e.y - 40, t('fx.woof'), true);
            this.blesFlock = null;
          } else if (e.to === 'alert') this.bubble(e.plane, e.x, e.y, t('fx.kek'), false);
          else if (e.to === 'flush') this.bubble(e.plane, e.x, e.y, t('fx.kek_flush'), true);
          break;
        default:
          break;
      }
    }
  }

  private spark(layer: Phaser.GameObjects.Container, x: number, y: number, s: number): void {
    const img = this.scene.add.image(x, y, TEX.spark).setScale(0.2 * s);
    layer.add(img);
    this.scene.tweens.add({
      targets: img,
      scale: s,
      angle: 90,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.Out',
      onComplete: () => {
        img.destroy();
      },
    });
  }

  /** A short rising caption in a layer's coordinates. */
  private label(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    text: string,
    color: string,
    s: number,
  ): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: '900',
        color,
        stroke: '#1B1410',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setScale(0.3 * s);
    layer.add(label);
    this.scene.tweens.add({ targets: label, scale: s, duration: 180, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: label,
      alpha: 0,
      y: y - 50 * s,
      delay: this.feel.juice.kekBubbleMs,
      duration: 400,
      onComplete: () => {
        label.destroy();
      },
    });
  }

  /** CLANG! The Generaal's pot spins off his head (GDD §7). */
  private knockPot(pot: { plane: PlaneId; x: number; y: number; scaleX: number }): void {
    const layer = this.parallax.plane(pot.plane).overlay;
    if (!layer) return;
    const s = Math.abs(pot.scaleX);
    const img = this.scene.add.image(pot.x, pot.y, TEX.pot).setScale(pot.scaleX, s);
    layer.add(img);
    const dir = pot.scaleX >= 0 ? -1 : 1;
    this.scene.tweens.add({
      targets: img,
      x: pot.x + dir * 160 * s * 2,
      angle: dir * 540,
      duration: 700,
      ease: 'Linear',
    });
    this.scene.tweens.add({
      targets: img,
      y: pot.y - 120 * s * 2,
      duration: 300,
      ease: 'Quad.Out',
      yoyo: true,
      onComplete: () => {
        this.scene.tweens.add({
          targets: img,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            img.destroy();
          },
        });
      },
    });
    this.label(layer, pot.x, pot.y - 40, t('fx.clang'), '#FFD25A', s * 2);
  }

  private featherBurst(plane: PlaneId, x: number, y: number): void {
    const [lo, hi] = this.feel.juice.featherCount;
    const n = Math.round((lo + Math.random() * (hi - lo)) * this.prefs.particleScale);
    this.feathers.get(plane)?.explode(Math.max(1, n), x, y);
  }

  /** Alarm-call bubble above a flock: small for ALERT, big and wobbling for FLUSH. */
  private bubble(plane: PlaneId, x: number, y: number, text: string, big: boolean): void {
    const layer = this.parallax.plane(plane).overlay;
    if (!layer) return;
    const s = (plane === 'near' ? 1 : plane === 'mid' ? 0.75 : 0.5) * (big ? 1.25 : 0.8);
    const lift = (big ? 170 : 120) * s;
    const ms = big ? this.feel.juice.flushBubbleMs : this.feel.juice.kekBubbleMs;
    const rot = Phaser.Math.DegToRad(big ? -6 : 4);
    const label = this.scene.add
      .text(x, y - lift, text, {
        fontFamily: FONT,
        fontSize: '60px',
        fontStyle: '900',
        color: big ? '#FFD25A' : '#F3EAD3',
        stroke: '#1B1410',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScale(0.2 * s)
      .setRotation(rot);
    layer.add(label);
    this.scene.tweens.add({ targets: label, scale: s, duration: ms * 0.2, ease: 'Back.Out' });
    if (big) {
      this.scene.tweens.add({
        targets: label,
        angle: { from: -8, to: 8 },
        yoyo: true,
        repeat: 2,
        duration: ms * 0.12,
      });
    }
    this.scene.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 30 * s,
      delay: ms * 0.7,
      duration: ms * 0.3,
      onComplete: () => {
        label.destroy();
      },
    });
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
