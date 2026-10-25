import { describe, expect, it } from 'vitest';
import en from '../../i18n/en.json';
import type { I18nKey } from '../../i18n/i18n';
import type { SimEvent } from '../../sim/events';
import { captionFor, updateCaptions, type CaptionLine } from './captions';

const cfg = { captionMs: 2000, captionMax: 3, captionRepeatMs: 1000 };
const ev = (e: Record<string, unknown>): SimEvent => e as unknown as SimEvent;

describe('sound captions (M9, GDD §18.3)', () => {
  it('every caption key has English text', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('caption.'));
    expect(keys.length).toBeGreaterThanOrEqual(15);
    const samples = [
      ev({ type: 'emptyClick' }),
      ev({ type: 'flockStateChanged', to: 'alert' }),
      ev({ type: 'worldEvent', event: 'carAlarm' }),
      ev({ type: 'birdCalled' }),
    ];
    for (const e of samples) {
      const k = captionFor(e);
      expect(k !== null && Object.hasOwn(en, k), e.type).toBe(true);
    }
    // On-screen words already (POOF!, score pops) get no caption.
    expect(captionFor(ev({ type: 'targetBagged' }))).toBeNull();
    expect(captionFor(ev({ type: 'shotFired' }))).toBeNull();
  });

  it('new cues on top, repeats extend, expired go, at most captionMax lines', () => {
    const last = new Map<I18nKey, number>();
    let lines: CaptionLine[] = updateCaptions([], last, [ev({ type: 'emptyClick' })], 0, cfg);
    expect(lines.map((l) => l.key)).toEqual(['caption.empty_click']);
    lines = updateCaptions(lines, last, [ev({ type: 'emptyClick' })], 500, cfg);
    expect(lines).toEqual([{ key: 'caption.empty_click', until: 2500 }]);
    lines = updateCaptions(
      lines,
      last,
      [ev({ type: 'birdCalled' }), ev({ type: 'crateOpened' }), ev({ type: 'gadgetUsed' })],
      600,
      cfg,
    );
    expect(lines.map((l) => l.key)).toEqual(['caption.vuvuzela', 'caption.crate', 'caption.kwe']);
    expect(updateCaptions(lines, last, [], 5000, cfg)).toEqual([]);
    // Shown less than captionRepeatMs ago and gone: not again yet.
    expect(updateCaptions([], last, [ev({ type: 'birdCalled' })], 1200, cfg)).toEqual([]);
    expect(updateCaptions([], last, [ev({ type: 'birdCalled' })], 1700, cfg)).toHaveLength(1);
  });
});

describe('v1.7 meerkat captions (D-044)', () => {
  const at = { tick: 1, colonyId: 'c', meerkatId: 2, plane: 'mid' as const, x: 0, y: 0 };
  it('a penalised hit, the scold, the alarm and the photo each have a caption', () => {
    expect(captionFor({ type: 'meerkatHit', shotId: 1, points: -10, ...at })).toBe(
      'caption.penalty',
    );
    expect(captionFor({ type: 'meerkatHit', shotId: 1, points: 0, ...at })).toBeNull();
    expect(captionFor({ type: 'meerkatScold', points: -10, ...at })).toBe('caption.meerkat_chirp');
    expect(captionFor({ type: 'meerkatAlarm', creature: 'sproeier', flockId: null, ...at })).toBe(
      'caption.meerkat_alarm',
    );
    expect(
      captionFor({
        type: 'familiefoto',
        tick: 1,
        colonyId: 'c',
        family: 6,
        plane: 'mid',
        x: 0,
        y: 0,
      }),
    ).toBe('caption.camera_click');
  });
});
