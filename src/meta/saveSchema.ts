// SaveData v1 (Tech §11): settings, FTUE, loadout, unlocks, Notaboek, Bird Book, bests, stats,
// (M6) the Season Run in progress plus run stats, and (M7) the Daily Hunt.
// Every section has a default, so a damaged section falls back on its own (save.ts parses each
// section separately) instead of wiping the player's progress.
import { z } from 'zod';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'save.v1';

const volume = z.number().min(0).max(1);
const ids = z.array(z.string().max(80)).max(500);
const count = z.number().int().nonnegative();

export const AimAssistSchema = z.enum(['off', 'low', 'standard']);
export const QualitySettingSchema = z.enum(['auto', 'low', 'medium', 'high']);
export const LanguageSettingSchema = z.enum(['auto', 'en', 'af', 'de', 'nl']);
/** v1.5 (D-041): Oupa's voice language; `same` follows the text (Dutch text → the Afrikaans voice). */
export const VoiceLanguageSettingSchema = z.enum(['same', 'en', 'af', 'de']);

export const SettingsSchema = z.object({
  masterVolume: volume,
  sfxVolume: volume,
  musicVolume: volume,
  /** M10: Oupa's barks (art bible §10: music / effects / voice sliders). */
  voiceVolume: volume,
  /** null = follow prefers-reduced-motion (shake off when the OS asks for reduced motion). */
  screenShake: z.boolean().nullable(),
  reduceFlashes: z.boolean(),
  aimAssist: AimAssistSchema,
  leftHanded: z.boolean(),
  /** The text language (menus, captions, subtitles, share text, tally). */
  language: LanguageSettingSchema,
  /** v1.5 (D-041): the voice language, separate from the text (captions follow the text). */
  voiceLanguage: VoiceLanguageSettingSchema,
  /** v1.5 (D-041): keep the Afrikaans flavour names (guns, maps, charms…) in any text language. */
  afrikaansNames: z.boolean(),
  quality: QualitySettingSchema,
  /** M9 accessibility (GDD §18.3): menu, tally and caption text 1× or `largeTextScale`. */
  textSize: z.enum(['normal', 'large']),
  /** M9: a black outline on all light text (menus, tally, HUD messages, call-outs). */
  highContrast: z.boolean(),
  /** M9: text captions for sound cues. */
  captions: z.boolean(),
  /** M9: the ⛔ badge on every don't-shoot creature (shape + icon, never colour alone). */
  colourBlind: z.boolean(),
  /** M9: holding fire repeats the shot whenever the gun is ready (any weapon). */
  holdToFire: z.boolean(),
  /** v1.1 (D-032, GDD §18.2): touch — the crosshair sits above the finger and the shot goes there. */
  offsetCrosshair: z.boolean(),
  /** v1.7b (D-046): Oupa's comments — voice and bubble, the bubble only, or none at all. */
  oupa: z.enum(['on', 'text', 'off']),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.8,
  voiceVolume: 1,
  screenShake: null,
  reduceFlashes: false,
  aimAssist: 'standard',
  leftHanded: false,
  language: 'auto',
  voiceLanguage: 'same',
  afrikaansNames: false,
  quality: 'auto',
  textSize: 'normal',
  highContrast: false,
  captions: false,
  colourBlind: false,
  holdToFire: false,
  offsetCrosshair: false,
  oupa: 'on',
};

const shortId = z.string().max(80);

/** The in-progress Season Run (src/sim/run RunState), saved after every Padstal (Tech §11). The
 *  shape is checked here; ids are checked against the content when the run is resumed. */
export const RunSaveSchema = z.object({
  v: z.number().int().positive(),
  seed: z.number().int().nonnegative(),
  weapon: shortId,
  pool: z.array(shortId).max(200).readonly(),
  phase: z.enum(['hunt', 'tally', 'padstal', 'victory', 'defeat']),
  huntIndex: z.number().int().nonnegative().max(100),
  charms: z.array(shortId).max(16).readonly(),
  doppies: z.number().int().nonnegative(),
  consumables: z.array(shortId.nullable()).max(8).readonly(),
  rental: shortId.nullable(),
  runShellBonus: z.number().int().nonnegative(),
  padstal: z
    .object({
      offers: z
        .array(
          z.object({
            kind: z.enum(['charm', 'consumable', 'weapon']),
            id: shortId,
            price: z.number().int().nonnegative(),
            bought: z.boolean(),
          }),
        )
        .max(16)
        .readonly(),
      rerolls: z.number().int().nonnegative(),
    })
    .nullable(),
  history: z
    .array(
      z.object({
        huntIndex: z.number().int().nonnegative(),
        score: z.number().int(),
        quota: z.number().int().nonnegative(),
        passed: z.boolean(),
        doppies: z
          .object({
            base: z.number().int(),
            overQuota: z.number().int(),
            interest: z.number().int(),
            boss: z.number().int(),
            found: z.number().int(),
            total: z.number().int(),
          })
          .nullable(),
      }),
    )
    .max(100)
    .readonly(),
});

/** M7: Daily Hunt streak, freezes, cosmetics and recent official attempts (Tech §11). */
export const DailySaveSchema = z.object({
  streak: count,
  bestStreak: count,
  /** Best official daily score (null = none finished yet). */
  bestScore: z.number().int().nullable(),
  /** UTC day number of the last official attempt (null = never played). */
  lastDay: z.number().int().nonnegative().nullable(),
  /** ISO weeks ("2026-W43") whose free freeze is used. */
  freezesUsed: z.array(z.string().regex(/^\d{4}-W\d{2}$/)).max(60),
  /** Streak-milestone cosmetics owned (GDD §15: cosmetics only). */
  cosmetics: ids,
  /** Official attempts, oldest first; score null = started but not finished. */
  history: z
    .array(
      z.object({
        day: z.number().int().nonnegative(),
        score: z.number().int().nullable(),
        rank: z.string().max(80).nullable(),
        wholeFlocks: count,
        grid: z.string().max(40),
      }),
    )
    .max(400),
});
export type DailySave = z.infer<typeof DailySaveSchema>;

/** v1.2 (D-033): bonus maps — today's unlocks (UTC day) and each bonus map's best. */
export const BonusMapSaveSchema = z.object({
  /** UTC day the unlocks were earned on (null = never); other days' unlocks are gone. */
  day: z.number().int().nonnegative().nullable(),
  /** "biome/bonus" keys unlocked on `day`. */
  unlocked: z.array(z.string().max(120)).max(100),
  /** "biome/bonus" → best score and its rank. */
  bests: z.record(
    z.string().max(120),
    z.object({ score: z.number().int(), rank: z.string().max(80) }),
  ),
});
export type BonusMapSave = z.infer<typeof BonusMapSaveSchema>;

export const RunAdsSchema = z.object({
  /** The run these belong to (RunState.seed); another seed means a fresh run: all unused. */
  seed: z.number().int().nonnegative().nullable(),
  retries: count,
  /** Hunt indexes whose Doppies were doubled. */
  doubled: z.array(z.number().int().nonnegative()).max(40),
});
export type RunAds = z.infer<typeof RunAdsSchema>;

const sections = {
  settings: SettingsSchema,
  ftue: z.object({ done: z.boolean(), skipped: z.boolean(), step: z.string().max(40) }),
  /** One-time UI notices (e.g. the iOS Add to Home Screen banner) already dismissed. */
  notices: ids,
  /** v1.3: `sights` = the sight fitted to each rifle (weapon id → sight id; older saves: none). */
  loadout: z.object({
    weapon: z.string().max(80),
    sights: z.record(z.string().max(80), z.string().max(80)).default({}),
  }),
  /** v1.3: `sights` unlocked by Notaboek challenges (older saves: none). */
  unlocks: z.object({ weapons: ids, sights: ids.default([]) }),
  notaboek: z.object({
    /** Challenge id → progress (counts toward `target`). */
    progress: z.record(z.string().max(80), count),
    done: ids,
  }),
  birdBook: z.object({ creatures: ids, secrets: ids }),
  /** Biome id → best Classic score and its rank. */
  bests: z.record(
    z.string().max(80),
    z.object({ score: z.number().int(), rank: z.string().max(80) }),
  ),
  bestRank: z.string().max(80).nullable(),
  stats: z.object({ hunts: count, bagged: count, shots: count }),
  /** M6: the Season Run in progress (null = none), and finished runs. */
  run: RunSaveSchema.nullable(),
  runStats: z.object({ started: count, won: count, bestHunts: count }),
  /** M7: the Daily Hunt (a new section: older saves get the default, no migration). */
  daily: DailySaveSchema,
  /**
   * M9: rewarded ads used in the Season Run with this seed (D-026): "Oupa se tweede kans"
   * retries and the hunts whose Doppies were doubled. Kept outside RunState (the sim's).
   */
  runAds: RunAdsSchema,
  /** M9: this device's title-screen benchmark (Settings → quality "auto" follows it). */
  device: z.object({
    benchTier: z.enum(['low', 'medium', 'high']).nullable(),
    benchAvgMs: z.number().nonnegative().max(10_000).nullable(),
  }),
  /** v1.0.1 (D-028 §3): UTC day of the last hunt started, for Oupa's first-hunt-of-the-day bark
   *  (a new section: older saves get the default, no migration). */
  barks: z.object({ lastHuntDay: z.number().int().nonnegative().nullable() }),
  /** v1.2: bonus maps (a new section: older saves get the default, no migration). */
  bonusMaps: BonusMapSaveSchema,
  /** v1.4 B (D-039): area packs unlocked for good (Namibië) and the area Classic plays (null =
   *  the home area). A new section: older saves get the default, no migration. */
  areas: z.object({ unlocked: ids, classic: z.string().max(80).nullable() }),
  /** v1.7b (D-046): power-ups and crate guns picked up at least once (the first pickup gets the
   *  long card; the Gun Shed marks the others "Not found yet"). A new section: no migration. */
  powerups: z.object({ seen: ids }),
} as const;

export const SaveSchema = z.object({ v: z.literal(SAVE_VERSION), ...sections });
export type SaveData = z.infer<typeof SaveSchema>;
export type SaveSection = keyof typeof sections;
export const SAVE_SECTIONS = sections;

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    ftue: { done: false, skipped: false, step: '' },
    notices: [],
    loadout: { weapon: 'dubbelloop', sights: {} },
    unlocks: { weapons: [], sights: [] },
    notaboek: { progress: {}, done: [] },
    birdBook: { creatures: [], secrets: [] },
    bests: {},
    bestRank: null,
    stats: { hunts: 0, bagged: 0, shots: 0 },
    run: null,
    runStats: { started: 0, won: 0, bestHunts: 0 },
    runAds: { seed: null, retries: 0, doubled: [] },
    device: { benchTier: null, benchAvgMs: null },
    barks: { lastHuntDay: null },
    bonusMaps: { day: null, unlocked: [], bests: {} },
    areas: { unlocked: [], classic: null },
    powerups: { seen: [] },
    daily: {
      streak: 0,
      bestStreak: 0,
      bestScore: null,
      lastDay: null,
      freezesUsed: [],
      cosmetics: [],
      history: [],
    },
  };
}
