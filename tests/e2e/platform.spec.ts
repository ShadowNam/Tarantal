// M9 platform layer. With E2E_PLATFORM=poki|crazygames (a portal build made with
// VITE_TEST_HOOKS=1, see playwright.config.ts) it checks the portal signals and ads against a
// fake SDK served in place of the portal's script: no ad before the first hunt, a commercial
// break between hunts with the game muted, gameplay start/stop around play, the rewarded
// "Oupa se tweede kans", and challenge links through the portal's own parameter. REAL_SDK=1
// loads the portals' real SDKs instead (their localhost modes; needs the network, run by hand).
// Without E2E_PLATFORM (the web build): the privacy screen and the e2e save namespace.
import { expect, test, type Page } from '@playwright/test';
import { encodeChallenge } from '../../src/meta/challenge';
import { CRAZYGAMES_SDK_URL } from '../../src/platform/crazygames';
import { POKI_SDK_URL } from '../../src/platform/poki';
import { FAKE_CRAZYGAMES_SDK, FAKE_POKI_SDK } from './fakeSdks';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  SCREENSHOTS,
  startHunt,
  tapRect,
} from './helpers';

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';
const REAL_SDK = process.env['REAL_SDK'] === '1';
const SAVE = 'tm.e2e.save.v1';

async function routeSdk(page: Page): Promise<void> {
  if (REAL_SDK) return;
  await page.route(POKI_SDK_URL, (r) =>
    r.fulfill({ contentType: 'text/javascript', body: FAKE_POKI_SDK }),
  );
  await page.route(CRAZYGAMES_SDK_URL, (r) =>
    r.fulfill({ contentType: 'text/javascript', body: FAKE_CRAZYGAMES_SDK }),
  );
}

async function sdkCalls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as Window & { __fakeSdk?: { calls: string[] } }).__fakeSdk?.calls ?? [],
  );
}

async function waitScene(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((s) => window.__TM__?.scene === s, scene, { timeout: 90_000 });
}

/** `calls` holds `expected` in this order (other calls may sit in between). */
function inOrder(calls: readonly string[], expected: readonly string[]): boolean {
  let i = 0;
  for (const c of calls) if (c === expected[i]) i++;
  return i === expected.length;
}

const AD = PLATFORM === 'poki' ? 'commercialBreak' : 'requestAd:midgame';
const REWARDED = PLATFORM === 'poki' ? 'rewardedBreak' : 'requestAd:rewarded';
const LOADED = PLATFORM === 'poki' ? 'gameLoadingFinished' : 'loadingStop';

test.describe('portal build', () => {
  test.skip(PLATFORM === 'web', 'set E2E_PLATFORM=poki|crazygames (portal build)');

  test('?admin=1 is ignored: the normal title, no admin page (D-034)', async ({ page }) => {
    await routeSdk(page);
    // D-045: nor the Project overview, even when asked for directly.
    await boot(page, 'admin=1&project=1');
    await waitScene(page, 'start');
    const h = await hook(page);
    expect(h.platform).toBe(PLATFORM);
    expect(h.admin).toBeNull();
    await expect(page.locator('#tm-admin')).toHaveCount(0);
    await expect(page.locator('#tm-project')).toHaveCount(0);
    expect(
      await page.evaluate(() => Object.keys(localStorage).some((k) => k.includes('admin'))),
    ).toBe(false);
  });

  test('ads only between hunts, muted meanwhile; gameplay signals around play', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'hunts are played in landscape');
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    await routeSdk(page);
    await boot(page, 'huntSeconds=2');
    expect((await hook(page)).platform).toBe(PLATFORM);
    await startHunt(page, touch);
    await waitScene(page, 'tally');
    if (!REAL_SDK) expect(await sdkCalls(page)).not.toContain(AD);
    await tapRect(page, touch, 'again');
    await waitScene(page, 'hunt');
    expect((await hook(page)).audioMuted).toBe(false);
    if (!REAL_SDK) {
      const calls = await sdkCalls(page);
      expect(
        inOrder(calls, [
          'init',
          LOADED,
          'gameplayStart',
          'gameplayStop',
          AD,
          `${AD}:end`,
          'gameplayStart',
        ]),
        calls.join(' '),
      ).toBe(true);
      // The game was muted while the ad covered it.
      expect(calls).toContain(`${AD}:muted=true`);
    }
    await page.screenshot({
      path: `${SCREENSHOTS}/platform-${PLATFORM}-hunt2-${info.project.name}.png`,
    });
    expect((await hook(page)).ads?.breaks).toBe(1);
    // The real SDKs log their own warnings (sandboxed frames, COOP over http): there, judge the
    // game by its own error hook (uncaught errors and rejections) instead of the console.
    if (REAL_SDK) expect((await hook(page)).errors).toEqual([]);
    else expect(errors).toEqual([]);
  });

  test('Oupa se tweede kans: a rewarded ad replays the lost Season Run hunt', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'the run is played in landscape');
    test.skip(REAL_SDK, 'the real SDKs grant no reward on localhost');
    const touch = isTouchProject(info);
    await routeSdk(page);
    // Huge quotas: the first hunt is lost.
    await boot(page, 'huntSeconds=2&quotaMul=50');
    await tapRect(page, touch, 'seasonRun');
    await page.waitForFunction(() => window.__TM__?.run?.view === 'intro', null, {
      timeout: 60_000,
    });
    await tapRect(page, touch, 'run.go');
    await waitScene(page, 'hunt');
    await page.waitForFunction(
      () =>
        window.__TM__?.run?.view === 'tally' && window.__TM__.rects['run.retryAd'] !== undefined,
      null,
      { timeout: 90_000 },
    );
    expect((await hook(page)).run?.phase).toBe('defeat');
    await page.screenshot({
      path: `${SCREENSHOTS}/platform-${PLATFORM}-retry-${info.project.name}.png`,
    });
    await tapRect(page, touch, 'run.retryAd');
    await page.waitForFunction(
      () => window.__TM__?.run?.view === 'intro' && window.__TM__.run.huntIndex === 0,
      null,
      { timeout: 60_000 },
    );
    expect(await sdkCalls(page)).toContain(`${REWARDED}:end`);
    // A rewarded ad was just watched: HUNT! goes straight in, no commercial break.
    await tapRect(page, touch, 'run.go');
    await waitScene(page, 'hunt');
    expect(await sdkCalls(page)).not.toContain(AD);
  });

  test('ad request race: double taps and Menu while the SDK starts the ad — one break, one hunt', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'hunts are played in landscape');
    test.skip(REAL_SDK, 'fake SDK only');
    test.setTimeout(180_000);
    const touch = isTouchProject(info);
    await routeSdk(page);
    // The fake SDK takes 1.5 s to start each ad: the request phase where taps used to slip through.
    await boot(page, 'huntSeconds=2&fakeAdDelay=1500');
    await startHunt(page, touch);
    await waitScene(page, 'tally');
    // Taps dispatched inside the page in one go: all land during the 1.5 s ad request.
    const tapIds = (ids: readonly string[]): Promise<void> =>
      page.evaluate(
        ([list, isTouch]) => {
          const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
          const h = window.__TM__;
          if (!canvas || !h) throw new Error('game not booted');
          const r = canvas.getBoundingClientRect();
          let pid = 500;
          for (const id of list) {
            const rect = h.rects[id];
            if (!rect) throw new Error(`no rect ${id}`);
            const init: PointerEventInit = {
              clientX: r.left + ((rect.x + rect.w / 2) / h.designWidth) * r.width,
              clientY: r.top + ((rect.y + rect.h / 2) / h.designHeight) * r.height,
              pointerId: pid++,
              pointerType: isTouch ? 'touch' : 'mouse',
              isPrimary: true,
              button: 0,
              buttons: 1,
              bubbles: true,
              cancelable: true,
            };
            canvas.dispatchEvent(new PointerEvent('pointerdown', init));
            window.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          }
        },
        [ids, touch] as const,
      );
    const breaks = async (): Promise<number> =>
      (await sdkCalls(page)).filter((c) => c === AD).length;

    // 1. Tally: [Again] twice, then [Menu].
    await tapIds(['again', 'again', 'menu']);
    await waitScene(page, 'hunt');
    // Long enough for a stray second break (1.5 s + 0.6 s) or restart to happen. The hunt may
    // already be over on a fast browser: the counts below catch any extra start or restart.
    await page.waitForTimeout(3000);
    let h = await hook(page);
    expect(await breaks()).toBe(1);
    expect(h.huntRequests).toBe(2);

    // 2. The run's hunt card (the route without a guard before): HUNT! twice, then Menu.
    await waitScene(page, 'tally');
    await tapRect(page, touch, 'seasonRun');
    await page.waitForFunction(() => window.__TM__?.run?.view === 'intro', null, {
      timeout: 60_000,
    });
    await tapIds(['run.go', 'run.go', 'run.menu']);
    await waitScene(page, 'hunt');
    expect((await hook(page)).mode).toBe('seasonHunt');
    await page.waitForTimeout(3000);
    h = await hook(page);
    expect(await breaks()).toBe(2);
    expect(h.huntRequests).toBe(3);
    expect(h.analytics.filter((a) => a.event === 'hunt_start')).toHaveLength(3);
    const calls = await sdkCalls(page);
    // Each break ran to its end before its hunt (never a hunt under a playing ad).
    expect(calls.filter((c) => c === `${AD}:end`)).toHaveLength(2);
  });

  test("a challenge link arrives through the portal's own parameter", async ({ page }) => {
    test.skip(REAL_SDK, 'fake SDK only');
    await routeSdk(page);
    const c = encodeChallenge({
      v: 1,
      seed: 42,
      mode: 'classic',
      biome: 'karoo-autumn',
      weapon: 'dubbelloop',
      score: 1234,
    });
    await boot(
      page,
      PLATFORM === 'poki'
        ? `gdc=${c}&reenbui=content&brakkie=content`
        : `c=${c}&reenbui=content&brakkie=content`,
    );
    await waitScene(page, 'challenge');
  });
});

test.describe('web build', () => {
  test.skip(PLATFORM !== 'web', 'web build only');

  test('privacy screen from Settings; clear my data restarts as a new player', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    // Two boots and a dozen menu steps: over the 90 s default on loaded software-GL CI runners.
    test.setTimeout(240_000);
    const touch = isTouchProject(info);
    await boot(page, '');
    // ?e2e runs keep their own save: the player's tm.save.v1 is never touched.
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain(SAVE);
    expect(keys).not.toContain('tm.save.v1');
    await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined);
    await tapRect(page, touch, 'settings');
    await page.waitForFunction(() => window.__TM__?.menu === 'settings');
    await tapRect(page, touch, 'settings.left_handed');
    await tapRect(page, touch, 'settings.privacy');
    await page.waitForFunction(() => window.__TM__?.menu === 'privacy');
    await page.screenshot({ path: `${SCREENSHOTS}/privacy-${info.project.name}.png` });
    // Esc closes it back to Settings.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__TM__?.menu === 'settings');
    await tapRect(page, touch, 'settings.privacy');
    await page.waitForFunction(() => window.__TM__?.menu === 'privacy');
    const leftHanded = (k: string): Promise<boolean | undefined> =>
      page.evaluate(
        (key) =>
          (JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: { leftHanded: boolean } })
            .settings?.leftHanded,
        k,
      );
    expect(await leftHanded(SAVE)).toBe(true);
    await tapRect(page, touch, 'privacy.clear');
    await tapRect(page, touch, 'privacy.clear');
    await page.waitForFunction(
      () => window.__TM__?.ready === true && window.__TM__.menu === null,
      null,
      {
        timeout: 60_000,
      },
    );
    expect(await leftHanded(SAVE)).not.toBe(true);
  });
});
