// The golden replays: fixed (seed, bot, input) hunts whose event hash must never change by
// accident. Regenerate with `npm run golden:update`.
import type { InputKind } from '../src/sim/types';
import type { BotKind } from './bots';

export interface GoldenCase {
  readonly name: string;
  readonly seed: number;
  readonly bot: BotKind;
  readonly mode: 'classic' | 'daily';
  readonly inputKind: InputKind;
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
];
