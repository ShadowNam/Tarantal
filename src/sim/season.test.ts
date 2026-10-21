// M6: Season Run hunts in the sim — the season block, Boss Hunts and their Boss Rules (GDD
// §13.1, §13.3; all four rules on the Generaal stand-in until M8), consumables and the weapon
// rental (GDD §10.3–10.4), and Season Run replays (InputLog v3).
import { describe, expect, it } from 'vitest';
import {
  aimAt,
  base,
  eventEntry,
  karooOf,
  newSim,
  ofType,
  quiet,
  run,
  shootBird,
  spawnsOf,
  withMidFlock,
} from '../../tools/simHarness';
import { loadContentHash } from '../../tools/testContent';
import { createEventHasher } from './events';
import { createRecorder, decodeInputLogText, encodeInputLogText } from './replay/inputLog';
import { runReplay } from './replay/verify';
import type { Sim } from './Sim';
import type { BirdView, Command, ModeConfig, SeasonHuntConfig } from './types';

function season(over: Partial<SeasonHuntConfig> = {}): ModeConfig {
  return {
    id: 'seasonHunt',
    biome: 'karoo-autumn',
    weapon: 'dubbelloop',
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

const bossHunt = (boss: string): ModeConfig => season({ kind: 'boss', boss });

function flockBird(sim: Sim): BirdView {
  const b = sim.snapshot().birds.find((x) => x.flockId !== null && x.hittable);
  if (b === undefined) throw new Error('no flock bird');
  return b;
}

describe('season block', () => {
  it('Omen hunts turn the biome weather on; plain hunts leave it off', () => {
    expect(newSim(quiet(), season({ kind: 'omen' })).snapshot().wind).not.toBeNull();
    expect(newSim(quiet(), season()).snapshot().wind).toBeNull();
  });

  it('rejects unknown charms, consumables, rentals and a boss hunt without a boss', () => {
    const c = quiet();
    expect(() => newSim(c, season({ charms: ['nope'] }))).toThrow(/charm/);
    expect(() => newSim(c, season({ charms: ['snelhand', 'snelhand'] }))).toThrow(/twice/);
    expect(() => newSim(c, season({ consumables: ['nope', null] }))).toThrow(/consumable/);
    expect(() => newSim(c, season({ rental: 'dubbelloop' }))).toThrow(/crate weapon/);
    expect(() => newSim(c, season({ kind: 'boss', boss: 'tarentaal' }))).toThrow(/boss/);
    const block = season().season;
    if (block === undefined) throw new Error('season block');
    expect(() => newSim(c, { id: 'classic', season: block })).toThrow(/Season Run block/);
  });

  it('a run shell bonus widens the belt', () => {
    expect(newSim(quiet(), season({ runShellBonus: 2 })).snapshot().weapon.magazine).toBe(10);
  });

  it('Classic hunts have no season view', () => {
    expect(newSim(quiet()).snapshot().season).toBeNull();
  });
});

describe('Boss Hunt (GDD §13.1)', () => {
  it('brings the biome boss (the Generaal stands in for every season boss)', () => {
    const c = quiet();
    karooOf(c).events = [eventEntry('bossAppearance')];
    for (const boss of ['generaal', 'ou_grys', 'kuifkop_koning', 'stormvoel']) {
      const ev = run(newSim(c, bossHunt(boss)), 60 * 60);
      expect(spawnsOf(ev, 'generaal'), boss).toHaveLength(1);
    }
    expect(spawnsOf(run(newSim(c, season()), 60 * 60), 'generaal')).toEqual([]);
  });

  it('the snapshot names the rule in force', () => {
    expect(newSim(quiet(), bossHunt('ou_grys')).snapshot().season).toMatchObject({
      kind: 'boss',
      bossRule: 'groundShotsZero',
    });
  });
});

describe('Boss Rules (GDD §13.3)', () => {
  it('Generaal — every miss alerts all flocks', () => {
    const missEvents = (mode: ModeConfig) => {
      const c = withMidFlock(quiet());
      const sim = newSim(c, mode);
      // Straight up into the sky, far from the ground flock: no normal alert.
      return run(sim, 1, [{ t: 'fire', dx: 0, sy: 40 }]);
    };
    const plain = missEvents(season());
    expect(ofType(plain, 'miss')).toHaveLength(1);
    expect(ofType(plain, 'flockThreatened')).toEqual([]);
    const boss = missEvents(bossHunt('generaal'));
    expect(ofType(boss, 'flockThreatened')).toMatchObject([{ source: 'event' }]);
  });

  it('Generaal — a near miss still threatens a flock only once (GDD §6.1)', () => {
    const nearMiss = (mode: ModeConfig) => {
      const c = withMidFlock(quiet());
      const sim = newSim(c, mode);
      const b = flockBird(sim);
      return run(sim, 1, aimAt(c.scoring.planes[b.plane].scrollFactor, b.x, b.y - 200));
    };
    for (const mode of [season(), bossHunt('generaal')]) {
      const ev = nearMiss(mode);
      expect(ofType(ev, 'miss')).toHaveLength(1);
      expect(ofType(ev, 'flockThreatened')).toMatchObject([{ source: 'shot' }]);
      expect(ofType(ev, 'flockStateChanged').map((e) => e.to)).toEqual(['alert']);
    }
  });

  it('Generaal — Stil Loop does not cancel the rule (the boss rule wins, D-023)', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c, season({ kind: 'boss', boss: 'generaal', charms: ['stil_loop'] }));
    const ev = run(sim, 1, [{ t: 'fire', dx: 0, sy: 40 }]);
    expect(ofType(ev, 'flockThreatened')).toMatchObject([{ source: 'event' }]);
  });

  it('Ou Grys — ground bags score 0, shown as a bossRule step', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c, bossHunt('ou_grys'));
    const s = ofType(shootBird(sim, c, flockBird(sim)), 'scoreAwarded')[0];
    expect(s?.award).toBe(0);
    expect(s?.breakdown.at(-1)).toMatchObject({ kind: 'bossRule', value: 0 });
  });

  it('Ou Grys — a ground-only shot earns no Twee Vlieë either', () => {
    const blast = (mode: ModeConfig) => {
      const c = withMidFlock(quiet());
      const v = c.weapons.weapons.find((w) => w.id === 'voorlaaier');
      if (v === undefined) throw new Error('voorlaaier');
      v.spreadPx = 300;
      const sim = newSim(c, mode);
      run(sim, 1, [{ t: 'consumable', slot: 2 }]);
      const birds = sim.snapshot().birds.filter((b) => b.flockId !== null);
      const mx = birds.reduce((t, b) => t + b.x, 0) / birds.length;
      const my = birds.reduce((t, b) => t + b.y, 0) / birds.length;
      const ev = run(sim, 1, aimAt(c.scoring.planes.mid.scrollFactor, mx, my - 30));
      return ofType(ev, 'bonusAwarded').find((b) => b.bonus === 'twoFlies');
    };
    const plain = blast(season({ rental: 'voorlaaier' }));
    expect(plain?.award).toBeGreaterThan(0);
    const ouGrys = blast(season({ kind: 'boss', boss: 'ou_grys', rental: 'voorlaaier' }));
    expect(ouGrys).toMatchObject({ base: plain?.base, award: 0 });
  });

  it('Kuifkop Koning — reload takes twice as long', () => {
    const reload = (mode: ModeConfig): number => {
      const sim = newSim(quiet(), mode);
      run(sim, 12, [{ t: 'fire', dx: 0, sy: 40 }]);
      const ev = run(sim, 400, [{ t: 'reload' }]);
      return (
        (ofType(ev, 'reloadFinished')[0]?.tick ?? 0) - (ofType(ev, 'reloadStarted')[0]?.tick ?? 0)
      );
    };
    expect(reload(bossHunt('kuifkop_koning')) + 1).toBe(2 * (reload(season()) + 1));
  });

  it('Stormvoël — dark except lightning, never more than 2 flashes a second', () => {
    const sim = newSim(quiet(), bossHunt('stormvoel'));
    expect(sim.snapshot().season).toMatchObject({ dark: true, lightning: false });
    const ev: ReturnType<typeof run> = [];
    let litTicks = 0;
    while (!sim.isOver()) {
      ev.push(...run(sim, 1));
      if (sim.snapshot().season?.lightning === true) litTicks++;
    }
    const flashes = ofType(ev, 'lightning').map((e) => e.tick);
    expect(flashes.length).toBeGreaterThan(8);
    const rule = base.run.bossRules.darkExceptLightning;
    const minGap = (rule?.flashEverySeconds?.[0] ?? 0) * 60;
    for (let i = 1; i < flashes.length; i++) {
      expect((flashes[i] ?? 0) - (flashes[i - 1] ?? 0)).toBeGreaterThanOrEqual(minGap);
    }
    expect(minGap).toBeGreaterThanOrEqual(60 / (rule?.maxFlashesPerSecond ?? 3));
    expect(litTicks).toBeGreaterThan(0);
    expect(newSim(quiet(), season()).snapshot().season?.dark).toBe(false);
  });
});

describe('consumables and the weapon rental (GDD §10.3–10.4)', () => {
  it('a consumable slot starts its power-up once', () => {
    const sim = newSim(quiet(), season({ consumables: ['boeretroos', 'bush_buckshot'] }));
    const ev = run(sim, 1, [{ t: 'consumable', slot: 0 }]);
    expect(ofType(ev, 'consumableUsed')).toMatchObject([
      { slot: 0, item: 'boeretroos', itemType: 'powerup' },
    ]);
    expect(ofType(ev, 'powerupStarted')).toMatchObject([
      { powerup: 'boeretroos', source: 'consumable' },
    ]);
    expect(ofType(run(sim, 1, [{ t: 'consumable', slot: 0 }]), 'consumableUsed')).toEqual([]);
    expect(sim.snapshot().season?.consumables).toEqual([null, 'bush_buckshot']);
    expect(sim.result().consumablesUsed).toEqual([0]);
  });

  it('the slot after the consumables arms the rented crate weapon, once', () => {
    const sim = newSim(quiet(), season({ rental: 'mielie_masjien' }));
    const ev = run(sim, 1, [{ t: 'consumable', slot: 2 }]);
    expect(ofType(ev, 'weaponChanged')).toMatchObject([
      { weapon: 'mielie_masjien', kind: 'crate' },
    ]);
    expect(sim.snapshot().season?.rental).toBeNull();
    expect(sim.result().rentalUsed).toBe(true);
  });

  it('consumables do nothing outside a Season Run', () => {
    const sim = newSim(quiet());
    expect(ofType(run(sim, 1, [{ t: 'consumable', slot: 0 }]), 'consumableUsed')).toEqual([]);
  });
});

describe('doppies found in a hunt (GDD §13.4)', () => {
  it('a white tarentaal drops 3 in a Season Run hunt, none in Classic', () => {
    const found = (mode: ModeConfig) => {
      const c = quiet();
      for (const k of karooOf(c).pacing.keyframes) k.flyoversPerMin = 60;
      karooOf(c).spawnTable = [{ creature: 'tarentaal_wit', weight: 1 }];
      const sim = newSim(c, mode);
      for (let i = 0; i < 1200 && sim.result().bagged === 0; i++) {
        const b = sim.snapshot().birds.find((x) => x.creature === 'tarentaal_wit' && x.hittable);
        if (b === undefined) {
          run(sim, 1);
          continue;
        }
        const ev = shootBird(sim, c, b);
        if (ofType(ev, 'targetBagged').length > 0) return { ev, sim };
        run(sim, 12);
      }
      throw new Error('no white tarentaal bagged');
    };
    const s = found(season());
    expect(ofType(s.ev, 'doppiesFound')).toMatchObject([{ amount: 3, total: 3 }]);
    expect(s.sim.result().doppies).toBe(3);
    const cl = found({ id: 'classic' });
    expect(ofType(cl.ev, 'doppiesFound')).toEqual([]);
  });
});

describe('Season Run replays (InputLog v3)', () => {
  it('a season hunt with charms, a rental and a reorder replays to the same event hash', () => {
    const content = withMidFlock(quiet());
    const mode = season({
      kind: 'boss',
      boss: 'generaal',
      charms: ['rooi_patrone', 'vlerkskoot', 'bles_die_plaashond'],
      consumables: ['boeretroos', null],
      rental: 'voorlaaier',
      runShellBonus: 1,
    });
    const header = { seed: 9, contentHash: loadContentHash(), mode, inputKind: 'pointer' as const };
    const rec = createRecorder(header);
    const sim = newSim(content, mode, 9);
    const hasher = createEventHasher();
    hasher.add(sim.drainEvents());
    const script = new Map<number, Command[]>([
      [5, [{ t: 'consumable', slot: 0 }]],
      [30, [{ t: 'fire', dx: 10, sy: 700 }]],
      [60, [{ t: 'charmOrder', order: [2, 0, 1] }]],
      [
        90,
        [
          { t: 'consumable', slot: 2 },
          { t: 'fire', dx: -40, sy: 690 },
        ],
      ],
      [400, [{ t: 'gadget' }]],
    ]);
    while (!sim.isOver()) {
      const cmds = script.get(sim.tick) ?? [];
      rec.record(sim.tick, cmds);
      sim.step(cmds);
      hasher.add(sim.drainEvents());
    }
    const log = rec.toLog();
    expect(log.v).toBe(3);
    const decoded = decodeInputLogText(encodeInputLogText(log));
    expect(decoded).toEqual(log);
    const replay = runReplay(decoded, content);
    expect(replay.eventHash).toBe(hasher.digest());
    expect(replay.result.score).toBe(sim.result().score);
  });
});
