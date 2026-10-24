import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import { canonicalJson, contentHash, sha256Hex, sha256HexOfString } from './hash';

describe('content hash', () => {
  it('sha256 matches node:crypto for many lengths', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = new Uint8Array(randomBytes(n));
      expect(sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(sha256HexOfString('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('canonical JSON ignores key order and $comment', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }], $comment: 'x' })).toBe(
      '{"a":[2,{"c":4,"d":3}],"b":1}',
    );
  });

  it('changes when a tunable changes', () => {
    const bundle = loadContent();
    const tweaked = structuredClone(bundle);
    tweaked.scoring.frenzyTiers[0] = { atStreak: 3, mul: 1.6 };
    expect(contentHash(tweaked)).not.toBe(contentHash(bundle));
    expect(contentHash(structuredClone(bundle))).toBe(contentHash(bundle));
  });

  it('leaves the admin-only Skietbaan out (D-037): tuning it re-seeds no Daily', () => {
    const bundle = loadContent();
    const tweaked = structuredClone(bundle);
    tweaked.modes.modes.range.respawnMs += 500;
    tweaked.modes.modes.range.spots.mid.flyY += 10;
    expect(contentHash(tweaked)).toBe(contentHash(bundle));
    // The rest of modes.json still counts.
    tweaked.modes.modes.classic.huntSeconds += 1;
    expect(contentHash(tweaked)).not.toBe(contentHash(bundle));
  });
});
