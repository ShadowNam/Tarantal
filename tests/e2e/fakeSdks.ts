// Stand-ins for the Poki and CrazyGames SDK scripts (M9), served by page.route() in place of the
// portals' own URLs, so portal builds are tested offline and without an account. Each records
// its calls in window.__fakeSdk.calls and, while an ad "plays", whether the game is muted.
// The real SDKs' local modes are checked by platform.spec.ts with REAL_SDK=1 (network needed).

const COMMON = `
  window.__fakeSdk = { calls: [], adMs: 600, rewardGranted: true };
  const fake = window.__fakeSdk;
  const log = (c) => fake.calls.push(c);
  // Records whether the game muted itself once the ad covers it (AudioDirector via onAdChange).
  const showAd = (name, onStart, result) => {
    log(name);
    if (onStart) onStart();
    return new Promise((resolve) => {
      setTimeout(() => log(name + ':muted=' + String(window.__TM__ && window.__TM__.audioMuted)), 50);
      setTimeout(() => {
        log(name + ':end');
        resolve(result);
      }, fake.adMs);
    });
  };
`;

export const FAKE_POKI_SDK = `(() => {${COMMON}
  window.PokiSDK = {
    init: () => { log('init'); return Promise.resolve(); },
    gameLoadingFinished: () => log('gameLoadingFinished'),
    gameplayStart: () => log('gameplayStart'),
    gameplayStop: () => log('gameplayStop'),
    commercialBreak: (onStart) => showAd('commercialBreak', onStart, undefined),
    rewardedBreak: (onStart) => showAd('rewardedBreak', onStart, fake.rewardGranted),
    shareableURL: (p) => Promise.resolve('https://poki.example/g/tarantal' +
      (Object.keys(p).length ? '?' + Object.entries(p).map(([k, v]) => 'gd' + k + '=' + v).join('&') : '')),
    getURLParam: (n) => new URLSearchParams(location.search).get('gd' + n) || '',
  };
})();`;

export const FAKE_CRAZYGAMES_SDK = `(() => {${COMMON}
  const listeners = [];
  window.CrazyGames = { SDK: {
    environment: 'crazygames',
    init: () => { log('init'); return Promise.resolve(); },
    game: {
      loadingStart: () => log('loadingStart'),
      loadingStop: () => log('loadingStop'),
      gameplayStart: () => log('gameplayStart'),
      gameplayStop: () => log('gameplayStop'),
      inviteLink: (p) => 'https://crazygames.example/game/tarantal?' + new URLSearchParams(p).toString(),
      getInviteParam: (n) => new URLSearchParams(location.search).get(n),
      settings: { muteAudio: false, disableChat: false },
      addSettingsChangeListener: (fn) => listeners.push(fn),
      removeSettingsChangeListener: () => undefined,
    },
    ad: {
      requestAd: (type, cb) => {
        showAd('requestAd:' + type, cb.adStarted, true).then(() => {
          if (type === 'rewarded' && !fake.rewardGranted) cb.adError && cb.adError('unfilled');
          else cb.adFinished && cb.adFinished();
        });
      },
      hasAdblock: () => Promise.resolve(false),
    },
  } };
  fake.setMuteAudio = (on) => listeners.forEach((fn) => fn({ muteAudio: on, disableChat: false }));
})();`;
