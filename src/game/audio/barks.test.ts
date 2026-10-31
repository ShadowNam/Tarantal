import { describe, expect, it } from 'vitest';
import { loadContent, loadFeel } from '../../../tools/testContent';
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
  it("v1.6b: Oupa Laai's first auto reload after a pickup says his line, held over the gap", () => {
    const d = new BarkDirector(T, GAP, new Set(['oupa_laai']));
    d.startHunt(0);
    const start: SimEvent = {
      type: 'powerupStarted',
      tick: 1,
      powerup: 'oupa_laai',
      source: 'crate',
    };
    const auto: SimEvent = { type: 'reloadStarted', tick: 2, perShell: false, auto: true };
    const manual: SimEvent = { type: 'reloadStarted', tick: 2, perShell: false };
    expect(
      d.hunt(
        [
          start,
          {
            type: 'crateOpened',
            tick: 1,
            crateId: 1,
            item: 'oupa_laai',
            itemType: 'powerup',
          } as SimEvent,
        ],
        frame(0),
      )?.line,
    ).toBe('bark.crate');
    expect(d.hunt([manual], frame(100))).toBeNull();
    // Inside the gap: held, then said once the gap is over.
    expect(d.hunt([auto], frame(200))).toBeNull();
    expect(d.hunt([], frame(GAP + 1))?.line).toBe('bark.oupa_laai');
    // Later auto reloads stay quiet until the next pickup (and the trigger's cooldown).
    expect(d.hunt([auto], frame(3 * GAP))).toBeNull();
    const cd = T.triggers.oupaLaai.cooldownMs;
    // Another power-up's pickup doesn't re-arm it.
    const chilli: SimEvent = {
      type: 'powerupStarted',
      tick: 3,
      powerup: 'chilli_biltong',
      source: 'crate',
    };
    expect(d.hunt([chilli, auto], frame(GAP + 1 + cd + 1))).toBeNull();
    expect(d.hunt([start, auto], frame(GAP + 2 + cd + 1))?.line).toBe('bark.oupa_laai');
  });

  it('v1.6b: a held Oupa Laai line is dropped when the power-up runs out', () => {
    const d = new BarkDirector(T, GAP, new Set(['oupa_laai']));
    d.startHunt(0);
    const crate = {
      type: 'crateOpened',
      tick: 1,
      crateId: 1,
      item: 'oupa_laai',
      itemType: 'powerup',
    } as SimEvent;
    expect(d.hunt([crate], frame(0))?.line).toBe('bark.crate');
    d.hunt([{ type: 'reloadStarted', tick: 2, perShell: false, auto: true }], frame(100));
    d.hunt([{ type: 'powerupEnded', tick: 3, powerup: 'oupa_laai' }], frame(200));
    expect(d.hunt([], frame(GAP + 1))).toBeNull();
  });

  it('lastSaidAt is when the last line went out (the e2e gap clock), -Infinity before any', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    expect(d.lastSaidAt).toBe(-Infinity);
    expect(d.hunt([{ type: 'reenbuiRain', tick: 100 }], frame(1234))).not.toBeNull();
    expect(d.lastSaidAt).toBe(1234);
  });

  it('v1.10 (D-067): Reënbui — the first drops, the swarm (held over the gap), the rain easing', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    expect(d.hunt([{ type: 'reenbuiRain', tick: 100 }], frame(0))?.line).toBe('bark.reenbui_rain');
    // The swarm rises inside the gap: held, said once the gap has passed.
    expect(
      d.hunt([{ type: 'alatesSwarm', tick: 280, mult: 1.3, columns: [] }], frame(1000)),
    ).toBeNull();
    expect(d.hunt([], frame(GAP + 10))?.line).toBe('bark.reenbui_swarm');
    expect(d.hunt([{ type: 'rainEased', tick: 1200, bagged: 4 }], frame(GAP * 2 + 20))?.line).toBe(
      'bark.reenbui_eased',
    );
  });

  it('fires on a bag streak and a miss streak of the configured length', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const bags = Array.from({ length: T.bagStreak }, (_, i) => bag(i + 1));
    expect(d.hunt(bags, frame(0))?.trigger).toBe('bagStreak');
    const misses = Array.from({ length: T.missStreak }, (_, i) => miss(i + 10));
    expect(d.hunt(misses, frame(GAP))?.trigger).toBe('missStreak');
  });

  it('v1.8 (D-050): a tin can juggled barks.canChain times in a row gets Oupa’s line', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const juggle = (chain: number): SimEvent => ({
      type: 'canJuggled',
      tick: 100,
      shotId: chain,
      canId: 2_000_000,
      plane: 'mid',
      x: 0,
      y: 0,
      chain,
      pellets: 8,
      side: 0,
      marks: [],
      points: 10,
    });
    expect(d.hunt([juggle(T.canChain - 1)], frame(0))).toBeNull();
    const b = d.hunt([juggle(T.canChain)], frame(1));
    expect(b?.trigger).toBe('canChain');
    expect(b?.line).toMatch(/^bark\.blik_/);
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

  it('idle waits out the gap instead of being lost, says it once; the last seconds go out on time', () => {
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

  it('1.9.2 (D-055): the ten-second call is said on the tick the clock reaches 10 s, even right after the Stampede bark', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const tps = 60;
    const at = T.lastSeconds * tps;
    // The Stampede starts at 15 s left and Oupa calls it (it claims the 6 s gap).
    const stampede: SimEvent = { type: 'stampedeStarted', tick: 1000 };
    const s = d.hunt([stampede], frame(50_000, 1000, { ticksLeft: 15 * tps }));
    expect(s?.trigger).toBe('stampede');
    // 15 s → 10 s left: 5 s later, inside the gap. One tick before the crossing: nothing.
    expect(d.hunt([], frame(54_983, 1299, { ticksLeft: at + 1 }))).toBeNull();
    // The crossing tick: said now, though the gap has a second to run.
    const call = d.hunt([], frame(55_000, 1300, { ticksLeft: at }));
    expect(call?.trigger).toBe('lastSeconds');
    expect(call?.urgent).toBe(true);
    expect(call?.line).toBe('bark.ten_seconds');
    // Once only, and it claims the gap.
    expect(d.hunt([{ type: 'emptyClick', tick: 1301 }], frame(55_020, 1301))).toBeNull();
  });

  it('1.9.2 (D-055): a ten-second call that would come late is never said', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    const tps = 60;
    // First frame seen inside the window: 9.6 s left → said (late window 0.5 s).
    const late = Math.ceil((T.lastSeconds - T.lastSecondsLateSeconds) * tps);
    expect(d.hunt([], frame(0, 10, { ticksLeft: late }))?.trigger).toBe('lastSeconds');
    const e = new BarkDirector(T, GAP);
    e.startHunt(0);
    // First frame seen past the window (a long stall): 9 s left → nothing, then or later.
    expect(e.hunt([], frame(0, 10, { ticksLeft: 9 * tps }))).toBeNull();
    expect(e.hunt([], frame(GAP * 2, 11, { ticksLeft: 9 * tps - 1 }))).toBeNull();
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

  it("a secret's bark claims the gap: no generic line that frame or for the gap after", () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    d.secret(0);
    const click: SimEvent[] = [{ type: 'emptyClick', tick: 1 }];
    expect(d.hunt(click, frame(0))).toBeNull();
    expect(d.hunt(click, frame(GAP - 1))).toBeNull();
    expect(d.waitMs(GAP - 1)).toBe(1);
    expect(d.hunt(click, frame(GAP))?.trigger).toBe('emptyClick');
    expect(d.waitMs(GAP)).toBe(GAP);
  });

  it('a boss or the Stampede during the gap is said once it ends (lasting), only once', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    expect(d.hunt([{ type: 'emptyClick', tick: 1 }], frame(0))?.trigger).toBe('emptyClick');
    const boss: SimEvent = {
      type: 'birdSpawned',
      tick: 2,
      birdId: 9,
      creature: 'generaal',
      plane: 'mid',
      motion: 'boss',
    };
    expect(d.hunt([boss, { type: 'stampedeStarted', tick: 2 }], frame(10))).toBeNull();
    expect(d.hunt([], frame(GAP))?.trigger).toBe('boss'); // higher priority first
    expect(d.hunt([], frame(GAP * 2))?.trigger).toBe('stampede');
    expect(d.hunt([], frame(GAP * 3))).toBeNull();
  });
});

describe('special-day lines (D-048)', () => {
  const special = loadContent().feesdae.specials.find((f) => f.id === 'halloween');
  if (special === undefined) throw new Error('no halloween');
  const started: SimEvent = { type: 'feesdagStarted', tick: 0, feesdag: 'halloween', lanterns: 4 };
  const hit = (thing: 'bat' | 'owl' | 'lantern'): SimEvent => ({
    type: 'spookHit',
    tick: 100,
    shotId: 1,
    thing,
    id: 9,
    plane: 'mid',
    x: 0,
    y: 0,
    points: thing === 'bat' ? 15 : thing === 'owl' ? -10 : 0,
    lanternsLit: 2,
  });

  it("speaks the special's start, bat, owl, lanterns-out and end lines in its own hunt", () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0, special.barks);
    expect(d.hunt([started], frame(0))?.line).toBe(special.barks.start);
    expect(d.hunt([hit('bat')], frame(GAP + 1))?.line).toBe(special.barks.bat);
    expect(d.hunt([hit('owl')], frame(GAP * 2 + 2))?.line).toBe(special.barks.owl);
    expect(d.hunt([{ type: 'lanternsOut', tick: 200, points: 25 }], frame(GAP * 3 + 3))?.line).toBe(
      special.barks.lanternsOut,
    );
    expect(d.say('feesdagEnd', GAP * 4 + 4)?.line).toBe(special.barks.end);
    expect(allBarkLines(T, [special.barks])).toContain(special.barks.owl);
  });

  it('says none of them on an ordinary hunt', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0);
    expect(d.hunt([started, hit('bat')], frame(0))).toBeNull();
    expect(d.say('feesdagEnd', GAP + 1)).toBeNull();
  });
});

describe('Christmas in the sun lines (D-064)', () => {
  const special = loadContent().feesdae.specials.find((f) => f.id === 'christmas');
  if (special === undefined) throw new Error('no christmas');
  const b = special.barks;
  const started: SimEvent = {
    type: 'feesdagStarted',
    tick: 0,
    feesdag: 'christmas',
    lanterns: 0,
    presents: 3,
  };
  const opened = (left: number): SimEvent => ({
    type: 'presentOpened',
    tick: 100,
    shotId: 1,
    id: 9,
    plane: 'mid',
    x: 0,
    y: 0,
    presentsLeft: left,
  });

  it('speaks the start, a present found, all found and the end lines', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0, b);
    expect(d.hunt([started], frame(0))?.line).toBe(b.start);
    expect(d.hunt([opened(2)], frame(GAP + 1))?.line).toBe(b.present);
    // The last present says "all found" (held until said), not the single-present line.
    expect(
      d.hunt([opened(0), { type: 'presentsFound', tick: 200, points: 25 }], frame(GAP * 2 + 2))
        ?.line,
    ).toBe(b.presentsFound);
    expect(d.say('feesdagEnd', GAP * 3 + 3)?.line).toBe(b.end);
  });

  it('a long dry spell says the Christmas dry line instead of the idle one', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0, b);
    const idleTicks = T.idleSeconds * 60 + 1;
    expect(d.hunt([], frame(GAP + 1, idleTicks))?.line).toBe(b.dry);
  });

  it('has no Halloween lines, and Halloween has no Christmas ones', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0, b);
    d.hunt([started], frame(0));
    const bat: SimEvent = {
      type: 'spookHit',
      tick: 100,
      shotId: 1,
      thing: 'bat',
      id: 9,
      plane: 'mid',
      x: 0,
      y: 0,
      points: 15,
      lanternsLit: 0,
    };
    expect(d.hunt([bat], frame(GAP + 1))).toBeNull();
    const h = new BarkDirector(T, GAP);
    const hb = loadContent().feesdae.specials.find((f) => f.id === 'halloween')?.barks ?? null;
    h.startHunt(0, hb);
    expect(h.hunt([opened(2)], frame(GAP + 1))).toBeNull();
    // On Halloween a dry spell is still the idle line.
    expect(h.hunt([], frame(GAP * 2 + 2, T.idleSeconds * 60 + 1))?.trigger).toBe('idle');
  });
});

describe('New Year countdown lines (D-065)', () => {
  const special = loadContent().feesdae.specials.find((f) => f.id === 'newyear');
  if (special === undefined) throw new Error('no newyear');
  const b = special.barks;
  const started: SimEvent = { type: 'feesdagStarted', tick: 0, feesdag: 'newyear', lanterns: 0 };
  const countdown: SimEvent = { type: 'countdownStarted', tick: 4800, endTick: 5400, mult: 2 };
  const tenLeft = (nowMs: number): ReturnType<typeof frame> => ({
    ...frame(nowMs, 4800),
    ticksLeft: T.lastSeconds * 60,
  });

  it('the start line, then the countdown line as the ten-second call (not the usual one)', () => {
    const d = new BarkDirector(T, GAP);
    d.startHunt(0, b);
    expect(d.hunt([started], frame(0))?.line).toBe(b.start);
    // Inside the gap: the ten-second call goes out anyway, with New Year's own line.
    const call = d.hunt([countdown], tenLeft(100));
    expect(call?.trigger).toBe('feesdagCountdown');
    expect(call?.line).toBe(b.countdown);
    expect(call?.urgent).toBe(true);
    expect(d.say('feesdagEnd', GAP * 3)?.line).toBe(b.end);
  });

  it('a big bag or a two-in-one in the countdown says the big-shot line; before it, no', () => {
    const big: SimEvent = {
      type: 'scoreAwarded',
      tick: 4900,
      birdId: 1,
      points: 30,
      mult: 4,
      award: T.countdownShotAward,
      breakdown: [],
    };
    const before = new BarkDirector(T, GAP);
    before.startHunt(0, b);
    expect(before.hunt([{ ...big, tick: 100 }], frame(GAP + 1))?.trigger).not.toBe('countdownShot');
    const d = new BarkDirector(T, GAP);
    d.startHunt(0, b);
    d.hunt([countdown], tenLeft(0));
    expect(d.hunt([big], frame(GAP + 1, 4900))?.line).toBe(b.countdownShot);
    const two: SimEvent = {
      type: 'bonusAwarded',
      tick: 5000,
      bonus: 'twoFlies',
      base: 15,
      award: 60,
    };
    expect(d.hunt([two], frame(GAP * 2 + 2 + 4000, 5000))?.line).toBe(b.countdownShot);
  });

  it('other days keep the usual ten-second call', () => {
    const d = new BarkDirector(T, GAP);
    const hb = loadContent().feesdae.specials.find((f) => f.id === 'christmas')?.barks ?? null;
    d.startHunt(0, hb);
    expect(d.hunt([], tenLeft(GAP + 1))?.trigger).toBe('lastSeconds');
  });
});
