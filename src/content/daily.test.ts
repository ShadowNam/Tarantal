import { describe, expect, it } from 'vitest';
import { loadDailyMeta } from '../../tools/testContent';
import { parseDailyMeta } from './daily';

describe('meta/daily.json', () => {
  it('the real file parses', () => {
    const d = loadDailyMeta();
    expect(d.biomeRotation).toContain('karoo-autumn');
    expect(d.grid.segments).toBeGreaterThan(0);
  });

  it('rejects non-calendar dates, inverted grid thresholds and unknown keys', () => {
    const ok = loadDailyMeta();
    expect(parseDailyMeta({ ...ok, epoch: '2026-02-30' }).ok).toBe(false);
    expect(parseDailyMeta({ ...ok, epoch: '2026-1-01' }).ok).toBe(false);
    expect(parseDailyMeta({ ...ok, epoch: '2028-02-29' }).ok).toBe(true);
    expect(parseDailyMeta({ ...ok, grid: { segments: 5, green: 0.2, yellow: 0.5 } }).ok).toBe(false);
    expect(parseDailyMeta({ ...ok, surprise: 1 }).ok).toBe(false);
    // D-028: the placeholder flag and the pre-launch age limit are required.
    const noFlag: Record<string, unknown> = { ...ok };
    delete noFlag['epochPlaceholder'];
    expect(parseDailyMeta(noFlag).ok).toBe(false);
    expect(parseDailyMeta({ ...ok, epochMaxAgeDays: 0 }).ok).toBe(false);
  });
});
