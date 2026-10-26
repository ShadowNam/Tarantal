// Golden replays: recorded hunts whose event hash must not change by accident. If this fails
// after an intentional sim or content change, run `npm run golden:update` and say why in the
// commit message (CLAUDE.md).
import { describe, expect, it } from 'vitest';
import { loadContent, loadContentHash } from '../../../tools/testContent';
import type { GoldenReplay } from '../../../tools/goldenCases';
import replays from './golden/replays.json';
import { absoluteTicks, decodeInputLogText } from './inputLog';
import { createSim } from '../Sim';
import type { Command } from '../types';
import { runReplay, verifyReplay } from './verify';

const golden: readonly GoldenReplay[] = replays as GoldenReplay[];
const content = loadContent();

describe('golden replays', () => {
  it('exist', () => {
    expect(golden.length).toBeGreaterThanOrEqual(3);
  });

  for (const g of golden) {
    it(`${g.name} reproduces its recorded events`, () => {
      const log = decodeInputLogText(g.log);
      expect(log.seed).toBe(g.seed);
      const outcome = runReplay(log, content);
      expect(
        {
          eventHash: outcome.eventHash,
          eventCount: outcome.eventCount,
          score: outcome.result.score,
        },
        'replay diverged — if the change was intentional run `npm run golden:update`',
      ).toEqual(g.expected);
      expect(log.contentHash, 'content/ changed since the golden replays were recorded').toBe(
        loadContentHash(),
      );
    });
  }

  it("D-048: the Spookjag golden covers a bat's bonus, an owl's penalty and Lanterns out", () => {
    const g = golden.find((x) => x.name === 'daily-2026-10-31-halloween-spook-pointer');
    if (g === undefined) throw new Error('no Spookjag golden');
    const log = decodeInputLogText(g.log);
    const sim = createSim({ seed: log.seed, content, mode: log.mode, inputKind: log.inputKind });
    const seen = new Set<string>(sim.drainEvents().map((e) => e.type));
    const ticks = absoluteTicks(log);
    let i = 0;
    while (!sim.isOver()) {
      const now: Command[] = [];
      while (i < ticks.length && (ticks[i] ?? Infinity) <= sim.tick) {
        const c = log.commands[i++];
        if (c !== undefined) now.push(c[1]);
      }
      sim.step(now);
      for (const e of sim.drainEvents()) {
        if (e.type === 'bonusAwarded') seen.add(`bonus:${e.bonus}`);
        else if (e.type === 'penaltyApplied') seen.add(`penalty:${e.creature}`);
        else seen.add(e.type);
      }
    }
    expect([...seen]).toEqual(
      expect.arrayContaining(['bonus:bat', 'penalty:ooruil', 'lanternsOut', 'bonus:lanternsOut']),
    );
  });

  it('fail when a scoring constant changes', () => {
    const g = golden.find((x) => x.expected.score > 0);
    if (g === undefined) throw new Error('need a golden replay that scores');
    const tweaked = structuredClone(content);
    tweaked.scoring.planes.mid.base = 11;
    tweaked.scoring.planes.far.base = 26;
    const log = decodeInputLogText(g.log);
    expect(runReplay(log, tweaked).eventHash).not.toBe(g.expected.eventHash);
    // Same content hash as the log, so verify reaches (and fails) the event-hash comparison.
    const verdict = verifyReplay(log, tweaked, log.contentHash, g.expected.eventHash);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/event hash/);
  });
});
