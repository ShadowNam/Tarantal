// Plays one headless hunt with a bot, recording the InputLog and hashing the event stream.
import type { ContentBundle } from '../src/content/schemas';
import { createEventHasher } from '../src/sim/events';
import { createRecorder, type InputLog } from '../src/sim/replay/inputLog';
import { createSim } from '../src/sim/Sim';
import type { AimAssistLevel, HuntResult, InputKind, ModeConfig } from '../src/sim/types';
import { createBot, type BotKind } from './bots';

export interface PlayOptions {
  readonly seed: number;
  readonly bot: BotKind;
  readonly mode: ModeConfig;
  readonly inputKind: InputKind;
  readonly aimAssist?: AimAssistLevel;
  readonly content: ContentBundle;
  readonly contentHash: string;
}

export interface PlayOutcome {
  readonly log: InputLog;
  readonly eventHash: string;
  readonly eventCount: number;
  readonly result: HuntResult;
}

export function playHunt(o: PlayOptions): PlayOutcome {
  const assist = o.aimAssist === undefined ? {} : { aimAssist: o.aimAssist };
  const sim = createSim({
    seed: o.seed,
    content: o.content,
    mode: o.mode,
    inputKind: o.inputKind,
    ...assist,
  });
  const bot = createBot(o.bot, o.seed, o.content, o.inputKind);
  const recorder = createRecorder({
    seed: o.seed,
    contentHash: o.contentHash,
    mode: o.mode,
    inputKind: o.inputKind,
    ...assist,
  });
  const hasher = createEventHasher();
  hasher.add(sim.drainEvents());
  while (!sim.isOver()) {
    const commands = bot.next(sim.snapshot());
    recorder.record(sim.tick, commands);
    sim.step(commands);
    hasher.add(sim.drainEvents());
  }
  return {
    log: recorder.toLog(),
    eventHash: hasher.digest(),
    eventCount: hasher.count,
    result: sim.result(),
  };
}
