// Golden replays: recorded hunts whose event hash must not change by accident. If this fails
// after an intentional sim or content change, run `npm run golden:update` and say why in the
// commit message (CLAUDE.md).
import { describe, expect, it } from 'vitest';
import { loadContent, loadContentHash } from '../../../tools/testContent';
import type { GoldenReplay } from '../../../tools/goldenCases';
import replays from './golden/replays.json';
import { decodeInputLogText } from './inputLog';
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
