// The hunt (Classic and the FTUE "Oupa se Les"). Shows the panorama behind the title; START
// unlocks audio, fixes the hunt's inputKind (touch → aim assist, at the Settings level) and starts
// the sim. Each frame: advance the fixed-step runner, route the frame's events to FX / audio /
// HUD / the hunt log (meta) / the FTUE director, then draw the interpolated snapshot. The scene
// never writes into the sim: input reaches it only as Commands. Esc, P, the HUD pause button or
// a hidden tab open the pause menu; the hunt clock holds while it is open.
import { inputSightZoom, redDotIds, redDotUp } from '../view/redDot';
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import type { Feesdag } from '../../content/schemas';
import { feesdagById } from '../../meta/feesdae';
import type { SpecialDayView } from '../feesdae/FeesdagView';
import type { Biome, Weapon } from '../../content/schemas';
import { DebugOverlay } from '../../debug/DebugOverlay';
import { artSummary } from '../assets/artSummary';
import { fill, t, tOr } from '../../i18n/i18n';
import { drawButton, Menu, textStyle } from '../ui/menu';
import { texturesInUse } from '../assets/textureUse';
import { hdTextureCount } from '../assets/AssetManifest';
import { megabytes } from '../assets/graphicsChoice';
import { sampleBounds, type BoundsSource } from './boundsSample';
import { captureHintAlpha, type CaptureState } from '../capture';
import { showDontShootBadge } from '../prefs';
import { TierFilters } from '../quality/TierFilters';
import type { Challenge } from '../../meta/challenge';
import { createHuntLogger, type HuntLogger } from '../../meta/huntLog';
import { createShareLogger, type ShareLogger } from '../../meta/share';
import { applyHunt, huntSight, isWeaponEquippable, type HuntOutcome } from '../../meta/progress';
import { msToTicks, TICKS_PER_SECOND } from '../../sim/clock';
import type { SimEvent } from '../../sim/events';
import { createRecorder, encodeInputLogText, type InputRecorder } from '../../sim/replay/inputLog';
import { createSim } from '../../sim/Sim';
import type { HuntResult, InputKind, ModeConfig, ModeId, PlaneId, SimState } from '../../sim/types';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from '../../sim/world';
import {
  neededBeforeStart,
  neededLateMissing,
  TEX,
  type AssetManifest,
  type LateNeed,
} from '../assets/AssetManifest';
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
import { crosshairExtent, reloadBoostsOf, spreadMulOf } from '../ui/gunLook';
import { WorldView } from '../view/WorldView';
import { MeerkatView } from '../view/MeerkatView';
import { CanView } from '../view/cans/CanView';
import type { MakalaniView } from '../view/palms/MakalaniView';
import type { TreeLifeView } from '../view/tree/TreeLifeView';
import type { NamibLifeView } from '../view/namib/NamibLifeView';
import type { TellView } from '../view/tell/TellView';
import type { BaboonView } from '../view/baboon/BaboonView';
import type { HarvestView } from '../view/harvest/HarvestView';
import type { HarvestTally } from './TallyScene';
import { playPotjieSound } from '../view/potjieSounds';
import { playMeerkatSound } from '../audio/meerkatSounds';
import { largestTextures, textureBytes } from '../assets/textureBytes';
import { mapLights, mapOmen, resolveMap, type ResolvedMap } from '../../sim/maps';
import { layoutForDay } from '../../meta/maps';
import { applyBonusResult, bonusKeys, bonusOpenFor, bonusSlug } from '../../meta/bonusMaps';
import { formatScore } from '../ui/format';
import type { HudScene } from './HudScene';
import { nameSceneWhenHudReady } from './hudReadyScene';
import type { PauseData } from './PauseScene';
import { viewFor, type RunData, type RunView } from './RunScene';
import type { TallyData } from './TallyScene';
import type { TitleData } from './TitleScene';
import type { ChallengeData } from './ChallengeScene';
import type { AdminData } from './AdminScene';
import type { RangeHost, RangeSession } from '../range/RangeSession';
import { freshLoadShown } from '../../platform/freshLoad';
import type { FruitView } from '../view/fruit/FruitView';
import { loadSimSystems, simSystemsReady } from '../simSystems';
import { needsLazySystems } from '../../sim/lazySystems';
import type { PelletStop } from '../view/fruit/fruitHits';
import { BABOON_SHEET } from '../view/baboon/baboonKeys';

export interface HuntData {
  /** Skip the title (the [Again] button) with this input kind. */
  readonly autoStart?: InputKind;
  /** Mode for autoStart (default classic). */
  readonly mode?: ModeId;
  /** M7: play this challenge (link card's [Accept], or [Again] after one). */
  readonly challenge?: Challenge;
  /** v1.2: a bonus map on today's Classic map ([Again] after Verder, while it is unlocked). */
  readonly bonus?: string;
  /** v1.3x (D-037): run this Skietbaan session (admin page only). */
  readonly range?: RangeSession;
  /** v1.3x: open the Skietbaan's setup page instead of the title (back from a range). */
  readonly rangeMenu?: true;
}

/** v1.2 (D-033) the map on screen; v1.3x: `ver` keeps the Ver plane open (the Skietbaan). */
interface MapChoice {
  readonly layout?: string;
  readonly bonus?: string;
  readonly ver?: boolean;
  /** D-048: a special day's look on the map (its light and decorations). */
  readonly feesdag?: string;
}

/** D-048: the special days' view module (a lazy chunk), once it has loaded. */
let feesdaeModule: typeof import('../feesdae/FeesdagView') | null = null;
/** D-048: each special's delivered sheet, once it has arrived (absent = the stand-in draws). */
const feesdaeSheets = new Map<string, HTMLImageElement>();
/** D-064: specials whose sheet a hunt has waited for once (a failed load isn't waited on again). */
const feesdaeSheetTried = new Set<string>();
/** D-064: the specials whose hunt waits (bounded) for their own listed sheet before it starts. */
const WAIT_FOR_SHEET: readonly string[] = ['christmas'];

/** D-064: the Christmas view's e2e hook (its tinsel). */
interface KersfeesHook {
  tinsel(): { prop: string | null; garlands: number; baubles: number; found: number | null };
}

const END_DELAY_MS = 900;
/** Time per frame spent drawing deferred textures behind the start card. */
const BACKGROUND_DRAW_MS = 8;
const MAX_FRAME_SAMPLES = 20_000;

export class HuntScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private parallax!: ParallaxView;
  /**
   * D-053: this run's ParallaxView once built, else null (the test hook's create-time texture
   * sample runs before the views exist; `parallax` may still hold the last run's destroyed one).
   */
  private boundsSource: BoundsSource | null = null;
  private birds!: BirdView;
  private fx!: Fx;
  private weapon!: WeaponView;
  private world!: WorldView;
  /** v1.7 (D-044): the desert maps' meerkat colonies. */
  private meerkats!: MeerkatView;
  /** v1.8 (D-050): the day's fence and tin cans. */
  private cans!: CanView;
  /** 1.9.3 (D-056): the far fence's cans (the Karoo's mid fence line) and the makalani palms. */
  private farCans!: CanView;
  /** Lazy (its own chunk: only maps with palms need it); null until it is in. */
  private makalani: MakalaniView | null = null;
  private makalaniGen = 0;
  private makalaniLoading = false;
  /** v1.7c (D-047): fruit that swing and drop when shot (lazy chunk; null until it is in). */
  private fruit: FruitView | null = null;
  private fruitGen = 0;
  /** 1.9.4 (D-057): the trees' residents (lazy chunk; null until it is in, or no baobab). */
  private treeLife: TreeLifeView | null = null;
  /** v1.7d (D-059): the Namibië veld life (its own lazy chunk). */
  private namibLife: NamibLifeView | null = null;
  private namibLifeGen = 0;
  private treeLifeGen = 0;
  /** v1.7e (D-061): the secrets' tell animals (lazy chunk; null until it is in, or none). */
  private tells: TellView | null = null;
  private tellsGen = 0;
  /** v1.8b (D-062): the baboon troops and raiders (lazy chunk; null until it is in, or none). */
  private baboons: BaboonView | null = null;
  private baboonsGen = 0;
  /** v1.8c (D-063): the Harvest's view (its lazy chunk), on the Harvest's map only. */
  private harvest: HarvestView | null = null;
  private harvestGen = 0;
  /** Family nests by prop id (layer, x on it): the weavers' scolding is panned from here. */
  private weaverNests = new Map<string, { layer: string; x: number }>();
  /** Nest shots before the tree-life chunk was in (its burst plays them once it is). */
  private lifeHeld: SimEvent[] = [];
  private lightIds: readonly string[] = [];
  private huntSeed = 0;
  /** Scroll factor of each prop of the map on screen (where a pellet stopped, for the fruit). */
  private propFactor = new Map<string, number>();
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
  /** v1.4 (#56): e2e only (__TM_TOOLS__.scopeCull): the zoomed view's culling, on by default. */
  static cullZoomed = true;
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
  /** v1.6 (D-042): the late art came in after the views were built (waitForLate): rebuild them. */
  private viewsStale = false;
  private tierFilters: TierFilters | null = null;
  /** M9: create() is waiting for a biome's art; there are no views to update yet. */
  private viewsPending = false;
  /** A commercial break before the next hunt is in flight (afterBreak is single-flight). */
  private breakPending = false;
  private modeId: ModeId = 'classic';
  /** v1.3x (D-037): the Skietbaan session this scene runs, or null (every hunt). */
  private range: RangeSession | null = null;
  /** M7: Classic/Daily/challenge setup (null for the FTUE and Season Run hunts). */
  private plan: HuntPlan | null = null;
  private shareLog: ShareLogger | null = null;
  /** v1.7b (D-046): power-ups and crate guns picked up this hunt (the tally lists them). */
  private usedPowerups: string[] = [];
  /** The pause between the hunt's end and the tally, on the wall clock (see afterRealMs). */
  private endAction: { readonly at: number; readonly run: () => void } | null = null;
  /** The biome on screen and its manifest (the home biome until a hunt in another starts). */
  private biome!: Biome;
  private manifest!: AssetManifest;
  /** v1.2 (D-033): the map on screen — weekday layout and bonus map (undefined = plain biome). */
  private map: MapChoice = {};
  /** D-048: the special day this hunt plays (null on an ordinary hunt) and its look. */
  private special: Feesdag | null = null;
  private spookView: SpecialDayView | null = null;
  /** v1.2: UTC day the hunt started (its layout is that day's; Verder unlocks for that day). */
  private huntDay = 0;
  /** Real time of the next Stampede rumble shake. */
  private nextRumbleAt = 0;

  constructor(ctx: GameContext) {
    super({ key: 'Hunt' });
    this.ctx = ctx;
  }

  create(data: HuntData): void {
    // v1.8b (D-062): the lazy sim systems' chunk, in the background from the title on.
    void loadSimSystems();
    this.boundsSource = null;
    // M9 lazy biomes: an auto-started hunt in a biome whose art isn't loaded yet waits for it.
    const wanted = this.initialBiome(data);
    // D-053: with HD chosen, the area's HD pack loads behind the same veil before its hunt.
    this.viewsPending = !this.ctx.biomeReady(wanted.id) || !this.ctx.graphics.ready(wanted.id);
    if (this.viewsPending) {
      this.waitForBiome(wanted.id, (ok) => {
        this.scene.restart(ok ? data : ({} satisfies HuntData));
      });
      return;
    }
    this.runner = null;
    this.range = data.range ?? null;
    this.captureHint = null;
    this.endAction = null;
    this.tierFilters = null;
    this.mapper = null;
    this.ending = false;
    this.logger = null;
    this.ftue = null;
    this.plan = null;
    this.shareLog = null;
    this.usedPowerups = [];
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
    this.releaseGuns(data);
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

    if (data.range !== undefined) this.begin(data.range.inputKind, null, 'range');
    else if (data.autoStart !== undefined)
      this.begin(data.autoStart, null, data.mode ?? 'classic', data.challenge ?? null, data.bonus);
    else if (data.rangeMenu === true) this.openSkietbaan();
    else this.showTitle();
    if (this.ctx.hook) {
      this.ctx.hook.ready = true;
      this.ctx.hook.boot['ready'] ??= performance.now();
    }
  }

  /** The biome an auto-started hunt will play (the home biome for the title). */
  private initialBiome(data: HuntData): Biome {
    const c = this.ctx;
    let id: string | undefined = data.range?.mode.biome;
    if (data.range === undefined && data.autoStart !== undefined) {
      if (data.challenge !== undefined) id = data.challenge.biome;
      else if (data.mode === 'seasonHunt')
        id = c.run.current === null ? undefined : c.run.info().biome;
      else if (data.mode === 'daily') id = c.daily.todaySetup().biome;
      else if (data.mode === 'ftue') id = c.content.modes.modes.ftue.biome;
      // v1.8c (D-063): [Again] after the Harvest builds its field straight away.
      else if (data.mode === 'harvest') id = c.content.modes.modes.harvest.biome;
      else id = c.classicBiome ?? c.classicArea();
    }
    const b = id === undefined ? undefined : c.content.biomes.find((x) => x.id === id);
    return b !== undefined && c.playableBiomes.includes(b.id) ? b : c.biome;
  }

  /** v1.2: the map an auto-started hunt will play (the title shows today's Classic layout). */
  private initialMap(data: HuntData): MapChoice {
    const c = this.ctx;
    const range = data.range?.mode;
    if (range !== undefined)
      return range.layout === undefined ? { ver: true } : { layout: range.layout, ver: true };
    if (data.autoStart !== undefined) {
      if (data.challenge !== undefined) {
        const l = data.challenge.l;
        const b = data.challenge.b;
        return l === undefined ? {} : b === undefined ? { layout: l } : { layout: l, bonus: b };
      }
      if (data.mode === 'seasonHunt' || data.mode === 'ftue' || data.mode === 'harvest') return {};
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
    this.viewsStale = false;
    // D-053: the views are about to be made: every manifest takes the chosen art (HD in, or
    // Standard back), and swapped-out textures nothing draws any more are freed.
    this.ctx.graphics.sync(this.textures, () => texturesInUse(this.game), this.anims);
    this.manifest.install(this.textures, () => false);
    const { width } = designSize();
    fitCamera(this.cameras.main);
    // An id this biome lacks (a bad ?layout=) draws the plain biome rather than failing.
    const map = safeResolveMap(this.biome, this.map.layout, this.map.bonus, this.map.ver);
    const mapBiome = map.biome;
    this.parallax = new ParallaxView(this, mapBiome, this.manifest, this.ctx.prefs.mergeLayers, {
      idle: this.ctx.feel.fauna.idle,
      ticksPerSecond: TICKS_PER_SECOND,
      before: this.ctx.faunaBefore,
      debug: this.ctx.faunaDebug,
      still: this.ctx.faunaStill,
    });
    this.parallax.measureFill = this.ctx.hook !== null;
    this.boundsSource = this.parallax;
    // D-048: a special day plays the day's map under its own light (Halloween: dusk).
    const special =
      this.map.feesdag === undefined
        ? null
        : feesdagById(this.ctx.content.feesdae, this.map.feesdag);
    const lightIds = special === null ? mapLights(map) : [special.light];
    this.lightIds = lightIds;
    const lights = lightIds.flatMap((id) => {
      const light = this.ctx.feel.lights[id];
      return light === undefined ? [] : [light];
    });
    this.parallax.applyLight(lights);
    if (this.ctx.hook)
      this.ctx.hook.map = {
        layout: map.layout?.id ?? null,
        bonus: map.bonus?.id ?? null,
        lights: lightIds,
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
      {
        near: this.ctx.content.scoring.planes.near.scale,
        mid: this.ctx.content.scoring.planes.mid.scale,
        far: this.ctx.content.scoring.planes.far.scale,
      },
    );
    // v1.7b (D-046): the pickup card says what a crate held; capture footage has no HUD.
    this.fx.itemLabels = this.ctx.capture !== null;
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
    this.world.reducedMotion = this.ctx.reducedMotion;
    const planes = this.ctx.content.scoring.planes;
    this.spookView?.clear();
    this.spookView = null;
    const look = special?.id === 'halloween' ? this.ctx.feel.feesdae.looks.halloween : undefined;
    this.world.heat = 0;
    const planeScales = {
      near: planes.near.scale,
      mid: planes.mid.scale,
      far: planes.far.scale,
      ver: planes.ver.scale,
    };
    if (special?.id === 'christmas' && feesdaeModule !== null) {
      // D-064: Christmas in the sun (presents, tinsel, Santa hats, the heat shimmer).
      const world = this.world;
      this.spookView = new feesdaeModule.KersfeesSceneView({
        scene: this,
        parallax: this.parallax,
        look: this.ctx.feel.feesdae.looks.christmas,
        planeScale: planeScales,
        mapBiome,
        decorations: special.decorations,
        sheet: feesdaeSheets.get(special.id) ?? null,
        reduceFlashes: this.ctx.prefs.reduceFlashes,
        setHeat: (h) => {
          world.heat = h;
        },
        hooks: this.ctx.hook !== null,
      });
      this.birds.hats = this.spookView.hats;
    } else if (special !== null && look !== undefined && feesdaeModule !== null) {
      const textures = this.textures;
      const manifest = this.manifest;
      this.spookView = new feesdaeModule.FeesdagSceneView(
        this,
        this.parallax,
        look,
        {
          near: planes.near.scale,
          mid: planes.mid.scale,
          far: planes.far.scale,
          ver: planes.ver.scale,
        },
        mapBiome,
        (asset) => {
          if (!textures.exists(asset)) return null;
          const src = textures.get(asset).getSourceImage();
          const o = manifest.origin(asset);
          return {
            w: src.width,
            h: src.height,
            ox: o.x * src.width,
            oy: o.y * src.height,
            scale: manifest.displayScale(asset),
          };
        },
        special.decorations,
        this.screenFixed,
        feesdaeSheets.get(special.id) ?? null,
      );
      this.birds.hats = this.spookView.hats;
    } else this.birds.hats = null;
    this.meerkats = new MeerkatView(
      this,
      this.manifest,
      this.parallax,
      this.ctx.content.birds.meerkats,
      {
        near: planes.near.scale,
        mid: planes.mid.scale,
        far: planes.far.scale,
        ver: planes.ver.scale,
      },
    );
    this.cans = new CanView(
      this,
      this.manifest,
      this.parallax,
      this.ctx.feel.cans,
      {
        near: planes.near.scale,
        mid: planes.mid.scale,
        far: planes.far.scale,
        ver: planes.ver.scale,
      },
      {
        near: planes.near.lineWeightPx,
        mid: planes.mid.lineWeightPx,
        far: planes.far.lineWeightPx,
        ver: planes.ver.lineWeightPx,
      },
    );
    const scales = {
      near: planes.near.scale,
      mid: planes.mid.scale,
      far: planes.far.scale,
      ver: planes.ver.scale,
    };
    const weights = {
      near: planes.near.lineWeightPx,
      mid: planes.mid.lineWeightPx,
      far: planes.far.lineWeightPx,
      ver: planes.ver.lineWeightPx,
    };
    this.farCans = new CanView(
      this,
      this.manifest,
      this.parallax,
      this.ctx.feel.cans,
      scales,
      weights,
      'farCans',
    );
    this.makalani = null;
    this.makalaniLoading = false;
    this.makalaniGen++;
    this.makalaniArgs = { scales, weights };
    this.loadFruit(mapBiome);
    this.loadTreeLife(mapBiome, scales);
    this.loadNamibLife(mapBiome);
    this.loadTells(mapBiome);
    this.loadBaboons(mapBiome);
    this.loadHarvest(mapBiome);
    this.weapon = new WeaponView(
      this,
      this.ctx.feel,
      this.gunLayer,
      this.ctx.prefs,
      // The gun's atlas goes to the GPU when it is first shown (D-029).
      (id) => this.manifest.ensureGun(this.textures, id),
      this.ctx.content.weapons.weapons,
    );
    // e2e/dev only (v1.7 art previews): hold the sim at a tick from inside the page (a rAF watcher
    // freezes the frame right after an event: the Familiefoto, a scold).
    if (this.ctx.hook)
      (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__ = (tick) => {
        if (this.runner !== null) this.runner.holdAt = tick;
      };
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
    const sight = huntSight(gun, this.ctx.save.data, this.ctx.content, this.ctx.sightOverride);
    return sight === undefined ? mode : { ...mode, sight };
  }

  /** v1.3: the picture a fitted sight draws (weapons.json sights), or null for no sight. */
  /** 1.9.2 (D-055): the power-ups that swap a rifle's sight for a red dot. */
  private get redDots(): ReadonlySet<string> {
    this.redDotSet ??= redDotIds(this.ctx.content);
    return this.redDotSet;
  }

  private redDotSet: ReadonlySet<string> | null = null;

  private sightPicture(id: string | null): SightPicture | null {
    if (id === null) return null;
    return this.ctx.content.weapons.sights.find((s) => s.id === id)?.picture ?? null;
  }

  /**
   * D-053: HD files that landed since (after "Play now in Standard", or the background late
   * and Ver groups) go under their keys now (renamed, never removed: D-046), and the scenery and
   * gun views switch over in place. Between hunts it also preloads the next areas' HD packs.
   */
  private refreshHd(idle: boolean): void {
    const g = this.ctx.graphics;
    if (this.ctx.hook) this.ctx.hook.graphics.refreshes++;
    if (!g.hd) {
      // Standard chosen while these views draw HD (Settings on the title: the hunt that follows
      // keeps the views, so no scene change frees it): swap back in place, free once unused.
      g.settle(this.game.scene.scenes, this.textures, () => texturesInUse(this.game), this.anims);
      if (this.parallax.refreshHd()) this.weapon.refreshRig();
      if (this.ctx.hook) this.ctx.hook.graphics.epoch = this.manifest.hdEpoch;
      return;
    }
    g.apply(this.manifest, this.textures);
    if (this.parallax.refreshHd()) this.weapon.refreshRig();
    // The standard textures HD replaced (layer tiles, renamed images) go once nothing draws them
    // (the views just moved over), not at the next scene change: on a phone both sets did not
    // fit 256 MB.
    g.purge(this.textures, () => texturesInUse(this.game), this.anims);
    if (this.ctx.hook) this.ctx.hook.graphics.epoch = this.manifest.hdEpoch;
    if (idle) {
      // The areas the next hunt is likeliest to use: the Classic area and today's Daily.
      g.preload(this.ctx.classicBiome ?? this.ctx.classicArea());
      g.preload(this.ctx.daily.todaySetup().biome);
    }
  }

  /** D-029 texture memory for the test hook, and (v1.3) which gun atlases are on the GPU. */
  private sampleTextures(hook: TestHook): void {
    hook.textureBytes = textureBytes(this.textures);
    hook.textureTop = largestTextures(this.textures, 15);
    // D-053: HD textures in the texture manager, and sampled on-screen boxes (the same with
    // Standard and HD).
    hook.graphics.hdTextures = hdTextureCount(this.textures);
    hook.graphics.bounds = sampleBounds(this.boundsSource);
    // The create-time sample runs before this run's views exist (boundsSource is null until the
    // ParallaxView is built; `parallax` is unset on the first run): no herds to probe yet.
    hook.fauna = this.boundsSource === null ? [] : this.parallax.faunaProbe();
    hook.gunAtlases = this.textures.getTextureKeys().filter((k) => k.startsWith('final:gun/'));
  }

  /**
   * v1.3: on the low tier, leaving a hunt (this scene restarts for the title, [Again] or the next
   * hunt) drops the gun atlases of every gun the next hunt can't start with, so a hunt that used
   * both crate guns doesn't keep them on the GPU (< 128 MB). A gun shown again uploads on demand
   * (ensureGun).
   */
  private releaseGuns(data: HuntData): void {
    // Only the low tier needs the room (its 128 MB budget); on the others the rigs stay, so a
    // crate gun never re-uploads mid-hunt (a hitch on phones).
    if (this.ctx.prefs.tier !== 'low') return;
    // Keep every gun the next hunt can start with: the loadout, the admin page's, the Season
    // Run's and a challenge's.
    const keep = new Set<string>([this.ctx.save.data.loadout.weapon]);
    const extra = [
      this.ctx.weaponOverride,
      this.ctx.run.current?.weapon,
      data.challenge?.weapon,
      data.range?.mode.weapon,
      data.range?.mode.range?.crate,
    ];
    for (const id of extra) if (id !== undefined) keep.add(id);
    for (const m of new Set([this.manifest, this.ctx.installedManifest]))
      m?.releaseGuns(this.textures, keep, this.anims);
  }

  /** M8: a hunt in another biome (Daily rotation, challenge, Season Run) swaps the scenery. */
  private useBiome(id: string, map: MapChoice): void {
    const sameMap =
      map.layout === this.map.layout &&
      map.bonus === this.map.bonus &&
      map.feesdag === this.map.feesdag &&
      (map.ver === true) === (this.map.ver === true);
    if (id === this.biome.id) {
      if (sameMap && !this.viewsStale) return;
      // v1.2: same biome, another map (props move, light changes): same textures, new views.
      for (const obj of [...this.children.list]) obj.destroy();
      this.map = map;
      // v1.6 (D-042): delivered files that came in since (late Ver strips) go in first; no
      // placeholder is drawn here.
      if (this.viewsStale) this.manifest.install(this.textures, () => false);
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
        ? {
            view: 'list',
            range: () => {
              this.scene.stop('Admin');
              this.openSkietbaan();
            },
          }
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

  // --- Skietbaan (D-037) ---------------------------------------------------------------------

  /** The Skietbaan's setup page, from its lazy chunk (admin page builds only). */
  private openSkietbaan(): void {
    // Builds with the admin page only (the PlatformAdapter's adminPage: web). Compared against
    // the raw flag (a literal after Vite's replacement) so a portal build drops this import()
    // and its chunk altogether; platform.spec checks the portal builds carry no such chunk.
    const flag = import.meta.env.VITE_PLATFORM;
    if (flag === 'poki' || flag === 'crazygames' || flag === 'capacitor') return;
    if (this.ctx.admin === null) return;
    this.ctx.platform.loadingProgress(1);
    if (this.ctx.hook) this.ctx.hook.scene = 'skietbaan';
    import('../range/Skietbaan').then(
      (m) => {
        if (!this.sys.isActive()) return;
        m.openSkietbaan({
          content: this.ctx.content,
          // The admin page's tool (its own save): every playable biome, like admin hunts (D-039).
          playableBiomes: this.ctx.playableBiomes,
          hook: this.ctx.hook,
          today: () => this.ctx.today(),
          nextSeed: () => this.ctx.nextSeed(),
          play: (session) => {
            this.ctx.audio.unlock();
            this.scene.restart({ range: session } satisfies HuntData);
          },
          back: () => {
            this.showAdmin();
          },
          // D-042 (14): dev builds only (the web build's admin page: dev server, GitHub Pages).
          freshLoad: freshLoadShown(this.ctx.platform)
            ? () => {
                void this.ctx.platform.hardRefresh();
              }
            : null,
        });
      },
      (err: unknown) => {
        // The chunk didn't load (offline, a new deploy): back to the admin list.
        console.warn('[skietbaan] could not load', err);
        this.showAdmin();
      },
    );
  }

  /** What a running range may use of this scene. */
  private rangeHost(): RangeHost {
    return {
      scene: this,
      audio: this.ctx.audio,
      reduceFlashes: () => this.ctx.prefs.reduceFlashes,
      simHeld: () => this.runner?.held === true,
      overlay: (plane) => {
        try {
          return this.parallax.plane(plane).overlay;
        } catch {
          return null;
        }
      },
      exit: () => {
        this.quitRange();
      },
      replay: (session) => {
        this.ctx.platform.gameplayStop();
        this.scene.stop('Hud');
        this.scene.restart({ range: session } satisfies HuntData);
      },
    };
  }

  /** The range's Setup button or the pause menu's Quit: back to the setup page. */
  private quitRange(): void {
    this.ctx.platform.gameplayStop();
    this.scene.stop('Hud');
    this.scene.restart({ rangeMenu: true } satisfies HuntData);
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
      ...(view === 'tally' ? { powerups: [...this.usedPowerups] } : {}),
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

  /**
   * D-048: loads the special days' view module (a lazy chunk) behind a veil, then starts the hunt;
   * the feesdae group's art and sounds load in the background (the stand-in and the synths play
   * until they arrive; the view swaps the sheet in when it lands).
   */
  private waitForFeesdae(special: Feesdag, then: (ok: boolean) => void): void {
    const { width, height } = designSize();
    const veil = this.add
      .rectangle(width / 2, height / 2, width, height, 0x1b1410, 0.82)
      .setDepth(9_999);
    const area = tOr(special.nameKey, special.id);
    const label = this.add
      .text(width / 2, height / 2, fill(t('ui.loading_area'), { area }), textStyle(48, '#F3EAD3'))
      .setOrigin(0.5)
      .setDepth(10_000);
    void import('../feesdae/FeesdagView')
      .then(async (m) => {
        feesdaeModule = m;
        this.loadFeesdaeArt();
        // D-064: Christmas waits for its own sheet when the index lists it (bounded by the file
        // timeout; unlisted or failed: the stand-in draws instead).
        if (WAIT_FOR_SHEET.includes(special.id) && !feesdaeSheetTried.has(special.id)) {
          feesdaeSheetTried.add(special.id);
          const img = await m.loadSpecialSheet(special.id);
          if (img !== null) feesdaeSheets.set(special.id, img);
        }
        return true;
      })
      .catch(() => false)
      .then((ok) => {
        if (label.active) label.destroy();
        if (this.ctx.hook)
          this.ctx.hook.feesdaeArt = feesdaeSheets.has(special.id) ? 'final' : 'standin';
        if (ok || !veil.active) {
          if (veil.active) veil.destroy();
          then(ok);
          return;
        }
        // The special's code didn't come (offline, a dropped connection): the same message,
        // Retry and Back as a biome whose art failed (D-042).
        this.showArtFailed(
          veil,
          area,
          () => {
            this.waitForFeesdae(special, then);
          },
          () => {
            then(false);
          },
        );
      });
  }

  /**
   * v1.8b (D-062): the baboon sheet behind a veil: it is in flight in the background (with the
   * late group); look for it every 200 ms. If the background files settle without it, Retry
   * (reload the missing file) or Back (D-042).
   */
  private waitForBaboonSheet(
    id: string,
    manifest: AssetManifest,
    then: (ok: boolean) => void,
  ): void {
    const { width, height } = designSize();
    const veil = this.add
      .rectangle(width / 2, height / 2, width, height, 0x1b1410, 0.82)
      .setDepth(9_999);
    const label = this.add
      .text(width / 2, height / 2, t('ui.loading'), textStyle(48, '#F3EAD3'))
      .setOrigin(0.5)
      .setDepth(10_000);
    const t0 = performance.now();
    const poll = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        manifest.upgrade(this.textures, BABOON_SHEET);
        const ok = manifest.delivered(this.textures, BABOON_SHEET);
        if (!ok && !manifest.lateDone) return;
        poll.remove();
        if (label.active) label.destroy();
        // e2e: how long Start waited for the sheet (hunt.spec: the first hunt never does).
        if (this.ctx.hook) this.ctx.hook.boot['baboonSheetWaitMs'] = performance.now() - t0;
        if (ok) {
          if (veil.active) veil.destroy();
          // Files arrived while waiting (the sheet, and with it any background file such as a
          // map's Ver strips): the views install them when they are built (as waitForLate does).
          this.viewsStale = true;
          then(true);
          return;
        }
        veil.destroy();
        this.waitForLate(id, { sight: false, ver: false, baboons: true }, then);
      },
    });
  }

  /** v1.8b (D-062): the lazy sim systems behind a veil; offline, Retry or Back (D-042). */
  private waitForSimSystems(biomeId: string, then: (ok: boolean) => void): void {
    const { width, height } = designSize();
    const veil = this.add
      .rectangle(width / 2, height / 2, width, height, 0x1b1410, 0.82)
      .setDepth(9_999);
    const def = this.ctx.content.biomes.find((b) => b.id === biomeId);
    const area = def === undefined ? biomeId : tOr(def.nameKey, biomeId);
    const t0 = performance.now();
    void loadSimSystems().then((ok) => {
      // e2e: how long Start waited for the sim systems' chunk.
      if (this.ctx.hook) this.ctx.hook.boot['simSystemsWaitMs'] = performance.now() - t0;
      if (ok || !veil.active) {
        if (veil.active) veil.destroy();
        then(ok);
        return;
      }
      this.showArtFailed(
        veil,
        area,
        () => {
          this.waitForSimSystems(biomeId, then);
        },
        () => {
          then(false);
        },
      );
    });
  }

  /** D-048: the special's own group's files in the background (D-064: only that special's);
   *  the sheet goes into the view on arrival. */
  private loadFeesdaeArt(): void {
    // Cached per page: each call only fetches what is still missing (a failed file, the lines
    // of a voice language picked since).
    const special = this.special;
    if (feesdaeModule === null || special === null) return;
    const id = special.id;
    void feesdaeModule.loadFeesdaeAssets(this.ctx.audio, id).then((img) => {
      if (img === null || feesdaeSheets.has(id)) return;
      feesdaeSheets.set(id, img);
      if (this.special?.id !== id) return;
      if (this.ctx.hook) this.ctx.hook.feesdaeArt = 'final';
      if (this.sys.isActive()) this.spookView?.useSheet(img);
    });
  }

  /**
   * Loads a biome's art chunk behind a veil with the area's name and the portal's loading
   * signals. v1.6 (D-042): when the delivered art still fails after main.ts's bounded retries,
   * a friendly message offers Retry (or Back); a hunt or the Skietbaan never starts on
   * placeholders.
   */
  private waitForBiome(id: string, then: (ok: boolean) => void): void {
    const { width, height } = designSize();
    const b = this.ctx.content.biomes.find((x) => x.id === id);
    const area = b === undefined ? id : tOr(b.nameKey, id);
    const veil = this.add
      .rectangle(width / 2, height / 2, width, height, 0x1b1410, 0.82)
      .setDepth(9_999);
    const label = this.add
      .text(width / 2, height / 2, fill(t('ui.loading_area'), { area }), textStyle(48, '#F3EAD3'))
      .setOrigin(0.5)
      .setDepth(10_000);
    this.ctx.platform.loadingProgress(0);
    void this.ctx.loadBiome(id).then((ok) => {
      this.ctx.platform.loadingProgress(1);
      if (label.active) label.destroy();
      if (ok && veil.active && !this.ctx.graphics.ready(id)) {
        this.waitForHd(id, veil, () => {
          then(true);
        });
        return;
      }
      if (ok || !veil.active) {
        if (veil.active) veil.destroy();
        then(ok);
        return;
      }
      this.showArtFailed(
        veil,
        area,
        () => {
          this.waitForBiome(id, then);
        },
        () => {
          then(false);
        },
      );
    });
  }

  /**
   * D-053: the area's HD pack behind `veil`: a bar with the MB, and after
   * feel.assets.hdOfferStandardMs "Play now in Standard" (the hunt starts on the standard art;
   * the HD files keep loading and swap in during play). Clears the veil, then calls `then`.
   */
  private waitForHd(id: string, veil: Phaser.GameObjects.Rectangle, then: () => void): void {
    const { width, height } = designSize();
    const hook = this.ctx.hook;
    if (hook) hook.graphics.loading = 'loading';
    const line = (): string => {
      const p = this.ctx.graphics.progress(id);
      return fill(t('gfx.loading'), { done: megabytes(p.done), total: megabytes(p.total) });
    };
    const label = this.add
      .text(width / 2, height / 2 - 80, line(), textStyle(40, '#F3EAD3'))
      .setOrigin(0.5)
      .setDepth(10_000);
    const barW = Math.min(900, width - 200);
    const back = this.add
      .rectangle(width / 2, height / 2, barW, 28, 0x3a2e25)
      .setStrokeStyle(4, 0x5a4a3c)
      .setDepth(10_000);
    const bar = this.add
      .rectangle(width / 2 - barW / 2, height / 2, 0, 28, 0xd8a73a)
      .setOrigin(0, 0.5)
      .setDepth(10_001);
    let menu: Menu | null = null;
    let offer: { g: Phaser.GameObjects.GameObject; text: Phaser.GameObjects.GameObject } | null =
      null;
    let done = false;
    // Wall-clock timers, not the scene clock: on a slow device (and while an area's art decodes)
    // Phaser caps each frame's delta, so a 4 s delayedCall took longer than the 15 s file
    // timeouts and "Play now in Standard" never came (Pixel 7 e2e).
    let ticker = 0;
    let offerTimer = 0;
    const stopTimers = (): void => {
      window.clearInterval(ticker);
      window.clearTimeout(offerTimer);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopTimers);
    const finish = (how: 'done' | 'skipped'): void => {
      if (done) return;
      done = true;
      stopTimers();
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, stopTimers);
      menu?.destroy();
      for (const o of [label, back, bar, veil, offer?.g, offer?.text]) o?.destroy();
      if (hook) {
        hook.graphics.loading = how;
        if (hook.menu === 'hdLoading') hook.menu = null;
      }
      then();
    };
    ticker = window.setInterval(() => {
      if (done || !label.active) return;
      const p = this.ctx.graphics.progress(id);
      label.setText(line());
      bar.width = p.total > 0 ? (barW * p.done) / p.total : 0;
    }, 100);
    offerTimer = window.setTimeout(() => {
      if (done || !veil.active) return;
      const rect = { x: width / 2 - 300, y: height / 2 + 90, w: 600, h: 110 };
      const b = drawButton(this, rect, t('gfx.play_standard'), 'primary', 40);
      b.g.setDepth(10_001);
      b.text.setDepth(10_002);
      offer = b;
      if (hook) hook.menu = 'hdLoading';
      menu = new Menu(
        this,
        [
          {
            id: 'hd.standard',
            rect: () => rect,
            press: () => {
              this.ctx.graphics.skip(id);
              finish('skipped');
            },
          },
        ],
        { focus: 'hd.standard', hook: this.ctx.hook },
      );
    }, this.ctx.feel.assets.hdOfferStandardMs);
    void this.ctx.graphics.loadHd(id).then(() => {
      // The load ended without HD (no runtime or index, D-053): this area plays in Standard, so
      // the restart that follows doesn't put up a new veil (it looped forever before).
      if (!this.ctx.graphics.ready(id)) this.ctx.graphics.skip(id);
      if (veil.active) finish('done');
    });
  }

  /**
   * v1.6 (D-042): the art-failed message over `veil` (the area's name, Retry and Back). Retry and
   * Back clear it, veil included, then call their function.
   */
  private showArtFailed(
    veil: Phaser.GameObjects.Rectangle,
    area: string,
    retryFn: () => void,
    backFn: () => void,
  ): void {
    const { width, height } = designSize();
    if (this.ctx.hook) this.ctx.hook.menu = 'artFailed';
    const msg = this.add
      .text(width / 2, height / 2 - 120, fill(t('ui.art_failed'), { area }), {
        ...textStyle(38, '#F3EAD3'),
        align: 'center',
        wordWrap: { width: Math.min(1400, width - 160) },
      })
      .setOrigin(0.5)
      .setDepth(10_000);
    const retry = { x: width / 2 - 430, y: height / 2 + 20, w: 400, h: 110 };
    const back = { x: width / 2 + 30, y: height / 2 + 20, w: 400, h: 110 };
    const r = drawButton(this, retry, t('ui.retry'), 'primary', 44);
    const k = drawButton(this, back, t('ui.back'), 'secondary', 44);
    for (const o of [r.g, r.text, k.g, k.text]) o.setDepth(10_001);
    const clear = (): void => {
      menu.destroy();
      for (const o of [veil, msg, r.g, r.text, k.g, k.text]) o.destroy();
      if (this.ctx.hook) this.ctx.hook.menu = null;
    };
    const menu = new Menu(
      this,
      [
        {
          id: 'art.retry',
          rect: () => retry,
          press: () => {
            clear();
            retryFn();
          },
        },
        {
          id: 'art.back',
          rect: () => back,
          press: () => {
            clear();
            backFn();
          },
        },
      ],
      {
        onBack: () => {
          clear();
          backFn();
        },
        focus: 'art.retry',
        hook: this.ctx.hook,
      },
    );
  }

  /**
   * v1.6 (D-042): the late groups (sight pictures, Ver strips, the rifles) behind the loading
   * veil, then `then(true)`. When files the hunt needs (`need`) still fail after main.ts's
   * bounded retries, the same message as waitForBiome offers Retry or Back (`then(false)`).
   */
  private waitForLate(id: string, need: LateNeed, then: (ok: boolean) => void): void {
    const { width, height } = designSize();
    const b = this.ctx.content.biomes.find((x) => x.id === id);
    const area = b === undefined ? id : tOr(b.nameKey, id);
    const veil = this.add
      .rectangle(width / 2, height / 2, width, height, 0x1b1410, 0.82)
      .setDepth(9_999);
    const label = this.add
      .text(width / 2, height / 2, t('ui.loading'), textStyle(48, '#F3EAD3'))
      .setOrigin(0.5)
      .setDepth(10_000);
    void this.ctx.loadLateArt(id, need).then((ok) => {
      if (label.active) label.destroy();
      if (!veil.active) return;
      if (ok) {
        veil.destroy();
        // The views were built before the files came in: rebuild them (useBiome).
        this.viewsStale = true;
        then(true);
        return;
      }
      this.showArtFailed(
        veil,
        area,
        () => {
          this.waitForLate(id, need, then);
        },
        () => {
          then(false);
        },
      );
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
    const range = this.range;
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
    // v1.8c (D-063): the Harvest plays the Classic loadout too.
    const gunMode = plainMode ?? (modeId === 'harvest' ? modeId : null);
    const adminGun = gunMode === null ? undefined : this.ctx.weaponOverride;
    const weapon =
      adminGun ??
      (gunMode !== null &&
      loadout !== undefined &&
      loadout.id !== this.ctx.content.modes.modes[gunMode].weapon &&
      isWeaponEquippable(loadout, save, this.ctx.content)
        ? loadout.id
        : undefined);
    const bonusOpen =
      bonus !== undefined &&
      modeId === 'classic' &&
      challenge === null &&
      // v1.4 B: the Classic area's bonus maps (Namibië's once picked), the same the title draws;
      // v1.3 (D-036): Die Verste starts only with a scope fitted (the title button says so).
      bonusOpenFor(
        this.ctx.content,
        save.bonusMaps,
        this.huntDay,
        this.ctx.classicBiome ?? this.ctx.classicArea(),
        bonus,
        this.withSight({ id: 'classic', ...(weapon === undefined ? {} : { weapon }) }).sight,
      );
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
    // v1.4 B: ?biome= (dev), else the area picked on the title (D-039).
    const biomeParam = this.ctx.classicBiome ?? this.ctx.classicArea();
    if (
      plan?.mode.id === 'classic' &&
      plan.challenge === null &&
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
    const baseMode: ModeConfig = range?.mode ??
      runHunt?.mode ??
      plan?.mode ?? { id: modeId, ...(weapon === undefined ? {} : { weapon }), ...extra };
    // v1.3 (D-036): a rifle carries its sight — a challenge's, the admin page's, or the one
    // fitted in the Skiet-Skuur (recorded in the replay with the mode). The Skietbaan names its
    // own (D-037).
    const mode = range === null ? this.withSight(baseMode) : baseMode;
    // D-048: a special day's hunt waits for its lazy view module and art (the feesdae group).
    this.special = feesdagById(this.ctx.content.feesdae, mode.feesdag);
    // A later special-day hunt tries the files again if the first load came back without them.
    if (this.special !== null) this.loadFeesdaeArt();
    if (
      this.special !== null &&
      (feesdaeModule === null ||
        (WAIT_FOR_SHEET.includes(this.special.id) && !feesdaeSheetTried.has(this.special.id)))
    ) {
      this.waitForFeesdae(this.special, (ok) => {
        if (ok) this.begin(kind, startPointer, modeId, challenge, bonus);
        else this.scene.restart({} satisfies HuntData);
      });
      return;
    }
    // The hunt's biome may not be the one behind the title (M8): swap the scenery first.
    const huntBiome =
      mode.biome ??
      (mode.id === 'seasonHunt' ? this.biome.id : this.ctx.content.modes.modes[mode.id].biome);
    // v1.8b (D-062): a map with baboons or ostriches waits for their sim code (a lazy chunk).
    const huntBiomeDef = this.ctx.content.biomes.find((b) => b.id === huntBiome);
    if (huntBiomeDef !== undefined && needsLazySystems(huntBiomeDef) && !simSystemsReady()) {
      this.waitForSimSystems(huntBiome, (ok) => {
        if (ok) this.begin(kind, startPointer, modeId, challenge, bonus);
        else this.scene.restart({} satisfies HuntData);
      });
      return;
    }
    // M9 lazy biomes: its art loads on first use; the hunt starts once it is in. D-053: with HD
    // chosen, also its HD pack (behind the same veil, "Play now in Standard" after 4 s), even when
    // its standard art came in earlier on the title (it skipped the HD wait before).
    if (
      this.ctx.playableBiomes.includes(huntBiome) &&
      (!this.ctx.biomeReady(huntBiome) || !this.ctx.graphics.ready(huntBiome))
    ) {
      this.waitForBiome(huntBiome, (ok) => {
        if (ok) this.begin(kind, startPointer, modeId, challenge, bonus);
        else this.scene.restart({} satisfies HuntData);
      });
      return;
    }
    // v1.6 (D-042): a rifle's sight pictures (and the Ver strips, the rifles' rigs) come with the
    // late Ver group; a scoped hunt or the Skietbaan waits for them, retrying files that failed,
    // so the sight and the Ver strip are never drawn from their placeholders.
    const huntDef = this.ctx.content.biomes.find((b) => b.id === huntBiome);
    const huntManifest = huntDef === undefined ? this.manifest : this.ctx.manifestFor(huntDef);
    // v1.8b (D-062): a map with a baboon troop waits for the baboon sheet when it is delivered
    // (the troop can be hit from the first tick, so it must be drawn then; the file loads in the
    // background). Never for a file the index doesn't list.
    if (
      huntDef?.baboons !== undefined &&
      range === null &&
      mode.id !== 'ftue' &&
      // Only a file the delivered index has (no or a stand-in delivery: the placeholder draws).
      huntManifest.listed(BABOON_SHEET) &&
      !huntManifest.delivered(this.textures, BABOON_SHEET)
    ) {
      this.waitForBaboonSheet(huntDef.id, huntManifest, (ok) => {
        if (ok) this.begin(kind, startPointer, modeId, challenge, bonus);
        else this.scene.restart({} satisfies HuntData);
      });
      return;
    }
    if (range !== null || mode.sight !== undefined) {
      const gun =
        mode.weapon ??
        (mode.id === 'seasonHunt' ? undefined : this.ctx.content.modes.modes[mode.id].weapon);
      const need: LateNeed = {
        sight: mode.sight !== undefined,
        ver: safeResolveMap(huntDef ?? this.biome, mode.layout, mode.bonus, range !== null).ver,
        ...(gun === undefined ? {} : { weapon: gun }),
      };
      if (!huntManifest.lateDone || neededLateMissing(huntManifest.missingLate, need).length > 0) {
        this.waitForLate(huntDef?.id ?? this.biome.id, need, (ok) => {
          if (ok) this.begin(kind, startPointer, modeId, challenge, bonus);
          else this.scene.restart((range === null ? {} : { rangeMenu: true }) satisfies HuntData);
        });
        return;
      }
    }
    this.useBiome(huntBiome, {
      ...(mode.layout === undefined ? {} : { layout: mode.layout }),
      ...(mode.bonus === undefined ? {} : { bonus: mode.bonus }),
      ...(range === null ? {} : { ver: true }),
      ...(mode.feesdag === undefined ? {} : { feesdag: mode.feesdag }),
    });
    if (!this.texturesDone) this.texturesDone = this.manifest.install(this.textures);
    if (this.manifest.upgrade(this.textures, 'sight/').length > 0) this.sight.reset();
    if (this.ctx.hook)
      this.ctx.hook.sightArt = !this.textures.exists(TEX.sightScope)
        ? null
        : this.textures.get(TEX.sightScope).getSourceImage() instanceof HTMLCanvasElement
          ? 'placeholder'
          : 'final';
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
    const seed = range?.seed ?? runHunt?.seed ?? plan?.seed ?? this.ctx.nextSeed();
    this.huntSeed = seed;
    const sim = createSim({
      seed,
      content: this.ctx.content,
      mode,
      inputKind: kind,
      aimAssist,
      // v1.3x (D-037): the Skietbaan's spawn program (from its lazy chunk).
      ...(range === null ? {} : { rangeProgram: range.rangeProgram }),
    });
    this.recorder = createRecorder({
      seed,
      contentHash: this.ctx.contentHash,
      mode,
      inputKind: kind,
      aimAssist,
    });
    // The Skietbaan logs nothing for the save (D-037: unranked, no Bird Book, no stats).
    this.logger =
      range === null
        ? createHuntLogger(
            (id) =>
              this.ctx.content.birds.creatures
                .find((c) => c.id === id)
                ?.behaviours.includes('perchHigh') === true,
          )
        : null;
    if (plan !== null) {
      this.ctx.daily.start(plan);
      this.shareLog = createShareLogger(this.ctx.dailyMeta.grid);
    }
    if (range === null) this.ctx.admin?.played(seed, sim.snapshot().weapon.id);
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
        // 1.9.2 (D-055) Rooikol: a red dot magnifies nothing, so fine aim moves 1:1 (for the
        // whole hold it was pressed with: redDot.ts).
        sightZoom: () => inputSightZoom(this.runner?.state, this.ctx.content, this.redDots),
        // v1.4 (D-038): a variable scope's steps, and the touch zoom buttons beside the ammo
        // (none under the red dot).
        zoomSteps: () => hud.zoomOf(this.runner?.state),
        zoomButtonAt: (x, y) => hud.zoomButtonAt(x, y),
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
    hud.setRange(range !== null);
    // D-028 §3: Oupa barks in every hunt but his own lesson, and never in capture footage (nor
    // on the Skietbaan).
    hud.startBarks(
      modeId !== 'ftue' && this.ctx.capture === null && range === null,
      this.special?.barks ?? null,
    );
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
    // The Skietbaan is no hunt: no ad cadence, no hunt analytics.
    if (range === null) {
      this.ctx.ads.huntStarted();
      this.ctx.platform.analytics('hunt_start', {
        mode: this.modeId,
        biome: this.biome.id,
        weapon: weapon ?? sim.snapshot().weapon.id,
        inputKind: kind,
        aimAssist,
      });
    }
    this.game.canvas.style.cursor = kind === 'pointer' ? 'none' : '';

    const hook = this.ctx.hook;
    if (hook) {
      // The scene's name once the HUD is up (its pause button exists only then): 'range' on the
      // Skietbaan, 'hunt' otherwise.
      nameSceneWhenHudReady(hook, hud.events, range === null ? 'hunt' : 'range', () =>
        this.sys.isActive(),
      );
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
      hook.meerkatLog = [];
      hook.meerkats = [];
      hook.cans = null;
      hook.farCans = null;
      hook.nuts = null;
      hook.potjie = null;
      hook.canLog = [];
      hook.canMs = 0;
      hook.namibLifeMs = 0;
      hook.namibLifeFrames = 0;
      hook.tells = null;
      hook.tellMs = 0;
      hook.baboons = null;
      hook.baboonMs = 0;
      hook.harvestActors = null;
      hook.harvest = null;
      hook.harvestMs = 0;
      hook.feesdagMs = 0;
      hook.fruit = null;
      hook.hunts++;
    }
    range?.attach(this.rangeHost());
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
    if (this.game.loop.frame % 30 === 0) this.refreshHd(runner === null);
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
    if (hook && !this.ending && hook.frameTimes.length < MAX_FRAME_SAMPLES) {
      hook.frameTimes.push(delta);
      hook.frameScoped.push(hook.zoom.raise >= 1);
      hook.frameOpen.push(hook.zoom.z === 1);
    }

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
    this.range?.frame(events, state);
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
    for (const e of events) {
      const id =
        e.type === 'powerupStarted'
          ? e.powerup
          : e.type === 'weaponChanged' && e.kind === 'crate'
            ? e.weapon
            : null;
      if (id !== null && !this.usedPowerups.includes(id)) this.usedPowerups.push(id);
    }
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
    // The hunt is over: the sight comes down (the tally never opens over a frozen scope view).
    // 1.9.2 (D-055) Rooikol: a red dot is up at once and magnifies nothing (the view's call).
    const aimed = runner.over ? null : interpolateAim(runner.prev, state, alpha);
    // The hold's own red dot while aiming; the next press's while idle (R6: the picture isn't
    // rebuilt on every press and release while the Rooikol runs).
    const redDot = redDotUp(state, this.redDots);
    const zoom = zoomFor(
      aimed !== null && redDot ? { ...aimed, zoom: 1, progress: 1 } : aimed,
      width,
      height,
    );
    this.zoomView = zoom;
    this.sight.setPicture(redDot ? 'red_dot' : this.sightPicture(state.weapon.sight));
    // v1.4 (#56): a fully raised ring sight hides the screen outside its square.
    this.parallax.cullZoomed = HuntScene.cullZoomed;
    this.parallax.setZoom(zoom.z, zoom.cx, zoom.cy, this.sight.opaqueOutside(zoom));
    this.parallax.update(cam, width);
    this.screen.setPosition(width / 2 - zoom.cx * zoom.z, height / 2 - zoom.cy * zoom.z);
    this.screen.setScale(zoom.z);
    this.sight.update(zoom, width, height);
    this.weapon.setScoped(zoom.raise);
    const drawBirds = interpolateBirds(runner.prev, state, alpha);
    this.birds.setViewZoom(zoom.z);
    this.birds.update(drawBirds, state.tick);
    this.world.update(state, width, designSize().height);
    // D-051: the potjie's simmer, rattles and clang (on sim ticks; none on a held frame).
    for (const c of this.world.potjie.cues)
      playPotjieSound(this.ctx.audio, c.sound, (c.screenX - width / 2) / (width / 2));
    const w0 = performance.now();
    this.meerkats.update(state);
    this.cans.update(state, runner.prev, alpha);
    this.farCans.update(state, runner.prev, alpha);
    if (state.nuts !== undefined) this.loadMakalani();
    this.makalani?.update(state, runner.prev, alpha);
    if (this.spookView !== null) {
      this.spookView.viewZoom = zoom.z;
      this.spookView.layout(width, height);
    }
    const f0 = performance.now();
    this.spookView?.update(state.feesdag, runner.prev.feesdag, alpha, state.tick);
    if (this.ctx.hook) this.ctx.hook.feesdagMs += performance.now() - f0;
    // Interpolated like the birds and the camera (a held frame keeps alpha 0: it holds).
    this.fruit?.update(state, width, state.tick - 1 + alpha);
    this.treeLife?.update(state, alpha);
    for (const cue of this.meerkats.cues) {
      const pan = (cue.screenX - width / 2) / (width / 2);
      // Only colonies on screen (or just off it) are heard.
      if (Math.abs(pan) <= 1.2)
        playMeerkatSound(this.ctx.audio, cue.sound, Math.max(-1, Math.min(1, pan)));
    }
    if (this.ctx.hook) {
      this.ctx.hook.meerkatMs += this.meerkats.ms;
      this.ctx.hook.canMs += this.cans.ms + this.farCans.ms + (this.makalani?.ms ?? 0);
      // v1.4 B (e2e perf): what the weavers and the mirage cost per frame.
      this.ctx.hook.sceneryMs += performance.now() - w0 + this.world.mirageMs;
      this.ctx.hook.sceneryFrames++;
    }
    // v1.7d (D-059, review): the Namibië veld life on its own timer (outside the weavers +
    // mirage window above).
    if (this.namibLife !== null) {
      const n0 = performance.now();
      this.namibLife.update(state, runner.prev, alpha, width);
      if (this.ctx.hook) {
        this.ctx.hook.namibLifeMs += performance.now() - n0;
        this.ctx.hook.namibLifeFrames++;
      }
    }
    // v1.7e (D-061): the tell animals, on their own timer (outside the weavers + mirage window).
    if (this.tells !== null) {
      this.tells.update(state, this.world.secretsLit(state));
      if (this.ctx.hook) this.ctx.hook.tellMs += this.tells.lastMs;
    }
    // v1.8b (D-062): the baboons, on their own timer (outside the weavers + mirage window).
    if (this.baboons !== null) {
      this.baboons.update(state);
      if (this.ctx.hook) this.ctx.hook.baboonMs += this.baboons.lastMs;
    }
    // v1.8c (D-063): the Harvest's warthogs, workers and fence, on their own timer.
    if (this.harvest !== null) {
      this.harvest.update(state);
      if (this.ctx.hook) this.ctx.hook.harvestMs += this.harvest.lastMs;
    }
    this.weapon.spreadMul = spreadMulOf(state.powerups, this.ctx.content.powerups.powerups);
    // v1.7b (D-046): Chilli Biltong's sparks at the muzzle.
    this.weapon.chilli = state.powerups.some(
      (p) =>
        this.ctx.content.powerups.powerups.find((d) => d.id === p.id)?.effect.infiniteAmmo === true,
    );
    this.weapon.setWeapon(state.weapon.id);
    this.weapon.setReloading(state.weapon.reloading);
    this.ctx.audio.setWeapon(state.weapon.id);
    this.ctx.audio.setFastReload(
      reloadBoostsOf(state.powerups, this.ctx.content.powerups.powerups).fast,
    );
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
        fill: Math.round(this.parallax.fill * 1000) / 1000,
        z: Math.round(z.z * 1000) / 1000,
        raise: Math.round(z.raise * 1000) / 1000,
        reticleX: Math.round(z.reticleX * 10) / 10,
        reticleY: Math.round(z.reticleY * 10) / 10,
        sight: state.weapon.sight,
        picture: this.sight.shown,
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
      this.debug.shown ? artSummary(this.manifest.entries()) : '',
    );
    const hud = this.scene.get('Hud') as HudScene;
    if (hud.sys.isActive()) {
      // v1.7b (D-046): the pickup card fades while the crosshair is over it.
      const ch = this.weapon.crosshair.root;
      hud.setAim(ch.visible && ch.alpha > 0 ? { x: ch.x, y: ch.y } : null);
      hud.render(state, events);
      const looks = this.ctx.hook?.powerupLooks;
      if (looks !== undefined) {
        looks.spreadRing = this.weapon.crosshair.boosted;
        looks.sparks = this.weapon.chilliSparks;
      }
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
      hook.cooldownTicks = state.weapon.cooldownTicks;
      hook.aimOffsetPx = this.ctx.prefs.crosshairOffsetPx;
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
      const far = this.ctx.content.scoring.planes.far;
      hook.farBirds = state.birds
        .filter((b) => b.plane === 'far' && b.hittable && b.kind === 'target')
        .map((b) => ({
          id: b.id,
          x:
            width / 2 +
            planeToDx(
              state.cameraX,
              far.scrollFactor,
              b.x + (body?.ox ?? 0) * far.scale * b.facing,
            ),
          y: b.y + (body?.oy ?? 0) * far.scale,
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
        item: c.item,
        icon: this.world.crateIcon(c.id),
        drawn: this.world.crateDrawn(c.id),
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
      hook.harvestFlyovers =
        state.harvest === null
          ? []
          : state.birds
              .filter((b) => b.motion === 'flyover')
              .map((b) => ({
                id: b.id,
                creature: b.creature,
                plane: b.plane,
                x: this.parallax.screenX(b.plane, b.x),
                y: b.y,
              }));
      hook.weapon = state.weapon.id;
      hook.powerups = state.powerups.map((p) => p.id);
      hook.wind = state.wind;
      hook.weavers = this.treeLife?.weaverCount ?? 0;
      hook.potjie = this.world.potjie.hook;
      hook.hdProps = this.parallax.hdSpots();
      hook.meerkats = this.meerkats.spots();
      hook.cans =
        state.cans === undefined
          ? null
          : { plane: state.cans.plane, spots: this.cans.spots(), bestChain: state.cans.bestChain };
      hook.farCans =
        state.farCans === undefined
          ? null
          : {
              plane: state.farCans.plane,
              spots: this.farCans.spots(),
              bestChain: state.farCans.bestChain,
            };
      hook.nuts =
        state.nuts === undefined
          ? null
          : {
              ...(this.makalani?.spots() ?? { nuts: [], palms: [], layers: [] }),
              bestChain: state.nuts.bestChain,
            };
      hook.spook =
        state.feesdag === undefined || this.spookView === null
          ? null
          : {
              id: state.feesdag.id,
              lanternsLit: state.feesdag.lanternsLit,
              lanternsTotal: state.feesdag.lanternsTotal,
              things: this.spookView.spots(),
              final: this.spookView.final,
              hats: this.birds.hatSpots().map((p) => ({
                x: Math.round(this.parallax.screenX(p.plane, p.x)),
                y: Math.round(p.y),
              })),
              ...(state.feesdag.presentsTotal === undefined
                ? {}
                : {
                    presentsClosed: state.feesdag.presentsClosed ?? 0,
                    presentsTotal: state.feesdag.presentsTotal,
                    ...('tinsel' in this.spookView && typeof this.spookView.tinsel === 'function'
                      ? { tinsel: (this.spookView as KersfeesHook).tinsel() }
                      : {}),
                    heat: this.world.heatOn() ? this.world.heat : 0,
                  }),
            };
      hook.fruit =
        this.fruit === null
          ? null
          : {
              count: this.fruit.count,
              hits: this.fruit.hitCount,
              drops: this.fruit.dropCount,
              swinging: this.fruit.swinging,
              spots: this.fruit.spots(),
            };
      hook.treeLife = this.treeLife?.hook() ?? null;
      hook.namibLife = this.namibLife?.hook() ?? null;
      hook.tells = this.tells?.tells ?? null;
      hook.baboons = this.baboons?.baboons ?? null;
      hook.baboonRaid = state.baboons?.raid ?? null;
      hook.harvestActors = this.harvest?.actors ?? null;
      const hv = state.harvest;
      hook.harvest =
        hv === null
          ? null
          : {
              phase: hv.phase,
              crop: hv.crop,
              repair: hv.repair,
              clockTicksLeft: hv.clockTicksLeft,
              warthogs: hv.warthogs.length,
              piglets: hv.piglets.length,
              workers: hv.workers.map((w) => ({ id: w.id, phase: w.phase, x: w.x, y: w.y })),
              warthogsBagged: hv.warthogsBagged,
              cropBonus: hv.cropBonus,
              bystanderPenalty: hv.bystanderPenalty,
            };
      hook.mirage = state.mirage;
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

  /**
   * v1.7c (D-047): loads the fruit view (its own chunk) for the map now on screen. Sprites of a
   * previous map go; a load that finishes after another rebuild is dropped.
   */
  private makalaniArgs: {
    scales: Readonly<Record<PlaneId, number>>;
    weights: Readonly<Record<PlaneId, number>>;
  } | null = null;

  /** 1.9.3 (D-056): the makalani view's chunk, loaded once a map with palms is running. */
  private loadMakalani(): void {
    if (this.makalani !== null || this.makalaniLoading || this.makalaniArgs === null) return;
    this.makalaniLoading = true;
    const gen = this.makalaniGen;
    const args = this.makalaniArgs;
    void import('../view/palms/MakalaniView').then((m) => {
      if (gen !== this.makalaniGen) return;
      this.makalani = new m.MakalaniView(
        this,
        this.manifest,
        this.parallax,
        this.ctx.feel.makalani,
        args.scales,
        args.weights,
        this.ctx.reducedMotion,
      );
    });
  }

  /** 1.9.4 (D-057): the tree-life chunk, for a map with the baobab or a weaver nest. */
  private loadTreeLife(mapBiome: Biome, planeScale: Readonly<Record<PlaneId, number>>): void {
    this.treeLife?.destroy();
    this.treeLife = null;
    const gen = ++this.treeLifeGen;
    const weavers = this.ctx.feel.juice.weavers.barkKey;
    this.lifeHeld = [];
    this.weaverNests = new Map();
    for (const p of mapBiome.props) {
      const layer = mapBiome.layers.find((l) => l.id === p.layer);
      if (
        layer !== undefined &&
        p.secret?.type === 'singleHit' &&
        p.secret.reward.barkKey === weavers
      )
        this.weaverNests.set(p.id, { layer: layer.id, x: p.u * coreWidth(layer.scrollFactor) });
    }
    const wanted = mapBiome.props.some(
      (p) =>
        p.asset === 'bushveld/baobab' ||
        (p.secret?.type === 'singleHit' && p.secret.reward.barkKey === weavers),
    );
    // e2e/dev only: ?treeLife=off (the art previews' "before").
    if (!wanted || this.ctx.treeLifePreview === 'off') return;
    void import('../view/tree/TreeLifeView')
      .then((m) => {
        if (gen !== this.treeLifeGen) return;
        this.treeLife = new m.TreeLifeView(this, this.ctx.feel, mapBiome, this.parallax, {
          seed: () => this.huntSeed,
          lightIds: this.lightIds,
          reducedMotion: this.ctx.reducedMotion,
          preview: this.ctx.treeLifePreview,
          farFactor: this.ctx.content.scoring.planes.far.scrollFactor,
          cameraAt: (tick) => this.runner?.cameraAt(tick) ?? null,
          planeScale,
        });
      })
      .catch(() => {
        // Offline without the chunk cached: the tree simply has no residents.
      });
  }

  /** v1.8b (D-062): the baboons' chunk, for a map with a troop. */
  private loadBaboons(mapBiome: Biome): void {
    this.baboons?.destroy();
    this.baboons = null;
    const gen = ++this.baboonsGen;
    if (mapBiome.baboons === undefined) return;
    void import('../view/baboon/BaboonView')
      .then((m) => {
        if (gen !== this.baboonsGen) return;
        this.baboons = new m.BaboonView(
          this,
          this.parallax,
          () => performance.now(),
          this.manifest,
          this.ctx.content.birds.baboons,
          this.ctx.hook !== null,
        );
      })
      .catch(() => {
        // Offline without the chunk cached: the troops are simply not drawn.
      });
  }

  /** v1.8c (D-063): the Harvest's chunk, for the Harvest's map. */
  private loadHarvest(mapBiome: Biome): void {
    this.harvest?.destroy();
    this.harvest = null;
    const gen = ++this.harvestGen;
    if (mapBiome.harvest === undefined) return;
    void import('../view/harvest/HarvestView')
      .then((m) => {
        if (gen !== this.harvestGen) return;
        this.harvest = new m.HarvestView(
          this,
          this.parallax,
          () => performance.now(),
          this.manifest,
          this.ctx.content.modes.modes.harvest,
          this.ctx.hook !== null,
        );
      })
      .catch(() => {
        // Offline without the chunk cached: the Harvest's actors are simply not drawn.
      });
  }

  /** v1.7e (D-061): the tell animals' chunk, for a map with a secret that has one. */
  private loadTells(mapBiome: Biome): void {
    this.tells?.destroy();
    this.tells = null;
    const gen = ++this.tellsGen;
    if (!mapBiome.props.some((p) => p.secret?.tell !== undefined)) return;
    void import('../view/tell/TellView')
      .then((m) => {
        if (gen !== this.tellsGen) return;
        this.tells = new m.TellView(
          this,
          this.parallax,
          () => performance.now(),
          this.manifest,
          this.ctx.content.birds.tells.species,
        );
      })
      .catch(() => {
        // Offline without the chunk cached: the secrets simply show no tell.
      });
  }

  /** v1.7d (D-059): the Namibië veld-life chunk, for a Namibië map. */
  private loadNamibLife(mapBiome: Biome): void {
    this.namibLife?.destroy();
    this.namibLife = null;
    const gen = ++this.namibLifeGen;
    if (mapBiome.id !== 'namibie') return;
    void import('../view/namib/NamibLifeView')
      .then((m) => {
        if (gen !== this.namibLifeGen || !m.wantsNamibLife(mapBiome)) return;
        this.namibLife = new m.NamibLifeView(this, mapBiome, this.parallax, {
          reducedMotion: this.ctx.reducedMotion,
          reduceFlashes: () => this.ctx.prefs.reduceFlashes,
          manifest: this.manifest,
          fauna: {
            idle: this.ctx.feel.fauna.idle,
            ticksPerSecond: TICKS_PER_SECOND,
            still: this.ctx.faunaStill,
          },
          lightIds: () => this.lightIds,
          audio: this.ctx.audio,
          planeScales: {
            near: this.ctx.content.scoring.planes.near.scale,
            mid: this.ctx.content.scoring.planes.mid.scale,
            far: this.ctx.content.scoring.planes.far.scale,
            ver: this.ctx.content.scoring.planes.ver.scale,
          },
        });
      })
      .catch(() => {
        // Offline without the chunk cached: the sand shows without its ground cover.
      });
  }

  private loadFruit(mapBiome: Biome): void {
    this.fruit?.destroy();
    this.fruit = null;
    const gen = ++this.fruitGen;
    this.propFactor = new Map(
      mapBiome.props.map((p) => [
        p.id,
        mapBiome.layers.find((l) => l.id === p.layer)?.scrollFactor ?? 1,
      ]),
    );
    void import('../view/fruit/FruitView')
      .then(async (m) => {
        const spots = await m.loadFruitSpots(mapBiome.id);
        if (gen !== this.fruitGen || spots.length === 0) return;
        this.fruit = new m.FruitView(
          this,
          this.ctx.feel,
          mapBiome,
          this.parallax,
          this.manifest,
          spots,
          this.ctx.audio,
          this.ctx.reducedMotion,
          {
            weapons: this.ctx.content.weapons.weapons,
            charms: this.ctx.content.charms.charms,
            driftPxAtFar: mapBiome.omen.wind?.driftPxAtFar ?? 0,
            farFactor: this.ctx.content.scoring.planes.far.scrollFactor,
            cameraAt: (tick) => this.runner?.cameraAt(tick) ?? null,
          },
        );
      })
      .catch(() => {
        // Offline without the chunk cached: the hunt simply has no fruit sprites.
      });
  }

  /** v1.7c (D-047): what a pellet stopped on, as far as the fruit care (null: it flew on). */
  private pelletStop(
    e: Extract<SimEvent, { type: 'pelletImpact' }>,
    state: SimState,
  ): PelletStop | null {
    const planes = this.ctx.content.scoring.planes;
    if (e.birdId !== null) {
      const id = e.birdId;
      const plane = state.birds.find((b) => b.id === id)?.plane ?? this.birds.positionOf(id)?.plane;
      return plane === undefined ? null : { factor: planes[plane].scrollFactor, creature: true };
    }
    if (e.meerkatId !== undefined) {
      const id = e.meerkatId;
      const c = state.meerkats.find((col) => col.meerkats.some((m) => m.id === id));
      return c === undefined ? null : { factor: planes[c.plane].scrollFactor, creature: true };
    }
    if (e.crateId !== null)
      return {
        factor: planes[this.ctx.content.powerups.crates.plane].scrollFactor,
        creature: true,
      };
    if (e.propId !== null) return { factor: this.propFactor.get(e.propId) ?? 1, creature: false };
    return null;
  }

  private handleEvents(events: readonly SimEvent[], width: number, state: SimState): void {
    // FX first: penalty pops look up where the bird was last drawn, before it is removed.
    this.fx.handle(events, width, state);
    this.birds.handle(events);
    const half = width / 2;
    // v1.4 B: a shot family nest lets its weavers out; they chatter and scold (AudioDirector).
    this.meerkats.handle(events);
    this.spookView?.handle(events, this.ctx.audio, width);
    this.cans.handle(events, this.ctx.audio, width);
    this.farCans.handle(events, this.ctx.audio, width);
    this.makalani?.handle(events, this.ctx.audio, width);
    // v1.8b (D-062): the baboons' barks, screeches and raid sounds.
    this.baboons?.handle(events, state, this.ctx.audio, width);
    this.harvest?.handle(events, state, this.ctx.audio, width);
    this.world.potjie.handle(events);
    if (this.ctx.hook) {
      const log = this.ctx.hook.canLog;
      for (const e of events) {
        if (e.type === 'canKnocked') log.push(`knock:${String(e.points)}`);
        else if (e.type === 'canJuggled') log.push(`juggle:${String(e.chain)}:${String(e.points)}`);
        else if (e.type === 'canLanded' && e.final) log.push('landed');
        else if (e.type === 'canGone') log.push(`weg:${String(e.points)}`);
        // 1.9.3 (D-056): the makalani nuts' events.
        else if (e.type === 'nutKnocked') log.push(`nut-knock:${String(e.points)}`);
        else if (e.type === 'nutJuggled')
          log.push(`nut-juggle:${String(e.chain)}:${String(e.points)}`);
        else if (e.type === 'nutPopped') log.push(`nut-pop:${String(e.points)}`);
        else if (e.type === 'nutLanded' && e.final) log.push('nut-landed');
        else if (e.type === 'nutGone') log.push(`nut-weg:${String(e.points)}`);
      }
      if (log.length > 200) log.splice(0, log.length - 200);
    }
    // v1.7 (D-044): the sentinel's alarm bark and the Familiefoto's camera click.
    for (const e of events) {
      if (e.type === 'meerkatAlarm')
        playMeerkatSound(
          this.ctx.audio,
          'alarm',
          (this.parallax.screenX(e.plane, e.x) - half) / half,
        );
      else if (e.type === 'familiefoto') playMeerkatSound(this.ctx.audio, 'click', 0);
    }
    if (this.ctx.hook) {
      const log = this.ctx.hook.meerkatLog;
      for (const e of events) {
        if (log.length >= 200) break;
        if (e.type === 'meerkatHit') log.push(`hit:${e.points}`);
        else if (e.type === 'meerkatScold') log.push(`scold:${e.points}`);
        else if (e.type === 'meerkatsDived') log.push(`dived:${e.cause}`);
        else if (e.type === 'meerkatAlarm') log.push(`alarm:${e.creature}`);
        else if (e.type === 'familiefoto') log.push('familiefoto');
      }
    }
    this.fruit?.handle(events, state, (e) => this.pelletStop(e, state), width);
    // v1.7d (D-059): the ostriches' puffs and sounds (the lazy veld-life chunk), and the e2e log.
    this.namibLife?.handle(events, state, this.ctx.audio, width);
    if (this.ctx.hook) {
      const log = this.ctx.hook.namibLog;
      for (const e of events) {
        if (log.length >= 200) break;
        if (e.type === 'ostrichHit') log.push(`hit:${e.nest ? 'nest:' : ''}${e.points}`);
        else if (e.type === 'ostrichesRan') log.push(`ran:${e.cause}`);
        else if (e.type === 'ostrichCall') log.push(`call:${e.call}`);
        else if (e.type === 'balloonHit') log.push(`balloon:${e.points}`);
        else if (e.type === 'worldEvent' && e.event === 'balloons')
          log.push(`event:balloons@${e.tick}`);
      }
    }
    // v1.4 B: a shot family nest lets its weavers out; they chatter and scold (AudioDirector).
    // 1.9.4 (review): the scolding and the count come straight from the event, so they never wait
    // for the lazy tree-life chunk; nest shots before it is in are held for its burst.
    for (const e of events) {
      if (e.type !== 'secretPenalty') continue;
      const nest = this.weaverNests.get(e.propId);
      if (nest === undefined) continue;
      const sx = (this.parallax.layer(nest.layer)?.root.x ?? 0) + nest.x;
      this.ctx.audio.weavers(Math.max(-1, Math.min(1, (sx - half) / half)));
      if (this.ctx.hook) this.ctx.hook.weaverBursts++;
      if (this.treeLife === null && this.lifeHeld.length < 16) this.lifeHeld.push(e);
    }
    const stop = (e: Extract<SimEvent, { type: 'pelletImpact' }>): PelletStop | null =>
      this.pelletStop(e, state);
    if (this.treeLife !== null && this.lifeHeld.length > 0) {
      this.treeLife.handle(this.lifeHeld, state, stop);
      this.lifeHeld = [];
    }
    this.treeLife?.handle(events, state, stop);
    // The Skietbaan scores nothing: no Whole-flock stamp sound or slow-mo there (D-037).
    const heard = this.range === null ? events : events.filter((e) => e.type !== 'flockWiped');
    this.ctx.audio.handle(heard, (e) => {
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
      } else if (
        e.type === 'aimEnded' &&
        (e.reason === 'weapon' || e.reason === 'reload' || e.reason === 'blocked')
      ) {
        // v1.3: the sim lowered the sight itself: the input stops holding it too.
        this.mapper?.dropAim();
      } else if (e.type === 'targetBagged') {
        bagged = true;
      } else if (e.type === 'bonusAwarded' && e.bonus === 'twoFlies') {
        this.runner?.hitStop(this.ctx.feel.juice.hitStopTwoFliesMs);
      } else if (e.type === 'flockWiped' && this.range === null) {
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
      this.modeId === 'harvest'
        ? this.ctx.daily.harvestExtras(
            result,
            runner.state.harvest?.crop ?? 0,
            this.shareLog?.grid() ?? '',
          )
        : finished === null || verder === null
          ? finished
          : { ...finished, news: [verder, ...finished.news] };
    // v1.8c (D-063): the Harvest's own tally lines and its local best.
    const harvest =
      this.modeId === 'harvest' ? this.harvestTally(runner.state.harvest, result) : null;
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
        powerups: [...this.usedPowerups],
        outcome,
        ftue,
        extras,
        ...(harvest === null ? {} : { harvest }),
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
              mode: this.modeId === 'daily' || this.modeId === 'harvest' ? this.modeId : 'classic',
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

  /** v1.8c (D-063): the Harvest's tally lines, and its best kept in the save (not when unranked). */
  private harvestTally(h: SimState['harvest'], result: HuntResult): HarvestTally {
    const before = this.ctx.save.data.harvest.best;
    const ranked = !this.ctx.daily.unranked && this.ctx.capture === null;
    const newBest = ranked && (before === null || result.score > before);
    if (ranked)
      this.ctx.save.update((d) => ({
        ...d,
        harvest: {
          best: newBest ? result.score : d.harvest.best,
          played: d.harvest.played + 1,
        },
      }));
    return {
      birds: result.bagged,
      warthogs: h?.warthogsBagged ?? 0,
      baboons: this.harvest?.baboonsBagged ?? 0,
      crop: Math.max(0, Math.floor(h?.crop ?? 0)),
      cropBonus: h?.cropBonus ?? 0,
      bystanderPenalty: h?.bystanderPenalty ?? 0,
      best: newBest ? result.score : before,
      newBest,
    };
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
        this.ctx.classicArea(),
      );
      unlocked = r.unlocked;
      if (r.unlocked !== null)
        line = tOr(bonusKeys(r.unlocked).unlocked, t('tally.verder_unlocked'));
      else if (r.newBest !== null && result.bonus !== null)
        line = fill(tOr(bonusKeys(result.bonus).best, t('title.verder_best')), {
          score: formatScore(result.score),
        });
      if (this.ctx.hook) this.ctx.hook.verderUnlocked = r.unlocked;
      return { ...d, bonusMaps: r.save };
    });
    // v1.4 B (D-039): reaching Die Verste unlocks the Namibië area for good.
    for (const id of this.ctx.grantAreas()) {
      const b = this.ctx.content.biomes.find((x) => x.id === id);
      const area = fill(t('tally.area_unlocked'), {
        area: b === undefined ? id : tOr(b.nameKey, id),
      });
      line = line === null ? area : `${line}  ·  ${area}`;
    }
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
        else if (this.range !== null) this.quitRange();
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
    this.range?.detach();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout);
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.birds.clear();
    this.world.clear();
    this.meerkats.clear();
    this.spookView?.clear();
    this.fruit?.clear();
    this.treeLife?.destroy();
    this.treeLife = null;
    this.treeLifeGen++;
    this.namibLife?.destroy();
    this.namibLife = null;
    this.namibLifeGen++;
    this.tells?.destroy();
    this.tells = null;
    this.tellsGen++;
    this.baboons?.destroy();
    this.baboons = null;
    this.baboonsGen++;
    this.harvest?.destroy();
    this.harvest = null;
    this.harvestGen++;
    this.game.canvas.style.cursor = '';
  }
}

/** resolveMap, or the plain biome for ids this biome lacks (a bad dev ?layout=). */
function safeResolveMap(biome: Biome, layout?: string, bonus?: string, ver = false): ResolvedMap {
  try {
    return resolveMap(biome, layout, bonus, ver);
  } catch {
    return resolveMap(biome, undefined, undefined, ver);
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
