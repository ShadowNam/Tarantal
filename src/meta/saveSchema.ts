// SaveData v1 (Tech §11): settings, FTUE, loadout, unlocks, Notaboek, Bird Book, bests, stats,
// and (M6) the Season Run in progress plus run stats.
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
export const LanguageSettingSchema = z.enum(['auto', 'en', 'af']);

export const SettingsSchema = z.object({
  masterVolume: volume,
  sfxVolume: volume,
  musicVolume: volume,
  /** null = follow prefers-reduced-motion (shake off when the OS asks for reduced motion). */
  screenShake: z.boolean().nullable(),
  reduceFlashes: z.boolean(),
  aimAssist: AimAssistSchema,
  leftHanded: z.boolean(),
  language: LanguageSettingSchema,
  quality: QualitySettingSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.8,
  screenShake: null,
  reduceFlashes: false,
  aimAssist: 'standard',
  leftHanded: false,
  language: 'auto',
  quality: 'auto',
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

const sections = {
  settings: SettingsSchema,
  ftue: z.object({ done: z.boolean(), skipped: z.boolean(), step: z.string().max(40) }),
  /** One-time UI notices (e.g. the iOS Add to Home Screen banner) already dismissed. */
  notices: ids,
  loadout: z.object({ weapon: z.string().max(80) }),
  unlocks: z.object({ weapons: ids }),
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
    loadout: { weapon: 'dubbelloop' },
    unlocks: { weapons: [] },
    notaboek: { progress: {}, done: [] },
    birdBook: { creatures: [], secrets: [] },
    bests: {},
    bestRank: null,
    stats: { hunts: 0, bagged: 0, shots: 0 },
    run: null,
    runStats: { started: 0, won: 0, bestHunts: 0 },
  };
}
