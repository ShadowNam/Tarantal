import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { versionCode } from './androidVersion';

describe('Android versionCode (D-058)', () => {
  it('is MAJOR·10000 + MINOR·100 + PATCH', () => {
    expect(versionCode('1.9.0')).toBe(10900);
    expect(versionCode('1.9.5')).toBe(10905);
    expect(versionCode('2.0.0')).toBe(20000);
    expect(versionCode('0.0.1')).toBe(1);
  });

  it('grows with every release, so each build installs over the one before', () => {
    const order = ['1.9.4', '1.9.5', '1.10.0', '1.10.11', '1.99.99', '2.0.0'];
    const codes = order.map(versionCode);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('refuses versions it cannot encode', () => {
    for (const v of ['1.9', '1.9.0-beta', 'v1.9.0', '1.100.0', '1.9.100', '0.0.0'])
      expect(() => versionCode(v)).toThrow();
  });

  it("encodes package.json's version", () => {
    expect(versionCode(pkg.version)).toBeGreaterThan(10904);
  });
});
