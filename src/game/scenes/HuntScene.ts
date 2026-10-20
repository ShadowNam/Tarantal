// The Classic hunt (M2). Shows the panorama behind a "Tap to hunt" card; that tap unlocks audio,
// fixes the hunt's inputKind (touch → aim assist) and starts the sim. Each frame: advance the
// fixed-step runner, route the frame's events to FX / audio / HUD, then draw the interpolated
// snapshot. The scene never writes into the sim: input reaches it only as Commands.
import * as Phaser from 'phaser';
import type { Weapon } from '../../content/schemas';
import { DebugOverlay } from '../../debug/DebugOverlay';
import { t } from '../../i18n/i18n';
import { screenShakeEnabled } from '../../meta/settings';
import type { SimEvent } from '../../sim/events';
import { createRecorder, encodeInputLogText, type InputRecorder } from '../../sim/replay/inputLog';
import { createSim } from '../../sim/Sim';
import type { HuntResult, InputKind, ModeConfig } from '../../sim/types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../../sim/world';
import type { GameContext } from '../GameContext';
import { HuntRunner } from '../HuntRunner';
import { InputMapper, inputKindOf } from '../input/InputMapper';
import { BirdView } from '../view/BirdView';
import { Fx, FONT } from '../view/Fx';
import { interpolateBirds, interpolateCamera } from '../view/interpolate';
import { ParallaxView } from '../view/ParallaxView';
import { WeaponView } from '../view/WeaponView';
import type { HudScene } from './HudScene';
import type { TallyData } from './TallyScene';

export interface HuntData {
  /** Skip the start card (the [Again] button) with this input kind. */
  readonly autoStart?: InputKind;
}

const END_DELAY_MS = 900;
const MAX_FRAME_SAMPLES = 20_000;

export class HuntScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private parallax!: ParallaxView;
  private birds!: BirdView;
  private fx!: Fx;
  private weapon!: WeaponView;
  private debug!: DebugOverlay;
  private screen!: Phaser.GameObjects.Container;
  private card: Phaser.GameObjects.Container | null = null;
  private runner: HuntRunner | null = null;
  private mapper: InputMapper | null = null;
  private recorder: InputRecorder | null = null;
  private inputKind: InputKind = 'pointer';
  private shake = true;
  private ending = false;
  private cleanups: (() => void)[] = [];
  private lastFrameAt: number | null = null;

  constructor(ctx: GameContext) {
    super({ key: 'Hunt' });
    this.ctx = ctx;
  }

  create(data: HuntData): void {
    this.runner = null;
    this.mapper = null;
    this.ending = false;
    this.card = null;
    this.cleanups = [];
    this.lastFrameAt = null;
    this.ctx.manifest.install(this.textures);
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);

    this.parallax = new ParallaxView(this, this.ctx.biome, this.ctx.manifest);
    this.screen = this.add.container(0, 0);
    this.birds = new BirdView(this, this.ctx.manifest, this.parallax);
    this.fx = new Fx(this, this.ctx.feel, this.parallax, this.screen, (id) =>
      this.birds.positionOf(id),
    );
    this.weapon = new WeaponView(this, this.ctx.feel, this.screen);
    this.debug = new DebugOverlay(
      this,
      this.ctx.content,
      this.ctx.biome,
      this.parallax,
      this.screen,
    );
    this.debug.setVisible(this.ctx.debug);
    this.relayout();
    this.parallax.update((CAMERA_MIN_X + CAMERA_MAX_X) / 2, width);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.teardown();
    });

    if (data.autoStart !== undefined) this.begin(data.autoStart, null);
    else this.showStartCard();
    if (this.ctx.hook) this.ctx.hook.ready = true;
  }

  private readonly relayout = (): void => {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
    this.weapon.layout(width * 0.62, height);
    this.card?.setPosition(width / 2, height / 2);
  };

  // --- start card ---------------------------------------------------------------------------

  private showStartCard(): void {
    const { width, height } = this.scale.gameSize;
    const hintKey = this.ctx.coarsePointer ? 'start.hint_touch' : 'start.hint_mouse';
    const shade = this.add.rectangle(0, 0, 4000, 2400, 0x1b1410, 0.45);
    const title = this.add
      .text(0, -40, t('start.title'), {
        fontFamily: FONT,
        fontSize: '120px',
        fontStyle: '900',
        color: '#F3EAD3',
        stroke: '#1B1410',
        strokeThickness: 16,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(0, 90, t(hintKey), {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: '700',
        color: '#F3EAD3',
        stroke: '#1B1410',
        strokeThickness: 6,
        align: 'center',
        wordWrap: { width: Math.min(1300, width - 160) },
      })
      .setOrigin(0.5, 0);
    this.card = this.add.container(width / 2, height / 2, [shade, title, hint]);
    this.tweens.add({
      targets: title,
      scale: { from: 1, to: 1.06 },
      yoyo: true,
      repeat: -1,
      duration: 700,
    });
    if (this.ctx.hook) this.ctx.hook.scene = 'start';

    const canvas = this.game.canvas;
    const onDown = (e: PointerEvent): void => {
      e.preventDefault();
      this.begin(inputKindOf(e.pointerType), e.pointerId);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.begin('pointer', null);
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    const remove = (): void => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    this.cleanups.push(remove);
    this.startCardRemove = remove;
  }

  private startCardRemove: (() => void) | null = null;

  // --- hunt -------------------------------------------------------------------------------------

  private begin(kind: InputKind, startPointer: number | null): void {
    if (this.runner) return;
    this.startCardRemove?.();
    this.startCardRemove = null;
    this.card?.destroy();
    this.card = null;
    this.ctx.audio.unlock();
    this.inputKind = kind;
    this.shake = screenShakeEnabled(this.ctx.reducedMotion);

    const mode: ModeConfig =
      this.ctx.huntSeconds === undefined
        ? { id: 'classic' }
        : { id: 'classic', huntSeconds: this.ctx.huntSeconds };
    const seed = this.ctx.nextSeed();
    const sim = createSim({ seed, content: this.ctx.content, mode, inputKind: kind });
    this.recorder = createRecorder({
      seed,
      contentHash: this.ctx.contentHash,
      mode,
      inputKind: kind,
    });

    this.scene.launch('Hud');
    const hud = this.scene.get('Hud') as HudScene;
    const mapper = new InputMapper(
      this.game.canvas,
      this.ctx.feel,
      {
        designSize: () => this.scale.gameSize,
        isOnBelt: (x, y) => hud.isOnBelt(x, y),
        queue: (cmd) => this.runner?.queue(cmd),
        aim: (x, y, fromTap) => {
          this.weapon.aim(x, y, fromTap || this.inputKind === 'pointer');
        },
        fingerDown: (down) => {
          this.weapon.setFingerDown(down);
        },
        toggleDebug: () => {
          this.ctx.debug = !this.ctx.debug;
          this.debug.setVisible(this.ctx.debug);
        },
      },
      sim.snapshot().cameraX,
    );
    if (startPointer !== null) mapper.ignorePointer(startPointer);
    mapper.setEnabled(true);
    this.mapper = mapper;
    this.cleanups.push(() => {
      mapper.destroy();
    });

    this.runner = new HuntRunner(sim, {
      maxStepsPerFrame: this.ctx.feel.loop.maxStepsPerFrame,
      recorder: this.recorder,
      perTick: () => mapper.perTick(),
    });
    this.weapon.setTouchMode(kind === 'touch');
    this.game.canvas.style.cursor = kind === 'pointer' ? 'none' : '';

    const hook = this.ctx.hook;
    if (hook) {
      hook.scene = 'hunt';
      hook.inputKind = kind;
      hook.result = null;
      hook.replay = null;
      hook.over = false;
      hook.hunts++;
    }
  }

  override update(): void {
    // Real elapsed time, not Phaser's smoothed/capped delta: the hunt clock must follow the wall
    // clock (a 90 s hunt lasts 90 s). The runner's step cap still guards against huge gaps.
    const now = performance.now();
    const delta = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;
    const runner = this.runner;
    const { width } = this.scale.gameSize;
    this.weapon.update(delta);
    if (runner === null) return;
    if (this.ctx.paused()) return;

    const hook = this.ctx.hook;
    if (hook && !this.ending && hook.frameTimes.length < MAX_FRAME_SAMPLES)
      hook.frameTimes.push(delta);

    const { events } = runner.advance(delta);
    if (events.length > 0) this.handleEvents(events, width);

    const state = runner.state;
    const alpha = runner.alpha;
    const cam = interpolateCamera(runner.prev, state, alpha);
    this.parallax.update(cam, width);
    const drawBirds = interpolateBirds(runner.prev, state, alpha);
    this.birds.update(drawBirds, state.tick);
    const safe = this.ctx.safeArea();
    // Bottom-left, clear of the HUD (timer/Frenzy top-left, belt bottom-right).
    this.debug.update(
      state,
      drawBirds,
      this.inputKind,
      safe.left + 20,
      this.scale.gameSize.height - safe.bottom - 60,
    );
    (this.scene.get('Hud') as HudScene).render(state, events);

    if (hook) {
      hook.tick = state.tick;
      hook.ticksLeft = state.ticksLeft;
      hook.score = state.score;
      hook.shells = state.weapon.shells;
      hook.cameraX = state.cameraX;
      hook.birds = state.birds.length;
    }

    if (runner.over && !this.ending) this.finish();
  }

  private handleEvents(events: readonly SimEvent[], width: number): void {
    // FX first: penalty pops look up where the bird was last drawn, before it is removed.
    this.fx.handle(events, width);
    const half = width / 2;
    this.ctx.audio.handle(events, (e) => {
      if (e.type === 'shotFired') return e.dx / half;
      if (e.type === 'targetBagged') return (this.parallax.screenX(e.plane, e.x) - half) / half;
      return 0;
    });
    let bagged = false;
    for (const e of events) {
      if (e.type === 'shotFired') {
        this.weapon.fired();
        if (this.shake) {
          const w: Weapon | undefined = this.ctx.content.weapons.weapons.find(
            (x) => x.id === e.weapon,
          );
          if (w && w.shake.px > 0) this.cameras.main.shake(w.shake.ms, w.shake.px / width);
        }
        const hook = this.ctx.hook;
        if (hook) {
          hook.shots++;
          hook.firstShotAtMs ??= performance.now();
        }
      } else if (e.type === 'targetBagged') {
        bagged = true;
      } else if (e.type === 'bonusAwarded' && e.bonus === 'twoFlies') {
        this.runner?.hitStop(this.ctx.feel.juice.hitStopTwoFliesMs);
      }
    }
    if (bagged) this.runner?.hitStop(this.ctx.feel.juice.hitStopMs);
  }

  private finish(): void {
    const runner = this.runner;
    if (runner === null) return;
    this.ending = true;
    this.mapper?.setEnabled(false);
    this.game.canvas.style.cursor = '';
    this.weapon.hideReticle();
    const result = this.recordResult();
    this.time.delayedCall(END_DELAY_MS, () => {
      this.scene.stop('Hud');
      const data: TallyData = {
        result,
        again: (pointerType) => {
          this.scene.stop('Tally');
          this.scene.restart({ autoStart: inputKindOf(pointerType) } satisfies HuntData);
        },
      };
      this.scene.launch('Tally', data);
    });
  }

  private recordResult(): HuntResult {
    if (this.runner === null) throw new Error('no hunt running');
    const result = this.runner.result();
    const hook = this.ctx.hook;
    if (hook) {
      hook.over = true;
      hook.result = result;
      hook.replay = this.recorder ? encodeInputLogText(this.recorder.toLog()) : null;
    }
    return result;
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout);
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.birds.clear();
    this.game.canvas.style.cursor = '';
  }
}
