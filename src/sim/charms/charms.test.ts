// M6 "Done when": every launch charm has at least one test proving its effect — scoring charms
// through the scoreBag breakdown, ammo/world charms through sim state and events. Economy charms
// (Spaarblik, Padstal-Vriend) act on the run, so their effect tests live in run/run.test.ts; the
// coverage guard (tools/charmCoverage.test.ts) checks both files.
import { describe, expect, it } from 'vitest';
import {
  aimAt,
  base,
  eventEntry,
  karooOf,
  newSim,
  ofType,
  onlyEvent,
  quiet,
  run,
  settle,
  shootBird,
  shootPart,
  waitForBird,
  withMidFlock,
  type Content,
} from '../../../tools/simHarness';
import type { Charm } from '../../content/schemas';
import type { SimEvent } from '../events';
import { scoreBag, scoreEventBonus } from '../scoring/pipeline';
import { dropTier } from '../scoring/frenzy';
import type { Sim } from '../Sim';
import type { BirdView, ModeConfig, SeasonHuntConfig } from '../types';
import { createCharmEngine, passivesOf, type TriggerContext } from './interpreter';

function charm(id: string): Charm {
  const c = base.charms.charms.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no charm ${id}`);
  return c;
}

const engine = (ids: readonly string[]) => createCharmEngine(ids.map(charm));

const ctx = (over: Partial<TriggerContext> = {}): TriggerContext => ({
  streak: 1,
  frenzyTier: 0,
  omenActive: false,
  omen: null,
  biome: 'karoo-autumn',
  kwevoelCalling: false,
  ...over,
});

/** One bag of 10 base points through the real pipeline with these charms equipped. */
function bagWith(ids: readonly string[], over: Partial<TriggerContext> = {}, behaviourAdd = 0) {
  const out = engine(ids).bag(ctx(over));
  return scoreBag(
    { base: 10, behaviourAdd, weaponScoreMul: 1, frenzyMul: 1, stampedeMul: 1 },
    out.modifiers,
  );
}

function season(charms: readonly string[], over: Partial<SeasonHuntConfig> = {}): ModeConfig {
  return {
    id: 'seasonHunt',
    biome: 'karoo-autumn',
    weapon: 'dubbelloop',
    season: {
      kind: 'plain',
      boss: null,
      charms,
      consumables: [null, null],
      rental: null,
      runShellBonus: 0,
      ...over,
    },
  };
}

function flockBird(sim: Sim, skip: readonly number[] = []): BirdView {
  const b = sim
    .snapshot()
    .birds.find((x) => x.flockId !== null && x.hittable && !skip.includes(x.id));
  if (b === undefined) throw new Error('no flock bird');
  return b;
}

function scoreOf(ev: readonly SimEvent[]): Extract<SimEvent, { type: 'scoreAwarded' }> {
  const s = ofType(ev, 'scoreAwarded')[0];
  if (s === undefined) throw new Error('nothing bagged');
  return s;
}

/** A shot into empty sky, far above the ground flocks (a Miss). */
const skyShot = { t: 'fire', dx: 0, sy: 60 } as const;

/** Reload length in ticks after one shot (the tick it starts on counts: its timer runs then). */
function reloadTicks(mode: ModeConfig): number {
  const sim = newSim(quiet(), mode);
  run(sim, 1, [skyShot]);
  settle(sim);
  const ev = run(sim, 400, [{ t: 'reload' }]);
  const start = ofType(ev, 'reloadStarted')[0]?.tick ?? NaN;
  const end = ofType(ev, 'reloadFinished')[0]?.tick ?? NaN;
  return end - start + 1;
}

describe('oupa_se_bril — far-plane bags +15 points', () => {
  it('adds Punte on far bags only', () => {
    expect(bagWith(['oupa_se_bril'], { plane: 'far' })).toMatchObject({ points: 25, award: 25 });
    expect(bagWith(['oupa_se_bril'], { plane: 'mid' })).toMatchObject({ points: 10 });
    expect(bagWith(['oupa_se_bril'], { plane: 'far' }).breakdown).toContainEqual(
      expect.objectContaining({ kind: 'addPoints', source: 'oupa_se_bril', value: 15 }),
    );
  });
});

describe('ekstra_bandolier — +2 shell capacity', () => {
  it('the belt holds 10 instead of 8', () => {
    expect(newSim(quiet(), season([])).snapshot().weapon).toMatchObject({ magazine: 8, shells: 8 });
    expect(newSim(quiet(), season(['ekstra_bandolier'])).snapshot().weapon).toMatchObject({
      magazine: 10,
      shells: 10,
    });
  });
});

describe('snelhand — reload 30 % faster', () => {
  it('900 ms (54 ticks) becomes 42 ticks', () => {
    expect(reloadTicks(season([]))).toBe(54);
    expect(reloadTicks(season(['snelhand']))).toBe(42);
  });
});

describe('grondwerk — ground bags +1 Mult', () => {
  it('forage and alert bags only', () => {
    expect(bagWith(['grondwerk'], { behaviour: 'forage' }).mult).toBe(2);
    expect(bagWith(['grondwerk'], { behaviour: 'alert' }).mult).toBe(2);
    expect(bagWith(['grondwerk'], { behaviour: 'flying' }, 1).mult).toBe(2);
  });

  it('reaches the live breakdown of a bag in the sim', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c, season(['grondwerk']));
    const s = scoreOf(shootBird(sim, c, flockBird(sim)));
    expect(s.breakdown).toContainEqual(
      expect.objectContaining({ kind: 'addMult', source: 'grondwerk', value: 1 }),
    );
    expect(s.mult).toBe(2); // foraging: 1 + 0, +1 Grondwerk
  });
});

describe('vlerkskoot — flying bags +2 Mult', () => {
  it('flying only', () => {
    expect(bagWith(['vlerkskoot'], { behaviour: 'flying' }, 1).mult).toBe(4);
    expect(bagWith(['vlerkskoot'], { behaviour: 'run' }, 0.5).mult).toBe(1.5);
  });
});

describe('fluitjie — replaces the Vuvuzela: one threat to the nearest flock, 6 s cooldown', () => {
  it('nudges instead of flushing, has no charge limit, cools down for 6 s', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c, season(['fluitjie']));
    expect(sim.snapshot().gadget).toMatchObject({ id: 'fluitjie', charges: -1 });
    const ev = run(sim, 1, [{ t: 'gadget' }]);
    expect(ofType(ev, 'gadgetUsed')).toMatchObject([{ gadget: 'fluitjie', flocks: 1 }]);
    expect(ofType(ev, 'flockThreatened')).toMatchObject([{ source: 'gadget' }]);
    expect(ofType(ev, 'flockStateChanged').map((e) => e.to)).not.toContain('flush');
    expect(ofType(ev, 'charmTriggered')).toContainEqual(
      expect.objectContaining({ charm: 'fluitjie', trigger: 'gadget' }),
    );
    expect(ofType(run(sim, 1, [{ t: 'gadget' }]), 'gadgetDenied')).toMatchObject([
      { reason: 'cooldown' },
    ]);
    run(sim, 6 * 60);
    for (let i = 0; i < 3; i++) {
      expect(ofType(run(sim, 361, [{ t: 'gadget' }]), 'gadgetUsed')).toHaveLength(1);
    }
  });

  it('without it the gadget is still the Vuvuzela (2 charges, flushes)', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c, season([]));
    expect(sim.snapshot().gadget).toMatchObject({ id: 'vuvuzela', charges: 2 });
    const ev = run(sim, 1, [{ t: 'gadget' }]);
    expect(ofType(ev, 'flockStateChanged').map((e) => e.to)).toContain('flush');
  });
});

describe('spaarblik — interest cap +5', () => {
  it('raises the interest cap stat (the run applies it: run.test.ts)', () => {
    expect(passivesOf([charm('spaarblik')]).interestCap).toBe(5);
  });
});

describe('rooi_patrone / laaste_patroon — first shell ×2, last shell ×3', () => {
  it('match the shell position', () => {
    expect(bagWith(['rooi_patrone'], { shellIndex: 1 }).mult).toBe(2);
    expect(bagWith(['rooi_patrone'], { shellIndex: 2 }).mult).toBe(1);
    expect(bagWith(['rooi_patrone'], { shellIndex: null }).mult).toBe(1);
    expect(bagWith(['laaste_patroon'], { shellIndex: 8, lastShell: true }).mult).toBe(3);
    expect(bagWith(['laaste_patroon'], { shellIndex: 7, lastShell: false }).mult).toBe(1);
  });

  it('the sim knows which shell bagged the bird (2-shell belt)', () => {
    const c = withMidFlock(quiet());
    const gun = c.weapons.weapons.find((w) => w.id === 'dubbelloop');
    if (gun?.kind !== 'primary') throw new Error('dubbelloop');
    gun.magazine = 2;
    const sim = newSim(c, season(['rooi_patrone', 'laaste_patroon']));
    const first = flockBird(sim);
    const a = scoreOf(shootBird(sim, c, first));
    settle(sim);
    const b = scoreOf(shootBird(sim, c, flockBird(sim, [first.id])));
    const sources = (s: typeof a) =>
      s.breakdown.filter((x) => x.kind === 'mulMult').map((x) => x.source);
    expect(sources(a)).toEqual(['rooi_patrone']);
    expect(sources(b)).toEqual(['laaste_patroon']);
  });
});

describe('stil_loop — your misses no longer alert flocks', () => {
  it('a miss near a flock threatens it without the charm, not with it', () => {
    const missNear = (charms: readonly string[]): SimEvent[] => {
      const c = withMidFlock(quiet());
      const sim = newSim(c, season(charms));
      const b = flockBird(sim);
      return run(sim, 1, aimAt(c.scoring.planes[b.plane].scrollFactor, b.x, b.y - 200));
    };
    const plain = missNear([]);
    expect(ofType(plain, 'miss')).toHaveLength(1);
    expect(ofType(plain, 'flockThreatened')).toMatchObject([{ source: 'shot' }]);
    const quietGun = missNear(['stil_loop']);
    expect(ofType(quietGun, 'miss')).toHaveLength(1);
    expect(ofType(quietGun, 'flockThreatened')).toEqual([]);
  });
});

describe('bles_die_plaashond — every 12 s the farm dog sends a flock to RUN', () => {
  it('runs at tick 720 and sends the visible flock running', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c, season(['bles_die_plaashond']));
    const ev = run(sim, 721);
    expect(ofType(ev, 'worldEvent')).toMatchObject([{ event: 'farmDog', tick: 720 }]);
    expect(ofType(ev, 'flockStateChanged').filter((e) => e.tick === 720)).toMatchObject([
      { to: 'run', cause: 'event' },
    ]);
  });
});

describe('konsertina — every 10th consecutive bag refunds 2 shells', () => {
  it('fires once per shot on streaks 10, 20 …', () => {
    const e = engine(['konsertina']);
    const fired = (streak: number, first: boolean) =>
      e.bag(ctx({ streak, firstBagOfShot: first })).fired.map((f) => f.actions.addShells);
    expect(fired(10, true)).toEqual([2]);
    expect(fired(10, false)).toEqual([]);
    expect(fired(20, true)).toEqual([2]);
    expect(fired(9, true)).toEqual([]);
  });

  it('the sim puts refunded shells back in the belt, up to its size', () => {
    const c = quiet();
    c.charms.charms.push({
      id: 'test_refund',
      rarity: 'common',
      archetype: 'ammo',
      effects: [{ on: 'shot', do: { addShells: 2 } }],
    });
    const sim = newSim(c, season(['test_refund']));
    const ev = run(sim, 1, [skyShot]);
    expect(ofType(ev, 'shellsAdded')).toMatchObject([{ added: 1, shells: 8 }]);
    expect(sim.snapshot().weapon.shells).toBe(8);
  });
});

describe('hadeda_fluit — a hadeda every 15 s; its penalty removed', () => {
  it('the hadeda flies over at tick 900, alerts the flocks, and costs nothing', () => {
    const c = withMidFlock(quiet());
    const hadeda = eventEntry('hadeda') as Content['biomes'][number]['events'][number];
    hadeda.perHunt = [0, 0];
    karooOf(c).events = [hadeda];
    const sim = newSim(c, season(['hadeda_fluit']));
    const ev = run(sim, 901);
    expect(ofType(ev, 'birdSpawned').filter((e) => e.creature === 'hadeda')).toMatchObject([
      { tick: 900 },
    ]);
    expect(ofType(ev, 'flockThreatened').filter((e) => e.tick === 900)).toMatchObject([
      { source: 'event' },
    ]);
    const bird = waitForBird(sim, c, 'hadeda');
    const before = sim.snapshot().score;
    const shot = shootBird(sim, c, bird);
    expect(ofType(shot, 'penaltyApplied')).toMatchObject([{ creature: 'hadeda', points: 0 }]);
    expect(sim.snapshot().score).toBe(before);
  });
});

describe('windleser — no wind drift; +1 Mult in Omen hunts', () => {
  it('far shots land where aimed in an Omen hunt', () => {
    const impact = (charms: readonly string[]) => {
      const sim = newSim(quiet(), season(charms, { kind: 'omen' }));
      expect(sim.snapshot().wind).not.toBeNull();
      return ofType(run(sim, 1, [skyShot]), 'pelletImpact')[0]?.dx;
    };
    expect(impact([])).not.toBe(0);
    expect(impact(['windleser'])).toBe(0);
  });

  it('+1 Mult only while the omen is on', () => {
    expect(bagWith(['windleser'], { omenActive: true }).mult).toBe(2);
    expect(bagWith(['windleser'], { omenActive: false }).mult).toBe(1);
  });
});

describe('haelstorm — every 8th shot is a Voorlaaier blast', () => {
  it('shot 8 goes off with 24 pellets on a normal shell', () => {
    const sim = newSim(quiet(), season(['haelstorm']));
    const shots: Extract<SimEvent, { type: 'shotFired' }>[] = [];
    const pellets: number[] = [];
    for (let i = 0; i < 8; i++) {
      const ev = run(sim, 1, [skyShot]);
      shots.push(...ofType(ev, 'shotFired'));
      pellets.push(ofType(ev, 'pelletImpact').length);
      settle(sim);
    }
    expect(shots.map((s) => s.weapon)).toEqual([
      ...Array<string>(7).fill('dubbelloop'),
      'voorlaaier',
    ]);
    expect(pellets).toEqual([...Array<number>(7).fill(8), 24]);
    expect(shots[7]?.shellsLeft).toBe(0);
  });
});

describe('padstal_vriend — +1 charm offer, rerolls 1 cheaper', () => {
  it('holds the shop stats (the run applies them: run.test.ts)', () => {
    expect(passivesOf([charm('padstal_vriend')])).toMatchObject({
      shopSlots: 1,
      rerollDiscount: 1,
    });
  });
});

describe('stampede_kenner — Season Run hunts get a Stampede', () => {
  it('the last 15 s are a Stampede', () => {
    const start = (charms: readonly string[]) =>
      ofType(newSim(quiet(), season(charms)).drainEvents(), 'huntStarted')[0]?.stampedeAtTick;
    expect(start([])).toBeNull();
    expect(start(['stampede_kenner'])).toBe(45 * 60);
  });
});

describe('hele_swerm — Whole Flock bonus ×3', () => {
  it('multiplies the Whole Flock bonus only', () => {
    const p = passivesOf([charm('hele_swerm')]);
    expect(p.bonusMul).toEqual({ wholeFlock: 3, twoFlies: 1, secretChain: 1 });
    const award = scoreEventBonus(180, {
      frenzyMul: 1.5,
      stampedeMul: 1,
      multipliers: ['frenzy', 'stampede'],
      bonusMul: p.bonusMul.wholeFlock,
    });
    expect(award).toBe(810);
  });
});

/** A Voorlaaier rental blast into the middle of a mid flock (several birds at once). */
function blastFlock(charms: readonly string[]): { sim: Sim; c: Content; ev: SimEvent[] } {
  const c = withMidFlock(quiet());
  const v = c.weapons.weapons.find((w) => w.id === 'voorlaaier');
  if (v === undefined) throw new Error('voorlaaier');
  v.spreadPx = 300;
  const sim = newSim(c, season(charms, { rental: 'voorlaaier' }));
  run(sim, 1, [{ t: 'consumable', slot: 2 }]);
  const birds = sim.snapshot().birds.filter((b) => b.flockId !== null);
  const mx = birds.reduce((t, b) => t + b.x, 0) / birds.length;
  const my = birds.reduce((t, b) => t + b.y, 0) / birds.length;
  const ev = run(sim, 1, aimAt(c.scoring.planes.mid.scrollFactor, mx, my - 30));
  return { sim, c, ev };
}

describe('kettingreaksie — each Twee Vlieë gives +0.2 Mult for the rest of the hunt', () => {
  it('builds up and applies to later bags at its slot', () => {
    const e = engine(['kettingreaksie']);
    e.trigger('twoFlies', ctx());
    e.trigger('twoFlies', ctx());
    expect(e.huntMults()[0]).toBeCloseTo(0.4);
    expect(e.bag(ctx()).modifiers).toMatchObject([{ source: 'kettingreaksie', op: 'addMult' }]);
  });

  it('in the sim a Twee Vlieë sets it off', () => {
    const { sim, c, ev } = blastFlock(['kettingreaksie']);
    expect(ofType(ev, 'bonusAwarded').map((b) => b.bonus)).toContain('twoFlies');
    expect(ofType(ev, 'charmTriggered')).toContainEqual(
      expect.objectContaining({ charm: 'kettingreaksie', trigger: 'twoFlies' }),
    );
    expect(sim.snapshot().season?.charmMults[0]).toBeCloseTo(0.2);
    run(sim, 200);
    const left = sim.snapshot().birds.find((b) => b.hittable && b.kind === 'target');
    if (left !== undefined) {
      const later = ofType(shootBird(sim, c, left), 'scoreAwarded')[0];
      if (later !== undefined) {
        expect(later.breakdown).toContainEqual(
          expect.objectContaining({ kind: 'addMult', source: 'kettingreaksie' }),
        );
      }
    }
  });

  it('charm bonusMul reaches the sim (a twoFlies ×3 test charm)', () => {
    const plain = blastFlock([]);
    const flies = ofType(plain.ev, 'bonusAwarded').find((b) => b.bonus === 'twoFlies');
    expect(flies).toBeDefined();
    const c = withMidFlock(quiet());
    c.charms.charms.push({
      id: 'test_flies',
      rarity: 'common',
      archetype: 'crowd',
      effects: [{ on: 'passive', do: { bonusMul: { bonus: 'twoFlies', mul: 3 } } }],
    });
    // Same blast, same seed: only the bonus changes.
    const boosted = (() => {
      const v = c.weapons.weapons.find((w) => w.id === 'voorlaaier');
      if (v === undefined) throw new Error('voorlaaier');
      v.spreadPx = 300;
      const sim = newSim(c, season(['test_flies'], { rental: 'voorlaaier' }));
      run(sim, 1, [{ t: 'consumable', slot: 2 }]);
      const birds = sim.snapshot().birds.filter((b) => b.flockId !== null);
      const mx = birds.reduce((t, b) => t + b.x, 0) / birds.length;
      const my = birds.reduce((t, b) => t + b.y, 0) / birds.length;
      return run(sim, 1, aimAt(c.scoring.planes.mid.scrollFactor, mx, my - 30));
    })();
    const b2 = ofType(boosted, 'bonusAwarded').find((b) => b.bonus === 'twoFlies');
    expect(b2?.base).toBe(flies?.base);
    expect(b2?.award).toBe((flies?.award ?? 0) * 3);
  });
});

describe('oupa_se_kaart — secrets glow; each secret +1 Mult for the hunt', () => {
  it('reveals secrets and builds Mult when one is set off', () => {
    const c = quiet();
    const sim = newSim(c, season(['oupa_se_kaart']));
    expect(sim.snapshot().season?.revealSecrets).toBe(true);
    expect(newSim(c, season([])).snapshot().season?.revealSecrets).toBe(false);
    const ev = shootPart(sim, c, 'potjie', 'lid');
    expect(ofType(ev, 'secretTriggered')).toHaveLength(1);
    expect(ofType(ev, 'charmTriggered')).toMatchObject([
      { charm: 'oupa_se_kaart', trigger: 'secret' },
    ]);
    expect(sim.snapshot().season?.charmMults).toEqual([1]);
  });
});

describe('boeretroos_fles — every flush triggers 1.5 s slow-mo', () => {
  it('a flush slows the creatures (in the sim) for 90 ticks', () => {
    const travelled = (charms: readonly string[]) => {
      const c = withMidFlock(quiet());
      const sim = newSim(c, season(charms));
      const ev = run(sim, 1, [{ t: 'gadget' }]);
      const before = new Map(sim.snapshot().birds.map((b) => [b.id, { x: b.x, y: b.y }]));
      run(sim, 40);
      const moved = sim.snapshot().birds.reduce((t, b) => {
        const p = before.get(b.id);
        return p === undefined ? t : t + Math.hypot(b.x - p.x, b.y - p.y);
      }, 0);
      return { ev, sim, moved };
    };
    const off = travelled([]);
    const on = travelled(['boeretroos_fles']);
    expect(ofType(off.ev, 'slowMo')).toEqual([]);
    expect(ofType(on.ev, 'slowMo')).toMatchObject([{ ticks: 90, scale: 0.5 }]);
    expect(on.sim.snapshot().season?.slowMo).toBe(true);
    expect(on.moved).toBeLessThan(off.moved * 0.75);
    run(on.sim, 60);
    expect(on.sim.snapshot().season?.slowMo).toBe(false);
  });
});

describe('kwevoel_se_seen — kwêvoël 3× as often; ×2 Mult while it calls', () => {
  it('×2 Mult only while a kwêvoël calls', () => {
    expect(bagWith(['kwevoel_se_seen'], { kwevoelCalling: true }).mult).toBe(2);
    expect(bagWith(['kwevoel_se_seen'], { kwevoelCalling: false }).mult).toBe(1);
  });

  it('adds kwêvoël visits from the charms stream; the base schedule is unchanged', () => {
    const visits = (charms: readonly string[]) => {
      const c = quiet();
      karooOf(c).events = [eventEntry('kwevoel')];
      return ofType(run(newSim(c, season(charms)), 60 * 60), 'worldEvent')
        .filter((e) => e.event === 'kwevoel')
        .map((e) => e.tick);
    };
    const without = visits([]);
    const withCharm = visits(['kwevoel_se_seen']);
    expect(withCharm.length).toBeGreaterThan(without.length);
    for (const t of without) expect(withCharm).toContain(t);
  });
});

describe('geheime_resep — a miss drops Frenzy one tier instead of resetting it', () => {
  it('drops to the start of the tier below', () => {
    const tiers = base.scoring.frenzyTiers;
    expect(dropTier(12, tiers)).toBe(6);
    expect(dropTier(7, tiers)).toBe(3);
    expect(dropTier(4, tiers)).toBe(0);
    expect(dropTier(2, tiers)).toBe(0);
  });

  it('in the sim a miss keeps part of the streak', () => {
    const streakAfterMiss = (charms: readonly string[]) => {
      const c = withMidFlock(quiet());
      c.scoring.frenzyTiers = [
        { atStreak: 1, mul: 1.5 },
        { atStreak: 2, mul: 2 },
      ];
      const sim = newSim(c, season(charms));
      const first = flockBird(sim);
      shootBird(sim, c, first);
      settle(sim);
      shootBird(sim, c, flockBird(sim, [first.id]));
      settle(sim);
      expect(sim.snapshot().streak).toBe(2);
      run(sim, 1, [skyShot]);
      return sim.snapshot().streak;
    };
    expect(streakAfterMiss([])).toBe(0);
    expect(streakAfterMiss(['geheime_resep'])).toBe(1);
  });
});

describe('generaal_se_pot — boss bags ×5; +1 shell capacity per boss bagged this run', () => {
  it('×5 on the boss bag and one shell of capacity for the run', () => {
    const c = onlyEvent(quiet(), 'bossAppearance');
    const sim = newSim(c, season(['generaal_se_pot'], { kind: 'boss', boss: 'generaal' }));
    run(sim, 60);
    let g = sim.snapshot().birds.find((b) => b.creature === 'generaal');
    if (g === undefined) throw new Error('generaal');
    shootBird(sim, c, g);
    settle(sim);
    g = sim.snapshot().birds.find((b) => b.creature === 'generaal');
    if (g === undefined) throw new Error('generaal gone');
    const s = scoreOf(shootBird(sim, c, g));
    expect(s.breakdown).toContainEqual(
      expect.objectContaining({ kind: 'mulMult', source: 'generaal_se_pot', value: 5 }),
    );
    expect(s.award).toBe(750); // 100 × (1 + run 0.5) × 5
    expect(sim.result()).toMatchObject({ bossesBagged: 1, shellCapacityForRun: 1 });
  });
});

describe('slot order (GDD §5.3, D-014)', () => {
  it('+Mult before ×Mult is worth more than after it', () => {
    const fwd = bagWith(['grondwerk', 'rooi_patrone'], { behaviour: 'forage', shellIndex: 1 });
    const rev = bagWith(['rooi_patrone', 'grondwerk'], { behaviour: 'forage', shellIndex: 1 });
    expect(fwd.mult).toBe(4); // (1 + 1) × 2
    expect(rev.mult).toBe(3); // 1 × 2 + 1
  });

  it('reordering mid-hunt (charmOrder) changes the next bag', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c, season(['rooi_patrone', 'grondwerk']));
    const ev = run(sim, 1, [{ t: 'charmOrder', order: [1, 0] }]);
    expect(ofType(ev, 'charmsReordered')).toMatchObject([
      { charms: ['grondwerk', 'rooi_patrone'] },
    ]);
    const s = scoreOf(shootBird(sim, c, flockBird(sim)));
    expect(s.mult).toBe(4);
    const c2 = withMidFlock(quiet());
    const sim2 = newSim(c2, season(['rooi_patrone', 'grondwerk']));
    run(sim2, 1);
    expect(scoreOf(shootBird(sim2, c2, flockBird(sim2))).mult).toBe(3);
  });

  it('a bad reorder is ignored', () => {
    const sim = newSim(quiet(), season(['rooi_patrone', 'grondwerk']));
    const ev = run(sim, 1, [{ t: 'charmOrder', order: [0, 1, 2] }]);
    expect(ofType(ev, 'charmsReordered')).toEqual([]);
  });
});
