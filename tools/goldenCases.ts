// The golden replays: fixed (seed, bot, input) hunts whose event hash must never change by
// accident. Regenerate with `npm run golden:update`.
import type { AimAssistLevel, InputKind, ModeConfig } from '../src/sim/types';
import type { BotKind } from './bots';

export interface GoldenCase {
  readonly name: string;
  readonly seed: number;
  readonly bot: BotKind;
  readonly mode: 'classic' | 'daily' | 'ftue' | 'seasonHunt';
  readonly inputKind: InputKind;
  readonly aimAssist?: AimAssistLevel;
  /** Full mode config when `{ id: mode }` is not enough (Season Run hunts). */
  readonly modeConfig?: ModeConfig;
}

/** A Season Run hunt on the Karoo stand-in with this season block. */
function seasonMode(season: NonNullable<ModeConfig['season']>): ModeConfig {
  return { id: 'seasonHunt', biome: 'karoo-autumn', weapon: 'dubbelloop', season };
}

export interface GoldenReplay extends GoldenCase {
  readonly contentHash: string;
  /** base64url InputLog. */
  readonly log: string;
  readonly expected: {
    readonly eventHash: string;
    readonly eventCount: number;
    readonly score: number;
  };
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: 'classic-42-random-pointer',
    seed: 42,
    bot: 'random',
    mode: 'classic',
    inputKind: 'pointer',
  },
  { name: 'classic-7-aim-pointer', seed: 7, bot: 'aim', mode: 'classic', inputKind: 'pointer' },
  { name: 'daily-2026-aim-touch', seed: 2026, bot: 'aim', mode: 'daily', inputKind: 'touch' },
  // M3: a hunt that escalates flocks (alert → run → flush, Vuvuzela, Whole Flock).
  {
    name: 'classic-11-competent-pointer',
    seed: 11,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
  },
  // M5: touch with the Settings aim assist at 'low' (replay v2 records the level).
  {
    name: 'classic-7-aim-touch-lowassist',
    seed: 7,
    bot: 'aim',
    mode: 'classic',
    inputKind: 'touch',
    aimAssist: 'low',
  },
  // M5: the FTUE hunt (slower pacing, Bles spook and forced flush beats, generous first hit).
  { name: 'ftue-3-aim-touch', seed: 3, bot: 'aim', mode: 'ftue', inputKind: 'touch' },
  // M6: Season Run hunts (charms in slot order, Boss Rules, run shell bonus; InputLog v3).
  {
    name: 'season-herfs-boss-competent',
    seed: 12,
    bot: 'competent',
    mode: 'seasonHunt',
    inputKind: 'pointer',
    modeConfig: seasonMode({
      kind: 'boss',
      boss: 'generaal',
      charms: ['grondwerk', 'vlerkskoot', 'rooi_patrone', 'kettingreaksie', 'generaal_se_pot'],
      consumables: [null, null],
      rental: null,
      runShellBonus: 1,
    }),
  },
  {
    name: 'season-winter-omen-competent',
    seed: 31,
    bot: 'competent',
    mode: 'seasonHunt',
    inputKind: 'touch',
    modeConfig: seasonMode({
      kind: 'omen',
      boss: null,
      charms: [
        'bles_die_plaashond',
        'windleser',
        'stampede_kenner',
        'haelstorm',
        'kwevoel_se_seen',
      ],
      consumables: ['boeretroos', null],
      rental: 'voorlaaier',
      runShellBonus: 0,
    }),
  },
  {
    name: 'season-stormvoel-boss-competent',
    seed: 5,
    bot: 'competent',
    mode: 'seasonHunt',
    inputKind: 'pointer',
    modeConfig: seasonMode({
      kind: 'boss',
      boss: 'stormvoel',
      charms: ['fluitjie', 'boeretroos_fles', 'hele_swerm', 'geheime_resep', 'hadeda_fluit'],
      consumables: [null, null],
      rental: null,
      runShellBonus: 0,
    }),
  },
  // M8: one Classic hunt per new weapon (Kettie stones in flight, per-shell reloads, silent misses).
  {
    name: 'classic-21-kettie-competent-pointer',
    seed: 21,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', weapon: 'kettie' },
  },
  {
    name: 'classic-22-windbuks-competent-touch',
    seed: 22,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'touch',
    modeConfig: { id: 'classic', weapon: 'windbuks' },
  },
  {
    name: 'classic-23-pomp-competent-pointer',
    seed: 23,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', weapon: 'pomp' },
  },
  {
    name: 'season-kuifkop-boss-pomp-competent',
    seed: 24,
    bot: 'competent',
    mode: 'seasonHunt',
    inputKind: 'pointer',
    modeConfig: {
      ...seasonMode({
        kind: 'boss',
        boss: 'kuifkop_koning',
        charms: ['snelhand'],
        consumables: [null, null],
        rental: null,
        runShellBonus: 0,
      }),
      weapon: 'pomp',
    },
  },
  // M8 (PR B): Winter · Bushveld — Classic (Ou Grys peeks, flocks that run), a Daily with the
  // glare omen, and the Season Run boss hunt with Ou Grys's own rule.
  {
    name: 'classic-31-bushveld-competent-pointer',
    seed: 31,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', biome: 'bushveld-winter' },
  },
  {
    name: 'daily-32-bushveld-aim-touch',
    seed: 32,
    bot: 'aim',
    mode: 'daily',
    inputKind: 'touch',
    modeConfig: { id: 'daily', biome: 'bushveld-winter' },
  },
  {
    name: 'season-winter-boss-bushveld-competent',
    seed: 33,
    bot: 'competent',
    mode: 'seasonHunt',
    inputKind: 'pointer',
    modeConfig: {
      id: 'seasonHunt',
      biome: 'bushveld-winter',
      weapon: 'dubbelloop',
      season: {
        kind: 'boss',
        boss: 'ou_grys',
        charms: ['vlerkskoot'],
        consumables: [null, null],
        rental: null,
        runShellBonus: 0,
      },
    },
  },
  // M8 (PR C): Lente · Okavango — Classic (water splashes, kuifkop hops), a Daily with the
  // sun-showers, a silent Windbuks hunt (splashes are its only noise) and the Kuifkop Koning boss
  // hunt with his own rule.
  {
    name: 'classic-41-okavango-competent-pointer',
    seed: 41,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', biome: 'okavango-spring' },
  },
  {
    name: 'daily-42-okavango-aim-touch',
    seed: 42,
    bot: 'aim',
    mode: 'daily',
    inputKind: 'touch',
    modeConfig: { id: 'daily', biome: 'okavango-spring' },
  },
  {
    name: 'classic-43-okavango-windbuks-competent-pointer',
    seed: 43,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', biome: 'okavango-spring', weapon: 'windbuks' },
  },
  {
    name: 'season-lente-boss-okavango-competent',
    seed: 44,
    bot: 'competent',
    mode: 'seasonHunt',
    inputKind: 'pointer',
    modeConfig: {
      id: 'seasonHunt',
      biome: 'okavango-spring',
      weapon: 'dubbelloop',
      season: {
        kind: 'boss',
        boss: 'kuifkop_koning',
        charms: ['snelhand', 'vlerkskoot'],
        consumables: [null, null],
        rental: null,
        runShellBonus: 0,
      },
    },
  },
  // M8 (PR D): Somer · Kalahari — Classic (the Stormvoël brings his own lightning), a Daily with
  // heat haze then the storm, a Kettie hunt in the storm, and the Stormvoël boss hunt.
  {
    name: 'classic-51-kalahari-competent-pointer',
    seed: 51,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', biome: 'kalahari-summer' },
  },
  {
    name: 'daily-52-kalahari-aim-touch',
    seed: 52,
    bot: 'aim',
    mode: 'daily',
    inputKind: 'touch',
    modeConfig: { id: 'daily', biome: 'kalahari-summer' },
  },
  {
    name: 'daily-53-kalahari-kettie-competent-pointer',
    seed: 53,
    bot: 'competent',
    mode: 'daily',
    inputKind: 'pointer',
    modeConfig: { id: 'daily', biome: 'kalahari-summer', weapon: 'kettie' },
  },
  {
    name: 'season-somer-boss-kalahari-competent',
    seed: 54,
    bot: 'competent',
    mode: 'seasonHunt',
    inputKind: 'pointer',
    modeConfig: {
      id: 'seasonHunt',
      biome: 'kalahari-summer',
      weapon: 'dubbelloop',
      season: {
        kind: 'boss',
        boss: 'stormvoel',
        charms: ['vlerkskoot', 'oupa_se_bril'],
        consumables: [null, null],
        rental: null,
        runShellBonus: 0,
      },
    },
  },
  // M7: the Daily Hunt of the day in the case names on the Karoo, omen on. The seed is pinned to
  // the value dailySeed(<that day>, contentHash) had at M7 (D-025): derived live, it changed with every
  // content edit and so did these hashes. daily.spec.ts still checks the browser derives the same
  // daily seed as Node, and replays these logs in Chromium and WebKit.
  {
    name: 'daily-2026-10-21-competent-pointer',
    seed: 1286298468,
    bot: 'competent',
    mode: 'daily',
    inputKind: 'pointer',
    modeConfig: { id: 'daily', biome: 'karoo-autumn' },
  },
  {
    name: 'daily-2026-10-21-aim-touch',
    seed: 1286298468,
    bot: 'aim',
    mode: 'daily',
    inputKind: 'touch',
    modeConfig: { id: 'daily', biome: 'karoo-autumn' },
  },
  // v1.2 (D-033): weekday layouts and Verder (InputLog v4 carries the map). The cases above
  // carry no layout: they replay on the plain biome, as every log made before v1.2 does.
  {
    name: 'classic-61-karoo-thu-competent-pointer',
    seed: 61,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', layout: 'thu' },
  },
  {
    name: 'classic-62-karoo-fri-competent-touch',
    seed: 62,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'touch',
    modeConfig: { id: 'classic', layout: 'fri' },
  },
  {
    name: 'classic-63-karoo-sat-aim-pointer',
    seed: 63,
    bot: 'aim',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', layout: 'sat' },
  },
  {
    name: 'classic-64-karoo-mon-verder-competent-pointer',
    seed: 64,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: { id: 'classic', layout: 'mon', bonus: 'verder' },
  },
  {
    name: 'daily-65-bushveld-wed-aim-touch',
    seed: 65,
    bot: 'aim',
    mode: 'daily',
    inputKind: 'touch',
    modeConfig: { id: 'daily', biome: 'bushveld-winter', layout: 'wed' },
  },
  // v1.3 (D-036): the Ver plane and rifles (hold to zoom, release to fire; InputLog v5).
  {
    name: 'classic-71-karoo-nogverder-tweetwee-scope-competent-pointer',
    seed: 71,
    bot: 'competent',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: {
      id: 'classic',
      layout: 'mon',
      bonus: 'nogVerder',
      weapon: 'twee_twee',
      sight: 'scope_small',
    },
  },
  {
    name: 'classic-72-karoo-dieverste-tweetwee-iron-aim-touch',
    seed: 72,
    bot: 'aim',
    mode: 'classic',
    inputKind: 'touch',
    modeConfig: { id: 'classic', layout: 'thu', bonus: 'dieVerste', weapon: 'twee_twee' },
  },
  {
    name: 'classic-73-bushveld-nogverder-pomp-plinker-pointer',
    seed: 73,
    bot: 'plinker',
    mode: 'classic',
    inputKind: 'pointer',
    modeConfig: {
      id: 'classic',
      biome: 'bushveld-winter',
      layout: 'sat',
      bonus: 'nogVerder',
      weapon: 'pomp',
    },
  },
];
