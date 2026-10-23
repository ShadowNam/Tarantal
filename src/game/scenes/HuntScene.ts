// The hunt (Classic and the FTUE "Oupa se Les"). Shows the panorama behind the title; START
// unlocks audio, fixes the hunt's inputKind (touch → aim assist, at the Settings level) and starts
// the sim. Each frame: advance the fixed-step runner, route the frame's events to FX / audio /
// HUD / the hunt log (meta) / the FTUE director, then draw the interpolated snapshot. The scene
// never writes into the sim: input reaches it only as Commands. Esc, P, the HUD pause button or
// a hidden tab open the pause menu; the hunt clock holds while it is open.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import type { Biome, Weapon } from '../../content/schemas';
import { DebugOverlay } from '../../debug/DebugOverlay';
import { fill, t, tOr } from '../../i18n/i18n';
import { textStyle } from '../ui/menu';
import { captureHintAlpha, type CaptureState } from '../capture';
import { showDontShootBadge } from '../prefs';
import { TierFilters } from '../quality/TierFilters';
import type { Challenge } from '../../meta/challenge';
import { createHuntLogger, type HuntLogger } from '../../meta/huntLog';
import { createShareLogger, type ShareLogger } from '../../meta/share';
import { applyHunt, fittedSight, isWeaponEquippable, type HuntOutcome } from '../../meta/progress';
import { msToTicks } from '../../sim/clock';
import type { SimEvent } from '../../sim/events';
import { createRecorder, encodeInputLogText, type InputRecorder } from '../../sim/replay/inputLog';
import { createSim } from '../../sim/Sim';
import type { HuntResult, InputKind, ModeConfig, ModeId, SimState } from '../../sim/types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../../sim/world';
import { neededBeforeStart, type AssetManifest } from '../assets/AssetManifest';
import { stemFor } from '../audio/music';
import { rumbleDue } from '../view/juice';
import type { HuntPlan } from '../daily/DailyFlow';
import { FtueDirector, type FtueStep } from '../ftue/FtueDirector';
import type { GameContext, TestHook } from '../GameContext';
import { HuntRunner } from '../HuntRunner';
import { InputMapper, inputKindOf } from '../input/InputMapper';
import { BirdView } from '../view/BirdView';
import { Fx } from '../view/Fx';
import { interpolateAim, interpolateBirds, interpolateCamera } from '../view/interpolate';
import { SightView, type SightPicture } from '../view/SightView';
import { NO_ZOOM, zoomFor, type ZoomState } from '../view/zoomView';
import { ParallaxView } from '../view/ParallaxView';
import { WeaponView } from '../view/WeaponView';
import { planeToDx } from '../../sim/camera';
import { crosshairExtent, spreadMulOf } from '../ui/gunLook';
import { WorldView } from '../view/WorldView';
import { textureBytes } from '../assets/textureBytes';
import { mapLights, mapOmen, resolveMap, type ResolvedMap } from '../../sim/maps';
import { layoutForDay } from '../../meta/maps';
import { applyBonusResult, bonusSlug, isUnlocked } from '../../meta/bonusMaps';
import { formatScore } from '../ui/format';
import type { HudScene } from './HudScene';
import type { PauseData } from './PauseScene';
import { viewFor, type RunData, type RunView } from './RunScene';
import type { TallyData } from './TallyScene';
import type { TitleData } from './TitleScene';
import type { ChallengeData } from './ChallengeScene';
import type { AdminData } from './AdminScene';

export interface HuntData {
  /** Skip the title (the [Again] button) with this input kind. */
  readonly autoStart?: InputKind;
  /** Mode for autoStart (default classic). */
  readonly mode?: ModeId;
  /** M7: play this challenge (link card's [Accept], or [Again] after one). */
  readonly challenge?: Challenge;
  /** v1.2: a bonus map on today's Classic map ([Again] after Verder, while it is unlocked). */
  readonly bonus?: string;
}

const END_DELAY_MS = 900;
/** Time per frame spent drawing deferred textures behind the start card. */
const BACKGROUND_DRAW_MS = 8;
const MAX_FRAME_SAMPLES = 20_000;

export class HuntScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private parallax!: ParallaxView;
  private birds!: BirdView;
  private fx!: Fx;
  private weapon!: WeaponView;
  private world!: WorldView;
  private debug!: DebugOverlay;
  private screen!: Phaser.GameObjects.Container;
  /** v1.3: screen overlays a sight's zoom never scales (glare, tints, rain), the sight picture,
   *  and the gun with its crosshair — in that order above the zoomed world. */
  private screenFixed!: Phaser.GameObjects.Container;
  private sightLayer!: Phaser.GameObjects.Container;
  private gunLayer!: Phaser.GameObjects.Container;
  private sight!: SightView;
  /** The rifle zoom view of the last frame (NO_ZOOM when no sight is up). */
  private zoomView: ZoomState = NO_ZOOM(1920, 1080);
  private runner: HuntRunner | null = null;
  /** v1.0.1 (D-028 §5): capture mode's key hint while it shows. */
  private captureHint: Phaser.GameObjects.Text | null = null;
  private mapper: InputMapper | null = null;
  private recorder: InputRecorder | null = null;
  private inputKind: InputKind = 'pointer';
  private ending = false;
  private logger: HuntLogger | null = null;
  private ftue: FtueDirector | null = null;
  private pausedByMenu = false;
  private cleanups: (() => void)[] = [];
  private lastFrameAt: number | null = null;
  private texturesDone = false;
  private tierFilters: TierFilters | null = null;
  /** M9: create() is waiting for a biome's art; there are no views to update yet. */
  private viewsPending = false;
  /** A commercial break before the next hunt is in flight (afterBreak is single-flight). */
  private breakPending = false;
  private modeId: ModeId = 'classic';
  /** M7: Classic/Daily/challenge setup (null for the FTUE and Season Run hunts). */
  private plan: HuntPlan | null = null;
  private shareLog: ShareLogger | null = null;
  /** The pause between the hunt's end and the tally, on the wall clock (see afterRealMs). */
  private endAction: { readonly at: number; readonly run: () => void } | null = null;
  /** The biome on screen and its manifest (the home biome until a hunt in another starts). */
  private biome!: Biome;
  private manifest!: AssetManifest;
  /** v1.2 (D-033): the map on screen — weekday layout and bonus map (undefined = plain biome). */
  private map: { readonly layout?: string; readonly bonus?: string } = {};
  /** v1.2: UTC day the hunt started (its layout is that day's; Verder unlocks for that day). */
  private huntDay = 0;
  /** Real time of the next Stampede rumble shake. */
  private nextRumbleAt = 0;

  constructor(ctx: GameContext) {
    super({ key: 'Hunt' });
    this.ctx = ctx;
  }

  create(data: HuntData): void {
    // M9 lazy biomes: an auto-started hunt in a biome whose art isn't loaded yet waits for it.
    const wanted = this.initialBiome(data);
    this.viewsPending = !this.ctx.biomeReady(wanted.id);
    if (this.viewsPending) {
      this.waitForBiome(wanted.id, (ok) => {
        this.scene.restart(ok ? data : ({} satisfies HuntData));
      });
      return;
    }
    this.runner = null;
    this.captureHint = null;
    this.endAction = null;
    this.tierFilters = null;
    this.mapper = null;
    this.ending = false;
    this.logger = null;
    this.ftue = null;
    this.plan = null;
    this.shareLog = null;
    this.pausedByMenu = false;
    this.ctx.menuPaused = false;
    this.cleanups = [];
    this.lastFrameAt = null;
    // M10 capture mode keys (S slow-mo, F freeze, C auto-pan); none of them is a game key.
    const capture = this.ctx.capture;
    if (capture !== null) {
      const onKey = (e: KeyboardEvent): void => {
        if (!e.repeat && capture.key(e.code)) e.preventDefault();
      };
      window.addEventListener('keydown', onKey);
      this.cleanups.push(() => {
        window.removeEventListener('keydown', onKey);
        // The animation speed is game-wide: don't carry a freeze or slow-mo past this scene.
        this.anims.globalTimeScale = 1;
      });
    }
    // Settings or the title benchmark changed the tier: swap the filters now (a layer merge
    // waits for the next view build).
    this.cleanups.push(
      this.ctx.onPrefsChange(() => {
        this.tierFilters?.apply(this.ctx.prefs);
        if (this.ctx.hook && this.tierFilters)
          this.ctx.hook.quality.filters = this.tierFilters.active;
      }),
    );
    // An auto-started hunt (Season Run, [Again], challenge) builds its own biome straight away
    // instead of the home biome's views first (D-025); the title shows the home biome.
    this.biome = this.initialBiome(data);
    this.map = this.initialMap(data);
    this.manifest =
      this.biome.id === this.ctx.biome.id ? this.ctx.manifest : this.ctx.manifestFor(this.biome);
    this.swapManifest();
    this.releaseGuns();
    // The test hook reads texture memory right after the release (not 30 frames later, which is
    // seconds under software GL on CI).
    if (this.ctx.hook) this.sampleTextures(this.ctx.hook);
    this.ctx.huntBiome = this.biome;
    this.ctx.audio.setBiome(this.biome.id);
    this.ctx.audio.resetIntensity();
    // Scenery and UI now; birds are drawn a few at a time while the start card shows.
    this.texturesDone = this.manifest.install(this.textures, neededBeforeStart);
    if (this.ctx.hook) this.ctx.hook.boot['textures'] ??= performance.now();
    this.buildViews();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout);
    // Browsers (iOS especially) only let audio start from pointerup/touchend/keydown, not from a
    // touch pointerdown; keep offering until the AudioContext runs.
    const unlockAudio = (): void => {
      if (!this.ctx.audio.running) this.ctx.audio.unlock();
    };
    this.game.canvas.addEventListener('pointerup', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    this.cleanups.push(() => {
      this.game.canvas.removeEventListener('pointerup', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.teardown();
    });

    // Tab hidden mid-hunt: open the pause menu, so coming back never resumes mid-flight.
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden' && this.runner !== null && !this.ending)
        this.openPause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
    });

    if (data.autoStart !== undefined)
      this.begin(data.autoStart, null, data.mode ?? 'classic', data.challenge ?? null, data.bonus);
    else this.showTitle();
    if (this.ctx.hook) {
      this.ctx.hook.ready = true;
      this.ctx.hook.boot['ready'] ??= performance.now();
    }
  }

  /** The biome an auto-started hunt will play (the home biome for the title). */
  private initialBiome(data: HuntData): Biome {
    const c = this.ctx;
    let id: string | undefined;
    if (data.autoStart !== undefined) {
      if (data.challenge !== undefined) id = data.challenge.biome;
      else if (data.mode === 'seasonHunt')
        id = c.run.current === null ? undefined : c.run.info().biome;
      else if (data.mode === 'daily') id = c.daily.todaySetup().biome;
      else if (data.mode === 'ftue') id = c.content.modes.modes.ftue.biome;
      else id = c.classicBiome ?? c.content.modes.modes.classic.biome;
    }
    const b = id === undefined ? undefined : c.content.biomes.find((x) => x.id === id);
    return b !== undefined && c.playableBiomes.includes(b.id) ? b : c.biome;
  }

  /** v1.2: the map an auto-started hunt will play (the title shows today's Classic layout). */
  private initialMap(data: HuntData): { readonly layout?: string; readonly bonus?: string } {
    const c = this.ctx;
    if (data.autoStart !== undefined) {
      if (data.challenge !== undefined) {
        const l = data.challenge.l;
        const b = data.challenge.b;
        return l === undefined ? {} : b === undefined ? { layout: l } : { layout: l, bonus: b };
      }
      if (data.mode === 'seasonHunt' || data.mode === 'ftue') return {};
      if (data.mode === 'daily') return { layout: c.daily.todaySetup().layout };
    }
    if (c.classicLayout === 'none') return {};
    // [Again] after Verder: the views are built for Verder straight away (no rebuild in begin).
    const bonus = c.classicBonus ?? (data.autoStart !== undefined ? data.bonus : undefined);
    const layout = c.classicLayout ?? layoutForDay(c.today());
    return bonus === undefined ? { layout } : { layout, bonus };
  }

  /** Every view of the hunt for the scene's biome and map (another biome or map rebuilds them). */
  private buildViews(): void {
    const { width } = designSize();
    fitCamera(this.cameras.main);
    // An id this biome lacks (a bad ?layout=) draws the plain biome rather than failing.
    const map = safeResolveMap(this.biome, this.map.layout, this.map.bonus);
    const mapBiome = map.biome;
    this.parallax = new ParallaxView(this, mapBiome, this.manifest, this.ctx.prefs.mergeLayers);
    const lights = mapLights(map).flatMap((id) => {
      const light = this.ctx.feel.lights[id];
      return light === undefined ? [] : [light];
    });
    this.parallax.applyLight(lights);
    if (this.ctx.hook)
      this.ctx.hook.map = {
        layout: map.layout?.id ?? null,
        bonus: map.bonus?.id ?? null,
        lights: mapLights(map),
        props: Object.fromEntries(mapBiome.props.map((p) => [p.id, p.u])),
      };
    // M9 tier filters on this camera (the HUD scene has its own camera, unfiltered).
    this.tierFilters?.clear();
    this.tierFilters = new TierFilters(this.cameras.main);
    this.tierFilters.apply(this.ctx.prefs);
    if (this.ctx.hook) {
      this.ctx.hook.quality.layers = this.parallax.layers.length;
      this.ctx.hook.quality.filters = this.tierFilters.active;
    }
    this.screen = this.add.container(0, 0);
    this.screenFixed = this.add.container(0, 0);
    this.sightLayer = this.add.container(0, 0);
    this.gunLayer = this.add.container(0, 0);
    this.sight = new SightView(this, this.sightLayer, this.manifest);
    this.birds = new BirdView(
      this,
      this.manifest,
      this.parallax,
      this.ctx.content,
      this.ctx.feel.juice.forageSpellTicks,
      // ⛔ until a creature's first sighting; always with Settings → colour-blind aids (M9).
      (creature) =>
        showDontShootBadge(this.ctx.prefs, this.ctx.save.data.birdBook.creatures, creature),
    );
    this.fx = new Fx(
      this,
      this.ctx.feel,
      this.parallax,
      this.screen,
      (id) => this.birds.positionOf(id),
      (id) => this.birds.potOf(id),
      this.ctx.content.powerups.crates.plane,
      this.ctx.prefs,
    );
    this.world = new WorldView(
      this,
      this.ctx.content,
      this.ctx.feel,
      mapBiome,
      this.parallax,
      this.screen,
      this.ctx.prefs,
      this.ctx.flashes,
      this.screenFixed,
    );
    this.world.secretGlow = lights.some((l) => l.secretGlow === true);
    this.weapon = new WeaponView(
      this,
      this.ctx.feel,
      this.gunLayer,
      this.ctx.prefs,
      // The gun's atlas goes to the GPU when it is first shown (D-029).
      (id) => this.manifest.ensureGun(this.textures, id),
      this.ctx.content.weapons.weapons,
    );
    // e2e/dev only (D-029 art previews): freeze the gun on a clip frame for screenshots.
    if (this.ctx.hook)
      (window as { __TM_GUN__?: WeaponView['pose'] }).__TM_GUN__ = (id, clip, frame) => {
        this.weapon.pose(id, clip, frame);
      };
    // e2e/dev only (v1.1 art previews): a gun's ammo with N rounds left and its crosshair, on top
    // of whatever is equipped (null = back to live). The hunt is held (?holdAt) meanwhile.
    if (this.ctx.hook)
      (
        window as {
          __TM_AMMO__?: (id: string | null, rounds?: number, x?: number, y?: number) => void;
        }
      ).__TM_AMMO__ = (id, rounds = 0, x, y) => {
        (this.scene.get('Hud') as HudScene).previewAmmo(id, rounds);
        this.weapon.crosshairPreview = id;
        // The previewed gun's own first-person art too (frozen on its idle frame).
        this.weapon.pose(id ?? this.runner?.state.weapon.id ?? '', id === null ? null : 'idle');
        if (x !== undefined && y !== undefined) this.weapon.aim(x, y, true);
      };
    this.debug = new DebugOverlay(this, this.ctx.content, mapBiome, this.parallax, this.screen);
    this.debug.setVisible(this.ctx.debug);
    this.relayout();
    this.parallax.update((CAMERA_MIN_X + CAMERA_MAX_X) / 2, width);
  }

  /**
   * M10 capture mode, each hunt frame: no HUD or reticle, the speed (slow-mo, frozen) for the sim,
   * tweens and animations, and the auto-pan. Applied from the next frame on.
   */
  private applyCapture(runner: HuntRunner, cameraX: number, deltaMs: number): void {
    const c = this.ctx.capture;
    if (c === null) return;
    const ts = c.timeScale;
    runner.timeScale = ts;
    this.tweens.timeScale = ts;
    this.anims.globalTimeScale = ts;
    this.mapper?.setAutoPan(c.panDirection(cameraX, CAMERA_MIN_X, CAMERA_MAX_X));
    this.weapon.hideReticle();
    if (!c.showGun) this.weapon.setVisible(false);
    const hud = this.scene.get('Hud');
    hud.cameras.main.setVisible(false);
    this.updateCaptureHint(c, deltaMs);
    if (this.ctx.hook) this.ctx.hook.capture = { ...c.snapshot(), hud: hud.cameras.main.visible };
  }

  /**
   * v1.0.1 (D-028 §5): on entering capture mode, "S slow · F freeze · C pan" for a few seconds,
   * then a fade, then gone. It runs on frame time (slow motion and freeze scale the hunt, not
   * this), each frame counting at most hintMaxStepMs, so a stall while the hunt warms up (shader
   * compiles on a slow device) can't use up the hint before it was ever drawn.
   */
  private updateCaptureHint(c: CaptureState, deltaMs: number): void {
    if (c.hintDone) return;
    const tuning = this.ctx.feel.capture;
    c.hintElapsedMs =
      c.hintElapsedMs === null ? 0 : c.hintElapsedMs + Math.min(deltaMs, tuning.hintMaxStepMs);
    const alpha = captureHintAlpha(c.hintElapsedMs, tuning.hintMs, tuning.hintFadeMs);
    if (alpha === null) {
      this.captureHint?.destroy();
      this.captureHint = null;
      c.hintDone = true;
      return;
    }
    if (this.captureHint === null) {
      const { width } = designSize();
      this.captureHint = this.add
        .text(width / 2, this.ctx.safeArea().top + 40, t('capture.hint'), {
          ...textStyle(tuning.hintPx),
          stroke: '#1B1410',
          strokeThickness: 5,
        })
        .setOrigin(0.5, 0)
        .setDepth(10_000);
    }
    this.captureHint.setAlpha(alpha);
  }

  /** Settings → screen shake, and never in a capture slow-mo or freeze (shakes run on real time). */
  private shakeAllowed(): boolean {
    const c = this.ctx.capture;
    return this.ctx.prefs.shake && (c === null || c.timeScale === 1);
  }

  /** GDD §17 Stampede ground-shake rumble: a small shake every rumbleEveryMs (Settings → shake). */
  private rumble(on: boolean, now: number, width: number): void {
    const r = this.ctx.feel.juice.stampede;
    const due = rumbleDue({
      on,
      shakeAllowed: this.shakeAllowed(),
      rumblePx: r.rumblePx,
      shakeScale: this.ctx.feel.juice.shakeScale,
      nowMs: now,
      nextAtMs: this.nextRumbleAt,
      everyMs: r.rumbleEveryMs,
    });
    if (due === null) return;
    this.nextRumbleAt = due.nextAtMs;
    this.cameras.main.shake(r.rumbleMs, due.px / width);
  }

  /**
   * D-031: releases the previously installed biome's scenery textures (not the shared ones) before
   * this.manifest installs, so the low tier never holds two biomes' layers and props. Callers have
   * destroyed every object that drew them (scene restart or useBiome).
   */
  private swapManifest(): void {
    const prev = this.ctx.installedManifest;
    if (prev !== null && prev !== this.manifest)
      prev.release(this.textures, this.manifest, this.anims);
    this.ctx.installedManifest = this.manifest;
  }

  /** v1.3: the mode with the rifle's sight (unchanged for guns without one or a set sight). */
  private withSight(mode: ModeConfig): ModeConfig {
    if (mode.sight !== undefined) return mode;
    const gun =
      mode.weapon ??
      (mode.id === 'seasonHunt' ? undefined : this.ctx.content.modes.modes[mode.id].weapon);
    if (gun === undefined) return mode;
    const def = this.ctx.content.weapons.weapons.find((w) => w.id === gun);
    if (def?.kind !== 'primary' || def.aim === undefined) return mode;
    const override = this.ctx.sightOverride;
    const sight =
      override !== undefined && def.aim.sights.includes(override)
        ? override
        : fittedSight(gun, this.ctx.save.data, this.ctx.content);
    return sight === undefined ? mode : { ...mode, sight };
  }

  /** v1.3: the picture a fitted sight draws (weapons.json sights), or null for no sight. */
  private sightPicture(id: string | null): SightPicture | null {
    if (id === null) return null;
    return this.ctx.content.weapons.sights.find((s) => s.id === id)?.picture ?? null;
  }

  /** D-029 texture memory for the test hook, and (v1.3) which gun atlases are on the GPU. */
  private sampleTextures(hook: TestHook): void {
    hook.textureBytes = textureBytes(this.textures);
    hook.gunAtlases = this.textures.getTextureKeys().filter((k) => k.startsWith('final:gun/'));
  }

  /**
   * v1.3: leaving a hunt (this scene restarts for the title, [Again] or the next hunt) drops the
   * gun atlases of every gun but the equipped one, so a hunt that used both crate guns doesn't
   * keep them on the GPU (low tier < 128 MB). A gun shown again uploads on demand (ensureGun).
   */
  private releaseGuns(): void {
    const keep = new Set([this.ctx.save.data.loadout.weapon]);
    for (const m of new Set([this.manifest, this.ctx.installedManifest]))
      m?.releaseGuns(this.textures, keep, this.anims);
  }

  /** M8: a hunt in another biome (Daily rotation, challenge, Season Run) swaps the scenery. */
  private useBiome(id: string, map: { readonly layout?: string; readonly bonus?: string }): void {
    const sameMap = map.layout === this.map.layout && map.bonus === this.map.bonus;
    if (id === this.biome.id) {
      if (sameMap) return;
      // v1.2: same biome, another map (props move, light changes): same textures, new views.
      for (const obj of [...this.children.list]) obj.destroy();
      this.map = map;
      this.buildViews();
      return;
    }
    const next = this.ctx.content.biomes.find((b) => b.id === id);
    if (next === undefined || !this.ctx.playableBiomes.includes(id)) return;
    for (const obj of [...this.children.list]) obj.destroy();
    this.map = map;
    this.biome = next;
    this.manifest = this.ctx.manifestFor(next);
    this.swapManifest();
    this.ctx.huntBiome = next;
    this.ctx.audio.setBiome(next.id);
    this.texturesDone = this.manifest.install(this.textures);
    this.buildViews();
  }

  private readonly relayout = (): void => {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    this.weapon.layout(width * (this.ctx.prefs.leftHanded ? 0.38 : 0.62), height);
  };

  // --- title ------------------------------------------------------------------------------

  private showTitle(): void {
    // The title is up: loading is over (Poki gameLoadingFinished, CrazyGames loadingStop).
    this.ctx.platform.loadingProgress(1);
    // v1.2x (D-034): the playtest admin page replaces the title (list, or the [Play] card).
    if (this.ctx.admin !== null) {
      this.showAdmin();
      return;
    }
    // A challenge link opened this page: its "beat this" card comes first, once.
    const pending = this.ctx.pendingChallenge;
    this.ctx.pendingChallenge = null;
    if (pending?.ok === true) {
      const data: ChallengeData = {
        challenge: pending.challenge,
        contentChanged: pending.contentChanged,
        accept: (kind, pointerId) => {
          this.afterBreak(() => {
            this.begin(kind, pointerId, pending.challenge.mode, pending.challenge);
          });
        },
        later: () => {
          this.scene.stop('Challenge');
          this.showTitle();
        },
      };
      this.scene.launch('Challenge', data);
      this.scene.bringToTop('Challenge');
      if (this.ctx.hook) this.ctx.hook.scene = 'challenge';
      return;
    }
    const data: TitleData = {
      ...(pending === null ? {} : { notice: t('title.challenge_bad') }),
      start: (kind, pointerId, mode, bonus) => {
        this.afterBreak(() => {
          this.begin(kind, pointerId, mode, null, bonus);
        });
      },
      run: () => {
        this.openRun();
      },
    };
    this.scene.launch('Title', data);
    this.scene.bringToTop('Title');
    if (this.ctx.hook) this.ctx.hook.scene = 'start';
  }

  // --- admin page (D-034) ---------------------------------------------------------------------

  private showAdmin(): void {
    const setup = this.ctx.admin?.setup ?? null;
    const data: AdminData =
      setup === null
        ? { view: 'list' }
        : {
            view: 'play',
            start: (pointerType) => {
              this.ctx.audio.unlock();
              const kind = inputKindOf(pointerType);
              if (setup.mode === 'seasonHunt') {
                // A fresh run on the admin save, jumped to the chosen hunt.
                this.ctx.run.abandon();
                this.ctx.run.start(this.ctx.nextSeed(), setup.weapon ?? this.runWeapon());
                this.ctx.run.jumpTo(setup.huntIndex ?? 0, setup.runRental ?? null);
              }
              this.begin(kind, null, setup.mode);
            },
          };
    this.scene.launch('Admin', data);
    this.scene.bringToTop('Admin');
    if (this.ctx.hook) this.ctx.hook.scene = 'admin';
  }

  // --- Season Run ---------------------------------------------------------------------------

  /** The primary the run uses: the Skiet-Skuur loadout if it is equippable, else Classic's. */
  private runWeapon(): string {
    const save = this.ctx.save.data;
    const loadout = this.ctx.content.weapons.weapons.find((w) => w.id === save.loadout.weapon);
    return loadout !== undefined && isWeaponEquippable(loadout, save, this.ctx.content)
      ? loadout.id
      : this.ctx.content.modes.modes.classic.weapon;
  }

  /** Title or tally → the run: resume the saved one, or start a new one. */
  private openRun(): void {
    this.scene.stop('Title');
    this.scene.stop('Tally');
    const run = this.ctx.run.current ?? this.ctx.run.start(this.ctx.nextSeed(), this.runWeapon());
    this.launchRun(viewFor(run));
  }

  private launchRun(view: RunView): void {
    const data: RunData = {
      view,
      hunt: (pointerType) => {
        this.afterBreak(() => {
          this.scene.stop('Run');
          this.scene.restart({
            autoStart: inputKindOf(pointerType),
            mode: 'seasonHunt',
          } satisfies HuntData);
        });
      },
      title: () => {
        this.scene.stop('Run');
        this.scene.restart({} satisfies HuntData);
      },
      newRun: () => {
        this.ctx.run.abandon();
        this.ctx.run.start(this.ctx.nextSeed(), this.runWeapon());
      },
    };
    this.scene.launch('Run', data);
    this.scene.bringToTop('Run');
    if (this.ctx.hook) this.ctx.hook.scene = 'run';
  }

  /**
   * Between hunts (M9): the portal's commercial break, then `go` (the next hunt). Audio is
   * unlocked here, inside the tap, because iOS refuses it once the ad has run.
   */
  private afterBreak(go: () => void): void {
    this.ctx.audio.unlock();
    // Single-flight (D-026): a second tap while the break is requested or showing is dropped;
    // only the first request's hunt starts, once, after the ad.
    if (this.breakPending) return;
    this.breakPending = true;
    if (this.ctx.hook) this.ctx.hook.adPending = true;
    const next = (): void => {
      this.breakPending = false;
      if (this.ctx.hook) this.ctx.hook.adPending = false;
      if (this.ctx.hook) this.ctx.hook.huntRequests++;
      go();
    };
    this.ctx.ads.beforeHunt().then(next, next);
  }

  /** Loads a biome's art chunk with a "Loading…" line and the portal's loading signals. */
  private waitForBiome(id: string, then: (ok: boolean) => void): void {
    const { width, height } = designSize();
    const label = this.add
      .text(width / 2, height / 2, t('ui.loading'), textStyle(48, '#F3EAD3'))
      .setOrigin(0.5)
      .setDepth(10_000);
    this.ctx.platform.loadingProgress(0);
    void this.ctx.loadBiome(id).then((ok) => {
      this.ctx.platform.loadingProgress(1);
      if (label.active) label.destroy();
      then(ok);
    });
  }

  // --- hunt -------------------------------------------------------------------------------------

  private begin(
    kind: InputKind,
    startPointer: number | null,
    modeId: ModeId,
    challenge: Challenge | null = null,
    /** v1.2: a bonus map on today's Classic map (only while it is unlocked today). */
    bonus?: string,
  ): void {
    if (this.runner) return;
    this.huntDay = this.ctx.today();
    this.scene.stop('Title');
    this.scene.stop('Challenge');
    this.ctx.audio.unlock();
    this.inputKind = kind;
    const save = this.ctx.save.data;
    // Settings may have changed on the title (left-handed moves the gun).
    this.relayout();

    // Classic and Daily play the Skiet-Skuur loadout (if it is still equippable); the FTUE its
    // own gun; a challenge the gun it names.
    const loadout = this.ctx.content.weapons.weapons.find((w) => w.id === save.loadout.weapon);
    const plainMode = modeId === 'classic' || modeId === 'daily' ? modeId : null;
    const adminGun = plainMode === null ? undefined : this.ctx.weaponOverride;
    const weapon =
      adminGun ??
      (plainMode !== null &&
      loadout !== undefined &&
      loadout.id !== this.ctx.content.modes.modes[plainMode].weapon &&
      isWeaponEquippable(loadout, save, this.ctx.content)
        ? loadout.id
        : undefined);
    const bonusOpen =
      bonus !== undefined &&
      modeId === 'classic' &&
      challenge === null &&
      isUnlocked(save.bonusMaps, this.huntDay, this.ctx.biome.id, bonus);
    const extra = {
      ...(bonusOpen ? { bonus } : {}),
      ...(this.ctx.huntSeconds === undefined ? {} : { huntSeconds: this.ctx.huntSeconds }),
      ...(this.ctx.omen === undefined || modeId === 'ftue' ? {} : { omen: this.ctx.omen }),
    };
    // Classic, Daily and challenge hunts: seed and mode from the daily flow (M7).
    let plan =
      plainMode === null
        ? null
        : this.ctx.daily.plan(plainMode, challenge, weapon, extra, () => this.ctx.nextSeed());
    const biomeParam = this.ctx.classicBiome;
    if (
      plan?.mode.id === 'classic' &&
      plan.challenge === null &&
      biomeParam !== undefined &&
      this.ctx.playableBiomes.includes(biomeParam)
    )
      plan = { ...plan, mode: { ...plan.mode, biome: biomeParam } };
    // e2e/dev only (v1.2): ?layout=thu&bonus=verder plays Classic on that map.
    if (plan?.mode.id === 'classic' && plan.challenge === null) {
      const { classicLayout, classicBonus } = this.ctx;
      if (classicLayout === 'none') plan = { ...plan, mode: plainMap(plan.mode) };
      else if (classicLayout !== undefined)
        plan = { ...plan, mode: { ...plan.mode, layout: classicLayout } };
      if (classicBonus !== undefined && classicLayout !== 'none')
        plan = {
          ...plan,
          mode: { ...plan.mode, bonus: classicBonus },
          hudTag: tOr(`hud.tag_${bonusSlug(classicBonus)}`, classicBonus),
        };
    }
    this.plan = plan;
    this.modeId = plan?.mode.id ?? modeId;
    // A Season Run hunt comes from the run (seed, biome, weapon, charms, Boss Rule …).
    const runHunt = modeId === 'seasonHunt' ? this.ctx.run.setup(this.ctx.huntSeconds) : null;
    const baseMode: ModeConfig = runHunt?.mode ??
      plan?.mode ?? { id: modeId, ...(weapon === undefined ? {} : { weapon }), ...extra };
    // v1.3 (D-036): a rifle carries its sight — a challenge's, the admin page's, or the one
    // fitted in the Skiet-Skuur (recorded in the replay with the mode).
    const mode = this.withSight(baseMode);
    // The hunt's biome may not be the one behind the title (M8): swap the scenery first.
    const huntBiome =
      mode.biome ??
      (mode.id === 'seasonHunt' ? this.biome.id : this.ctx.content.modes.modes[mode.id].biome);
    // M9 lazy biomes: its art loads on first use; the hunt starts once it is in.
    if (this.ctx.playableBiomes.includes(huntBiome) && !this.ctx.biomeReady(huntBiome)) {
      this.waitForBiome(huntBiome, (ok) => {
        if (ok) this.begin(kind, startPointer, modeId, challenge, bonus);
        else this.scene.restart({} satisfies HuntData);
      });
      return;
    }
    this.useBiome(huntBiome, {
      ...(mode.layout === undefined ? {} : { layout: mode.layout }),
      ...(mode.bonus === undefined ? {} : { bonus: mode.bonus }),
    });
    if (!this.texturesDone) this.texturesDone = this.manifest.install(this.textures);
    this.manifest.prewarmBirds(this.textures);
    if (this.ctx.hook) {
      this.ctx.hook.boot['huntStart'] ??= performance.now();
      this.ctx.hook.missingTextures = this.manifest.missing(this.textures);
      this.ctx.hook.biome = this.biome.id;
      // v1.2: the map's weather (calm / omen) sits between the mode setting and its default.
      this.ctx.hook.omen = mapOmen(
        safeResolveMap(this.biome, mode.layout, mode.bonus).weather,
        mode.omen,
        mode.id === 'seasonHunt'
          ? mode.season?.kind === 'omen'
          : this.ctx.content.modes.modes[mode.id].omen,
      );
    }
    const aimAssist = save.settings.aimAssist;
    const seed = runHunt?.seed ?? plan?.seed ?? this.ctx.nextSeed();
    const sim = createSim({ seed, content: this.ctx.content, mode, inputKind: kind, aimAssist });
    this.recorder = createRecorder({
      seed,
      contentHash: this.ctx.contentHash,
      mode,
      inputKind: kind,
      aimAssist,
    });
    this.logger = createHuntLogger(
      (id) =>
        this.ctx.content.birds.creatures
          .find((c) => c.id === id)
          ?.behaviours.includes('perchHigh') === true,
    );
    if (plan !== null) {
      this.ctx.daily.start(plan);
      this.shareLog = createShareLogger(this.ctx.dailyMeta.grid);
    }
    this.ctx.admin?.played(seed, sim.snapshot().weapon.id);
    const durationTicks = sim.snapshot().durationTicks;
    this.ftue =
      modeId === 'ftue'
        ? new FtueDirector({
            inputKind: kind,
            durationTicks,
            secretHintAt: this.ctx.feel.ftue.secretHintAt,
            bannerTicks: msToTicks(this.ctx.feel.ftue.bannerMs),
            onStep: (step, tick) => {
              this.ftueStep(step, tick);
            },
          })
        : null;

    this.scene.launch('Hud');
    const hud = this.scene.get('Hud') as HudScene;
    const mapper = new InputMapper(
      this.game.canvas,
      this.ctx.feel,
      {
        designSize: () => designSize(),
        isOnBelt: (x, y) => hud.isOnBelt(x, y),
        isOnGadget: (x, y) => hud.isOnGadget(x, y),
        itemAt: (x, y) => hud.itemAt(x, y),
        holdToFire: () =>
          (this.runner?.state.weapon.holdToFire ?? false) || this.ctx.prefs.holdToFire,
        weaponHolds: () => this.runner?.state.weapon.holdToFire ?? false,
        // v1.3: a rifle in hand (its fitted sight's zoom) holds to zoom and releases to fire.
        sightZoom: () => {
          const w = this.runner?.state.weapon;
          if (w?.kind !== 'primary' || w.sight === null) return null;
          const s = this.ctx.content.weapons.sights.find((x) => x.id === w.sight);
          return s?.zoom[w.zoomStep] ?? s?.zoom[0] ?? null;
        },
        readyToFire: () => {
          const w = this.runner?.state.weapon;
          return (
            w !== undefined &&
            !w.reloading &&
            w.cooldownTicks === 0 &&
            (w.shells > 0 || w.magazine < 0)
          );
        },
        queue: (cmd) => this.runner?.queue(cmd),
        aim: (x, y, fromTap) => {
          this.weapon.aim(x, y, fromTap || this.inputKind === 'pointer');
        },
        crosshairOffsetPx: () => this.ctx.prefs.crosshairOffsetPx,
        fingerDown: (down) => {
          this.weapon.setFingerDown(down);
        },
        isOnUi: (x, y) => hud.isOnUi(x, y),
        pause: () => {
          this.openPause();
        },
        toggleDebug: () => {
          this.ctx.debug = !this.ctx.debug;
          this.debug.setVisible(this.ctx.debug);
        },
      },
      sim.snapshot().cameraX,
    );
    // A touch that started the hunt must not also fire when it lifts. A mouse fires on press, so
    // its start press is already used up (and ignoring the mouse id could swallow every later
    // click if that press were released outside the canvas).
    if (startPointer !== null && kind === 'touch') mapper.ignorePointer(startPointer);
    mapper.setEnabled(true);
    this.mapper = mapper;
    this.cleanups.push(() => {
      mapper.destroy();
    });

    this.runner = new HuntRunner(sim, {
      maxStepsPerFrame: this.ctx.feel.loop.maxStepsPerFrame,
      recorder: this.recorder,
      perTick: () => mapper.perTick(),
      ...(this.ctx.holdAtTick === undefined ? {} : { holdAtTick: this.ctx.holdAtTick }),
    });
    this.weapon.setTouchMode(kind === 'touch');
    hud.setInputKind(kind);
    hud.setSeason(runHunt === null ? null : { quota: runHunt.info.quota });
    // D-028 §3: Oupa barks in every hunt but his own lesson, and never in capture footage.
    hud.startBarks(modeId !== 'ftue' && this.ctx.capture === null);
    hud.setTag(plan?.hudTag ?? null);
    hud.setControls({
      pause: () => {
        this.openPause();
      },
      skip:
        modeId === 'ftue'
          ? () => {
              this.skipFtue();
            }
          : null,
    });
    this.ctx.platform.gameplayStart();
    this.ctx.ads.huntStarted();
    this.ctx.platform.analytics('hunt_start', {
      mode: this.modeId,
      biome: this.biome.id,
      weapon: weapon ?? sim.snapshot().weapon.id,
      inputKind: kind,
      aimAssist,
    });
    this.game.canvas.style.cursor = kind === 'pointer' ? 'none' : '';

    const hook = this.ctx.hook;
    if (hook) {
      hook.scene = 'hunt';
      hook.mode = this.modeId;
      hook.huntSeed = seed;
      hook.daily =
        plan?.daily == null
          ? null
          : {
              key: plan.daily.setup.key,
              number: plan.daily.setup.number,
              seed: plan.daily.setup.seed,
              official: plan.daily.official,
            };
      hook.challenge =
        challenge === null
          ? null
          : {
              seed: challenge.seed,
              mode: challenge.mode,
              score: challenge.score,
              contentChanged: hook.challenge?.contentChanged ?? false,
            };
      hook.hudTag = plan?.hudTag ?? null;
      hook.tally = null;
      hook.ftue.active = modeId === 'ftue';
      hook.inputKind = kind;
      hook.result = null;
      hook.replay = null;
      hook.over = false;
      hook.flockLog = [];
      hook.hunts++;
    }
  }

  override update(): void {
    if (this.viewsPending) return;
    // Real elapsed time, not Phaser's smoothed/capped delta: the hunt clock must follow the wall
    // clock (a 90 s hunt lasts 90 s). The runner's step cap still guards against huge gaps.
    const now = performance.now();
    const end = this.endAction;
    if (end !== null && now >= end.at) {
      this.endAction = null;
      end.run();
      return;
    }
    const delta = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;
    const runner = this.runner;
    const { width } = designSize();
    this.weapon.update(delta);
    if (runner === null) {
      // Between hunts (start card, title) nothing stays frozen or slowed from capture mode.
      if (this.anims.globalTimeScale !== 1) this.anims.globalTimeScale = 1;
      if (!this.texturesDone) {
        this.texturesDone = this.manifest.install(this.textures, () => true, BACKGROUND_DRAW_MS);
        if (this.texturesDone && this.ctx.hook)
          this.ctx.hook.boot['allTextures'] ??= performance.now();
      }
      // v1.3: texture memory on the title too (after a hunt), about twice a second.
      if (this.ctx.hook && this.game.loop.frame % 30 === 0) this.sampleTextures(this.ctx.hook);
      return;
    }
    const paused = this.ctx.paused();
    if (this.ctx.hook) this.ctx.hook.paused = paused;
    if (paused) return;

    const hook = this.ctx.hook;
    if (hook && !this.ending && hook.frameTimes.length < MAX_FRAME_SAMPLES)
      hook.frameTimes.push(delta);

    const simStart = hook ? performance.now() : 0;
    const { events, steps } = runner.advance(delta);
    if (hook && !this.ending && hook.simFrameMs.length < MAX_FRAME_SAMPLES) {
      // M9 perf: the sim's share of the frame and its ticks (catch-up ticks pile up when frames
      // are slow, as under software GL; perf.spec separates them from the render cost).
      hook.simFrameMs.push(performance.now() - simStart);
      hook.simFrameSteps.push(steps);
    }
    const state = runner.state;
    if (events.length > 0) this.handleEvents(events, width, state);
    this.applyCapture(runner, state.cameraX, delta);
    // e2e ?holdAt (visual baselines): once the sim holds, tweens and animations hold too, so a
    // delivered bird's clip or a fading pop is the same frame on every run.
    if (runner.held && this.tweens.timeScale !== 0) {
      this.tweens.timeScale = 0;
      this.anims.globalTimeScale = 0;
      // v1.0.1: the HUD's tweens too (Oupa's bubble holds where it is).
      this.scene.get('Hud').tweens.timeScale = 0;
    }
    // M10: the music follows the hunt's intensity (calm / build / stampede).
    this.ctx.audio.setIntensity(stemFor(runner.over ? null : state, this.ctx.feel.audio));
    this.rumble(state.stampedeActive && !runner.over, now, width);
    this.logger?.add(events);
    this.shareLog?.add(events);
    if (this.ftue) {
      this.ftue.update(events, state.tick, {
        shells: state.weapon.shells,
        reloading: state.weapon.reloading,
      });
    }

    const alpha = runner.alpha;
    const cam = interpolateCamera(runner.prev, state, alpha);
    // v1.3 (D-036): a raised rifle sight zooms the world around the aim point (zoomView.ts).
    const { height } = designSize();
    const zoom = zoomFor(interpolateAim(runner.prev, state, alpha), width, height);
    this.zoomView = zoom;
    this.parallax.setZoom(zoom.z, zoom.cx, zoom.cy);
    this.parallax.update(cam, width);
    this.screen.setPosition(width / 2 - zoom.cx * zoom.z, height / 2 - zoom.cy * zoom.z);
    this.screen.setScale(zoom.z);
    this.sight.setPicture(this.sightPicture(state.weapon.sight));
    this.sight.update(zoom, height);
    this.weapon.setScoped(zoom.raise);
    const drawBirds = interpolateBirds(runner.prev, state, alpha);
    this.birds.setViewZoom(zoom.z);
    this.birds.update(drawBirds, state.tick);
    this.world.update(state, width, designSize().height);
    this.weapon.spreadMul = spreadMulOf(state.powerups, this.ctx.content.powerups.powerups);
    this.weapon.setWeapon(state.weapon.id);
    this.weapon.setReloading(state.weapon.reloading);
    this.ctx.audio.setWeapon(state.weapon.id);
    if (this.ctx.hook) {
      const c = this.weapon.crosshair;
      this.ctx.hook.crosshair = {
        weapon: c.weaponId,
        extent: Math.round(crosshairExtent(c.prims)),
        visible: c.root.visible && c.root.alpha > 0,
        x: Math.round(c.root.x),
        y: Math.round(c.root.y),
      };
      // v1.3: the rifle zoom view (the reticle is where a release fires, on screen).
      const z = this.zoomView;
      this.ctx.hook.zoom = {
        z: Math.round(z.z * 1000) / 1000,
        raise: Math.round(z.raise * 1000) / 1000,
        reticleX: Math.round(z.reticleX * 10) / 10,
        reticleY: Math.round(z.reticleY * 10) / 10,
        sight: state.weapon.sight,
      };
    }
    const safe = this.ctx.safeArea();
    // Bottom-left, right of the gadget button (timer/Frenzy top-left, belt bottom-right).
    this.debug.update(
      state,
      drawBirds,
      this.inputKind,
      safe.left + 40 + this.ctx.feel.hud.gadgetPx + this.ctx.feel.hud.marginPx,
      designSize().height - safe.bottom - 90,
    );
    const hud = this.scene.get('Hud') as HudScene;
    if (hud.sys.isActive()) {
      hud.render(state, events);
      if (this.ftue) hud.setFtuePrompt(this.ftuePrompt(), this.ftueHand(state));
    }

    if (hook) {
      hook.tick = state.tick;
      const fxPops = this.fx.popStats();
      const hudPops = hud.popStats();
      hook.pops = {
        shown: fxPops.shown + hudPops.shown,
        created: fxPops.created + hudPops.created,
      };
      hook.ticksLeft = state.ticksLeft;
      hook.score = state.score;
      hook.shells = state.weapon.shells;
      // D-029: GPU texture memory (RGBA bytes of every texture source), sampled twice a second.
      if (state.tick % 30 === 0) this.sampleTextures(hook);
      hook.magazine = state.weapon.magazine;
      hook.reloading = state.weapon.reloading;
      hook.stones = state.projectiles.length;
      hook.glare = state.glare?.side ?? null;
      hook.rain = state.rain;
      hook.lightning = state.lightning;
      hook.cameraX = state.cameraX;
      hook.birds = state.birds.length;
      hook.gadgetCharges = state.gadget?.charges ?? 0;
      hook.flocks = state.flocks.map((f) => `${f.id}:${f.state}`);
      const ver = this.ctx.content.scoring.planes.ver;
      const tarentaal = this.ctx.content.birds.creatures.find((c) => c.id === 'tarentaal');
      const body = tarentaal !== undefined && 'hitbox' in tarentaal ? tarentaal.hitbox.body : null;
      hook.verBirds = state.birds
        .filter((b) => b.plane === 'ver' && b.hittable)
        .map((b) => ({
          id: b.id,
          x:
            width / 2 +
            planeToDx(
              state.cameraX,
              ver.scrollFactor,
              b.x + (body?.ox ?? 0) * ver.scale * b.facing,
            ),
          y: b.y + (body?.oy ?? 0) * ver.scale,
        }));
      hook.flockSpots = state.flocks.map((f) => {
        const members = state.birds.filter((b) => b.flockId === f.id);
        const n = Math.max(1, members.length);
        const x = members.reduce((t, b) => t + this.parallax.screenX(b.plane, b.x), 0) / n;
        const y = members.reduce((t, b) => t + b.y, 0) / n;
        return { id: f.id, state: f.state, alive: f.alive, x, y, plane: f.plane };
      });
      hook.secretSpots = state.secrets.flatMap((sec) => {
        const layer = this.parallax.layer(sec.layerId);
        if (layer === undefined) return [];
        return sec.parts
          .filter((p) => !p.hit)
          .map((p) => ({
            propId: sec.propId,
            partId: p.id,
            x: layer.root.x + p.x,
            y: p.y,
            ready: sec.ready,
          }));
      });
      hook.crateSpots = state.crates.map((c) => ({
        id: c.id,
        x: this.parallax.screenX(c.plane, c.x),
        y: c.y,
      }));
      hook.specialBirds = state.birds
        .filter((b) => b.motion === 'perch' || b.motion === 'boss' || b.motion === 'hop')
        .map((b) => ({
          id: b.id,
          creature: b.creature,
          phase: b.phase,
          x: this.parallax.screenX(b.plane, b.x),
          y: b.y,
        }));
      hook.weapon = state.weapon.id;
      hook.powerups = state.powerups.map((p) => p.id);
      hook.wind = state.wind;
      hook.durationTicks = state.durationTicks;
    }

    if (runner.over && !this.ending) this.finish();
  }

  /** e2e only (D-028 §4): `n` score pops over a bird in view, BitmapText or canvas Text. */
  benchPops(n: number, mode: 'bitmap' | 'text'): number | null {
    const state = this.runner?.state;
    if (state === undefined) return null;
    const { width } = designSize();
    const bird =
      state.birds.find((b) => {
        const x = this.parallax.screenX(b.plane, b.x);
        return x > 0 && x < width;
      }) ?? state.birds[0];
    if (bird === undefined) return null;
    return this.fx.benchPops(n, mode, { plane: bird.plane, x: bird.x, y: bird.y });
  }

  private handleEvents(events: readonly SimEvent[], width: number, state: SimState): void {
    // FX first: penalty pops look up where the bird was last drawn, before it is removed.
    this.fx.handle(events, width, state);
    this.birds.handle(events);
    const half = width / 2;
    this.ctx.audio.handle(events, (e) => {
      if (e.type === 'shotFired') return e.dx / half;
      if (e.type === 'targetBagged' || e.type === 'flockStateChanged' || e.type === 'flockWiped')
        return (this.parallax.screenX(e.plane, e.x) - half) / half;
      return 0;
    });
    let bagged = false;
    for (const e of events) {
      if (e.type === 'shotFired') {
        this.weapon.setWeapon(e.weapon);
        this.weapon.fired();
        const def = this.ctx.content.weapons.weapons.find((x) => x.id === e.weapon);
        if (def?.kind === 'crate' && def.smokeMs !== undefined && def.smokeMs > 0)
          this.weapon.smoke(def.smokeMs, this.ctx.feel.juice.smokeScale);
        if (this.shakeAllowed()) {
          const w: Weapon | undefined = this.ctx.content.weapons.weapons.find(
            (x) => x.id === e.weapon,
          );
          const px = (w?.shake.px ?? 0) * this.ctx.feel.juice.shakeScale;
          if (w && px > 0) this.cameras.main.shake(w.shake.ms, px / width);
        }
        const hook = this.ctx.hook;
        if (hook) {
          hook.shots++;
          hook.firstShotAtMs ??= performance.now();
        }
      } else if (e.type === 'weaponChanged') {
        this.mapper?.cancelHold();
      } else if (e.type === 'targetBagged') {
        bagged = true;
      } else if (e.type === 'bonusAwarded' && e.bonus === 'twoFlies') {
        this.runner?.hitStop(this.ctx.feel.juice.hitStopTwoFliesMs);
      } else if (e.type === 'flockWiped') {
        // GDD §6.4: slow-mo 0.3× for 0.4 s (scoring.json, so the rule and its feel stay together).
        const { scale, ms } = this.ctx.content.scoring.wholeFlock.slowMo;
        this.runner?.slowMo(scale, ms);
      } else if (e.type === 'gadgetUsed' && this.ctx.hook) {
        this.ctx.hook.gadgetUses++;
      } else if (e.type === 'flockStateChanged' && this.ctx.hook) {
        const log = this.ctx.hook.flockLog;
        if (log.length < 500) log.push(`${e.flockId}:${e.from}>${e.to}:${e.cause}`);
      }
    }
    if (bagged) this.runner?.hitStop(this.ctx.feel.juice.hitStopMs);
  }

  /**
   * Runs `fn` after `ms` of real time. Phaser's scene clock follows the smoothed, capped frame
   * delta, so at a few frames a second (software GL in CI) a 900 ms delayedCall took ~15 s;
   * like the hunt clock (D-019), this one follows performance.now() (D-025).
   */
  private afterRealMs(ms: number, fn: () => void): void {
    this.endAction = { at: performance.now() + ms, run: fn };
  }

  private finish(): void {
    const runner = this.runner;
    if (runner === null) return;
    this.ending = true;
    this.mapper?.setEnabled(false);
    this.game.canvas.style.cursor = '';
    this.weapon.hideReticle();
    const result = this.recordResult();
    const ftue = this.ftue !== null;
    if (this.ftue) {
      this.ftue.complete(result.ticks);
      this.markFtueDone(false);
    }
    const plan = this.plan;
    // The bonus-map unlock first: a Notaboek challenge counts it (v1.3: Nog Verder → the .22).
    const bonus = this.recordBonus(result);
    const verder = bonus.line;
    const outcome = this.recordProgress(
      result,
      plan === null || this.ctx.daily.ranked(plan),
      bonus.unlocked,
    );
    const finished =
      plan === null ? null : this.ctx.daily.finish(plan, result, this.shareLog?.grid() ?? '');
    const extras =
      finished === null || verder === null
        ? finished
        : { ...finished, news: [verder, ...finished.news] };
    if (this.modeId === 'seasonHunt') {
      this.ctx.run.afterHunt(result);
      this.afterRealMs(END_DELAY_MS, () => {
        this.scene.stop('Hud');
        this.launchRun('tally');
      });
      return;
    }
    this.afterRealMs(END_DELAY_MS, () => {
      this.scene.stop('Hud');
      const data: TallyData = {
        result,
        outcome,
        ftue,
        extras,
        share: (x) => this.ctx.daily.share(x),
        again: (pointerType) => {
          this.afterBreak(() => {
            this.scene.stop('Tally');
            // After the FTUE, [Again] is a real Classic hunt (GDD §16 step 7). After a Daily it
            // is practice on the same hunt; after a challenge, the same challenge again.
            const challengeAgain = plan?.challenge ?? null;
            const bonusAgain = plan?.mode.bonus;
            this.scene.restart({
              autoStart: inputKindOf(pointerType),
              mode: this.modeId === 'daily' ? 'daily' : 'classic',
              ...(challengeAgain === null ? {} : { challenge: challengeAgain }),
              ...(bonusAgain === undefined ? {} : { bonus: bonusAgain }),
            } satisfies HuntData);
          });
        },
        menu: () => {
          this.scene.stop('Tally');
          this.scene.restart({} satisfies HuntData);
        },
        seasonRun: () => {
          this.openRun();
        },
        ...(this.ctx.admin === null
          ? {}
          : {
              admin: () => {
                this.ctx.admin?.back();
              },
            }),
      };
      this.scene.launch('Tally', data);
    });
  }

  /**
   * v1.2 (D-033): a Classic or Daily hunt → bonus maps (today's Verder unlock, Verder's best).
   * Returns the tally line it earned, or null. Capture mode and `?e2e` on a public build are
   * unranked and unlock nothing.
   */
  private recordBonus(result: HuntResult): { line: string | null; unlocked: string | null } {
    if (this.ctx.daily.unranked) return { line: null, unlocked: null };
    let line: string | null = null;
    let unlocked: string | null = null;
    this.ctx.save.update((d) => {
      const r = applyBonusResult(
        d.bonusMaps,
        result,
        this.huntDay,
        this.ctx.today(),
        this.ctx.content,
        this.ctx.biome.id,
      );
      unlocked = r.unlocked;
      if (r.unlocked !== null)
        line = tOr(`tally.${bonusSlug(r.unlocked)}_unlocked`, t('tally.verder_unlocked'));
      else if (r.newBest !== null && result.bonus !== null)
        line = fill(t('title.verder_best'), { score: formatScore(result.score) });
      if (this.ctx.hook) this.ctx.hook.verderUnlocked = r.unlocked;
      return { ...d, bonusMaps: r.save };
    });
    return { line, unlocked };
  }

  /** Hunt log → save (stats, Bird Book, bests, rank, Notaboek) and hunt_end analytics. */
  private recordProgress(
    result: HuntResult,
    ranked: boolean,
    bonusUnlocked: string | null,
  ): HuntOutcome | null {
    const logger = this.logger;
    this.ctx.platform.gameplayStop();
    this.ctx.platform.analytics('hunt_end', {
      mode: result.mode,
      biome: result.biome,
      score: result.score,
      accuracy: result.accuracy,
      wingShotPct: result.bagged > 0 ? result.wingShots / result.bagged : 0,
      flocksWiped: result.wholeFlocks,
      secrets: result.secrets,
      penalties: result.penalties,
      durationMs: Math.round((result.ticks * 1000) / 60),
    });
    if (logger === null) return null;
    let outcome: HuntOutcome | null = null;
    this.ctx.save.update((d) => {
      outcome = applyHunt(
        d,
        logger.finish(result, bonusUnlocked),
        this.ctx.content,
        this.ctx.notaboek,
        ranked,
      );
      return outcome.save;
    });
    return outcome;
  }

  // --- pause, FTUE ------------------------------------------------------------------------------

  private openPause(): void {
    if (this.runner === null || this.ending || this.pausedByMenu) return;
    this.pausedByMenu = true;
    this.ctx.menuPaused = true;
    this.mapper?.setEnabled(false);
    this.ctx.audio.setMuted('pause', true);
    this.ctx.platform.gameplayStop();
    this.game.canvas.style.cursor = '';
    const season = this.runner.state.season;
    const data: PauseData = {
      ...(season === null || season.charms.length < 2
        ? {}
        : {
            charms: {
              ids: season.charms,
              reorder: (order: readonly number[], ids: readonly string[]) => {
                this.runner?.queue({ t: 'charmOrder', order: [...order] });
                this.ctx.run.keepOrder(ids);
              },
            },
          }),
      resume: () => {
        this.closePause();
      },
      quit: () => {
        this.closePause(false);
        if (this.ftue) this.skipFtue();
        else this.quitToTitle();
      },
    };
    this.scene.launch('Pause', data);
    this.scene.bringToTop('Pause');
    if (this.ctx.hook) this.ctx.hook.paused = true;
  }

  /** `resume` false: Quit (the hunt ends, so gameplay doesn't restart for the portal). */
  private closePause(resume = true): void {
    if (!this.pausedByMenu) return;
    this.scene.stop('Pause');
    this.pausedByMenu = false;
    this.ctx.menuPaused = false;
    this.ctx.audio.setMuted('pause', false);
    // Settings may have changed in the pause menu (left-handed, quality, shake).
    this.relayout();
    (this.scene.get('Hud') as HudScene).relayoutNow();
    if (!this.ending && resume) {
      this.ctx.platform.gameplayStart();
      this.mapper?.setEnabled(true);
      this.game.canvas.style.cursor = this.inputKind === 'pointer' ? 'none' : '';
    }
    // Don't count the time spent in the menu as a frame gap.
    this.lastFrameAt = null;
  }

  private quitToTitle(): void {
    this.ctx.platform.gameplayStop();
    this.scene.stop('Hud');
    this.scene.restart({} satisfies HuntData);
  }

  /** Skip (HUD button or Quit in the pause menu): the FTUE counts as seen. */
  private skipFtue(): void {
    if (this.ftue === null || this.ending) return;
    this.ftue.skip(this.runner?.state.tick ?? 0);
    this.markFtueDone(true);
    this.quitToTitle();
  }

  private markFtueDone(skipped: boolean): void {
    this.ctx.save.update((d) =>
      d.ftue.done
        ? d
        : { ...d, ftue: { done: true, skipped, step: skipped ? 'skip' : 'complete' } },
    );
  }

  private ftueStep(step: FtueStep, tick: number): void {
    this.ctx.platform.analytics('ftue_step', { step, tick, inputKind: this.inputKind });
    if (step !== 'complete' && step !== 'skip') {
      this.ctx.save.update((d) => (d.ftue.done ? d : { ...d, ftue: { ...d.ftue, step } }));
    }
    this.ctx.hook?.ftue.steps.push(step);
  }

  /** The FTUE line with its numbers filled in from content (run and flight multipliers). */
  private ftuePrompt(): { key: string; text: string } | null {
    const p = this.ftue?.prompt;
    if (p === undefined || p === null) return null;
    const add = this.ctx.content.scoring.behaviourAdd;
    return {
      key: p.key,
      text: fill(t(p.key), { n: p.key === 'ftue.run' ? add.run : 1 + add.flying }),
    };
  }

  /** Where the FTUE hand points: the foraging flock nearest the screen centre, or the belt. */
  private ftueHand(state: SimState): { x: number; y: number } | 'belt' | null {
    const hand = this.ftue?.prompt?.hand ?? null;
    if (hand !== 'flock') return hand;
    const { width } = designSize();
    let best: { x: number; y: number } | null = null;
    for (const f of state.flocks) {
      const members = state.birds.filter((b) => b.flockId === f.id);
      if (members.length === 0) continue;
      const x =
        members.reduce((sum, b) => sum + this.parallax.screenX(b.plane, b.x), 0) / members.length;
      const y = members.reduce((sum, b) => sum + b.y, 0) / members.length;
      if (x < 0 || x > width) continue;
      if (best === null || Math.abs(x - width / 2) < Math.abs(best.x - width / 2)) best = { x, y };
    }
    return best;
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
    this.world.clear();
    this.game.canvas.style.cursor = '';
  }
}

/** resolveMap, or the plain biome for ids this biome lacks (a bad dev ?layout=). */
function safeResolveMap(biome: Biome, layout?: string, bonus?: string): ResolvedMap {
  try {
    return resolveMap(biome, layout, bonus);
  } catch {
    return resolveMap(biome, undefined, undefined);
  }
}

/** e2e/dev only (?layout=none): the mode without a map (the plain biome). */
function plainMap(mode: ModeConfig): ModeConfig {
  return {
    id: mode.id,
    ...(mode.biome === undefined ? {} : { biome: mode.biome }),
    ...(mode.weapon === undefined ? {} : { weapon: mode.weapon }),
    ...(mode.huntSeconds === undefined ? {} : { huntSeconds: mode.huntSeconds }),
    ...(mode.omen === undefined ? {} : { omen: mode.omen }),
  };
}
