// M8: Somer · Kalahari from content — heat haze that moves far birds' hitboxes, the storm (rain:
// flocks run, never fly; lightning never above the shared flash cap), its secrets (the weaver
// nest you must not shoot, the windpomp sign, the dead branch) and Die Stormvoël, who can only be
// hit while lightning lights him and crosses the sky far, then mid. Quiet content per test.
import { describe, expect, it } from 'vitest';
import {
  biomeOf,
  quiet,
  run,
  ofType,
  aimAt,
  secretOf,
  shootPart,
  shootBird,
  settle,
  withMidFlock,
  type Content,
} from '../../tools/simHarness';
import { secondsToTicks } from './clock';
import type { SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { BirdView, FlockState, ModeConfig, SeasonHuntConfig } from './types';

const KAL = 'kalahari-summer';
const classic = (omen?: boolean): ModeConfig => ({
  id: 'classic',
  biome: KAL,
  ...(omen === undefined ? {} : { omen }),
});

function sim(c: Content, mode: ModeConfig = classic(), seed = 3): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

function stormOf(c: Content) {
  const s = biomeOf(c, KAL).omen.storm;
  if (s === undefined) throw new Error('no storm');
  return s;
}

describe('Kalahari omen: heat haze, then the storm', () => {
  it('haze wobbles far birds (snapshot and hitbox) before the storm, not near/mid, not after', () => {
    const c = quiet(KAL);
    const k = biomeOf(c, KAL);
    for (const f of k.pacing.keyframes) f.flyoversPerMin = 30;
    const plain = sim(c, classic(false), 5);
    const hazy = sim(c, classic(true), 5);
    let seen = false;
    for (let i = 0; i < 600 && !seen; i++) {
      run(plain, 1);
      run(hazy, 1);
      const a = plain.snapshot().birds.find((b) => b.plane === 'far');
      const b = hazy.snapshot().birds.find((x) => x.id === a?.id);
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) > 1) seen = true;
      expect(Math.abs(dx)).toBeLessThanOrEqual(stormOf(c).hazePx + 1e-9);
    }
    expect(seen).toBe(true);
  });

  it('the storm breaks at stormAt: rain, and a flock that would flush keeps running', () => {
    const c = withMidFlock(quiet(KAL), KAL);
    const s = sim(c, classic(true));
    const at = Math.floor(stormOf(c).stormAt * secondsToTicks(90));
    const before = run(s, at - 1);
    expect(s.snapshot().rain).toBe(false);
    expect(ofType(before, 'weatherChanged')).toEqual([]);
    const breaking = run(s, 2);
    expect(ofType(breaking, 'weatherChanged')).toMatchObject([{ rain: true }]);
    expect(s.snapshot().rain).toBe(true);
    const states: FlockState[] = [];
    for (let i = 0; i < 3; i++) {
      const b = s.snapshot().birds.find((x) => x.flockId !== null);
      if (b === undefined) break;
      run(s, 1, aimAt(c.scoring.planes.mid.scrollFactor, b.x, b.y - 140));
      settle(s);
      states.push(s.snapshot().flocks[0]?.state ?? 'forage');
    }
    expect(states).toEqual(['alert', 'run', 'run']);
  });

  it('storm lightning keeps the flash cap (≥ 1/maxFlashesPerSecond s apart), only in the storm', () => {
    const c = quiet(KAL);
    const s = sim(c, classic(true));
    const ev = run(s, secondsToTicks(90));
    const flashes = ofType(ev, 'lightning').map((e) => e.tick);
    const at = Math.floor(stormOf(c).stormAt * secondsToTicks(90));
    expect(flashes.length).toBeGreaterThan(5);
    expect(flashes.every((t) => t >= at)).toBe(true);
    const gap = 60 / stormOf(c).maxFlashesPerSecond;
    for (let i = 1; i < flashes.length; i++) {
      expect((flashes[i] ?? 0) - (flashes[i - 1] ?? 0)).toBeGreaterThanOrEqual(gap);
    }
    // No omen (Classic): no storm, no lightning.
    expect(ofType(run(sim(c), secondsToTicks(90)), 'lightning')).toEqual([]);
  });
});

describe('Kalahari secrets (GDD §11.1)', () => {
  it("weaver nest: don't shoot it — −10, not a secret found, again after its cooldown", () => {
    const c = quiet(KAL);
    const s = sim(c);
    const first = shootPart(s, c, 'weaver_camelthorn', 'nest');
    expect(ofType(first, 'secretPenalty')).toMatchObject([
      { propId: 'weaver_camelthorn', points: -10 },
    ]);
    expect(ofType(first, 'secretTriggered')).toEqual([]);
    expect(s.snapshot().score).toBe(-10);
    expect(s.result().secrets).toBe(0);
    expect(secretOf(s, 'weaver_camelthorn').ready).toBe(false);
    run(s, secondsToTicks(2) + 1);
    shootPart(s, c, 'weaver_camelthorn', 'nest');
    expect(s.snapshot().score).toBe(-20);
  });

  it('windpomp sign: +5 s once', () => {
    const c = quiet(KAL);
    const s = sim(c);
    const before = s.snapshot().durationTicks;
    shootPart(s, c, 'windpomp_sign', 'sign');
    expect(s.snapshot().durationTicks).toBe(before + secondsToTicks(5));
  });

  it('dead camelthorn branch: +50 and the roosting flock bursts out flushing', () => {
    const c = quiet(KAL);
    const s = sim(c);
    const ev = shootPart(s, c, 'dead_camelthorn', 'branch');
    expect(ofType(ev, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 50 }]);
    expect(ofType(ev, 'flockSpawned')).toMatchObject([{ size: 8 }]);
    expect(ofType(ev, 'flockStateChanged')).toMatchObject([{ to: 'flush' }]);
  });
});

describe('Die Stormvoël (GDD §7 Summer boss): only lightning shows him', () => {
  function withVoel(): Content {
    const c = quiet(KAL);
    biomeOf(c, KAL).events = [
      {
        id: 'bossAppearance',
        creature: 'stormvoel',
        modes: ['classic', 'daily'],
        perHunt: [1, 1],
        window: [0.01, 0.01],
        passes: ['far', 'mid'],
      },
    ];
    return c;
  }

  it('brings his own lightning in Classic; between flashes he cannot be hit', () => {
    const c = withVoel();
    const s = sim(c);
    const ev: SimEvent[] = [];
    let dark: BirdView | undefined;
    let lit: BirdView | undefined;
    for (let i = 0; i < secondsToTicks(20) && (dark === undefined || lit === undefined); i++) {
      ev.push(...run(s, 1));
      const v = s.snapshot().birds.find((b) => b.creature === 'stormvoel');
      if (v === undefined) continue;
      if (s.snapshot().lightning) lit ??= v;
      else dark ??= v;
    }
    expect(ofType(ev, 'lightning').length).toBeGreaterThan(0);
    expect(dark?.hittable).toBe(false);
    expect(lit?.hittable).toBe(true);
  });

  it('crosses the far sky, then comes back the other way across the mid sky', () => {
    const c = withVoel();
    const s = sim(c);
    const seen: { id: number; plane: string; dir: number; x: number }[] = [];
    for (let i = 0; i < secondsToTicks(85); i++) {
      run(s, 1);
      const v = s.snapshot().birds.find((b) => b.creature === 'stormvoel');
      if (v === undefined) continue;
      const last = seen.at(-1);
      if (last?.id !== v.id) seen.push({ id: v.id, plane: v.plane, dir: 0, x: v.x });
      else if (last.dir === 0 && v.x !== last.x) last.dir = Math.sign(v.x - last.x);
    }
    expect(seen.map((p) => p.plane)).toEqual(['far', 'mid']);
    expect(seen[0]?.dir).toBe(-(seen[1]?.dir ?? 0));
  });

  it('keeps the hits he took on the far pass; three hits in all bag him', () => {
    const c = withVoel();
    const s = sim(c);
    const all: SimEvent[] = [];
    let farHit = false;
    for (let i = 0; i < secondsToTicks(85); i++) {
      all.push(...run(s, 1));
      const v = s.snapshot().birds.find((b) => b.creature === 'stormvoel');
      if (v === undefined || !v.hittable) continue;
      // One hit on the far pass, the rest on the mid pass.
      if (v.plane === 'far' && farHit) continue;
      const ev = shootBird(s, c, v);
      all.push(...ev, ...settle(s));
      if (v.plane === 'far' && ofType(ev, 'targetHit').length > 0) farHit = true;
      if (ofType(ev, 'targetBagged').length > 0) break;
    }
    expect(farHit).toBe(true);
    expect(ofType(all, 'targetHit').map((e) => e.hitsLeft)).toEqual([2, 1]);
    expect(ofType(all, 'targetBagged')).toMatchObject([{ creature: 'stormvoel', plane: 'mid' }]);
  });

  it('under his boss rule the rule lights him; flashes from every source keep the cap', () => {
    const c = withVoel();
    const season: SeasonHuntConfig = {
      kind: 'boss',
      boss: 'stormvoel',
      charms: [],
      consumables: [],
      rental: null,
      runShellBonus: 0,
    };
    const s = createSim({
      seed: 4,
      content: c,
      mode: { id: 'seasonHunt', biome: KAL, weapon: 'dubbelloop', season },
      inputKind: 'pointer',
    });
    const flashes = ofType(run(s, secondsToTicks(60)), 'lightning').map((e) => e.tick);
    expect(flashes.length).toBeGreaterThan(5);
    const cap = c.run.bossRules['darkExceptLightning']?.maxFlashesPerSecond ?? 3;
    for (let i = 1; i < flashes.length; i++) {
      expect((flashes[i] ?? 0) - (flashes[i - 1] ?? 0)).toBeGreaterThanOrEqual(60 / cap);
    }
  });
});
