import { describe, expect, it } from 'vitest';
import { loadContent, loadContentHash, loadDailyMeta } from '../../tools/testContent';
import { createEventHasher } from '../sim/events';
import { createSim } from '../sim/Sim';
import { toBase64Url } from '../sim/replay/inputLog';
import type { ModeConfig } from '../sim/types';
import {
  challengeFor,
  challengeHunt,
  challengeUrl,
  cleanName,
  compareToChallenge,
  decodeChallenge,
  encodeChallenge,
  type ChallengeContext,
} from './challenge';
import { dailySeed } from './daily';

const content = loadContent();
const hash = loadContentHash();
const ctx: ChallengeContext = {
  content,
  playableBiomes: content.biomes.map((b) => b.id),
  contentHash: hash,
  limits: loadDailyMeta().challenge,
};
const b64 = (text: string): string => toBase64Url(new TextEncoder().encode(text));
const valid = {
  v: 1,
  seed: 123456,
  mode: 'classic',
  biome: 'karoo-autumn',
  weapon: 'dubbelloop',
  score: 2840,
};

/** Event hash of a scripted hunt (a shot every 0.5 s) with this setup. */
function huntHash(seed: number, mode: ModeConfig): string {
  const sim = createSim({ seed, content, mode, inputKind: 'touch' });
  const h = createEventHasher();
  h.add(sim.drainEvents());
  while (!sim.isOver()) {
    sim.step(
      sim.tick % 30 === 0
        ? [{ t: 'fire', dx: 120, sy: 640 }]
        : sim.tick % 30 === 15
          ? [{ t: 'reload' }]
          : [],
    );
    h.add(sim.drainEvents());
  }
  return h.digest();
}

describe('challenge links (Tech §12)', () => {
  it('round-trips: encode → decode → the same hunt setup and the same hunt', () => {
    const sent = {
      seed: dailySeed('2026-10-21', hash),
      mode: 'daily' as const,
      biome: 'karoo-autumn',
      weapon: 'windbuks',
      score: 3120,
      dailyNumber: 1,
    };
    const c = challengeFor(sent, hash, 'Oom Koos');
    const url = challengeUrl('https://example.test/Tarantal/', c);
    const param = new URL(url).searchParams.get('c') ?? '';
    const got = decodeChallenge(param, ctx);
    expect(got).toEqual({ ok: true, challenge: c, contentChanged: false });
    if (!got.ok) return;
    const hunt = challengeHunt(got.challenge);
    expect(hunt).toEqual({
      seed: sent.seed,
      mode: { id: 'daily', biome: 'karoo-autumn', weapon: 'windbuks' },
    });
    expect(huntHash(hunt.seed, hunt.mode)).toBe(
      huntHash(sent.seed, { id: 'daily', biome: sent.biome, weapon: sent.weapon }),
    );
    expect(param.length).toBeLessThan(220);
  });

  it('lends the Kettie (M8 projectiles) like any other primary', () => {
    const got = decodeChallenge(b64(JSON.stringify({ ...valid, weapon: 'kettie' })), ctx);
    expect(got.ok && got.challenge.weapon).toBe('kettie');
  });

  it('appends to a base that already has a query', () => {
    const c = challengeFor({ ...valid, mode: 'classic', dailyNumber: null }, hash);
    expect(challengeUrl('https://x.test/?portal=1', c)).toMatch(/\?portal=1&c=/);
  });

  it('rejects bad links safely, with a reason', () => {
    const cases: [string, string][] = [
      ['a'.repeat(ctx.limits.maxLinkChars + 1), 'tooLong'],
      ['!!!', 'notBase64'],
      ['a', 'notBase64'],
      [b64('not json'), 'notJson'],
      [toBase64Url(Uint8Array.from([0xff, 0xfe, 0x7b])), 'notJson'],
      [b64('null'), 'badShape'],
      [b64('[]'), 'badShape'],
      [b64(JSON.stringify({ ...valid, v: 2 })), 'badShape'],
      [b64(JSON.stringify({ ...valid, seed: -1 })), 'badShape'],
      [b64(JSON.stringify({ ...valid, seed: 1.5 })), 'badShape'],
      [b64(JSON.stringify({ ...valid, seed: 2 ** 32 })), 'badShape'],
      [b64(JSON.stringify({ ...valid, mode: 'seasonHunt' })), 'badShape'],
      [b64(JSON.stringify({ ...valid, mode: 'ftue' })), 'badShape'],
      [b64(JSON.stringify({ ...valid, score: '1e9' })), 'badShape'],
      [b64(JSON.stringify({ ...valid, extra: 1 })), 'badShape'],
      [b64(JSON.stringify({ ...valid, __proto__: { x: 1 }, constructor: 1 })), 'badShape'],
      [b64(JSON.stringify({ ...valid, biome: '../etc' })), 'badShape'],
      [b64(JSON.stringify({ ...valid, biome: 'namibie-etosha' })), 'unknownBiome'],
      [b64(JSON.stringify({ ...valid, weapon: 'bazooka' })), 'unknownWeapon'],
      [b64(JSON.stringify({ ...valid, weapon: 'voorlaaier' })), 'unknownWeapon'],
      [b64(JSON.stringify({ ...valid, weapon: 'vuvuzela' })), 'unknownWeapon'],
    ];
    for (const [param, reason] of cases) {
      expect(decodeChallenge(param, ctx), param.slice(0, 40)).toEqual({ ok: false, reason });
    }
  });

  it('flags a link made with other content, but still plays it', () => {
    const r = decodeChallenge(b64(JSON.stringify({ ...valid, h: '00000000' })), ctx);
    expect(r).toMatchObject({ ok: true, contentChanged: true });
    expect(decodeChallenge(b64(JSON.stringify(valid)), ctx)).toMatchObject({
      ok: true,
      contentChanged: false,
    });
  });

  it('cleans the sender name (controls, bidi overrides, length)', () => {
    expect(cleanName(' Oom‮ Koos\u0007 ', 24)).toBe('Oom Koos');
    expect(cleanName('‏\u0000 ', 24)).toBeUndefined();
    expect(cleanName('🐦'.repeat(30), 24)).toBe('🐦'.repeat(24));
    const r = decodeChallenge(b64(JSON.stringify({ ...valid, by: '‮X'.repeat(20) })), ctx);
    expect(r.ok && r.challenge.by).toBe('X'.repeat(20));
    const blank = decodeChallenge(b64(JSON.stringify({ ...valid, by: '\u0001' })), ctx);
    expect(blank.ok && 'by' in blank.challenge).toBe(false);
  });

  it('encode refuses an invalid challenge', () => {
    expect(() => encodeChallenge({ ...valid, mode: 'classic', seed: -5 } as never)).toThrow();
  });

  it('compares the result', () => {
    const c = { ...valid, mode: 'classic' as const, v: 1 as const };
    expect(compareToChallenge(2841, c)).toBe('win');
    expect(compareToChallenge(2840, c)).toBe('tie');
    expect(compareToChallenge(10, c)).toBe('lose');
  });
});
