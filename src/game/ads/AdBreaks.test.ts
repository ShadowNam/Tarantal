import { describe, expect, it, vi } from 'vitest';
import { AdBreaks } from './AdBreaks';

function platform(granted = true) {
  return {
    commercialBreak: vi.fn(() => Promise.resolve()),
    rewardedBreak: vi.fn(() => Promise.resolve(granted)),
    rewardedAvailable: () => true,
    analytics: vi.fn(),
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

  it('rewarded: reports granted or not', async () => {
    const yes = new AdBreaks(platform(true));
    expect(await yes.rewarded('retry')).toBe(true);
    const no = platform(false);
    const noAds = new AdBreaks(no);
    expect(await noAds.rewarded('doppies')).toBe(false);
    expect(no.analytics).toHaveBeenCalledWith('rewarded_ad', { kind: 'doppies', granted: false });
    expect(noAds.counts).toEqual({ breaks: 0, rewarded: 1, granted: 0 });
  });

  it('no commercial break right after a rewarded ad', async () => {
    const p = platform();
    const ads = new AdBreaks(p);
    ads.huntStarted();
    await ads.rewarded('retry');
    await ads.beforeHunt();
    expect(p.commercialBreak).not.toHaveBeenCalled();
    await ads.beforeHunt();
    expect(p.commercialBreak).toHaveBeenCalledTimes(1);
  });
});
