import { describe, expect, it } from 'vitest';
import { m3Gates, playRows, summarise, type HuntRow } from './balance-sim';

const row = (bot: HuntRow['bot'], score: number, extra: Partial<HuntRow> = {}): HuntRow => ({
  bot,
  seed: score,
  score,
  bagged: 10,
  wingShots: 4,
  wholeFlocks: 0,
  flushes: 0,
  twoFlies: 0,
  shots: 20,
  accuracy: 0.5,
  ...extra,
});

describe('balance sim', () => {
  it('summarises scores into mean and percentiles, and shares per bagged bird', () => {
    const rows = [100, 200, 300, 400, 500].map((s, i) =>
      row('competent', s, { wholeFlocks: i === 0 ? 2 : 0 }),
    );
    const s = summarise('competent', rows);
    expect(s).toMatchObject({ hunts: 5, mean: 300, p50: 300, p15: 200, p85: 400 });
    expect(s.wingShotShare).toBeCloseTo(0.4, 9);
    expect(s.wholeFlocksPerHunt).toBeCloseTo(0.4, 9);
    expect(s.wholeFlockHuntRate).toBeCloseTo(0.2, 9);
  });

  it('checks the M3 gates', () => {
    const by = (c: number, p: number, r: number) =>
      new Map([
        ['competent', summarise('competent', [row('competent', c)])],
        ['plinker', summarise('plinker', [row('plinker', p)])],
        ['random', summarise('random', [row('random', r)])],
      ] as const);
    expect(m3Gates(by(3500, 2500, 500)).map((g) => g.pass)).toEqual([true, true, true]);
    expect(m3Gates(by(5000, 4000, 500)).map((g) => g.pass)).toEqual([false, false, true]);
    expect(m3Gates(by(3000, 400, 500)).map((g) => g.pass)).toEqual([true, true, false]);
  });

  it('plays deterministic hunts', () => {
    const job = { bot: 'competent', seeds: [3], input: 'pointer', mode: 'classic' } as const;
    expect(playRows(job)).toEqual(playRows(job));
  });
});
