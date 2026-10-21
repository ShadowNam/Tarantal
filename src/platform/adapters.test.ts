// Portal adapters against fake SDKs (M9): the same call shapes as the Poki HTML5 SDK and the
// CrazyGames SDK v3. Real SDK runs (local/test modes) are in tests/e2e/platform.spec.ts.
import { describe, expect, it, vi } from 'vitest';
import { AdGate, type Timers } from './adGate';
import { CrazyGamesPlatform, type CrazyAdCallbacks, type CrazySdk } from './crazygames';
import type { PlatformOptions } from './local';
import { PokiPlatform, type PokiSdk } from './poki';

const opts: PlatformOptions = { log: false, adTimeoutMs: 1000, sdkTimeoutMs: 1000 };

function fakePoki(over: Partial<PokiSdk> = {}): PokiSdk & { calls: string[] } {
  const calls: string[] = [];
  const sdk: PokiSdk & { calls: string[] } = {
    calls,
    init: () => Promise.resolve(),
    gameLoadingFinished: () => calls.push('loadingFinished'),
    gameplayStart: () => calls.push('gameplayStart'),
    gameplayStop: () => calls.push('gameplayStop'),
    commercialBreak: (onStart) => {
      calls.push('commercialBreak');
      onStart?.();
      return Promise.resolve();
    },
    rewardedBreak: (onStart) => {
      calls.push('rewardedBreak');
      onStart?.();
      return Promise.resolve(true);
    },
    shareableURL: () => Promise.resolve('https://poki.test/g/tarantal'),
    getURLParam: (n) => (n === 'c' ? 'fromPoki' : ''),
    ...over,
  };
  return sdk;
}

function fakeCrazy(
  result: 'finish' | 'error' = 'finish',
  env = 'local',
  muteAudio = false,
): CrazySdk & { calls: string[]; settingsFn: ((s: { muteAudio?: boolean }) => void) | null } {
  const calls: string[] = [];
  const sdk = {
    calls,
    settingsFn: null as ((s: { muteAudio?: boolean }) => void) | null,
    environment: env,
    init: () => Promise.resolve(),
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      inviteLink: (p: Record<string, string>) =>
        `https://crazygames.test/game/tarantal?c=${p['c'] ?? ''}`,
      getInviteParam: (n: string) => (n === 'c' ? 'fromInvite' : null),
      settings: { muteAudio },
      addSettingsChangeListener: (fn: (s: { muteAudio?: boolean }) => void) => {
        sdk.settingsFn = fn;
      },
    },
    ad: {
      requestAd: (type: 'midgame' | 'rewarded', cb: CrazyAdCallbacks) => {
        calls.push(`requestAd:${type}`);
        cb.adStarted?.();
        if (result === 'finish') cb.adFinished?.();
        else cb.adError?.('no fill');
      },
      hasAdblock: () => Promise.resolve(false),
    },
  };
  return sdk;
}

describe('AdGate', () => {
  it('reports playing only between started() and the end, one ad at a time', async () => {
    const gate = new AdGate(1000);
    const seen: boolean[] = [];
    gate.onChange((p) => seen.push(p));
    let finish: (v: boolean) => void = () => undefined;
    const first = gate.run(
      (started) =>
        new Promise<boolean>((resolve) => {
          started();
          finish = resolve;
        }),
      false,
    );
    expect(gate.isPlaying).toBe(true);
    // A second request while the first runs is refused at once.
    expect(await gate.run(() => Promise.resolve(true), false)).toBe(false);
    finish(true);
    expect(await first).toBe(true);
    expect(seen).toEqual([true, false]);
    expect(gate.isPlaying).toBe(false);
  });

  it('a rejecting or throwing SDK gives the fallback and unmutes', async () => {
    const gate = new AdGate(1000);
    expect(
      await gate.run((started) => {
        started();
        return Promise.reject(new Error('sdk'));
      }, 'fb'),
    ).toBe('fb');
    expect(
      await gate.run(() => {
        throw new Error('sync');
      }, 'fb'),
    ).toBe('fb');
    expect(gate.isPlaying).toBe(false);
  });

  it('an ad that never settles ends at the timeout (the game never hangs)', async () => {
    let fire: () => void = () => undefined;
    const timers: Timers = {
      set: (fn) => {
        fire = fn;
        return 1;
      },
      clear: () => undefined,
    };
    const gate = new AdGate(60_000, timers);
    const p = gate.run((started) => {
      started();
      return new Promise<boolean>(() => undefined);
    }, false);
    expect(gate.isPlaying).toBe(true);
    fire();
    expect(await p).toBe(false);
    expect(gate.isPlaying).toBe(false);
  });
});

describe('PokiPlatform (fake SDK)', () => {
  async function poki(sdk: PokiSdk | null): Promise<PokiPlatform> {
    const p = new PokiPlatform(opts, () => Promise.resolve(sdk), false);
    await p.init();
    return p;
  }

  it('loading finished once, gameplay start/stop without repeats', async () => {
    const sdk = fakePoki();
    const p = await poki(sdk);
    p.loadingProgress(0.5);
    p.loadingProgress(1);
    p.loadingProgress(1);
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    expect(sdk.calls).toEqual(['loadingFinished', 'gameplayStart', 'gameplayStop']);
  });

  it('loading that finished before init reports once the SDK is ready', async () => {
    const sdk = fakePoki();
    const p = new PokiPlatform(opts, () => Promise.resolve(sdk), false);
    p.loadingProgress(1);
    await p.init();
    expect(sdk.calls).toEqual(['loadingFinished']);
  });

  it('commercial break: stops gameplay first, mutes while the ad plays, then unmutes', async () => {
    const sdk = fakePoki();
    const p = await poki(sdk);
    const ad: boolean[] = [];
    p.onAdChange((on) => ad.push(on));
    p.gameplayStart();
    await p.commercialBreak();
    expect(sdk.calls).toEqual(['gameplayStart', 'gameplayStop', 'commercialBreak']);
    expect(ad).toEqual([true, false]);
    expect(p.isAdPlaying()).toBe(false);
  });

  it('rewarded: true grants, false (no video) does not', async () => {
    expect(await (await poki(fakePoki())).rewardedBreak()).toBe(true);
    const refused = await poki(fakePoki({ rewardedBreak: () => Promise.resolve(false) }));
    expect(await refused.rewardedBreak()).toBe(false);
  });

  it('no SDK (adblock, offline): the game runs, no ads, no rewards offered', async () => {
    const p = await poki(null);
    expect(p.rewardedAvailable()).toBe(false);
    expect(await p.rewardedBreak()).toBe(false);
    await expect(p.commercialBreak()).resolves.toBeUndefined();
    expect(p.shareUrl('https://x.test/?c=abc')).toBe('https://x.test/?c=abc');
  });

  it('init that rejects counts as no SDK', async () => {
    const p = await poki(fakePoki({ init: () => Promise.reject(new Error('blocked')) }));
    expect(p.rewardedAvailable()).toBe(false);
  });

  it('challenge links go through Poki: gdc on the game page, read back with getURLParam', async () => {
    const p = await poki(fakePoki());
    expect(p.shareUrl('https://games.poki.test/x/index.html?c=AbC_1')).toBe(
      'https://poki.test/g/tarantal?gdc=AbC_1',
    );
    expect(p.launchParam('c')).toBe('fromPoki');
    expect(p.pwa).toBe(false);
    expect(p.canShowExternalLinks).toBe(false);
  });
});

describe('CrazyGamesPlatform (fake SDK)', () => {
  async function crazy(sdk: CrazySdk | null): Promise<CrazyGamesPlatform> {
    const p = new CrazyGamesPlatform(opts, () => Promise.resolve(sdk));
    await p.init();
    return p;
  }

  it('loadingStart at init, loadingStop when loaded, start again for a lazy load', async () => {
    const sdk = fakeCrazy();
    const p = await crazy(sdk);
    p.loadingProgress(1);
    p.loadingProgress(0.2);
    p.loadingProgress(1);
    expect(sdk.calls).toEqual(['loadingStart', 'loadingStop', 'loadingStart', 'loadingStop']);
  });

  it('midgame ad: mute while it plays; an ad error still resumes the game', async () => {
    for (const result of ['finish', 'error'] as const) {
      const sdk = fakeCrazy(result);
      const p = await crazy(sdk);
      const ad: boolean[] = [];
      p.onAdChange((on) => ad.push(on));
      await p.commercialBreak();
      expect(sdk.calls).toContain('requestAd:midgame');
      expect(ad).toEqual([true, false]);
    }
  });

  it('rewarded: adFinished grants, adError does not', async () => {
    expect(await (await crazy(fakeCrazy('finish'))).rewardedBreak()).toBe(true);
    expect(await (await crazy(fakeCrazy('error'))).rewardedBreak()).toBe(false);
  });

  it("environment 'disabled' (another host) is treated as no SDK", async () => {
    const sdk = fakeCrazy('finish', 'disabled');
    const p = await crazy(sdk);
    expect(p.rewardedAvailable()).toBe(false);
    p.gameplayStart();
    expect(sdk.calls).toEqual([]);
  });

  it('adblock: no ads requested, no rewarded offered', async () => {
    const sdk = fakeCrazy();
    sdk.ad.hasAdblock = () => Promise.resolve(true);
    const p = await crazy(sdk);
    expect(p.rewardedAvailable()).toBe(false);
    await p.commercialBreak();
    expect(sdk.calls).not.toContain('requestAd:midgame');
  });

  it('settings.muteAudio silences the game and follows changes', async () => {
    const sdk = fakeCrazy('finish', 'local', true);
    const p = await crazy(sdk);
    const fn = vi.fn();
    p.onPortalMute(fn);
    expect(fn).toHaveBeenLastCalledWith(true);
    sdk.settingsFn?.({ muteAudio: false });
    expect(fn).toHaveBeenLastCalledWith(false);
  });

  it('challenge links use inviteLink / getInviteParam', async () => {
    const p = await crazy(fakeCrazy());
    expect(p.shareUrl('https://x.test/?c=AbC')).toBe('https://crazygames.test/game/tarantal?c=AbC');
    expect(p.launchParam('c')).toBe('fromInvite');
  });
});
