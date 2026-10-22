// Juice (GDD §17): feather burst + POOF bubble + score pop on a bag, pellet puffs on misses,
// camera shake per weapon, hit-stop through the runner (pass 1); "KEK!" when a flock is alerted
// and one synchronised "KEK-KEK-KEK!" per flock when it flushes (pass 2). Driven only by sim
// events. Bubbles are also captions for the alarm calls (accessibility, GDD §17). M4: sparks and
// "TING!" on secret parts, a burst when a secret pays out (with its event's caption: car alarm,
// reservoir splash), the Generaal's CLANG as his pot flies off, "KWÊ-KWÊ!" from a perched
// kwêvoël, and a burst where a crate opens.
import { fontPx, outline } from '../ui/textLook';
import * as Phaser from 'phaser';
import { tapToPlane } from '../../sim/camera';
import type { LivePrefs } from '../prefs';
import type { Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { PlaneId, SimState } from '../../sim/types';
import { t, tOr } from '../../i18n/i18n';
import { TEX } from '../assets/AssetManifest';
import { formatAward, popParts } from '../ui/format';
import { PopPool, colorNumber, ensurePopFont, popCanShow, popLook } from '../ui/popFont';
import type { ParallaxView } from './ParallaxView';

/** UI and body face (art bible §6): self-hosted Baloo 2 (public/fonts), system font until it loads. */
export const FONT = '"Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Comic display face for onomatopoeia (KEK!, POOF!; art bible §1 rule 3, §6). */
export const DISPLAY_FONT = 'Bangers, "Baloo 2", system-ui, sans-serif';

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
  /** v1.0.1 (D-028 §4): pooled BitmapText score pops (no canvas text per kill). */
  private readonly pops: PopPool;
  /** v1.0.1: pooled POOF bubbles; the label's text rarely changes, so reuse never re-renders it. */
  private readonly poofFree: {
    bubble: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    look: string;
  }[] = [];
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
    this.pops = new PopPool(scene);
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
        case 'pelletImpact': {
          // A Kettie stone lands later: shift by the camera's pan since it was fired.
          const pan =
            e.cx === undefined
              ? 0
              : (e.cx - state.cameraX) * this.parallax.plane('mid').scrollFactor;
          if (e.birdId === null) this.puffs.explode(1, width / 2 + e.dx + pan, e.sy);
          break;
        }
        case 'splash': {
          // Okavango water (M8): a crown of drops where the shot hit the water.
          // On the water's own layer (the mid plane), at the world point the shot hit.
          const mid = this.parallax.plane('mid');
          const at = tapToPlane(e.cx, mid.scrollFactor, e.dx, e.sy);
          const img = this.scene.add.image(at.x, at.y, TEX.splash).setScale(0.4);
          mid.overlay?.add(img);
          this.scene.tweens.add({
            targets: img,
            scale: 1.1,
            alpha: 0,
            duration: 420,
            ease: 'Cubic.Out',
            onComplete: () => {
              img.destroy();
            },
          });
          break;
        }
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
        fontSize: fontPx(56),
        fontStyle: '900',
        color,
        ...outline(56, 9),
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
        fontFamily: DISPLAY_FONT,
        fontSize: fontPx(60),
        fontStyle: '900',
        color: big ? '#FFD25A' : '#F3EAD3',
        ...outline(60, 10),
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
    const text = t('fx.poof');
    const style = { ...outline(64, 8) };
    const look = `${fontPx(64)}|${style.stroke ?? ''}|${style.strokeThickness ?? 0}`;
    // Reuse a finished POOF (same look: its label texture is already right); else make one.
    let item = this.poofFree.pop();
    if (item !== undefined && item.look !== look) {
      item.bubble.destroy();
      item.label.destroy();
      item = undefined;
    }
    if (item === undefined) {
      item = {
        bubble: this.scene.add.image(0, 0, TEX.bubble),
        label: this.scene.add
          .text(0, 0, text, {
            fontFamily: DISPLAY_FONT,
            fontSize: fontPx(64),
            fontStyle: '900',
            color: '#C8302A',
            ...style,
          })
          .setOrigin(0.5),
        look,
      };
    }
    const { bubble, label } = item;
    // Phaser's setText re-renders only when the text differs (a language switch).
    label.setText(text);
    for (const o of [bubble, label]) {
      o.setPosition(x, y - 40 * s)
        .setScale(0.2 * s)
        .setRotation(rot)
        .setAlpha(1)
        .setVisible(true)
        .setActive(true);
    }
    layer.add([bubble, label]);
    this.scene.tweens.add({
      targets: [bubble, label],
      scale: s,
      duration: this.feel.juice.poofMs * 0.3,
      ease: 'Back.Out',
    });
    const done = item;
    this.scene.tweens.add({
      targets: [bubble, label],
      alpha: 0,
      delay: this.feel.juice.poofMs * 0.6,
      duration: this.feel.juice.poofMs * 0.4,
      onComplete: () => {
        bubble.setVisible(false).setActive(false);
        label.setVisible(false).setActive(false);
        this.poofFree.push(done);
      },
    });
  }

  /** Pooled score pops: shown and made (test hook, D-028 §4). */
  popStats(): { shown: number; created: number } {
    return { shown: this.pops.shown, created: this.pops.created };
  }

  /** "10 ×2" rising, then resolving to "+20" (GDD §5.3, §17: 60 px over 600 ms). */
  private scorePop(at: BagSpot, parts: string, award: string, color: string): void {
    const layer = this.parallax.plane(at.plane).overlay;
    if (!layer) return;
    const s = at.plane === 'near' ? 1 : at.plane === 'mid' ? 0.8 : 0.65;
    const resolvedColor = color === '#F3EAD3' ? '#FFD25A' : color;
    // v1.0.1 (D-028 §4): a pooled BitmapText pop. A string the pop atlas can't draw (it never
    // happens with format.ts) falls back to a canvas Text.
    if (!popCanShow(parts) || !popCanShow(award)) {
      this.scorePopText(at, parts, award, color);
      return;
    }
    const keys = ensurePopFont(this.scene, popLook(FONT, 52, 8));
    const pop = this.pops
      .acquire(keys)
      .show(keys, keys.sizePx, parts, 0.5, 0.5, colorNumber(color));
    pop.root.setPosition(at.x, at.y - 110 * s).setScale(s);
    layer.add(pop.root);
    const { scorePopMs, scorePopRisePx } = this.feel.juice;
    // Resolve "10 ×2" → "+20" from the rise tween's own progress (see scorePopText).
    let resolved = false;
    this.scene.tweens.add({
      targets: pop.root,
      y: pop.root.y - scorePopRisePx,
      duration: scorePopMs,
      ease: 'Cubic.Out',
      onUpdate: (tween) => {
        if (resolved || tween.progress < 0.45 || !pop.root.active) return;
        resolved = true;
        pop.setText(award).setColor(colorNumber(resolvedColor));
      },
    });
    this.scene.tweens.add({
      targets: pop.root,
      alpha: 0,
      delay: scorePopMs * 0.75,
      duration: scorePopMs * 0.5,
      onComplete: () => {
        this.pops.release(pop);
      },
    });
  }

  /** The pre-v1.0.1 canvas Text pop, kept for strings outside the pop atlas. */
  private scorePopText(at: BagSpot, parts: string, award: string, color: string): void {
    const layer = this.parallax.plane(at.plane).overlay;
    if (!layer) return;
    const s = at.plane === 'near' ? 1 : at.plane === 'mid' ? 0.8 : 0.65;
    const text = this.scene.add
      .text(at.x, at.y - 110 * s, parts, {
        fontFamily: FONT,
        fontSize: fontPx(52),
        fontStyle: '900',
        color,
        ...outline(52, 8),
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
