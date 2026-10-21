// M10 audio (art bible §10, Tech §7): recorded files through the asset index with the synth as
// fallback, per-biome music that starts after the first gesture and follows the hunt, and the
// mute rules (first gesture, hidden tab, pause). Chromium only: it reads Web Audio state through
// the test hook, and Linux WebKit builds may lack the codecs (real Safari plays the MP3s).
import { expect, test, type Page } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapRect,
} from './helpers';
import { serveStandins } from './standins';

// The PWA service worker would fetch delivered files itself once it controls the page, and
// page.route never sees those requests (CI saw the server's index.html instead of the art).
test.use({ serviceWorkers: 'block' });

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (h ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

const gain = (page: Page) => page.evaluate(() => window.__TM__?.masterGain ?? null);

test('recorded music and SFX play after the first gesture; mute rules hold', async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== 'chromium' || !isLandscape(info), 'Chromium, landscape');
  const errors = collectErrors(page);
  const touch = isTouchProject(info);
  await serveStandins(page);
  await boot(page, 'seed=42');
  // No AudioContext before a gesture (browsers block it; Tech §9).
  expect(await gain(page)).toBeNull();
  expect((await hook(page)).music).toBeNull();
  await startHunt(page, touch);
  await page.waitForFunction(() => window.__TM__?.music?.id === 'karoo-autumn', null, {
    timeout: 30_000,
  });
  const h = await hook(page);
  expect(h.music?.stem).toBe('calm');
  expect(h.assets.recorded).toEqual(
    expect.arrayContaining([
      'sfx/shot',
      'sfx/poof',
      'music/karoo-autumn/calm',
      'music/karoo-autumn/build',
      'amb/karoo-autumn',
    ]),
  );
  expect(await gain(page)).toBeGreaterThan(0);

  // Hidden tab: silent at once. Mid-hunt it also opens the pause menu, so audio stays muted on
  // return until the player resumes.
  await setHidden(page, true);
  expect(await gain(page)).toBe(0);
  await setHidden(page, false);
  await page.waitForFunction(() => window.__TM__?.menu === 'pause');
  expect(await gain(page)).toBe(0);
  await tapRect(page, touch, 'pause.resume');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  expect(await gain(page)).toBeGreaterThan(0);

  // Pause from the HUD: muted while the menu is open.
  if (touch) await tapRect(page, touch, 'pause');
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__TM__?.menu === 'pause');
  expect(await gain(page)).toBe(0);
  await tapRect(page, touch, 'pause.resume');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  expect(await gain(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('with nothing delivered there is no music and the synth plays the SFX', async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== 'chromium' || !isLandscape(info), 'Chromium, landscape');
  const touch = isTouchProject(info);
  await boot(page, 'seed=42');
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.masterGain ?? 0) > 0, null, { timeout: 60_000 });
  const h = await hook(page);
  expect(h.music).toBeNull();
  expect(h.assets.recorded).toEqual([]);
});

test('Settings has a voice volume next to music and effects', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape');
  const touch = isTouchProject(info);
  await boot(page, 'seed=42');
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined);
  await tapRect(page, touch, 'settings');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  const rects = (await hook(page)).rects;
  for (const id of [
    'settings.masterVolume',
    'settings.sfxVolume',
    'settings.musicVolume',
    'settings.voiceVolume',
    'settings.language',
  ])
    expect(rects[id], id).toBeDefined();
  await page.screenshot({ path: `${SCREENSHOTS}/audio-settings-${info.project.name}.png` });
});
