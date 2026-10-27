// D-053: the loading screen's recommendation and the remembered preset.
import { describe, expect, it } from 'vitest';
import {
  cardAllowed,
  devicePxPerDesignPx,
  megabytes,
  recommendGraphics,
  settingAfterCard,
  startMode,
  type GraphicsEnv,
} from './graphicsChoice';

/** A 2560×1440 desktop at DPR 1 on a fast link (1.33 device px per design px). */
const desktop: GraphicsEnv = {
  effectiveType: '4g',
  downlinkMbps: 10,
  saveData: false,
  deviceMemory: 8,
  devicePixelRatio: 1,
  cssWidth: 2560,
  cssHeight: 1440,
  tier: 'high',
};

describe('devicePxPerDesignPx', () => {
  it('follows the canvas fit and the DPR', () => {
    expect(devicePxPerDesignPx({ devicePixelRatio: 1, cssWidth: 1920, cssHeight: 1080 })).toBe(1);
    expect(devicePxPerDesignPx(desktop)).toBeCloseTo(1440 / 1080);
    // Pixel 7 landscape (915 × 412 CSS px, DPR 2.625): 1.0 device px per design px.
    expect(
      devicePxPerDesignPx({ devicePixelRatio: 2.625, cssWidth: 915, cssHeight: 412 }),
    ).toBeCloseTo((412 / 1080) * 2.625, 2);
    // iPhone 14 landscape (844 × 390, DPR 3): 1.08.
    expect(devicePxPerDesignPx({ devicePixelRatio: 3, cssWidth: 844, cssHeight: 390 })).toBeCloseTo(
      (390 / 1080) * 3,
      2,
    );
  });
});

describe('recommendGraphics', () => {
  it('HD on a large, fast, capable screen', () => {
    expect(recommendGraphics(desktop)).toMatchObject({ pick: 'hd', weak: false });
  });

  it('Standard when the screen would not show the difference', () => {
    expect(recommendGraphics({ ...desktop, cssWidth: 1920, cssHeight: 1080 }).pick).toBe(
      'standard',
    );
    // A phone at 1.08 device px per design px.
    expect(
      recommendGraphics({ ...desktop, devicePixelRatio: 3, cssWidth: 844, cssHeight: 390 }).pick,
    ).toBe('standard');
    // A Retina laptop (1440 × 900 CSS at DPR 2: 1.67).
    expect(
      recommendGraphics({ ...desktop, devicePixelRatio: 2, cssWidth: 1440, cssHeight: 900 }).pick,
    ).toBe('hd');
  });

  it('Standard on a slow or metered connection', () => {
    expect(recommendGraphics({ ...desktop, effectiveType: '3g' }).pick).toBe('standard');
    expect(recommendGraphics({ ...desktop, downlinkMbps: 4 }).pick).toBe('standard');
    expect(recommendGraphics({ ...desktop, saveData: true }).pick).toBe('standard');
  });

  it('unknown hints do not count against HD (Safari, Firefox)', () => {
    expect(
      recommendGraphics({
        ...desktop,
        effectiveType: undefined,
        downlinkMbps: undefined,
        saveData: undefined,
        deviceMemory: undefined,
      }).pick,
    ).toBe('hd');
  });

  it('little memory or the low tier: Standard, and HD says it may be slow', () => {
    expect(recommendGraphics({ ...desktop, deviceMemory: 3 })).toMatchObject({
      pick: 'standard',
      weak: false,
    });
    expect(recommendGraphics({ ...desktop, deviceMemory: 2 })).toMatchObject({
      pick: 'standard',
      weak: true,
    });
    expect(recommendGraphics({ ...desktop, tier: 'low' })).toMatchObject({
      pick: 'standard',
      weak: true,
    });
  });
});

describe('the remembered preset', () => {
  it('a saved preset skips the card; "ask" asks', () => {
    expect(startMode('hd')).toBe('hd');
    expect(startMode('standard')).toBe('standard');
    expect(startMode('ask')).toBeNull();
    expect(startMode('ask', 'hd')).toBe('hd');
  });

  it('Remember my choice saves it; unticked, the next start asks again', () => {
    expect(settingAfterCard('hd', true)).toBe('hd');
    expect(settingAfterCard('standard', true)).toBe('standard');
    expect(settingAfterCard('hd', false)).toBe('ask');
    // Settings → "Ask on start" brings the card back.
    expect(startMode(settingAfterCard('standard', false))).toBeNull();
  });

  it('formats MB for the card', () => {
    expect(megabytes(5 * 1024 * 1024)).toBe(5);
    expect(megabytes(1.26 * 1024 * 1024)).toBe(1.3);
    expect(megabytes(150.4 * 1024 * 1024)).toBe(150);
  });
});

describe('the Graphics card on boot (D-053)', () => {
  it('a test build without ?graphics= (fresh profile: "ask") boots to the title in Standard', () => {
    expect(cardAllowed({ testHooks: true, capture: false, param: null })).toBe(false);
    // What boot does then: no preset, no card → Standard.
    expect(startMode('ask', null) ?? 'standard').toBe('standard');
  });

  it('shows on every real build, and in a test build only with ?graphics=card', () => {
    expect(cardAllowed({ testHooks: false, capture: false, param: null })).toBe(true);
    expect(cardAllowed({ testHooks: true, capture: false, param: 'card' })).toBe(true);
    expect(cardAllowed({ testHooks: true, capture: false, param: 'hd' })).toBe(false);
    expect(cardAllowed({ testHooks: true, capture: true, param: 'card' })).toBe(false);
  });
});
