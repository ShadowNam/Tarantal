import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeel } from './feel';

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'content/client/feel.json'), 'utf8'),
) as Record<string, unknown>;

describe('client/feel.json', () => {
  it('is valid', () => {
    expect(parseFeel(raw)).toMatchObject({ ok: true });
  });

  it('D-048: only the special-day bark triggers may have no lines of their own', () => {
    type Barks = { triggers: Record<string, { lines: string[] }> };
    const clone = (name: string): Record<string, unknown> => {
      const c = structuredClone(raw) as typeof raw & { barks: Barks };
      const t = c.barks.triggers[name];
      if (t !== undefined) t.lines = [];
      return c;
    };
    expect(parseFeel(clone('feesdagOwl'))).toMatchObject({ ok: true });
    expect(parseFeel(clone('lanternsOut'))).toMatchObject({ ok: true });
    expect(parseFeel(clone('bagStreak'))).toMatchObject({ ok: false });
    expect(parseFeel(clone('newBest'))).toMatchObject({ ok: false });
  });

  it('matches the GDD §18.2 gesture numbers', () => {
    const r = parseFeel(raw);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.feel.input.tapMaxMs).toBe(180);
    expect(r.feel.input.tapMaxMovePx).toBe(12);
    expect(r.feel.input.flickMinPx).toBe(60);
    expect(r.feel.input.flickMaxMs).toBe(200);
    expect(r.feel.input.edgePanFraction).toBe(0.12);
    expect(r.feel.input.inertiaMaxPxPerSec).toBe(2400);
    expect(r.feel.hud.beltTapMinPx).toBeGreaterThanOrEqual(64);
  });

  it('rejects unknown keys and bad values', () => {
    const extra = structuredClone(raw);
    (extra['input'] as Record<string, unknown>)['bogus'] = 1;
    expect(parseFeel(extra).ok).toBe(false);
    const bad = structuredClone(raw);
    (bad['juice'] as Record<string, unknown>)['gunTouchAlpha'] = 2;
    expect(parseFeel(bad).ok).toBe(false);
  });
});
