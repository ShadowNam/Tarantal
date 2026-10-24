import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, migrations } from './migrations';
import { CORRUPT_KEY, loadSave, repairSave, SaveStore } from './save';
import { defaultSave, SAVE_VERSION } from './saveSchema';
import { readText, resetStorageForTests, storageStatus } from './storage';

let store: Map<string, string>;

function fakeLocalStorage(): void {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  });
}

beforeEach(() => {
  resetStorageForTests();
  fakeLocalStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SaveData v1', () => {
  it('M9 clear(): removes every stored key and goes on with the defaults', () => {
    const save = new SaveStore();
    save.update((d) => ({ ...d, stats: { ...d.stats, hunts: 7 } }));
    store.set('tm.save.corrupt', 'old');
    store.set('tm.notice.x', '1');
    const seen: number[] = [];
    save.onChange((d) => seen.push(d.stats.hunts));
    save.clear();
    expect([...store.keys()]).toEqual([]);
    expect(save.data).toEqual(defaultSave());
    expect(seen).toEqual([0]);
    expect(loadSave().status).toBe('new');
  });

  it('starts from defaults when nothing is stored', () => {
    const r = loadSave();
    expect(r.status).toBe('new');
    expect(r.data).toEqual(defaultSave());
  });

  it('round-trips settings and progress through localStorage (a reopened tab)', () => {
    const a = new SaveStore();
    a.update((d) => ({
      ...d,
      settings: { ...d.settings, leftHanded: true, language: 'af', aimAssist: 'low' },
      ftue: { done: true, skipped: false, step: 'tally' },
      bests: { 'karoo-autumn': { score: 2840, rank: 'bosveldjagter' } },
    }));
    // A new page: only localStorage survives.
    resetStorageForTests();
    const b = new SaveStore();
    expect(b.status).toBe('loaded');
    expect(b.data.settings.leftHanded).toBe(true);
    expect(b.data.settings.language).toBe('af');
    expect(b.data.settings.aimAssist).toBe('low');
    expect(b.data.ftue.done).toBe(true);
    expect(b.data.bests['karoo-autumn']?.score).toBe(2840);
  });

  it('v1.4: an unlocked, equipped Langloop survives a reopened tab', () => {
    const a = new SaveStore();
    a.update((d) => ({
      ...d,
      unlocks: { ...d.unlocks, weapons: [...d.unlocks.weapons, 'langloop'] },
      loadout: { ...d.loadout, weapon: 'langloop' },
    }));
    expect(readText('save.v1')).toContain('langloop');
    resetStorageForTests();
    const b = new SaveStore();
    expect(b.data.unlocks.weapons).toContain('langloop');
    expect(b.data.loadout.weapon).toBe('langloop');
  });

  it('a corrupted save falls back to defaults and keeps the bad text for bug reports', () => {
    store.set('tm.save.v1', '{"v":1,"settings":{"leftHa');
    const s = new SaveStore();
    expect(s.status).toBe('corrupt');
    expect(s.data).toEqual(defaultSave());
    expect(readText(CORRUPT_KEY)).toBe('{"v":1,"settings":{"leftHa');
    // The repaired save is written back, so the next load is clean.
    resetStorageForTests();
    expect(loadSave().status).toBe('loaded');
  });

  it('non-object JSON is treated as corrupt', () => {
    for (const bad of ['null', '42', '"x"', '[1,2]', '{"v":"1"}', '{}']) {
      store.set('tm.save.v1', bad);
      expect(loadSave().status).toBe('corrupt');
    }
  });

  it('one damaged section or field falls back alone and the rest survives', () => {
    const good = defaultSave();
    store.set(
      'tm.save.v1',
      JSON.stringify({
        ...good,
        settings: { ...good.settings, leftHanded: true, masterVolume: 7, aimAssist: 'max' },
        bests: 'garbage',
        ftue: { done: true, skipped: true, step: 'run' },
      }),
    );
    const r = loadSave();
    expect(r.status).toBe('repaired');
    expect(r.repaired).toEqual(
      expect.arrayContaining(['settings.masterVolume', 'settings.aimAssist', 'bests']),
    );
    expect(r.data.settings.leftHanded).toBe(true);
    expect(r.data.settings.masterVolume).toBe(good.settings.masterVolume);
    expect(r.data.settings.aimAssist).toBe('standard');
    expect(r.data.bests).toEqual({});
    expect(r.data.ftue.done).toBe(true);
  });

  it('an M6 save without the daily section gets the default (no migration, M7)', () => {
    const old: Record<string, unknown> = {
      ...defaultSave(),
      stats: { hunts: 4, bagged: 9, shots: 30 },
    };
    delete old['daily'];
    const { data, repaired } = repairSave(old);
    expect(data.daily).toEqual(defaultSave().daily);
    expect(data.stats.hunts).toBe(4);
    expect(repaired).toEqual([]);
  });

  it('a v1.2 save without sights keeps its gun and unlocks and gets none (v1.3, no migration)', () => {
    const old = {
      ...defaultSave(),
      loadout: { weapon: 'pomp' },
      unlocks: { weapons: ['windbuks'] },
    };
    const { data, repaired } = repairSave(old);
    expect(data.loadout).toEqual({ weapon: 'pomp', sights: {} });
    expect(data.unlocks).toEqual({ weapons: ['windbuks'], sights: [] });
    expect(repaired).toEqual([]);
  });

  it('a damaged daily field falls back alone', () => {
    const d = defaultSave();
    const raw = { ...d, daily: { ...d.daily, streak: 5, freezesUsed: ['nope'] } };
    const { data, repaired } = repairSave(raw);
    expect(data.daily.streak).toBe(5);
    expect(data.daily.freezesUsed).toEqual([]);
    expect(repaired).toEqual(['daily.freezesUsed']);
  });

  it('a save from a newer version is read but never overwritten', () => {
    const newer = JSON.stringify({
      v: SAVE_VERSION + 1,
      ftue: { done: true, skipped: false, step: '' },
    });
    store.set('tm.save.v1', newer);
    const s = new SaveStore();
    expect(s.status).toBe('newer');
    expect(s.data.ftue.done).toBe(true);
    s.update((d) => ({ ...d, stats: { ...d.stats, hunts: 9 } }));
    expect(store.get('tm.save.v1')).toBe(newer);
    expect(s.data.stats.hunts).toBe(9);
  });

  it('notifies listeners on change', () => {
    const s = new SaveStore();
    const seen: boolean[] = [];
    s.onChange((d) => seen.push(d.settings.reduceFlashes));
    s.update((d) => ({ ...d, settings: { ...d.settings, reduceFlashes: true } }));
    expect(seen).toEqual([true]);
  });
});

describe('migrations', () => {
  it('has a step for every version below the current one', () => {
    for (let v = 0; v < SAVE_VERSION; v++) expect(migrations[v]).toBeTypeOf('function');
  });

  it('v0 → v1 keeps the M2 screen-shake toggle', () => {
    expect(migrate({ v: 0, screenShake: false }, 1)).toEqual({
      v: 1,
      settings: { screenShake: false },
    });
    expect(migrate({ v: 0 }, 1)).toEqual({ v: 1 });
  });

  it('migrates the M2 keys on first M5 load and removes them', () => {
    store.set('tm.settings.screenShake', 'false');
    const s = new SaveStore();
    expect(s.status).toBe('migrated');
    expect(s.data.settings.screenShake).toBe(false);
    expect(s.data.ftue.done).toBe(false);
    expect(store.has('tm.settings.screenShake')).toBe(false);
    expect(store.has('tm.save.v1')).toBe(true);
  });

  it('throws on a gap in the chain', () => {
    expect(() => migrate({ v: -1 }, 1)).toThrow(/no save migration/);
  });

  it('repairSave turns an empty object into the defaults', () => {
    expect(repairSave({}).data).toEqual(defaultSave());
  });
});

describe('storage that throws (private mode, blocked)', () => {
  it('runs from memory: progress holds for the session', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    const s = new SaveStore();
    expect(s.status).toBe('new');
    s.update((d) => ({ ...d, ftue: { done: true, skipped: true, step: '' } }));
    expect(storageStatus()).toBe('memory');
    expect(new SaveStore().data.ftue.done).toBe(true);
  });

  it('runs when the localStorage getter itself throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const s = new SaveStore();
      s.update((d) => ({ ...d, stats: { ...d.stats, hunts: 1 } }));
      expect(s.data.stats.hunts).toBe(1);
      expect(storageStatus()).toBe('memory');
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
