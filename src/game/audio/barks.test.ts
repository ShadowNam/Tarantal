import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../tools/testContent';
import type { SimEvent } from '../../sim/events';
import { BarkDirector, allBarkLines, firstHuntToday, type BarkFrame } from './barks';

const feel = loadFeel();
const T = feel.barks;
const GAP = feel.audio.barkGapMs;
const frame = (nowMs: number, tick = 100, extra: Partial<BarkFrame> = {}): BarkFrame => ({
  nowMs,
  tick,
  ticksLeft: 5000,
  ticksPerSecond: 60,
  frenzyTopMul: 3,
  ...extra,
});
const miss = (shotId: number): SimEvent => ({ type: 'miss', tick: 100, shotId });
const shot = (shotId: number, tick = 100): SimEvent => ({
  type: 'shotFired',
  tick,
  shotId,
  weapon: 'dubbelloop',
  dx: 0,
  sy: 0,
  shellsLeft: 1,
});
const bag = (shotId: number, birdId = shotId): SimEvent => ({
  type: 'targetBagged',
  tick: 100,
  shotId,
  birdId,
  creature: 'tarentaal',
  plane: 'near',
  behaviour: 'forage',
  flockId: 1,
  x: 0,
  y: 0,
});

describe('BarkDirector (v1.0.1, D-028 §3)', () => {
  it('fires on a bag streak and a miss streak of the configured length', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const bags = Array.from({ length: T.bagStreak }, (_, i) => bag(i + 1));
    expect(d.hunt(bags, frame(0))?.trigger).toBe('bagStreak');
    const misses = Array.from({ length: T.missStreak }, (_, i) => miss(i + 10));
    expect(d.hunt(misses, frame(GAP))?.trigger).toBe('missStreak');
  });

  it('two birds from one shot count once in the bag streak', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const sameShot = Array.from({ length: T.bagStreak }, (_, i) => bag(1, i + 1));
    expect(d.hunt(sameShot, frame(0))).toBeNull();
  });

  it('the highest priority wins; at most one bark per gap; lines rotate', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const both: SimEvent[] = [
      { type: 'emptyClick', tick: 100 },
      { type: 'stampedeStarted', tick: 100 },
    ];
    const first = d.hunt(both, frame(0));
    expect(first?.trigger).toBe('stampede');
    expect(first?.line).toBe(T.triggers.stampede.lines[0]);
    expect(d.hunt([{ type: 'stampedeStarted', tick: 101 }], frame(GAP - 1))).toBeNull();
    // Stampede has no own cooldown: after the gap its next line.
    expect(d.hunt([{ type: 'stampedeStarted', tick: 102 }], frame(GAP))?.line).toBe(
      T.triggers.stampede.lines[1],
    );
  });

  it('a trigger respects its own cooldown beyond the gap', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const click: SimEvent[] = [{ type: 'emptyClick', tick: 100 }];
    expect(d.hunt(click, frame(0))?.trigger).toBe('emptyClick');
    expect(T.triggers.emptyClick.cooldownMs).toBeGreaterThan(GAP);
    expect(d.hunt(click, frame(GAP))).toBeNull();
    expect(d.hunt(click, frame(T.triggers.emptyClick.cooldownMs))?.trigger).toBe('emptyClick');
  });

  it('idle and the last seconds wait out the gap instead of being lost, and say it once', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    expect(d.hunt([{ type: 'emptyClick', tick: 1 }], frame(0, 1))?.trigger).toBe('emptyClick');
    const idleTick = T.idleSeconds * 60;
    expect(d.hunt([], frame(10, idleTick))).toBeNull(); // gap
    expect(d.hunt([], frame(GAP, idleTick + 1))?.trigger).toBe('idle');
    expect(d.hunt([], frame(GAP * 2, idleTick + 2))).toBeNull(); // said once
    // A shot ends the idle stretch; the next one may bark again.
    d.hunt([shot(1, idleTick + 3)], frame(GAP * 3, idleTick + 3));
    const left = { ticksLeft: T.lastSeconds * 60 };
    expect(d.hunt([], frame(GAP * 4, idleTick + 10, left))?.trigger).toBe('lastSeconds');
  });

  it('quota met is said once, even if the gap delays it', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    d.hunt([{ type: 'emptyClick', tick: 1 }], frame(0));
    expect(d.hunt([], frame(10, 100, { quotaReached: true }))).toBeNull();
    expect(d.hunt([], frame(GAP, 101))?.trigger).toBe('quotaMet');
    expect(d.hunt([], frame(GAP * 2, 102, { quotaReached: true }))).toBeNull();
  });

  it('the kwêvoël has its own line; other non-targets the generic one', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const pen = (creature: string): SimEvent => ({
      type: 'penaltyApplied',
      tick: 1,
      birdId: 1,
      creature,
      points: -50,
    });
    expect(d.hunt([pen('kwevoel')], frame(0))?.trigger).toBe('kwevoel');
    expect(d.hunt([pen('hadeda')], frame(GAP))?.trigger).toBe('nonTarget');
  });

  it('outside the hunt: say() honours the gap too', () => {
    const d = new BarkDirector(T, GAP);
    expect(d.say('legend', 0)?.line).toBe('bark.legend');
    expect(d.say('badHunt', 1)).toBeNull();
  });

  it('first hunt of the day; every line is listed once (voice keys)', () => {
    expect(firstHuntToday(null, 20_000)).toBe(true);
    expect(firstHuntToday(19_999, 20_000)).toBe(true);
    expect(firstHuntToday(20_000, 20_000)).toBe(false);
    const lines = allBarkLines(T);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines.length).toBeGreaterThanOrEqual(35);
  });
});
