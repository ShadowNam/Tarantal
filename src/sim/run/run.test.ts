// M6: the Season Run engine — structure, quotas, doppies (GDD §13.1–13.4), the Padstal (§13.5),
// the economy charms, save/resume and a full 12-hunt run played by the balance bot.
import { describe, expect, it } from 'vitest';
import { base, type Content } from '../../../tools/simHarness';
import { playRun } from '../../../tools/seasonRun';
import type { HuntResult } from '../types';
import {
  bonusDoppies,
  buy,
  charmPool,
  createRun,
  doppiesTally,
  huntInfo,
  huntSetup,
  leavePadstal,
  openPadstal,
  reorderCharms,
  reroll,
  rerollCost,
  rollOffers,
  sell,
  settleHunt,
  totalHunts,
  type RunState,
} from './run';

const allCharms = base.charms.charms.map((c) => c.id);
const newRun = (seed = 1): RunState =>
  createRun(base, { seed, weapon: 'dubbelloop', pool: allCharms });

function result(score: number, over: Partial<HuntResult> = {}): HuntResult {
  return {
    seed: 0,
    mode: 'seasonHunt',
    biome: 'karoo-autumn',
    layout: null,
    bonus: null,
    weapon: 'dubbelloop',
    score,
    ticks: 3600,
    shots: 0,
    hitShots: 0,
    accuracy: 0,
    bagged: 0,
    baggedByPlane: { near: 0, mid: 0, far: 0, ver: 0 },
    wingShots: 0,
    penalties: 0,
    emptyClicks: 0,
    bestStreak: 0,
    twoFlies: 0,
    wholeFlocks: 0,
    flushes: 0,
    gadgetUses: 0,
    secrets: 0,
    crates: 0,
    rank: '',
    doppies: 0,
    shellCapacityForRun: 0,
    consumablesUsed: [],
    rentalUsed: false,
    bossesBagged: 0,
    ...over,
  };
}

/** Passes the current hunt with `score` and walks into the Padstal. */
function passToPadstal(run: RunState, score = 100000): RunState {
  return openPadstal(base, settleHunt(base, run, result(score)));
}

describe('run structure (GDD §13.1)', () => {
  it('4 seasons × plain / omen / boss = 12 hunts with their quotas', () => {
    expect(totalHunts(base)).toBe(12);
    const kinds = Array.from({ length: 12 }, (_, i) => huntInfo(base, i).kind);
    expect(kinds).toEqual(Array<string[]>(4).fill(['plain', 'omen', 'boss']).flat());
    expect(huntInfo(base, 0)).toMatchObject({
      season: 'herfs',
      quota: base.run.seasons[0]?.quotas[0],
    });
  });

  it('each season runs on its own biome (M8: the Karoo stand-in is gone)', () => {
    expect(huntInfo(base, 0)).toMatchObject({ biome: 'karoo-autumn' });
    expect(huntInfo(base, 5)).toMatchObject({
      season: 'winter',
      biome: 'bushveld-winter',
      boss: 'ou_grys',
      bossRule: 'groundShotsZero',
    });
    expect(huntInfo(base, 6)).toMatchObject({
      season: 'lente',
      biome: 'okavango-spring',
    });
    expect(huntInfo(base, 9)).toMatchObject({
      season: 'somer',
      biome: 'kalahari-summer',
    });
  });

  it('the hunt setup carries the run into the sim (seeded by position)', () => {
    const run = { ...newRun(7), charms: ['vlerkskoot'], rental: 'voorlaaier', runShellBonus: 2 };
    const a = huntSetup(base, run);
    expect(a.mode).toMatchObject({
      id: 'seasonHunt',
      biome: 'karoo-autumn',
      weapon: 'dubbelloop',
      season: {
        kind: 'plain',
        boss: null,
        charms: ['vlerkskoot'],
        rental: 'voorlaaier',
        runShellBonus: 2,
      },
    });
    expect(huntSetup(base, run).seed).toBe(a.seed);
    expect(huntSetup(base, { ...run, huntIndex: 1 }).seed).not.toBe(a.seed);
    expect(huntSetup(base, { ...run, huntIndex: 2 }).mode.season).toMatchObject({
      kind: 'boss',
      boss: 'generaal',
    });
  });

  it('missing a quota ends the run; passing the 12th is victory', () => {
    const quota = huntInfo(base, 0).quota;
    expect(settleHunt(base, newRun(), result(quota - 1)).phase).toBe('defeat');
    expect(settleHunt(base, newRun(), result(quota)).phase).toBe('tally');
    const last = { ...newRun(), huntIndex: 11 };
    expect(settleHunt(base, last, result(1e9)).phase).toBe('victory');
  });

  it('settling clears used consumables and the rental, and keeps the run shell bonus', () => {
    const run = { ...newRun(), consumables: ['boeretroos', 'bush_buckshot'], rental: 'voorlaaier' };
    const after = settleHunt(
      base,
      run,
      result(1e6, { consumablesUsed: [1], shellCapacityForRun: 1 }),
    );
    expect(after).toMatchObject({
      consumables: ['boeretroos', null],
      rental: null,
      runShellBonus: 1,
    });
  });
});

describe('double Doppies (M9 rewarded, GDD §19)', () => {
  it("pays the last hunt's Doppies once more, in the tally only", () => {
    const quota = huntInfo(base, 0).quota;
    const tally = settleHunt(base, newRun(), result(quota));
    const paid = tally.history.at(-1)?.doppies?.total ?? 0;
    expect(paid).toBeGreaterThan(0);
    expect(bonusDoppies(tally).doppies).toBe(tally.doppies + paid);
    expect(bonusDoppies(newRun())).toEqual(newRun());
    const lost = settleHunt(base, newRun(), result(0));
    expect(bonusDoppies(lost)).toBe(lost);
  });
});

describe('doppies (GDD §13.4)', () => {
  it('+3 base, +1 per full 10 % over quota (max 5), +1 per 5 unspent (max 5), +3 boss', () => {
    const run = { ...newRun(), doppies: 12 };
    expect(doppiesTally(base, run, 1000, 1000, 'plain', 0)).toEqual({
      base: 3,
      overQuota: 0,
      interest: 2,
      boss: 0,
      found: 0,
      total: 5,
    });
    expect(doppiesTally(base, run, 1290, 1000, 'boss', 3)).toMatchObject({
      overQuota: 2,
      boss: 3,
      found: 3,
      total: 13,
    });
    expect(doppiesTally(base, { ...run, doppies: 90 }, 9000, 1000, 'plain', 0)).toMatchObject({
      overQuota: 5,
      interest: 5,
    });
  });

  it('a run starts with 4 and is paid after a passed hunt', () => {
    const run = newRun();
    expect(run.doppies).toBe(4);
    const quota = huntInfo(base, 0).quota;
    expect(settleHunt(base, run, result(quota)).doppies).toBe(4 + 3 + 0);
  });
});

describe('spaarblik — interest cap +5', () => {
  it('raises the interest cap from 5 to 10', () => {
    const rich = { ...newRun(), doppies: 60 };
    expect(doppiesTally(base, rich, 0, 1, 'plain', 0).interest).toBe(5);
    expect(doppiesTally(base, { ...rich, charms: ['spaarblik'] }, 0, 1, 'plain', 0).interest).toBe(
      10,
    );
  });
});

describe('Padstal (GDD §13.5)', () => {
  it('offers 2 charms, 1 consumable and 1 rental, never a charm you own', () => {
    const run = passToPadstal({ ...newRun(), charms: ['vlerkskoot'] });
    const offers = run.padstal?.offers ?? [];
    expect(offers.map((o) => o.kind)).toEqual(['charm', 'charm', 'consumable', 'weapon']);
    for (let seed = 1; seed < 40; seed++) {
      const r = passToPadstal({ ...newRun(seed), charms: ['vlerkskoot'] });
      expect(r.padstal?.offers.some((o) => o.id === 'vlerkskoot')).toBe(false);
    }
  });

  it('prices: charm by rarity, consumable by padstalPrice, rental fixed', () => {
    const offers = passToPadstal(newRun(3)).padstal?.offers ?? [];
    for (const o of offers) {
      if (o.kind === 'charm') {
        const c = base.charms.charms.find((x) => x.id === o.id);
        expect(o.price).toBe(c === undefined ? -1 : base.charms.prices[c.rarity]);
      } else if (o.kind === 'weapon') expect(o.price).toBe(base.run.padstal.weaponRentalPrice);
    }
  });

  it('offers only from the pool (locked charms never show)', () => {
    const pool = charmPool(base, ['hele_swerm', 'oupa_se_kaart', 'geheime_resep']);
    expect(pool).toHaveLength(21);
    expect(charmPool(base, ['hele_swerm'], ['hele_swerm'])).toContain('hele_swerm');
    for (let seed = 1; seed < 60; seed++) {
      const run = passToPadstal(createRun(base, { seed, weapon: 'dubbelloop', pool }));
      for (const o of run.padstal?.offers ?? [])
        expect(['hele_swerm', 'oupa_se_kaart', 'geheime_resep']).not.toContain(o.id);
    }
  });

  it('the same run and position always roll the same offers', () => {
    const a = passToPadstal(newRun(11));
    const b = passToPadstal(newRun(11));
    expect(a.padstal).toEqual(b.padstal);
  });

  it('reroll costs 2, then 3 …, and rolls new offers', () => {
    let run = { ...passToPadstal(newRun(5)), doppies: 20 };
    const first = run.padstal?.offers;
    expect(rerollCost(base, run)).toBe(2);
    run = reroll(base, run).run;
    expect(run.doppies).toBe(18);
    expect(rerollCost(base, run)).toBe(3);
    expect(run.padstal?.offers).not.toEqual(first);
    expect(reroll(base, { ...run, doppies: 2 })).toMatchObject({ ok: false, reason: 'doppies' });
  });

  it('buying takes doppies and a slot; sold-out offers and full slots are refused', () => {
    let run = { ...passToPadstal(newRun(2)), doppies: 50 };
    const i = run.padstal?.offers.findIndex((o) => o.kind === 'charm') ?? -1;
    const offer = run.padstal?.offers[i];
    const r = buy(base, run, i);
    expect(r.ok).toBe(true);
    run = r.run;
    expect(run.charms).toEqual([offer?.id]);
    expect(run.doppies).toBe(50 - (offer?.price ?? 0));
    expect(buy(base, run, i)).toMatchObject({ ok: false, reason: 'sold' });
    const j = run.padstal?.offers.findIndex((o, k) => o.kind === 'charm' && k !== i) ?? -1;
    const other = run.padstal?.offers[j]?.id;
    const full = { ...run, charms: allCharms.filter((x) => x !== other).slice(0, 5) };
    expect(buy(base, full, j)).toMatchObject({ ok: false, reason: 'slots' });
    expect(buy(base, { ...full, doppies: 0 }, j)).toMatchObject({ ok: false });
  });

  it('consumables go to a free slot; the rental to the rental slot', () => {
    let run = { ...passToPadstal(newRun(4)), doppies: 50 };
    const ci = run.padstal?.offers.findIndex((o) => o.kind === 'consumable') ?? -1;
    const wi = run.padstal?.offers.findIndex((o) => o.kind === 'weapon') ?? -1;
    run = buy(base, run, ci).run;
    run = buy(base, run, wi).run;
    expect(run.consumables.filter((c) => c !== null)).toHaveLength(1);
    expect(run.rental).toBe(run.padstal?.offers[wi]?.id);
  });

  it('selling pays half the price, rounded down', () => {
    const run = {
      ...passToPadstal(newRun()),
      charms: ['laaste_patroon', 'vlerkskoot'],
      doppies: 0,
    };
    const r = sell(base, run, 0);
    expect(r.run).toMatchObject({ charms: ['vlerkskoot'], doppies: 3 }); // uncommon 6 → 3
  });

  it('reordering moves charms; a bad order is refused', () => {
    const run = { ...newRun(), charms: ['a', 'b', 'c'] };
    expect(reorderCharms(run, [2, 0, 1]).run.charms).toEqual(['c', 'a', 'b']);
    expect(reorderCharms(run, [0, 0, 1]).ok).toBe(false);
  });

  it('leaving goes on to the next hunt', () => {
    const run = leavePadstal(passToPadstal(newRun()));
    expect(run).toMatchObject({ phase: 'hunt', huntIndex: 1, padstal: null });
  });
});

describe('padstal_vriend — +1 charm offer, rerolls 1 cheaper', () => {
  it('three charm offers and a reroll of 1', () => {
    const run = passToPadstal({ ...newRun(8), charms: ['padstal_vriend'] });
    expect(run.padstal?.offers.filter((o) => o.kind === 'charm')).toHaveLength(3);
    expect(rerollCost(base, run)).toBe(1);
    expect(rollOffers(base, newRun(8), 0).filter((o) => o.kind === 'charm')).toHaveLength(2);
  });
});

describe('a full run with the balance bot (M6 "Done when")', () => {
  /** Real content with quotas low enough that the bot can finish all 12 hunts. */
  function easy(): Content {
    const c = structuredClone(base) as Content;
    for (const s of c.run.seasons) s.quotas = s.quotas.map(() => 200);
    return c;
  }

  it('completes all 12 hunts to victory through all four real seasons (M8), buying charms', () => {
    const c = easy();
    const out = playRun({
      content: c,
      seed: 21,
      bot: 'competent',
      policy: 'synergy',
      pool: c.charms.charms.map((x) => x.id),
    });
    expect(out.hunts).toHaveLength(12);
    // Every hunt played its season's own biome: no stand-in (M8).
    expect(out.hunts.map((h) => h.biome)).toEqual(
      c.run.seasons.flatMap((s) => [s.biome, s.biome, s.biome]),
    );
    expect(new Set(out.hunts.map((h) => h.biome)).size).toBe(4);
    expect(out.run.phase).toBe('victory');
    expect(out.run.charms.length).toBeGreaterThan(0);
    expect(out.hunts.every((h) => h.passed)).toBe(true);
  }, 60_000);

  it('resumes from the saved JSON after any Padstal and plays out identically', () => {
    const c = easy();
    const pool = c.charms.charms.map((x) => x.id);
    const opts = {
      content: c,
      seed: 4,
      bot: 'competent',
      policy: 'synergy',
      pool,
      maxHunts: 4,
    } as const;
    const straight = playRun(opts);
    // Every save goes through JSON, as the browser's save does.
    const viaSave = playRun({
      ...opts,
      onSave: (run) => JSON.parse(JSON.stringify(run)) as RunState,
    });
    expect(viaSave.hunts).toEqual(straight.hunts);
    expect(viaSave.run).toEqual(straight.run);
  }, 60_000);
});
