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
  /** M7: a Daily Hunt of this UTC day; `seed` is then dailySeed(day, contentHash), set by
   *  golden:update (the value written here is a placeholder). */
  readonly dailyDate?: string;
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
  // M7: the Daily Hunt of a fixed UTC day — seed from dailySeed(day, contentHash), the day's
  // rotation biome, omen on. The same logs are replayed in Chromium and WebKit (daily.spec.ts).
  {
    name: 'daily-2026-10-21-competent-pointer',
    seed: 0,
    bot: 'competent',
    mode: 'daily',
    inputKind: 'pointer',
    modeConfig: { id: 'daily', biome: 'karoo-autumn' },
    dailyDate: '2026-10-21',
  },
  {
    name: 'daily-2026-10-21-aim-touch',
    seed: 0,
    bot: 'aim',
    mode: 'daily',
    inputKind: 'touch',
    modeConfig: { id: 'daily', biome: 'karoo-autumn' },
    dailyDate: '2026-10-21',
  },
];
