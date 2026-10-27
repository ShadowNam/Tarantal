import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../../sim/clock';
import {
  bubbleAt,
  coalGlow,
  FLIGHT_TICKS,
  LID_REST,
  lidFlight,
  lidOnPot,
  lidPose,
  RATTLE_CYCLE,
  RATTLE_CYCLE_CALM,
  RATTLE_TICKS,
  rattleClack,
  rattleStart,
  RIM_Y,
  steam,
  type PotState,
} from './potjieMotion';

const on = (tick: number, o: Partial<PotState> = {}): PotState => ({
  tick,
  sinceOff: null,
  calm: false,
  wind: 0,
  ...o,
});

describe('potjie motion (D-051)', () => {
  it('every pose is a pure function of the tick (a held frame holds, a replay matches)', () => {
    for (const t of [0, 77, 240, 1234, 9999]) {
      for (const s of [on(t), on(t, { calm: true }), on(t, { sinceOff: t % 90, wind: -0.4 })]) {
        expect(lidPose(s)).toEqual(lidPose({ ...s }));
        expect(steam(s)).toEqual(steam({ ...s }));
      }
      expect(coalGlow(t, false)).toBe(coalGlow(t, false));
      expect(bubbleAt(t, true)).toBe(bubbleAt(t, true));
    }
  });

  it('the lid sits still on the rim between rattles and rattles once a cycle', () => {
    for (let c = 0; c < 20; c++) {
      const start = rattleStart(c * RATTLE_CYCLE, false);
      // The rattle starts inside its cycle and ends before the next one.
      expect(start).toBeGreaterThanOrEqual(c * RATTLE_CYCLE);
      expect(start + RATTLE_TICKS).toBeLessThan((c + 1) * RATTLE_CYCLE);
      expect(lidOnPot(start - 1, false)).toEqual({ x: 0, y: RIM_Y, rot: 0, rattling: false });
      expect(lidOnPot(start + 3, false).rattling).toBe(true);
      expect(lidOnPot(start + 3, false).y).toBeLessThan(RIM_Y);
      expect(lidOnPot(start + RATTLE_TICKS, false).rattling).toBe(false);
      let clacks = 0;
      for (let t = c * RATTLE_CYCLE; t < (c + 1) * RATTLE_CYCLE; t++)
        if (rattleClack(t, false)) clacks++;
      expect(clacks).toBe(RATTLE_TICKS / 6);
    }
  });

  it('reduce motion: rarer, smaller rattles and fewer wisps', () => {
    expect(RATTLE_CYCLE_CALM).toBeGreaterThan(RATTLE_CYCLE);
    let lift = 0;
    let calmLift = 0;
    for (let t = 0; t < 30 * TICKS_PER_SECOND; t++) {
      lift = Math.max(lift, RIM_Y - lidOnPot(t, false).y);
      calmLift = Math.max(calmLift, RIM_Y - lidOnPot(t, true).y);
    }
    expect(calmLift).toBeGreaterThan(0);
    expect(calmLift).toBeLessThan(lift);
    expect(steam(on(5, { calm: true })).length).toBeLessThan(steam(on(5)).length);
  });

  it('shot: the lid pops up, tumbles and comes to rest on the ground beside the pot', () => {
    const start = lidFlight(0);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(RIM_Y);
    // Up first (the pop), well above the rim.
    const top = Math.min(...Array.from({ length: FLIGHT_TICKS }, (_, i) => lidFlight(i).y));
    expect(top).toBeLessThan(RIM_Y - 60);
    expect(lidFlight(FLIGHT_TICKS).landed).toBe(true);
    // At rest beside the pot for the rest of the hunt.
    for (const s of [FLIGHT_TICKS + 12, 600, 10_000])
      expect(lidFlight(s)).toEqual({ ...LID_REST, landed: true });
    expect(LID_REST.x).toBeGreaterThan(60);
    // Off the pot: no more rattles, the pose follows sinceOff only.
    expect(lidPose(on(500, { sinceOff: 400 }))).toEqual(lidPose(on(9, { sinceOff: 400 })));
  });

  it('lid off: the pot steams freely (more wisps, a big puff just after the pop)', () => {
    const lidded = steam(on(300));
    const open = steam(on(300, { sinceOff: 200 }));
    expect(open.length).toBeGreaterThan(lidded.length);
    expect(steam(on(300, { sinceOff: 5 })).length).toBeGreaterThan(open.length);
  });

  it('steam drifts with the wind and fades as it rises', () => {
    const still = steam(on(100));
    const windy = steam(on(100, { wind: 0.8 }));
    const sum = (ws: readonly { x: number }[]): number => ws.reduce((a, w) => a + w.x, 0);
    expect(sum(windy)).toBeGreaterThan(sum(still));
    expect(sum(steam(on(100, { wind: -0.8 })))).toBeLessThan(sum(still));
    for (const w of steam(on(100, { sinceOff: 300 }))) {
      expect(w.alpha).toBeGreaterThanOrEqual(0);
      expect(w.alpha).toBeLessThanOrEqual(1);
      expect(w.y).toBeLessThan(RIM_Y);
    }
  });

  it('the coals flicker gently inside a narrow band (calmer with reduce motion)', () => {
    const range = (calm: boolean): [number, number] => {
      const v = Array.from({ length: 600 }, (_, t) => coalGlow(t, calm));
      return [Math.min(...v), Math.max(...v)];
    };
    const [lo, hi] = range(false);
    const [clo, chi] = range(true);
    expect(lo).toBeGreaterThan(0.25);
    expect(hi).toBeLessThanOrEqual(1);
    expect(chi - clo).toBeLessThan(hi - lo);
  });
});
