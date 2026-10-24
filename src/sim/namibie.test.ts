// v1.4 B (D-039): Namibië from content — the mirage (far and Ver birds shimmer, hitboxes too; no
// flashes), the sociable-weaver family nest on the near plane (don't shoot it: −10 every 2 s)
// and the ostrich-egg flask secret. Quiet content per test.
import { describe, expect, it } from 'vitest';
import {
  biomeOf,
  quiet,
  run,
  ofType,
  secretOf,
  shootPart,
  type Content,
} from '../../tools/simHarness';
import { secondsToTicks } from './clock';
import { createSim, type Sim } from './Sim';
import { loadContent } from '../../tools/testContent';

const base = (): Content => loadContent() as Content;
import type { ModeConfig, PlaneId } from './types';

const NAM = 'namibie';
const classic = (omen?: boolean, layout?: string): ModeConfig => ({
  id: 'classic',
  biome: NAM,
  ...(omen === undefined ? {} : { omen }),
  ...(layout === undefined ? {} : { layout }),
});

function sim(c: Content, mode: ModeConfig = classic(), seed = 3): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

function mirageOf(c: Content) {
  const m = biomeOf(c, NAM).omen.mirage;
  if (m === undefined) throw new Error('no mirage');
  return m;
}

describe('Namibië omen: the mirage', () => {
  it('shimmers far and Ver birds (snapshot and hitbox) all hunt, within hazePx / verPx', () => {
    const c = quiet(NAM);
    const n = biomeOf(c, NAM);
    for (const f of n.pacing.keyframes) {
      f.flocks = { far: 1, ver: 1 };
      f.flyoversPerMin = 20;
    }
    const plain = sim(c, classic(false, 'mon'), 5);
    const hazy = sim(c, classic(true, 'mon'), 5);
    const seen = new Set<PlaneId>();
    const m = mirageOf(c);
    for (let i = 0; i < 1500; i++) {
      run(plain, 1);
      run(hazy, 1);
      for (const a of plain.snapshot().birds) {
        const b = hazy.snapshot().birds.find((x) => x.id === a.id);
        if (b === undefined) continue;
        const dx = Math.abs(b.x - a.x);
        if (a.plane === 'near' || a.plane === 'mid') expect(dx).toBeLessThan(1e-9);
        else {
          if (dx > 0.5) seen.add(a.plane);
          expect(dx).toBeLessThanOrEqual((a.plane === 'far' ? m.hazePx : m.verPx) + 1e-9);
        }
      }
      if (seen.has('far') && seen.has('ver')) break;
    }
    expect([...seen].sort()).toEqual(['far', 'ver']);
    expect(hazy.snapshot().mirage).toBe(true);
    expect(plain.snapshot().mirage).toBe(false);
  });

  it('the plain map (no weekday layout) leaves the Ver plane out, flocks and all', () => {
    const s = createSim({ seed: 9, content: base(), mode: classic(), inputKind: 'pointer' });
    run(s, secondsToTicks(30));
    expect(s.snapshot().flocks.some((f) => f.plane === 'ver')).toBe(false);
    expect(s.snapshot().birds.some((b) => b.plane === 'ver')).toBe(false);
    const tue = createSim({
      seed: 9,
      content: base(),
      mode: classic(false, 'tue'),
      inputKind: 'pointer',
    });
    run(tue, 2);
    expect(tue.snapshot().flocks.some((f) => f.plane === 'ver')).toBe(true);
  });

  it('never lights up the sky: no lightning, no rain', () => {
    const c = quiet(NAM);
    const s = sim(c, classic(true, 'tue'));
    const ev = run(s, secondsToTicks(20));
    expect(ofType(ev, 'weatherChanged')).toEqual([]);
    expect(s.snapshot().lightning).toBe(false);
  });
});

describe('Namibië secrets', () => {
  it("the family nest: don't shoot it — −10, not a secret found, again after its cooldown", () => {
    const c = quiet(NAM);
    const s = sim(c);
    const first = shootPart(s, c, 'nest_camelthorn', 'nest');
    expect(ofType(first, 'secretPenalty')).toMatchObject([
      { propId: 'nest_camelthorn', points: -10 },
    ]);
    expect(ofType(first, 'secretTriggered')).toEqual([]);
    expect(s.snapshot().score).toBe(-10);
    expect(secretOf(s, 'nest_camelthorn').ready).toBe(false);
    run(s, secondsToTicks(2) + 1);
    shootPart(s, c, 'nest_camelthorn', 'nest');
    expect(s.snapshot().score).toBe(-20);
  });

  it('the ostrich-egg flask: +60 once, and the roosting birds burst out', () => {
    const c = quiet(NAM);
    const s = sim(c);
    const ev = shootPart(s, c, 'quiver_egg', 'egg');
    expect(ofType(ev, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 60 }]);
    expect(ofType(ev, 'flockSpawned')).toMatchObject([{ size: 8 }]);
    expect(s.result().secrets).toBe(1);
  });

  it('is an area pack outside the Season Run, unlocked by Die Verste', () => {
    const c = quiet(NAM);
    expect(biomeOf(c, NAM).area).toEqual({ unlockBonus: 'dieVerste', quota: expect.any(Number) });
    expect(c.run.seasons.some((x) => x.biome === NAM)).toBe(false);
  });
});
