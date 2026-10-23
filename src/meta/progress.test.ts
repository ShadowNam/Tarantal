import { describe, expect, it } from 'vitest';
import { loadContent, loadNotaboek } from '../../tools/testContent';
import type { HuntLog } from './huntLog';
import { applyHunt, isWeaponEquippable, isWeaponUnlocked } from './progress';
import { defaultSave, type SaveData } from './saveSchema';

const content = loadContent();
const notaboek = loadNotaboek();
const weapon = (id: string) => {
  const w = content.weapons.weapons.find((x) => x.id === id);
  if (!w) throw new Error(id);
  return w;
};

function hunt(over: Partial<HuntLog> = {}): HuntLog {
  return {
    mode: 'classic',
    biome: 'karoo-autumn',
    score: 1200,
    rank: 'plaaswerker',
    shots: 40,
    bagged: 20,
    baggedFar: 4,
    wingShots: 3,
    wholeFlocks: 0,
    secrets: 0,
    crates: 1,
    creaturesSeen: ['tarentaal'],
    secretsFound: [],
    ...over,
  };
}

function play(save: SaveData, logs: HuntLog[]) {
  let s = save;
  const completed: string[] = [];
  const unlocked: string[] = [];
  for (const l of logs) {
    const o = applyHunt(s, l, content, notaboek);
    s = o.save;
    completed.push(...o.completed);
    unlocked.push(...o.unlockedWeapons);
  }
  return { save: s, completed, unlocked };
}

describe('applyHunt', () => {
  it('counts stats, the first-hunt challenge and the Bird Book', () => {
    const o = applyHunt(
      defaultSave(),
      hunt({ creaturesSeen: ['kwevoel', 'tarentaal'] }),
      content,
      notaboek,
    );
    expect(o.save.stats).toEqual({ hunts: 1, bagged: 20, shots: 40 });
    expect(o.completed).toContain('first_hunt');
    expect(o.newCreatures).toEqual(['kwevoel', 'tarentaal']);
    const again = applyHunt(o.save, hunt({ creaturesSeen: ['tarentaal'] }), content, notaboek);
    expect(again.newCreatures).toEqual([]);
    expect(again.completed).not.toContain('first_hunt');
  });

  it('bag_50_far unlocks the Windbuks across hunts (total scope)', () => {
    const r = play(
      defaultSave(),
      Array.from({ length: 12 }, () => hunt({ baggedFar: 4 })),
    );
    expect(r.save.notaboek.progress['bag_50_far']).toBe(48);
    expect(r.unlocked).not.toContain('windbuks');
    const r2 = play(r.save, [hunt({ baggedFar: 5 })]);
    expect(r2.unlocked).toEqual(['windbuks']);
    expect(r2.save.unlocks.weapons).toContain('windbuks');
    expect(r2.save.notaboek.done).toContain('bag_50_far');
    expect(isWeaponEquippable(weapon('windbuks'), r2.save, content)).toBe(true);
  });

  it('whole_flock_x3 unlocks the Kettie, which is equippable (M8 projectiles)', () => {
    const r = play(defaultSave(), [hunt({ wholeFlocks: 2 }), hunt({ wholeFlocks: 1 })]);
    expect(r.unlocked).toEqual(['kettie']);
    expect(isWeaponUnlocked(weapon('kettie'), r.save, content)).toBe(true);
    expect(isWeaponEquippable(weapon('kettie'), r.save, content)).toBe(true);
    expect(isWeaponEquippable(weapon('kettie'), defaultSave(), content)).toBe(false);
  });

  it('hunt-scope challenges need the score in one hunt, and only in their modes', () => {
    const r = play(defaultSave(), [hunt({ score: 2000 }), hunt({ score: 2000 })]);
    expect(r.completed).not.toContain('score_2500');
    expect(r.save.notaboek.progress['score_2500']).toBe(2000);
    expect(play(r.save, [hunt({ mode: 'ftue', score: 3000 })]).completed).not.toContain(
      'score_2500',
    );
    expect(play(r.save, [hunt({ score: 2600 })]).completed).toContain('score_2500');
  });

  it('every Karoo secret completes the Bird Book page, found over several hunts', () => {
    const r = play(defaultSave(), [
      hunt({ secretsFound: ['windpomp', 'bakkie'] }),
      hunt({ secretsFound: ['windpomp', 'potjie'] }),
    ]);
    expect(r.save.notaboek.progress['karoo_secrets_all']).toBe(3);
    const r2 = play(r.save, [hunt({ secretsFound: ['fence_bell'] })]);
    expect(r2.completed).toContain('karoo_secrets_all');
    expect(r2.save.birdBook.secrets).toHaveLength(4);
  });

  it('keeps per-biome Classic bests and the best rank', () => {
    let o = applyHunt(defaultSave(), hunt({ score: 1200, rank: 'plaaswerker' }), content, notaboek);
    expect(o.newBest).toEqual({ previous: null });
    expect(o.rankUp).toBe('plaaswerker');
    o = applyHunt(o.save, hunt({ score: 900, rank: 'stadsjapie' }), content, notaboek);
    expect(o.newBest).toBeNull();
    expect(o.rankUp).toBeNull();
    expect(o.save.bestRank).toBe('plaaswerker');
    o = applyHunt(o.save, hunt({ score: 2600, rank: 'bosveldjagter' }), content, notaboek);
    expect(o.newBest).toEqual({ previous: 1200 });
    expect(o.save.bests['karoo-autumn']).toEqual({ score: 2600, rank: 'bosveldjagter' });
    // FTUE scores are not Classic bests or ranks.
    const f = applyHunt(
      defaultSave(),
      hunt({ mode: 'ftue', score: 5000, rank: 'bosveld_legend' }),
      content,
      notaboek,
    );
    expect(f.newBest).toBeNull();
    expect(f.save.bestRank).toBeNull();
  });

  it('a Verder hunt (v1.2) leaves the Classic best alone but still counts for rank', () => {
    const first = applyHunt(
      defaultSave(),
      hunt({ score: 1200, rank: 'plaaswerker' }),
      content,
      notaboek,
    );
    const v = applyHunt(
      first.save,
      hunt({ bonus: 'verder', score: 4000, rank: 'bosveldjagter' }),
      content,
      notaboek,
    );
    expect(v.newBest).toBeNull();
    expect(v.save.bests['karoo-autumn']).toEqual({ score: 1200, rank: 'plaaswerker' });
    expect(v.rankUp).toBe('bosveldjagter');
    expect(v.save.bestRank).toBe('bosveldjagter');
  });

  it('the Pomp unlocks at the Plaaswerker rank', () => {
    expect(isWeaponUnlocked(weapon('pomp'), defaultSave(), content)).toBe(false);
    const o = applyHunt(defaultSave(), hunt({ rank: 'plaaswerker' }), content, notaboek);
    expect(isWeaponEquippable(weapon('pomp'), o.save, content)).toBe(true);
    expect(isWeaponEquippable(weapon('dubbelloop'), defaultSave(), content)).toBe(true);
  });
});

describe('practice Daily hunts (M7 first-attempt rule)', () => {
  it('count for stats and the Notaboek but never move the rank', () => {
    const log = hunt({ mode: 'daily', score: 4800, rank: 'bosveld_legend' });
    const practice = applyHunt(defaultSave(), log, content, notaboek, false);
    expect(practice.save.bestRank).toBeNull();
    expect(practice.rankUp).toBeNull();
    expect(practice.save.stats.hunts).toBe(1);
    expect(practice.completed).toContain('first_hunt');
    const official = applyHunt(defaultSave(), log, content, notaboek);
    expect(official.save.bestRank).toBe('bosveld_legend');
  });
});
