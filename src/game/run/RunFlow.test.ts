// RunFlow's rewarded-ad hooks (M9, GDD §19): "Oupa se tweede kans" and "double Doppies".
import { beforeEach, describe, expect, it } from 'vitest';
import { loadContent, loadNotaboek } from '../../../tools/testContent';
import { SaveStore } from '../../meta/save';
import { resetStorageForTests } from '../../meta/storage';
import type { PlatformAdapter } from '../../platform/PlatformAdapter';
import { huntInfo } from '../../sim/run/run';
import type { HuntResult } from '../../sim/types';
import { RunFlow } from './RunFlow';

const content = loadContent();
const notaboek = loadNotaboek();
const events: string[] = [];
const platform = {
  analytics: (e: string, d?: Record<string, unknown>) => events.push(`${e}:${String(d?.['kind'])}`),
} as unknown as PlatformAdapter;

function result(score: number): HuntResult {
  return {
    seed: 0,
    mode: 'seasonHunt',
    biome: 'karoo-autumn',
    layout: null,
    bonus: null,
    weapon: 'dubbelloop',
    sight: null,
    score,
    ticks: 3600,
    shots: 0,
    hitShots: 0,
    accuracy: 0,
    bagged: 0,
    baggedByPlane: { near: 0, mid: 0, far: 0, ver: 0 },
    wingShots: 0,
    penalties: 0,
    emptyClicks: 0,
    bestStreak: 0,
    twoFlies: 0,
    wholeFlocks: 0,
    flushes: 0,
    gadgetUses: 0,
    secrets: 0,
    crates: 0,
    rank: '',
    doppies: 0,
    shellCapacityForRun: 0,
    consumablesUsed: [],
    rentalUsed: false,
    bossesBagged: 0,
  };
}

let save: SaveStore;
let flow: RunFlow;
beforeEach(() => {
  resetStorageForTests();
  events.length = 0;
  save = new SaveStore();
  flow = new RunFlow(content, notaboek, save, platform);
});

describe('Oupa se tweede kans (rewarded retry)', () => {
  it('a lost run can replay the lost hunt rewardedRetryPerRun times, with the same seed', () => {
    const run = flow.start(7, 'dubbelloop');
    const seed = flow.setup(undefined).seed;
    expect(flow.canRetry()).toBe(false);
    for (let i = 0; i < content.run.rewardedRetryPerRun; i++) {
      flow.afterHunt(result(0));
      expect(save.data.run).toBeNull();
      expect(flow.canRetry()).toBe(true);
      expect(flow.retry()).toEqual(run);
      expect(save.data.run).toEqual(run);
      // The loss is taken back from the run record too.
      expect(save.data.runStats.started).toBe(1);
      expect(flow.setup(undefined).seed).toBe(seed);
    }
    flow.afterHunt(result(0));
    expect(flow.canRetry()).toBe(false);
    expect(flow.retry()).toBeNull();
    expect(events.filter((e) => e === 'rewarded:retry')).toHaveLength(
      content.run.rewardedRetryPerRun,
    );
  });

  it('a new run starts with its retries unused', () => {
    flow.start(7, 'dubbelloop');
    flow.afterHunt(result(0));
    flow.retry();
    flow.afterHunt(result(0));
    flow.start(7, 'dubbelloop');
    flow.afterHunt(result(0));
    expect(flow.canRetry()).toBe(true);
  });
});

describe('double Doppies (rewarded)', () => {
  it('once per hunt, on the run tally of a hunt that paid', () => {
    flow.start(3, 'dubbelloop');
    expect(flow.canDouble()).toBe(false);
    const after = flow.afterHunt(result(huntInfo(content, 0).quota));
    const paid = after.history.at(-1)?.doppies?.total ?? 0;
    expect(flow.canDouble()).toBe(true);
    expect(flow.doubleDoppies()?.doppies).toBe(after.doppies + paid);
    expect(save.data.run?.doppies).toBe(after.doppies + paid);
    expect(flow.canDouble()).toBe(false);
    expect(flow.doubleDoppies()).toBeNull();
    expect(save.data.runAds.doubled).toEqual([0]);
  });
});
