import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isBoolean,
  readText,
  readValue,
  removeAllKeys,
  removeKey,
  resetStorageForTests,
  setStorageNamespace,
  writeText,
  writeValue,
} from './storage';

function mapStorage(store: Map<string, string>): Storage {
  return {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetStorageForTests();
});

describe('storage', () => {
  it('falls back to memory when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    writeValue('x', true);
    expect(readValue('x', false, isBoolean)).toBe(true);
  });

  it('ignores corrupt or wrongly typed values', () => {
    const store = new Map<string, string>([
      ['tm.y', '{not json'],
      ['tm.z', '"str"'],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    expect(readValue('y', false, isBoolean)).toBe(false);
    expect(readValue('z', true, isBoolean)).toBe(true);
  });

  it('a failed removal stays removed in this session and can be replaced', () => {
    const store = new Map([['tm.notice', 'old']]);
    const backend = mapStorage(store);
    backend.removeItem = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', backend);
    removeKey('notice');
    expect(store.get('tm.notice')).toBe('old');
    expect(readText('notice')).toBeNull();
    writeText('notice', 'new');
    expect(readText('notice')).toBe('new');
  });

  it('a failed clear does not bring old saved data back into the session', () => {
    const store = new Map([
      ['tm.save.v1', 'old save'],
      ['tm.notice', 'old notice'],
    ]);
    const backend = mapStorage(store);
    backend.removeItem = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', backend);
    expect(removeAllKeys()).toBe(false);
    expect(readText('save.v1')).toBeNull();
    expect(readText('notice')).toBeNull();
    writeText('save.v1', 'new save');
    expect(readText('save.v1')).toBe('new save');
    expect(readText('notice')).toBeNull();
  });

  it('clearing still works in memory when storage keys cannot be enumerated', () => {
    const store = new Map([['tm.notice', 'old notice']]);
    const backend = mapStorage(store);
    Object.defineProperty(backend, 'length', {
      get: () => {
        throw new Error('SecurityError');
      },
    });
    vi.stubGlobal('localStorage', backend);
    expect(removeAllKeys()).toBe(false);
    expect(readText('notice')).toBeNull();
  });

  it('clearing player data preserves the test namespace in the memory fallback', () => {
    vi.stubGlobal('localStorage', undefined);
    setStorageNamespace('e2e.');
    writeText('save.v1', 'test save');
    setStorageNamespace('');
    writeText('save.v1', 'player save');
    // No browser store: the memory wipe is the whole clear, so it succeeds.
    expect(removeAllKeys()).toBe(true);
    expect(readText('save.v1')).toBeNull();
    setStorageNamespace('e2e.');
    expect(readText('save.v1')).toBe('test save');
  });

  it('M9: a namespace keeps test runs away from the player save (tm.e2e.*)', () => {
    const store = new Map<string, string>([['tm.save.v1', 'player']]);
    vi.stubGlobal('localStorage', mapStorage(store));
    setStorageNamespace('e2e.');
    expect(readText('save.v1')).toBeNull();
    writeText('save.v1', 'test');
    expect(store.get('tm.e2e.save.v1')).toBe('test');
    expect(store.get('tm.save.v1')).toBe('player');
  });

  it('M9: removeAllKeys clears only the current prefix (privacy → clear my data)', () => {
    const store = new Map<string, string>([
      ['tm.save.v1', 'a'],
      ['tm.save.corrupt', 'b'],
      ['tm.e2e.save.v1', 'c'],
      ['other.app', 'd'],
    ]);
    vi.stubGlobal('localStorage', mapStorage(store));
    expect(removeAllKeys()).toBe(true);
    expect([...store.keys()].sort()).toEqual(['other.app', 'tm.e2e.save.v1']);
    expect(readText('save.v1')).toBeNull();
  });
});
