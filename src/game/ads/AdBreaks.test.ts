import { describe, expect, it, vi } from 'vitest';
import { AdBreaks } from './AdBreaks';

/** A fake portal: ads report "playing" through onAdChange, like LocalPlatform's AdGate. */
function platform(opts: { granted?: boolean; plays?: boolean } = {}) {
  const { granted = true, plays = true } = opts;
  const listeners = new Set<(p: boolean) => void>();
  const play = async <T>(v: T): Promise<T> => {
    if (plays) for (const fn of listeners) fn(true);
    await Promise.resolve();
    if (plays) for (const fn of listeners) fn(false);
    return v;
  };
  return {
    commercialBreak: vi.fn(() => play(undefined)),
    rewardedBreak: vi.fn(() => play(granted)),
    rewardedAvailable: () => true,
    analytics: vi.fn(),
    onAdChange: (fn: (p: boolean) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

describe('AdBreaks (M9: ads only between hunts)', () => {
  it('no break before the first hunt of the page; one before each later hunt', async () => {
    const p = platform();
    const ads = new AdBreaks(p);
    await ads.beforeHunt();
    expect(p.commercialBreak).not.toHaveBeenCalled();
    ads.huntStarted();
    await ads.beforeHunt();
    ads.huntStarted();
    await ads.beforeHunt();
    expect(p.commercialBreak).toHaveBeenCalledTimes(2);
    expect(ads.counts.breaks).toBe(2);
  });

  it('single-flight: a second request during a break joins it (one break, busy meanwhile)', async () => {
    const p = platform();
    const ads = new AdBreaks(p);
    ads.huntStarted();
    const a = ads.beforeHunt();
    expect(ads.busy).toBe(true);
    const b = ads.beforeHunt();
    await Promise.all([a, b]);
    expect(p.commercialBreak).toHaveBeenCalledTimes(1);
    expect(ads.busy).toBe(false);
    // No rewarded ad on top of a break in flight.
    ads.huntStarted();
    const c = ads.beforeHunt();
    expect(await ads.rewarded('retry')).toBe(false);
    await c;
    expect(p.rewardedBreak).not.toHaveBeenCalled();
  });

  it('rewarded: reports granted or not', async () => {
    const yes = new AdBreaks(platform({ granted: true }));
    expect(await yes.rewarded('retry')).toBe(true);
    const no = platform({ granted: false });
    const noAds = new AdBreaks(no);
    expect(await noAds.rewarded('doppies')).toBe(false);
    expect(no.analytics).toHaveBeenCalledWith('rewarded_ad', { kind: 'doppies', granted: false });
    expect(noAds.counts).toEqual({ breaks: 0, rewarded: 1, granted: 0 });
  });

  it('no commercial break right after a rewarded ad that really played', async () => {
    const p = platform();
    const ads = new AdBreaks(p);
    ads.huntStarted();
    await ads.rewarded('retry');
    await ads.beforeHunt();
    expect(p.commercialBreak).not.toHaveBeenCalled();
    await ads.beforeHunt();
    expect(p.commercialBreak).toHaveBeenCalledTimes(1);
  });

  it('a rewarded request with no ad shown (no fill, no SDK) keeps the next break', async () => {
    const p = platform({ granted: false, plays: false });
    const ads = new AdBreaks(p);
    ads.huntStarted();
    await ads.rewarded('retry');
    await ads.beforeHunt();
    expect(p.commercialBreak).toHaveBeenCalledTimes(1);
  });
});
