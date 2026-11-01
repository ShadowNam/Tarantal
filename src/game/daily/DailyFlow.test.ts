import { beforeEach, describe, expect, it } from 'vitest';
import { loadContent, loadContentHash, loadDailyMeta } from '../../../tools/testContent';
import { setLanguage } from '../../i18n/i18n';
import { challengeFor, decodeChallenge } from '../../meta/challenge';
import { dailySeed } from '../../meta/daily';
import { parseDayKey } from '../../meta/dailyCalendar';
import { SaveStore } from '../../meta/save';
import { defaultSave } from '../../meta/saveSchema';
import { resetStorageForTests } from '../../meta/storage';
import type { ShareOutcome, SharePayload } from '../../platform/share';
import type { HuntResult } from '../../sim/types';
import { DailyFlow, type HuntPlan } from './DailyFlow';

const content = loadContent();
const hash = loadContentHash();
const meta = loadDailyMeta();
// Daily #1: the epoch, read from content (its only copy, D-028).
const DAY = parseDayKey(meta.epoch) ?? NaN;

interface Fake {
  events: { event: string; data: Record<string, unknown> }[];
  shared: SharePayload[];
  outcome: ShareOutcome;
}

function setup(
  day = DAY,
  unranked = false,
): {
  flow: DailyFlow;
  save: SaveStore;
  fake: Fake;
  setDay: (d: number) => void;
} {
  const fake: Fake = { events: [], shared: [], outcome: 'copied' };
  const save = new SaveStore({ data: defaultSave(), status: 'new', repaired: [] });
  let today = day;
  const flow = new DailyFlow({
    content,
    contentHash: hash,
    meta,
    save,
    platform: {
      analytics: (event, data = {}) => fake.events.push({ event, data }),
      share: (p) => {
        fake.shared.push(p);
        return Promise.resolve(fake.outcome);
      },
      shareUrl: (u) => u,
    },
    today: () => today,
    playableBiomes: ['karoo-autumn'],
    shareBase: () => 'https://example.test/Tarantal/',
    unranked,
  });
  return { flow, save, fake, setDay: (d) => (today = d) };
}

function result(plan: HuntPlan, score: number): HuntResult {
  return {
    seed: plan.seed,
    mode: plan.mode.id,
    sight: null,
    layout: plan.mode.layout ?? null,
    bonus: plan.mode.bonus ?? null,
    biome: plan.mode.biome ?? 'karoo-autumn',
    weapon: plan.mode.weapon ?? 'dubbelloop',
    score,
    ticks: 5400,
    shots: 40,
    hitShots: 20,
    accuracy: 0.5,
    bagged: 25,
    baggedByPlane: { near: 5, mid: 15, far: 5, ver: 0 },
    wingShots: 4,
    penalties: 0,
    emptyClicks: 0,
    bestStreak: 6,
    twoFlies: 1,
    wholeFlocks: 2,
    flushes: 3,
    gadgetUses: 0,
    secrets: 0,
    crates: 1,
    rank: 'bosveldjagter',
    doppies: 0,
    shellCapacityForRun: 0,
    consumablesUsed: [],
    rentalUsed: false,
    bossesBagged: 0,
  };
}

const seedNever = (): number => {
  throw new Error('classic seed asked for a daily');
};

beforeEach(() => {
  resetStorageForTests();
  setLanguage('en');
});

describe('DailyFlow', () => {
  it('M10 capture (unranked): the Daily is never official and no hunt offers a share or link', () => {
    const { flow, save } = setup(DAY, true);
    const plan = flow.plan('daily', null, undefined, {}, seedNever);
    expect(plan.daily?.official).toBe(false);
    flow.start(plan);
    expect(flow.ranked(plan)).toBe(false);
    const x = flow.finish(plan, result(plan, 99_999), '🟩');
    expect(x.share).toBeNull();
    expect(save.data.daily.history).toEqual([]);
    expect(save.data.daily.streak).toBe(0);
    const classic = flow.plan('classic', null, undefined, {}, () => 42);
    flow.start(classic);
    expect(flow.finish(classic, result(classic, 1234), '🟩').share).toBeNull();
  });

  it('v1.2: Classic plays today’s layout and may carry Verder; the Daily never does', () => {
    const { flow } = setup();
    const classic = flow.plan('classic', null, undefined, { bonus: 'verder' }, () => 42);
    expect(classic.mode).toMatchObject({ id: 'classic', layout: 'wed', bonus: 'verder' });
    expect(classic.hudTag).toBe('Further · bonus map');
    const daily = flow.plan('daily', null, undefined, { bonus: 'verder' }, seedNever);
    expect(daily.mode.bonus).toBeUndefined();
    expect(daily.mode.layout).toBe('wed');
  });

  it('first daily attempt is official, records the result and shares a link to the same hunt', async () => {
    const { flow, save, fake } = setup();
    const plan = flow.plan('daily', null, undefined, {}, seedNever);
    expect(plan.seed).toBe(dailySeed(meta.epoch, hash));
    expect(plan.mode).toEqual({
      id: 'daily',
      biome: 'karoo-autumn',
      layout: plan.daily?.setup.layout,
    });
    expect(plan.daily?.official).toBe(true);
    expect(plan.hudTag).toBe('DAILY #1');
    flow.start(plan);
    expect(flow.ranked(plan)).toBe(true);
    expect(fake.events).toEqual([
      {
        event: 'daily_play',
        data: {
          day: meta.epoch,
          number: 1,
          official: true,
          biome: 'karoo-autumn',
          challenge: false,
        },
      },
    ]);
    const x = flow.finish(plan, result(plan, 2840), '🟩🟩🟨🟩⬛');
    expect(x.tag).toBe('Daily #1');
    expect(x.news).toEqual(['Streak: 1 day']);
    expect(save.data.daily.history).toEqual([
      { day: DAY, score: 2840, rank: 'bosveldjagter', wholeFlocks: 2, grid: '🟩🟩🟨🟩⬛' },
    ]);
    expect(x.share?.text).toContain(
      'Daily #1 · Wednesday · 🔥 2\u00a0840 🌌 · Bushveld Hunter · 🟩🟩🟨🟩⬛ · 2× whole flock',
    );
    const param = new URL(x.share?.url ?? '').searchParams.get('c') ?? '';
    const decoded = decodeChallenge(param, {
      content,
      playableBiomes: ['karoo-autumn'],
      contentHash: hash,
      limits: meta.challenge,
    });
    expect(decoded).toMatchObject({
      ok: true,
      challenge: { seed: plan.seed, mode: 'daily', score: 2840, n: 1, l: 'wed' },
    });

    expect(await flow.share(x)).toBe('copied');
    expect(fake.shared).toEqual([x.share]);
    expect(fake.events.at(-1)).toEqual({
      event: 'share_click',
      data: { mode: 'daily', official: true, method: 'copied' },
    });
  });

  it('later attempts that day are practice: no streak, best, rank or share', () => {
    const { flow, save } = setup();
    const first = flow.plan('daily', null, undefined, {}, seedNever);
    flow.start(first);
    flow.finish(first, result(first, 2840), '🟩');
    const again = flow.plan('daily', null, 'windbuks', {}, seedNever);
    expect(again.daily?.official).toBe(false);
    expect(again.seed).toBe(first.seed);
    expect(again.mode.weapon).toBe('windbuks');
    expect(again.hudTag).toBe('PRACTICE · DAILY #1');
    flow.start(again);
    expect(flow.ranked(again)).toBe(false);
    const x = flow.finish(again, result(again, 9000), '🟩');
    expect(x.share).toBeNull();
    expect(x.tag).toBe('Practice · Daily #1');
    expect(x.news).toEqual(["Practice · today's official score: 2\u00a0840"]);
    expect(save.data.daily.bestScore).toBe(2840);
    expect(save.data.daily.streak).toBe(1);
  });

  it('a new UTC day is a new official attempt with the streak and a new seed', () => {
    const { flow, setDay } = setup();
    const d1 = flow.plan('daily', null, undefined, {}, seedNever);
    flow.start(d1);
    setDay(DAY + 1);
    const d2 = flow.plan('daily', null, undefined, {}, seedNever);
    expect(d2.daily?.official).toBe(true);
    expect(d2.seed).not.toBe(d1.seed);
    flow.start(d2);
    expect(flow.finish(d2, result(d2, 100), '').news[0]).toBe('Streak: 2 days');
    expect(flow.streakToday()).toEqual({ streak: 2, freezeReady: true });
  });

  it('e2e ?dailySeed= fixes the seed whatever the content hash; the rest of the day is kept', () => {
    const { flow } = setup();
    const plain = flow.todaySetup();
    const fixed = new DailyFlow({
      ...(flow as unknown as { deps: ConstructorParameters<typeof DailyFlow>[0] }).deps,
      seedOverride: 1105699564,
    }).todaySetup();
    expect(fixed.seed).toBe(1105699564);
    expect({ ...fixed, seed: plain.seed }).toEqual(plain);
  });

  it('a challenge to today’s unplayed daily is the official daily; else it is a challenge', () => {
    const { flow } = setup();
    const today = flow.todaySetup();
    const c = challengeFor(
      {
        seed: today.seed,
        mode: 'daily',
        biome: 'karoo-autumn',
        weapon: 'windbuks',
        score: 3000,
        dailyNumber: 1,
        layout: today.layout,
      },
      hash,
      'Sannie',
    );
    const plan = flow.plan('classic', c, undefined, { huntSeconds: 3 }, seedNever);
    expect(plan.daily?.official).toBe(true);
    expect(plan.mode).toEqual({
      id: 'daily',
      biome: 'karoo-autumn',
      weapon: 'windbuks',
      layout: today.layout,
      huntSeconds: 3,
    });
    flow.start(plan);
    const x = flow.finish(plan, result(plan, 3100), '');
    expect(x.compare).toBe('You 3\u00a0100 · Sannie 3\u00a0000 · you win!');
    expect(x.tag).toBe('Daily #1');
    // Again on the same challenge: now practice, still compared.
    const again = flow.plan('classic', c, undefined, {}, seedNever);
    expect(again.daily?.official).toBe(false);
    flow.start(again);
    expect(flow.finish(again, result(again, 10), '').compare).toBe(
      'You 10 · Sannie 3\u00a0000 · so close!',
    );
  });

  it('a day before the epoch finishes and shares without a daily number (no throw)', () => {
    const { flow, save } = setup(DAY - 3);
    const plan = flow.plan('daily', null, undefined, {}, seedNever);
    expect(plan.daily?.setup.number).toBeLessThan(1);
    flow.start(plan);
    const x = flow.finish(plan, result(plan, 500), '🟩');
    expect(save.data.daily.history.at(-1)?.score).toBe(500);
    const param = new URL(x.share?.url ?? '').searchParams.get('c') ?? '';
    const decoded = decodeChallenge(param, {
      content,
      playableBiomes: ['karoo-autumn'],
      contentHash: hash,
      limits: meta.challenge,
    });
    expect(decoded.ok).toBe(true);
    expect(decoded.ok && decoded.challenge.n).toBeUndefined();
  });

  it('a daily challenge to another day, or to another biome, is never ranked or official', () => {
    const { flow } = setup();
    const today = flow.todaySetup();
    const old = challengeFor(
      {
        seed: 12345,
        mode: 'daily',
        biome: 'karoo-autumn',
        weapon: 'dubbelloop',
        score: 1,
        dailyNumber: 1,
      },
      hash,
    );
    const p1 = flow.plan('classic', old, undefined, {}, seedNever);
    expect(p1.daily).toBeNull();
    flow.start(p1);
    expect(flow.ranked(p1)).toBe(false);
    const otherBiome = challengeFor(
      {
        seed: today.seed,
        mode: 'daily',
        biome: 'bushveld-winter',
        weapon: 'dubbelloop',
        score: 1,
        dailyNumber: 1,
      },
      hash,
    );
    const p2 = flow.plan('classic', otherBiome, undefined, {}, seedNever);
    expect(p2.daily).toBeNull();
    flow.start(p2);
    expect(flow.ranked(p2)).toBe(false);
  });

  it('a Classic challenge plays its seed and gun, compares, and can be shared on', () => {
    const { flow, save } = setup();
    const c = challengeFor(
      {
        seed: 777,
        mode: 'classic',
        biome: 'karoo-autumn',
        weapon: 'windbuks',
        score: 1500,
        dailyNumber: null,
      },
      hash,
    );
    const plan = flow.plan('classic', c, 'dubbelloop', {}, seedNever);
    expect(plan).toMatchObject({
      seed: 777,
      mode: { id: 'classic', weapon: 'windbuks' },
      daily: null,
      hudTag: 'BEAT 1\u00a0500',
    });
    flow.start(plan);
    const x = flow.finish(plan, result(plan, 1500), '⬛');
    expect(x.compare).toBe('You 1\u00a0500 · them 1\u00a0500 · a tie!');
    expect(x.tag).toBe('Challenge');
    expect(x.share?.text).toContain('Classic · Karoo');
    expect(save.data.daily).toEqual(defaultSave().daily);
  });

  it('Classic without a challenge uses the normal seed and no tag', () => {
    const { flow } = setup();
    const plan = flow.plan('classic', null, undefined, { omen: true }, () => 42);
    expect(plan).toMatchObject({
      seed: 42,
      mode: { id: 'classic', omen: true },
      daily: null,
      hudTag: null,
    });
    flow.start(plan);
    const x = flow.finish(plan, result(plan, 500), '⬛⬛⬛⬛⬛');
    expect(x.tag).toBeNull();
    expect(x.news).toEqual([]);
    expect(x.shareInfo).toEqual({ mode: 'classic', official: false });
  });

  it('af strings', () => {
    setLanguage('af');
    const { flow } = setup();
    const plan = flow.plan('daily', null, undefined, {}, seedNever);
    expect(plan.hudTag).toBe('DAAGLIKS #1');
    flow.start(plan);
    const x = flow.finish(plan, result(plan, 2840), '🟩');
    expect(x.tag).toBe('Daaglikse Jag #1');
    expect(x.share?.text).toContain('Daaglikse Jag #1');
  });
});
