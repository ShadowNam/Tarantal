// v1.9 (D-066) the veld soundscape in the game (lazy chunk: HuntScene imports it after the first
// gesture, so the first download carries none of it). It owns the content (client/soundscape.json),
// loads the `soundscape` group's recordings (only once a hunt has started, or after
// titleLoadDelayMs on the title — never before START), keeps the penalty creatures' quiet windows
// (warningForecast.ts), and each frame steps the scheduler (soundscape.ts) on the hunt's tick, or
// on the title's own clock, into the AudioDirector's lowest-priority voice.
import raw from '../../../content/client/soundscape.json';
import type { ContentBundle, Soundscape } from '../../content/schemas';
import { parseSoundscape } from '../../content/soundscape';
import { TICKS_PER_SECOND } from '../../sim/clock';
import type { SimEvent } from '../../sim/events';
import type { ModeConfig } from '../../sim/types';
import type { FinalSound } from '../assets/AssetManifest';
import { fetchAssetIndex, loadBytes } from '../assets/finalLoader';
import { loadVoiceIndex } from '../assets/voiceIndex';
import type { AudioDirector } from './AudioDirector';
import type { ForecastSim } from './forecastSim';
import {
  resolveSoundscapeLight,
  SoundscapeDirector,
  type CallOutcome,
  type SoundscapeCall,
  type SoundscapeLogEntry,
  type SoundscapeSink,
} from './soundscape';
import { SOUNDSCAPE_GROUP, soundscapeSounds } from './soundscapeKeys';
import { makingRoom, ReenbuiCues, type CueOutcome, type ReenbuiTiming } from './reenbuiCues';
import { forecastWarnings, WarningQuiet, type ForecastEvent } from './warningForecast';

const FILE_TIMEOUT_MS = 15_000;

/** What the test hook shows (`__TM_HOOK__.soundscape`). */
export interface SoundscapeHook {
  area: string | null;
  light: string | null;
  title: boolean;
  /** Recordings that arrived (of the group's). */
  files: number;
  /** Recent offered calls, newest last (key, due tick, frame tick, distance, pan, outcome). */
  calls: SoundscapeLogEntry[];
  counts: Record<CallOutcome, number>;
  /** The hunt's forecast penalty-creature events (ticks). */
  warnings: ForecastEvent[];
  /** Soundscape voices playing now (the director's wall-clock count). */
  voices: number;
  /** v1.10 (D-067): a Reënbui this hunt — whether the calls make room now, and its cues'
   *  outcomes so far (null: no Reënbui). */
  reenbui: { room: boolean; counts: Record<CueOutcome, number> } | null;
}

/** Where and when the soundscape plays. */
export interface SoundscapeSetup {
  readonly area: string;
  /** The lights as drawn (a special day's light replaces the map's). */
  readonly lights: readonly string[];
  /** The map's own layout and bonus lights. */
  readonly mapLights: readonly string[];
  readonly title: boolean;
  /** A hunt's seed and mode (the forecast); null on the title. */
  readonly hunt: { readonly seed: number; readonly mode: ModeConfig } | null;
  readonly startTick: number;
}

export function loadSoundscapeContent(): Soundscape {
  const r = parseSoundscape(raw);
  if (!r.ok) throw new Error(`content/client/soundscape.json invalid: ${r.errors.join('; ')}`);
  return r.soundscape;
}

export class SoundscapeRuntime implements SoundscapeSink {
  readonly sc: Soundscape;
  private readonly director: SoundscapeDirector;
  private readonly warn: WarningQuiet;
  /** Event id → its creature, in the area playing (worldEvent → arrival). */
  private eventCreature = new Map<string, string>();
  private loading: Promise<void> | null = null;
  /** The title's own load (titleLoadDelayMs after start) is tried once; hunts call load(). */
  private titleLoadTried = false;
  private readonly createdAt: number;
  readonly hook: SoundscapeHook | null;
  private scapeArea: string | null = null;
  /** The area's call sounds (decoded while it is on screen). */
  private areaSounds: string[] = [];
  /** v1.10 (D-067): this hunt's Reënbui (the sim's phase ticks) and its cues. */
  private reenbui: ReenbuiTiming | null = null;
  private readonly cues: ReenbuiCues;

  constructor(
    private readonly audio: AudioDirector,
    private readonly content: ContentBundle,
    hookOn: boolean,
    now: number,
    /** The sim's schedule functions (forecastSim.ts, from the main bundle). */
    private readonly sim: ForecastSim,
    /** e2e only (?soundscapeBoost): every rate × this. */
    boost = 1,
  ) {
    const sc = loadSoundscapeContent();
    this.sc =
      boost === 1
        ? sc
        : {
            ...sc,
            areas: Object.fromEntries(
              Object.entries(sc.areas).map(([a, l]) => [
                a,
                l.map((e) => ({ ...e, perMinute: e.perMinute * boost })),
              ]),
            ),
          };
    this.director = new SoundscapeDirector(this.sc, hookOn);
    this.cues = new ReenbuiCues(this.sc.reenbui);
    const warned = Object.values(this.sc.calls).flatMap((c) =>
      c.warns === undefined ? [] : [c.warns],
    );
    const t = (ms: number): number => (ms * TICKS_PER_SECOND) / 1000;
    this.warn = new WarningQuiet(
      warned,
      t(this.sc.quietBeforeEventMs),
      t(this.sc.quietAfterEventMs),
    );
    this.createdAt = now;
    this.hook = hookOn
      ? {
          area: null,
          light: null,
          title: true,
          files: 0,
          calls: this.director.log ?? [],
          counts: this.director.counts,
          warnings: [],
          voices: 0,
          reenbui: null,
        }
      : null;
  }

  /** Starts loading the recordings (once): a hunt has started, or the title waited long enough. */
  load(): Promise<void> {
    this.loading ??= this.fetchFiles();
    return this.loading;
  }

  private async fetchFiles(): Promise<void> {
    const format = this.audio.fileFormat();
    // A browser that plays neither Ogg nor MP3 gets no files at all (never asked again).
    if (format === null) return;
    // The same delivery switch as every sound (and the voice packs): no index, or an index
    // without any audio, means nothing was delivered — the soundscape stays silent then.
    const main = await fetchAssetIndex(FILE_TIMEOUT_MS);
    if (main.index === null || Object.keys(main.index.audio).length === 0) return;
    const voice = await loadVoiceIndex();
    if (voice === null) {
      // A failure is forgotten: the next hunt's load() tries again (frame() does not retry).
      this.loading = null;
      return;
    }
    const keys = new Set(soundscapeSounds(this.sc));
    const files = await Promise.all(
      Object.entries(voice.audio)
        .filter(([key, e]) => e.group === SOUNDSCAPE_GROUP && keys.has(key))
        .map(async ([key, entry]): Promise<FinalSound | null> => {
          const bytes = await loadBytes(entry[format].path, FILE_TIMEOUT_MS);
          return bytes === null ? null : { key, entry, bytes, format };
        }),
    );
    const got = files.filter((f): f is FinalSound => f !== null);
    this.audio.addRecorded(got);
    if (this.hook) this.hook.files = got.length;
  }

  /** The area and moment on screen: a new schedule, the area's calls decoded. */
  setScene(s: SoundscapeSetup): void {
    const { light, hazeDb } = resolveSoundscapeLight(this.sc, s.lights, s.mapLights);
    const seed = s.hunt?.seed ?? this.sc.titleSeed;
    this.director.start({
      area: s.area,
      light,
      hazeDb,
      seed,
      title: s.title,
      startTick: s.startTick,
    });
    if (this.scapeArea !== s.area) {
      this.scapeArea = s.area;
      const sounds = (this.sc.areas[s.area] ?? []).flatMap((e) => {
        const c = this.sc.calls[e.call];
        return c === undefined ? [] : [c.sound];
      });
      this.areaSounds = [...new Set(sounds)];
      this.audio.setSoundscapeKeys(this.areaSounds);
    } else if (this.reenbui !== null) {
      // Same area after a Reënbui hunt: release the event's sounds (only the area's stay decoded).
      this.audio.setSoundscapeKeys(this.areaSounds);
    }
    // A new scene: no Reënbui until a hunt's snapshot says so (frame()).
    this.reenbui = null;
    this.cues.reset(null);
    if (this.hook) this.hook.reenbui = null;
    const watched = new Set(this.warnedCreatures());
    const forecast =
      s.hunt === null
        ? []
        : forecastWarnings(this.content, s.hunt.seed, s.hunt.mode, watched, this.sim);
    this.warn.reset(forecast);
    const biome = this.content.biomes.find((b) => b.id === s.area);
    this.eventCreature = new Map(
      (biome?.events ?? []).flatMap((e) =>
        e.creature !== undefined && watched.has(e.creature) ? [[e.id, e.creature] as const] : [],
      ),
    );
    if (this.hook) {
      this.hook.area = s.area;
      this.hook.light = light;
      this.hook.title = s.title;
      this.hook.warnings = forecast;
    }
  }

  private warnedCreatures(): string[] {
    return Object.values(this.sc.calls).flatMap((c) => (c.warns === undefined ? [] : [c.warns]));
  }

  /** Nothing plays (a hunt ended into the tally, the Skietbaan). */
  stop(): void {
    this.director.stop();
  }

  /**
   * Once a frame: the hunt's tick, its birds and this frame's events (null on the title). On the
   * title it also starts the file load once titleLoadDelayMs has passed.
   */
  frame(
    tick: number,
    birds: readonly { readonly creature: string }[] | null,
    events: readonly SimEvent[] | null,
    now: number,
    /** v1.10 (D-067): the hunt's Reënbui from its snapshot (null: none; absent: the title). */
    reenbui?: ReenbuiTiming | null,
    /** v1.12 (D-069): Brakkie is barking, yelping or digging now (the snapshot's phase). */
    dogLoud = false,
  ): void {
    this.dogLoud = dogLoud;
    if (
      !this.titleLoadTried &&
      this.loading === null &&
      now - this.createdAt >= this.sc.titleLoadDelayMs
    ) {
      this.titleLoadTried = true;
      void this.load();
    }
    if (birds !== null) this.warn.observe(tick, birds);
    if (events !== null)
      for (const e of events)
        if (e.type === 'worldEvent') {
          const c = this.eventCreature.get(e.event);
          if (c !== undefined) this.warn.arrived(c, e.tick);
        }
    if (reenbui !== undefined) this.followReenbui(tick, reenbui);
    this.director.step(tick, this);
    if (this.reenbui !== null)
      this.cues.step(tick, (c) => {
        const call = this.sc.calls[c.call];
        if (call === undefined) return 'missing';
        const dist = this.sc.distances[c.distance];
        return this.audio.ambient(
          call.sound,
          0,
          c.levelDb + dist.levelDb,
          dist.lowpassHz,
          this.sc.reenbui.maxVoices,
          this.sc.reserveVoices,
        );
      });
    if (this.hook) {
      this.hook.voices = this.audio.ambientPlaying;
      if (this.hook.reenbui !== null) this.hook.reenbui.room = this.room(tick);
    }
  }

  play(c: Readonly<SoundscapeCall>): CallOutcome {
    return this.audio.ambient(
      c.key,
      c.pan,
      c.levelDb,
      c.lowpassHz,
      this.sc.maxVoices,
      this.sc.reserveVoices,
    );
  }

  quiet(creature: string, tick: number): boolean {
    return this.warn.quiet(creature, tick);
  }

  /** v1.10 (D-067): every call makes room for a Reënbui's storm and rain; v1.12 (D-069) and for
   *  Brakkie's bark, yelp or dig (his sounds are never masked by a far call). */
  room(tick: number): boolean {
    return this.dogLoud || makingRoom(this.sc.reenbui, this.reenbui, tick);
  }

  /** v1.12 (D-069): Brakkie loud this frame (from the snapshot, read only: lesson 36). */
  private dogLoud = false;

  /** v1.10 (D-067): the hunt's Reënbui from its snapshot: a new one gets its cues and its sounds
   *  decoded (with the area's); none keeps them released. */
  private followReenbui(tick: number, v: ReenbuiTiming | null): void {
    const same = v === null ? this.reenbui === null : this.reenbui?.buildupTick === v.buildupTick;
    if (same) return;
    this.reenbui =
      v === null
        ? null
        : {
            buildupTick: v.buildupTick,
            dropsTick: v.dropsTick,
            swarmTick: v.swarmTick,
            easingTick: v.easingTick,
            endTick: v.endTick,
            withStorm: v.withStorm,
          };
    this.cues.reset(this.reenbui, tick);
    const own = this.sc.reenbui.cues.flatMap((c) => {
      const call = this.sc.calls[c.call];
      return call === undefined ? [] : [call.sound];
    });
    this.audio.setSoundscapeKeys(
      this.reenbui === null ? this.areaSounds : [...new Set([...this.areaSounds, ...own])],
    );
    if (this.hook)
      this.hook.reenbui = this.reenbui === null ? null : { room: false, counts: this.cues.counts };
  }
}
