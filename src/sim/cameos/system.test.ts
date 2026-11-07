// v1.13 (D-075, review round 2): the guard rule on the cameo system itself, with a fake host and
// hand-built shots: (a) a shot on a cameo with something a player shoots at near the aim point is
// never charged; (b) with nothing near, −10 once, nothing again inside the 2 s cooldown, −10 again
// after it; (c) a shot that hit a target (it bagged a bird) is never charged, even when a pellet
// also touched a cameo. Every hit plays the reaction either way.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { CAMEO_PREVIEW_SPOT } from '../../content/cameoPreview';
import type { ContentBundle } from '../../content/schemas';
import type { SimEvent } from '../events';
import { createRng } from '../rng';
import { createCameoSystem, type CameoShot, type CameoSystem } from './system';

const base = loadContent();
const C = base.cameos;

function setup(): {
  sys: CameoSystem;
  events: SimEvent[];
  points: () => number;
  step: (n: number) => void;
} {
  const content: ContentBundle = {
    ...base,
    cameos: {
      ...C,
      kinds: {
        ...C.kinds,
        tortoise: {
          ...C.kinds.tortoise,
          schedule: { ...C.kinds.tortoise.schedule, firstSeconds: [999, 999] },
        },
      },
      preview: { atSeconds: 0.1, kinds: ['tortoise'], ...CAMEO_PREVIEW_SPOT },
    },
  };
  let tick = 0;
  let pts = 0;
  const events: SimEvent[] = [];
  const sys = createCameoSystem(
    content,
    {
      layers: { near: { id: 'near', scrollFactor: 1 }, mid: { id: 'mid', scrollFactor: 0.6 } },
      groundY: { near: C.nearGroundY, mid: 760 },
      scrollFactor: { near: 1, mid: 0.6, far: 0.35, ver: 0.22 },
      herd: null,
      kinds: ['tortoise'],
      durationTicks: () => 90 * 60,
    },
    createRng(5).stream('cameos'),
    {
      tick: () => tick,
      emit: (e) => events.push(e),
      penalty: (p) => {
        pts += p;
      },
      cameraX: () => 960,
      busyNear: () => false,
      alarmTarget: () => null,
      threaten: () => undefined,
    },
  );
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      tick++;
      sys.step();
    }
  };
  return { sys, events, points: () => pts, step };
}

/** A shot whose aim point and pellets are on the tortoise's body (near layer: layer = screen). */
function shotAt(sys: CameoSystem, id: number, o: Partial<CameoShot> = {}): CameoShot {
  const v = sys.view().visits[0];
  const m = v?.members[0];
  const body = C.kinds.tortoise.hitboxes.adult[0];
  if (v === undefined || m === undefined || body === undefined) throw new Error('no tortoise');
  const at = { x: m.x + body.ox * v.facing, y: m.y + body.oy };
  return {
    shotId: id,
    hitVisits: [v.id],
    hitTarget: false,
    targetNearAim: false,
    aimOn: () => at,
    impactsOn: () => [at],
    ...o,
  };
}

const hits = (ev: SimEvent[]): Extract<SimEvent, { type: 'cameoHit' }>[] =>
  ev.filter((e): e is Extract<SimEvent, { type: 'cameoHit' }> => e.type === 'cameoHit');

describe('the cameos’ guard rule (D-075)', () => {
  it('(a) something a player shoots at near the aim point: no charge, the reaction plays', () => {
    const t = setup();
    t.step(10);
    t.sys.shot(shotAt(t.sys, 1, { targetNearAim: true }));
    const h = hits(t.events);
    expect(h).toHaveLength(1);
    expect(h[0]?.aimed).toBe(false);
    expect(h[0]?.points).toBe(0);
    expect(t.points()).toBe(0);
    expect(t.sys.view().visits[0]?.reaction).toBe('hide');
  });

  it('(b) nothing near: −10 once, nothing inside the cooldown, −10 again after it', () => {
    const t = setup();
    t.step(10);
    t.sys.shot(shotAt(t.sys, 1));
    expect(t.points()).toBe(-C.hit.penalty);
    t.step(Math.floor(C.hit.cooldownSeconds * 60) - 5);
    t.sys.shot(shotAt(t.sys, 2));
    expect(t.points()).toBe(-C.hit.penalty);
    expect(hits(t.events)[1]?.aimed).toBe(true);
    expect(hits(t.events)[1]?.points).toBe(0);
    t.step(10);
    t.sys.shot(shotAt(t.sys, 3));
    expect(t.points()).toBe(-2 * C.hit.penalty);
  });

  it('(c) a shot that hit a target (it bagged a bird) is never charged, even through a cameo', () => {
    const t = setup();
    t.step(10);
    t.sys.shot(shotAt(t.sys, 1, { hitTarget: true }));
    expect(t.points()).toBe(0);
    expect(hits(t.events)[0]?.aimed).toBe(false);
    expect(t.sys.view().visits[0]?.reaction).toBe('hide');
  });

  it('a pellet that missed the cameo plays nothing and costs nothing', () => {
    const t = setup();
    t.step(10);
    t.sys.shot(shotAt(t.sys, 1, { hitVisits: [] }));
    expect(hits(t.events)).toHaveLength(0);
    expect(t.points()).toBe(0);
  });
});
