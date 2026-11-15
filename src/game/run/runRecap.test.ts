import { describe, expect, it } from 'vitest';
import { runRecap } from './runRecap';

describe('run recap', () => {
  it('compares quota margins proportionally and includes a failed final hunt', () => {
    const history = [
      { huntIndex: 0, score: 150, quota: 100, passed: true, doppies: null },
      { huntIndex: 1, score: 1200, quota: 1000, passed: true, doppies: null },
      { huntIndex: 2, score: 900, quota: 1000, passed: false, doppies: null },
    ];
    const recap = runRecap(history);
    expect(recap.strongest?.huntIndex).toBe(0);
    expect(recap.weakest?.huntIndex).toBe(2);
    expect(recap.hunts).toEqual(history);
  });
  it('does not call zero-quota fixtures an achievement', () => {
    const recap = runRecap([{ huntIndex: 0, score: 0, quota: 0, passed: true, doppies: null }]);
    expect(recap.strongest).toBeNull();
    expect(recap.weakest).toBeNull();
    expect(runRecap([]).hunts).toEqual([]);
  });
});
