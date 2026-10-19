// Replay verification (Tech §3.10): re-run a hunt from its InputLog and compare the event hash.
// Used by golden tests now, and by bug reports, ghosts and (v1.x) leaderboard validation later.
import type { ContentBundle } from '../../content/schemas';
import { createEventHasher } from '../events';
import { createSim } from '../Sim';
import type { Command, HuntResult } from '../types';
import { absoluteTicks, type InputLog } from './inputLog';

export interface ReplayOutcome {
  readonly eventHash: string;
  readonly eventCount: number;
  readonly result: HuntResult;
}

export function runReplay(log: InputLog, content: ContentBundle): ReplayOutcome {
  const sim = createSim({ seed: log.seed, content, mode: log.mode, inputKind: log.inputKind });
  const hasher = createEventHasher();
  hasher.add(sim.drainEvents());
  const ticks = absoluteTicks(log);
  let i = 0;
  while (!sim.isOver()) {
    const now: Command[] = [];
    while (i < ticks.length && (ticks[i] ?? Infinity) <= sim.tick) {
      const entry = log.commands[i];
      if (entry !== undefined) now.push(entry[1]);
      i++;
    }
    sim.step(now);
    hasher.add(sim.drainEvents());
  }
  return { eventHash: hasher.digest(), eventCount: hasher.count, result: sim.result() };
}

export type VerifyResult =
  | { readonly ok: true; readonly outcome: ReplayOutcome }
  | { readonly ok: false; readonly reason: string; readonly outcome?: ReplayOutcome };

/** Checks that a log was recorded against this content and reproduces the expected events. */
export function verifyReplay(
  log: InputLog,
  content: ContentBundle,
  contentHash: string,
  expectedEventHash: string,
): VerifyResult {
  if (log.contentHash !== contentHash) {
    return {
      ok: false,
      reason: `content changed: log ${log.contentHash.slice(0, 12)}…, now ${contentHash.slice(0, 12)}…`,
    };
  }
  const outcome = runReplay(log, content);
  if (outcome.eventHash !== expectedEventHash) {
    return {
      ok: false,
      reason: `event hash ${outcome.eventHash} ≠ expected ${expectedEventHash}`,
      outcome,
    };
  }
  return { ok: true, outcome };
}
