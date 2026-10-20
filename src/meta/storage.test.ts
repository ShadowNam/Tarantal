import { afterEach, describe, expect, it, vi } from 'vitest';
import { screenShakeEnabled, setScreenShake } from './settings';
import { isBoolean, readValue, writeValue } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('screen shake defaults from reduced motion and persists the toggle', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    expect(screenShakeEnabled(false)).toBe(true);
    expect(screenShakeEnabled(true)).toBe(false);
    setScreenShake(false);
    expect(screenShakeEnabled(false)).toBe(false);
  });
});
