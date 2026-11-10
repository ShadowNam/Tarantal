// v1.19 (D-084): the two special shotgun shells. Dragon's Breath: more pellets over a wider
// pattern that stops at the mid plane, any pellet a hit. The Slug: one heavy ball that reaches
// the far plane, drifts with the wind more and bags what it hits in one. Both count down only on
// shotgun shots, never stack, drop from crates only in a shotgun hunt and sell at the Padstal only
// in a shotgun run.
import { describe, expect, it } from 'vitest';
import {
  base,
  karooOf,
  newSim,
  ofType,
  quiet,
  run,
  shootBird,
  type Content,
  waitForBird,
} from '../../tools/simHarness';
import { activate, effectsOf, onShellFired, type ActivePowerup } from './powerups';
import { createRun, rollOffers } from './run/run';
import type { Sim } from './Sim';
import type { ModeConfig, SeasonHuntConfig } from './types';
import { eventEntry } from '../../tools/simHarness';

const dragon = base.powerups.powerups.find((p) => p.id === 'dragon_breath');
const slug = base.powerups.powerups.find((p) => p.id === 'slug');
const dubbelloop = base.weapons.weapons.find((w) => w.id === 'dubbelloop');

function season(over: Partial<SeasonHuntConfig> = {}, weapon = 'dubbelloop'): ModeConfig {
  return {
    id: 'seasonHunt',
    biome: 'karoo-autumn',
    weapon,
    season: {
      kind: 'plain',
      boss: null,
      charms: [],
      consumables: [null, null],
      rental: null,
      runShellBonus: 0,
      ...over,
    },
  };
}

/** A sim with `shell` in consumable slot 0, used on the first tick. */
function loaded(c: Content, shell: string, over: Partial<SeasonHuntConfig> = {}): Sim {
  const sim = newSim(c, season({ consumables: [shell, null], ...over }));
  const ev = run(sim, 1, [{ t: 'consumable', slot: 0 }]);
  expect(ofType(ev, 'powerupStarted')).toMatchObject([{ powerup: shell }]);
  return sim;
}

function withFlocks(c: Content, flocks: Record<string, number>): Content {
  for (const k of karooOf(c).pacing.keyframes) k.flocks = flocks;
  return c;
}

/** One early crate holding `item`. */
function crates(item: string): Content {
  const c = quiet();
  c.powerups.crates.perHunt = 1;
  c.powerups.crates.windows = [[0.01, 0.01]];
  c.powerups.crates.table = [{ id: item, weight: 1 }];
  return c;
}

describe('special shells: content (D-084)', () => {
  it('two shotgun-only shell power-ups in the crates and the Padstal', () => {
    expect(dragon?.needsShotgun).toBe(true);
    expect(slug?.needsShotgun).toBe(true);
    expect(dragon?.durationShells).toBeGreaterThan(0);
    expect(slug?.durationShells).toBeGreaterThan(0);
    expect(dragon?.padstalPrice).toBeGreaterThan(0);
    expect(slug?.padstalPrice).toBeGreaterThan(0);
    for (const id of ['dragon_breath', 'slug'])
      expect(base.powerups.crates.table.some((e) => e.id === id)).toBe(true);
    const shotguns = base.weapons.weapons.filter((w) => w.shotgun === true).map((w) => w.id);
    expect(shotguns.sort()).toEqual(['dubbelloop', 'pomp', 'voorlaaier']);
  });
});

describe('special shells: power-up rules (D-084)', () => {
  it('effectsOf names the loaded shell; a new one replaces the other', () => {
    if (dragon === undefined || slug === undefined) throw new Error('no shells');
    const list: ActivePowerup[] = [];
    expect(activate(list, dragon)).toEqual([]);
    expect(effectsOf(list).shell).toMatchObject({ kind: 'dragon_breath', reach: 'mid' });
    expect(activate(list, slug)).toEqual(['dragon_breath']);
    expect(list.map((p) => p.def.id)).toEqual(['slug']);
    expect(effectsOf(list).shell).toMatchObject({ kind: 'slug' });
  });

  it('shells count down only on shotgun shots; other shell power-ups on every shot', () => {
    if (slug === undefined) throw new Error('no slug');
    const buck = base.powerups.powerups.find((p) => p.id === 'bush_buckshot');
    if (buck === undefined) throw new Error('no buckshot');
    const list: ActivePowerup[] = [];
    activate(list, slug);
    activate(list, buck);
    expect(onShellFired(list, false)).toEqual([]);
    expect(list.find((p) => p.def.id === 'slug')?.shellsLeft).toBe(slug.durationShells);
    expect(list.find((p) => p.def.id === 'bush_buckshot')?.shellsLeft).toBe(
      (buck.durationShells ?? 0) - 1,
    );
    for (let i = 0; i < (slug.durationShells ?? 0) - 1; i++) onShellFired(list, true);
    expect(onShellFired(list, true)).toContain('slug');
  });
});

describe("Dragon's Breath in the sim (D-084)", () => {
  it('fires more pellets, counts its shells and ends after the last one', () => {
    const sim = loaded(quiet(), 'dragon_breath');
    const n = dragon?.durationShells ?? 0;
    const want = Math.round(
      (dubbelloop?.pellets ?? 0) * (dragon?.effect.dragonBreath?.pelletsMul ?? 1),
    );
    for (let i = 0; i < n; i++) {
      const ev = run(sim, 20, [{ t: 'fire', dx: 0, sy: 500 }]);
      expect(ofType(ev, 'shotFired')).toMatchObject([{ shell: 'dragon_breath' }]);
      expect(ofType(ev, 'pelletImpact')).toHaveLength(want);
      if (i === n - 1)
        expect(ofType(ev, 'powerupEnded')).toMatchObject([{ powerup: 'dragon_breath' }]);
      else expect(ofType(ev, 'powerupEnded')).toHaveLength(0);
    }
    // The next shot is a normal shell.
    const after = run(sim, 20, [{ t: 'fire', dx: 0, sy: 500 }]);
    expect(ofType(after, 'shotFired')[0]?.shell).toBeUndefined();
    expect(ofType(after, 'pelletImpact')).toHaveLength(dubbelloop?.pellets ?? 0);
  });

  it("caps the Voorlaaier's blast: never more than maxPellets, its own pattern kept", () => {
    const sim = loaded(quiet(), 'dragon_breath', { rental: 'voorlaaier' });
    run(sim, 1, [{ t: 'consumable', slot: 2 }]);
    const ev = run(sim, 20, [{ t: 'fire', dx: 0, sy: 500 }]);
    expect(ofType(ev, 'shotFired')).toMatchObject([
      { weapon: 'voorlaaier', shell: 'dragon_breath' },
    ]);
    const impacts = ofType(ev, 'pelletImpact');
    expect(impacts).toHaveLength(dragon?.effect.dragonBreath?.maxPellets ?? 0);
    // The pattern stays the Voorlaaier's own (300 px), not 2.4× it.
    const own = base.weapons.weapons.find((w) => w.id === 'voorlaaier')?.spreadPx ?? 0;
    for (const p of impacts) expect(Math.hypot(p.dx, p.sy - 500)).toBeLessThanOrEqual(own + 1);
  });

  it('the flame never reaches a far bird', () => {
    const c = withFlocks(quiet(), { far: 1 });
    const sim = loaded(c, 'dragon_breath');
    const bird = waitForBird(sim, c, 'tarentaal');
    expect(bird.plane).toBe('far');
    const ev = shootBird(sim, c, bird);
    expect(ofType(ev, 'shotFired')).toMatchObject([{ shell: 'dragon_breath' }]);
    expect(ofType(ev, 'pelletImpact').every((p) => p.birdId === null)).toBe(true);
  });

  it('one pellet on a mid bird is a hit (a bunched flock goes down)', () => {
    const c = withFlocks(quiet(), { mid: 1 });
    const sim = loaded(c, 'dragon_breath');
    const bird = waitForBird(sim, c, 'tarentaal');
    const ev = shootBird(sim, c, bird);
    const hit = new Set(
      ofType(ev, 'pelletImpact').flatMap((p) => (p.birdId === null ? [] : [p.birdId])),
    );
    const bagged = new Set(ofType(ev, 'targetBagged').map((b) => b.birdId));
    expect(hit.size).toBeGreaterThan(0);
    for (const id of hit) expect(bagged.has(id), `bird ${id}`).toBe(true);
  });

  it('is deterministic: the same seed and commands give the same events', () => {
    const events = (): string => {
      const c = withFlocks(quiet(), { mid: 1 });
      const sim = loaded(c, 'dragon_breath');
      const bird = waitForBird(sim, c, 'tarentaal');
      return JSON.stringify([...shootBird(sim, c, bird), ...run(sim, 30)]);
    };
    expect(events()).toBe(events());
  });
});

describe('the Slug in the sim (D-084)', () => {
  it('one ball, no spread, and it reaches a far bird', () => {
    const c = withFlocks(quiet(), { far: 1 });
    const sim = loaded(c, 'slug');
    const bird = waitForBird(sim, c, 'tarentaal');
    const ev = shootBird(sim, c, bird);
    expect(ofType(ev, 'shotFired')).toMatchObject([{ shell: 'slug' }]);
    const impacts = ofType(ev, 'pelletImpact');
    expect(impacts).toHaveLength(1);
    // It stops on the far flock (the front-most bird where it lands).
    const hit = sim.snapshot().birds.find((b) => b.id === impacts[0]?.birdId);
    expect(impacts[0]?.birdId).not.toBeNull();
    expect(ofType(ev, 'targetBagged').map((b) => b.birdId)).toContain(impacts[0]?.birdId);
    expect(hit === undefined || hit.plane === 'far').toBe(true);
  });

  it('bags an armoured three-hit boss in one shot', () => {
    const c = quiet();
    karooOf(c).events = [eventEntry('bossAppearance')];
    const boss = c.birds.creatures.find((x) => x.id === 'generaal');
    if (boss?.kind !== 'boss') throw new Error('no boss');
    boss.hitsToBag = 3;
    const sim = newSim(c, season({ kind: 'boss', boss: 'generaal', consumables: ['slug', null] }));
    const b = waitForBird(sim, c, 'generaal');
    run(sim, 1, [{ t: 'consumable', slot: 0 }]);
    const now = sim.snapshot().birds.find((x) => x.id === b.id) ?? b;
    const ev = shootBird(sim, c, now);
    expect(ofType(ev, 'targetBagged').map((x) => x.birdId)).toContain(b.id);
    expect(ofType(ev, 'armorKnocked')).toHaveLength(0);
  });

  it('drifts with the wind more than a normal shell', () => {
    const drift = (shell: string | null): number => {
      const sim = newSim(
        quiet(),
        season({ kind: 'omen', consumables: [shell ?? 'boeretroos', null] }),
      );
      if (shell !== null) run(sim, 1, [{ t: 'consumable', slot: 0 }]);
      else run(sim, 1);
      run(sim, 240);
      const ev = run(sim, 1, [{ t: 'fire', dx: 0, sy: 300 }]);
      const p = ofType(ev, 'pelletImpact');
      return Math.max(...p.map((x) => Math.abs(x.driftFarPx ?? 0)));
    };
    const plain = drift(null);
    const heavy = drift('slug');
    expect(plain).toBeGreaterThan(0);
    const ratio = (slug?.effect.slug?.windSensitivity ?? 0) / (dubbelloop?.windSensitivity ?? 1);
    expect(heavy / plain).toBeCloseTo(ratio, 1);
  });
});

describe('special shells: which guns (D-084)', () => {
  it('a rifle hunt never drops them; a shotgun hunt can', () => {
    for (const id of ['dragon_breath', 'slug']) {
      const rifle = newSim(crates(id), {
        id: 'classic',
        layout: 'mon',
        weapon: 'twee_twee',
        sight: 'scope_small',
      });
      expect(ofType(run(rifle, 60), 'crateSpawned')).toMatchObject([{ item: null }]);
      const shotgun = newSim(crates(id), { id: 'classic', layout: 'mon', weapon: 'pomp' });
      expect(ofType(run(shotgun, 60), 'crateSpawned')).toMatchObject([{ item: id }]);
    }
  });

  it('the Padstal offers them only in a shotgun run', () => {
    let seen = false;
    for (let seed = 1; seed <= 60; seed++) {
      const rifle = createRun(base, { seed, weapon: 'twee_twee', pool: [] });
      const shotgun = createRun(base, { seed, weapon: 'dubbelloop', pool: [] });
      for (let k = 0; k < 3; k++) {
        expect(
          rollOffers(base, rifle, k).some((o) => o.id === 'slug' || o.id === 'dragon_breath'),
        ).toBe(false);
        if (rollOffers(base, shotgun, k).some((o) => o.id === 'slug' || o.id === 'dragon_breath'))
          seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  it('a shell waits in its slot while no shotgun is in hand', () => {
    const sim = newSim(quiet(), season({ consumables: ['slug', null] }, 'twee_twee'));
    const ev = run(sim, 1, [{ t: 'consumable', slot: 0 }]);
    expect(ofType(ev, 'consumableUsed')).toHaveLength(0);
  });

  it('a non-shotgun crate gun fires normally and leaves the shells loaded', () => {
    const sim = loaded(quiet(), 'slug', { rental: 'mielie_masjien' });
    run(sim, 1, [{ t: 'consumable', slot: 2 }]);
    const ev = run(sim, 10, [{ t: 'fire', dx: 0, sy: 500 }]);
    expect(ofType(ev, 'shotFired')[0]).toMatchObject({ weapon: 'mielie_masjien' });
    expect(ofType(ev, 'shotFired')[0]?.shell).toBeUndefined();
    expect(sim.snapshot().powerups.find((p) => p.id === 'slug')?.shellsLeft).toBe(
      slug?.durationShells,
    );
  });
});
