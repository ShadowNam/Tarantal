import { describe, expect, it } from 'vitest';
import { loadContent, loadNotaboek } from '../../tools/testContent';
import { createRun, type RunState } from '../sim/run/run';
import { finishRunStats, lockedCharms, playerPool, unlockedCharms, validRun } from './run';
import { repairSave } from './save';
import { defaultSave } from './saveSchema';

const content = loadContent();
const notaboek = loadNotaboek();

const run = (): RunState =>
  createRun(content, { seed: 3, weapon: 'dubbelloop', pool: ['vlerkskoot'] });

describe('charm unlocks (GDD §13.6)', () => {
  it('Notaboek charm rewards start locked and join the pool when done', () => {
    expect(lockedCharms(notaboek)).toEqual(['hele_swerm', 'oupa_se_kaart', 'geheime_resep']);
    const fresh = defaultSave();
    expect(playerPool(fresh, content, notaboek)).toHaveLength(21);
    const done = { ...fresh, notaboek: { progress: {}, done: ['whole_flock_x5'] } };
    expect(unlockedCharms(done, notaboek)).toEqual(['hele_swerm']);
    expect(playerPool(done, content, notaboek)).toContain('hele_swerm');
    expect(playerPool(done, content, notaboek)).not.toContain('geheime_resep');
  });
});

describe('saved run', () => {
  it('a run round-trips through the save section', () => {
    const r = run();
    const { data, repaired } = repairSave({ ...defaultSave(), run: JSON.parse(JSON.stringify(r)) });
    expect(repaired).toEqual([]);
    expect(validRun(data.run, content)).toEqual(r);
  });

  it('a damaged run section falls back to no run, the rest of the save survives', () => {
    const { data, repaired } = repairSave({
      ...defaultSave(),
      bestRank: 'boer',
      run: { ...run(), phase: 'banana' },
    });
    expect(data.run).toBeNull();
    expect(data.bestRank).toBe('boer');
    expect(repaired).toContain('run');
  });

  it('a run that no longer fits the content is dropped', () => {
    expect(validRun({ ...run(), charms: ['gone_charm'] }, content)).toBeNull();
    expect(validRun({ ...run(), huntIndex: 12 }, content)).toBeNull();
    expect(validRun({ ...run(), consumables: [null] }, content)).toBeNull();
    expect(validRun({ ...run(), weapon: 'voorlaaier' }, content)).toBeNull();
    expect(validRun(null, content)).toBeNull();
  });

  it('old saves without the section load with no run', () => {
    const { data } = repairSave({ v: 1 });
    expect(data.run).toBeNull();
    expect(data.runStats).toEqual({ started: 0, won: 0, bestHunts: 0 });
  });

  it('finished runs add to the run stats', () => {
    const lost: RunState = {
      ...run(),
      phase: 'defeat',
      history: [{ huntIndex: 0, score: 10, quota: 1950, passed: false, doppies: null }],
    };
    expect(finishRunStats({ started: 2, won: 0, bestHunts: 3 }, lost)).toEqual({
      started: 2,
      won: 0,
      bestHunts: 3,
    });
  });
});
