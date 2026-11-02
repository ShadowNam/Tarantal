import { describe, expect, it } from 'vitest';
import { JOURNAL } from '../content/journal';
import {
  awardPlaques,
  coachTip,
  equipPlaque,
  journalKey,
  personalGoals,
  plaqueProgress,
  recordHunt,
  recordRival,
  shotMoment,
  ShotFeedbackGate,
  sightingKey,
} from './journal';
import { defaultSave, JournalSaveSchema } from './saveSchema';
import { createHuntLogger, type HuntLog } from './huntLog';
import { repairSave } from './save';
import { applyHunt } from './progress';
import { loadContent, loadNotaboek } from '../../tools/testContent';
import type { Challenge } from './challenge';
import type { SimEvent } from '../sim/events';
import { residentFrames } from '../game/view/tree/residentSheet';
import { colonyFrames } from '../game/view/tree/colonySheet';

function hunt(patch: Partial<HuntLog> = {}): HuntLog {
  return {
    mode: 'classic',
    biome: 'karoo-autumn',
    layout: 'mon',
    bonus: null,
    weapon: 'dubbelloop',
    sight: null,
    rules: '12345678',
    score: 200,
    accuracy: 0.5,
    penalties: 0,
    emptyClicks: 0,
    shots: 20,
    bagged: 10,
    baggedFar: 2,
    baggedVer: 0,
    bonusUnlocked: null,
    wingShots: 1,
    wholeFlocks: 1,
    secrets: 0,
    crates: 0,
    creaturesSeen: [],
    secretsFound: [],
    rank: 'stadsjapie',
    ...patch,
  };
}
const challenge = (patch: Partial<Challenge> = {}): Challenge => ({
  v: 1,
  seed: 42,
  mode: 'classic',
  biome: 'karoo-autumn',
  weapon: 'dubbelloop',
  score: 100,
  h: '12345678',
  ...patch,
});

describe('improvement rollout journal', () => {
  it('cannot award keepsakes in an unranked sandbox or the lesson', () => {
    const save = defaultSave();
    save.journal = recordHunt(save.journal, hunt({ accuracy: 1 }), true).journal;
    for (const log of [hunt({ rules: '' }), hunt({ mode: 'ftue' })]) {
      const result = applyHunt(save, log, loadContent(), loadNotaboek());
      expect(result.save.journal.earned).toEqual([]);
    }
  });
  it('holds urgent banners across frames and rate limits later shot feedback', () => {
    const gate = new ShotFeedbackGate();
    const far = [{ type: 'targetBagged', plane: 'far' }] as SimEvent[];
    expect(gate.take([{ type: 'stampedeStarted' } as SimEvent], 10, 100)).toBeNull();
    expect(gate.take(far, 11, 100)).toBeNull();
    expect(gate.take(far, 109, 100)).toBeNull();
    expect(gate.take(far, 110, 100)).toBe('long');
    expect(gate.take(far, 111, 100)).toBeNull();
    expect(gate.take(far, 110 + JOURNAL.feedbackCooldownTicks, 100)).toBe('long');
  });
  it('opens an older save without losing its progress', () => {
    const old: Record<string, unknown> = {
      ...defaultSave(),
      stats: { hunts: 12, bagged: 30, shots: 40 },
    };
    delete old['journal'];
    const fixed = repairSave(old);
    expect(fixed.data.journal).toEqual(defaultSave().journal);
    expect(fixed.data.stats.hunts).toBe(12);
  });
  it('keeps different maps, weapons, sights, modes and rules apart', () => {
    const base = hunt();
    const keys = [
      base,
      hunt({ weapon: 'windbuks' }),
      hunt({ layout: 'tue' }),
      hunt({ bonus: 'verder' }),
      hunt({ sight: 'scope' }),
      hunt({ rules: 'abcdefgh' }),
      hunt({ mode: 'daily' }),
    ].map(journalKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('retains records rather than replacing them with the most recent result', () => {
    const first = recordHunt(defaultSave().journal, hunt(), true);
    const next = recordHunt(
      first.journal,
      hunt({ score: 100, accuracy: 0.2, wholeFlocks: 0, penalties: -10 }),
      true,
    );
    const row = next.journal.records[journalKey(hunt())];
    expect(row).toMatchObject({
      score: 200,
      accuracy: 0.5,
      wholeFlocks: 1,
      cleanBag: 10,
      hunts: 2,
    });
    expect(next.improved).toEqual([]);
    const best = recordHunt(next.journal, hunt({ score: 400, accuracy: 0.8 }), true);
    expect(best.improved).toEqual(['score', 'accuracy']);
    expect(JournalSaveSchema.safeParse(best.journal).success).toBe(true);
  });
  it('requires enough shots for accuracy, and no penalty for a clean bag', () => {
    const j = recordHunt(
      defaultSave().journal,
      hunt({ shots: 1, accuracy: 1, bagged: 1, penalties: -10 }),
      true,
    ).journal;
    expect(j.records[journalKey(hunt())]).toMatchObject({ accuracy: 0, cleanBag: 0 });
    const qualified = recordHunt(
      j,
      hunt({ shots: JOURNAL.minAccuracyShots, accuracy: 0.9 }),
      true,
    ).journal;
    expect(qualified.records[journalKey(hunt())]?.accuracy).toBe(0.9);
  });
  it('cannot earn personal records from practice, FTUE, training or incomplete setup', () => {
    const j = defaultSave().journal;
    for (const log of [
      hunt({ mode: 'ftue' }),
      hunt({ mode: 'range' }),
      hunt({ rules: '' }),
      hunt({ weapon: '' }),
    ])
      expect(recordHunt(j, log, true).journal).toBe(j);
    expect(recordHunt(j, hunt(), false).journal).toBe(j);
  });
  it('caps records and keeps the latest setup accessible', () => {
    let j = defaultSave().journal;
    for (let i = 0; i < JOURNAL.maxRecords + 4; i++)
      j = recordHunt(j, hunt({ rules: String(i) }), true).journal;
    expect(Object.keys(j.records)).toHaveLength(JOURNAL.maxRecords);
    expect(j.latest).toBe(journalKey(hunt({ rules: String(JOURNAL.maxRecords + 3) })));
    expect(JournalSaveSchema.safeParse(j).success).toBe(true);
  });
  it('keeps goals above the best while capping already-mastered accuracy and flock goals', () => {
    const j = recordHunt(
      defaultSave().journal,
      hunt({ score: -100, accuracy: 1, wholeFlocks: JOURNAL.maxFlockGoal, bagged: 40 }),
      true,
    ).journal;
    const row = Object.values(j.records)[0];
    if (!row) throw new Error('missing record');
    const goals = personalGoals(row);
    expect(goals.find((g) => g.id === 'score')?.target).toBeGreaterThan(-100);
    expect(goals.find((g) => g.id === 'accuracy')).toMatchObject({ target: 1, complete: true });
    expect(goals.find((g) => g.id === 'flocks')).toMatchObject({
      target: JOURNAL.maxFlockGoal,
      complete: true,
    });
    expect(goals.find((g) => g.id === 'clean')).toMatchObject({
      target: JOURNAL.maxCleanBagGoal,
      complete: true,
    });
  });
  it('ignores old-rule challenges, keeps the best rematch and bounds rival history', () => {
    const empty = defaultSave().journal;
    expect(recordRival(empty, challenge({ h: 'deadbeef' }), 200, '12345678')).toBe(empty);
    const legacy = challenge();
    delete legacy.h;
    expect(recordRival(empty, legacy, 200, '12345678')).toBe(empty);
    let j = recordRival(empty, challenge(), 200, '12345678');
    j = recordRival(j, challenge(), 50, '12345678');
    expect(j.rivals).toHaveLength(1);
    expect(j.rivals[0]?.best).toBe(200);
    for (let i = 0; i < JOURNAL.maxRivals + 2; i++)
      j = recordRival(j, challenge({ seed: i }), 0, '12345678');
    expect(j.rivals).toHaveLength(JOURNAL.maxRivals);
  });
  it('awards keepsakes permanently and refuses locked selections', () => {
    let save = defaultSave();
    expect(equipPlaque(save, 'marksman')).toBe(save);
    save = {
      ...save,
      journal: recordHunt(save.journal, hunt({ accuracy: 1, bagged: 10 }), true).journal,
    };
    save = awardPlaques(save);
    expect(save.journal.earned).toEqual(
      expect.arrayContaining(['marksman', 'hunter', 'guardian', 'flock']),
    );
    save = equipPlaque(save, 'marksman');
    save = { ...save, journal: { ...save.journal, records: {}, latest: null } };
    expect(plaqueProgress(save).find((p) => p.id === 'marksman')?.earned).toBe(true);
    expect(save.journal.plaque).toBe('marksman');
  });
  it('observations are whitelisted, deduplicated and use existing illustration frames', () => {
    const logger = createHuntLogger();
    logger.observe('galago');
    logger.observe('galago');
    logger.observe('invalid');
    expect([...logger.creaturesSeen]).toEqual([sightingKey('galago')]);
    for (const species of JOURNAL.species) {
      const frames = species.habitat === 'baobab' ? residentFrames() : colonyFrames();
      expect(
        frames.some((f) => f.name === species.frame),
        species.id,
      ).toBe(true);
    }
  });
  it('uses actual results for coaching and chooses the most important shot moment', () => {
    expect(coachTip(hunt({ emptyClicks: 1 }))).toBe('reload');
    expect(coachTip(hunt({ accuracy: 0.1 }))).toBe('steady');
    expect(coachTip(hunt({ wholeFlocks: 0 }))).toBe('flock');
    const events = [
      { type: 'targetBagged', plane: 'far' },
      { type: 'targetBagged', plane: 'ver' },
      { type: 'bonusAwarded', bonus: 'twoFlies' },
    ] as SimEvent[];
    expect(shotMoment(events)).toBe('double');
    expect(shotMoment(events.slice(0, 2))).toBe('horizon');
    expect(shotMoment([{ type: 'flockWiped' } as SimEvent, ...events])).toBe('whole');
    expect(shotMoment([])).toBeNull();
  });
});
