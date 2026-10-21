import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isBoolean,
  readText,
  readValue,
  removeAllKeys,
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
    removeAllKeys();
    expect([...store.keys()].sort()).toEqual(['other.app', 'tm.e2e.save.v1']);
    expect(readText('save.v1')).toBeNull();
  });
});
