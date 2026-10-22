// v1.0.1 (D-028 §1): the public build — what GitHub Pages and the portal releases ship, built
// without VITE_TEST_HOOKS — refuses official results under `?e2e`. A `?e2e` page has a fresh
// `tm.e2e.*` save every time, so without this gate a test link gave unlimited fresh official
// Daily attempts and shareable cards. On that build: the Daily is practice (no attempt, streak or
// best saved), no tally offers [Share], and a challenge link is not opened.
// Runs only with E2E_BUILD=public (playwright.config.ts builds the public web build then); every
// other e2e run uses the CI test build, where daily.spec.ts keeps official Dailies.
import { expect, test, type Page } from '@playwright/test';
import { loadContentHash, loadDailyMeta } from '../../tools/testContent';
import { challengeFor, encodeChallenge } from '../../src/meta/challenge';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  tapRect,
} from './helpers';

// Today = the epoch (content/meta/daily.json, its only copy, D-028).
const DAY = loadDailyMeta().epoch;

async function waitScene(page: Page, scene: string): Promise<void> {
  await page.waitForFunction((s) => window.__TM__?.scene === s, scene, { timeout: 120_000 });
}

async function savedDaily(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('tm.e2e.save.v1');
    return raw === null ? null : ((JSON.parse(raw) as { daily?: unknown }).daily ?? null);
  });
}

test.describe('public build: ?e2e is unranked', () => {
  test('the Daily is practice only: nothing saved, no [Share]', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, `huntSeconds=3&today=${DAY}`);
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined);
    await page.screenshot({ path: `${SCREENSHOTS}/daily-public-title-${info.project.name}.png` });
    await tapRect(page, touch, 'daily');
    await waitScene(page, 'hunt');
    let h = await hook(page);
    expect(h.daily, 'a fresh ?e2e save still gets no official attempt').toMatchObject({
      key: DAY,
      official: false,
    });
    expect(h.hudTag).toMatch(/^PRACTICE · DAILY #/);
    await waitScene(page, 'tally');
    h = await hook(page);
    expect(h.tally).toMatchObject({ share: false });
    expect(h.tally?.tag).toMatch(/^Practice · Daily #/);
    expect(h.rects['share']).toBeUndefined();
    await page.screenshot({ path: `${SCREENSHOTS}/daily-public-tally-${info.project.name}.png` });
    const daily = (await savedDaily(page)) as {
      streak: number;
      bestScore: number | null;
      lastDay: number | null;
      history: unknown[];
    } | null;
    // The save may not hold a daily section at all; if it does, nothing official is in it.
    if (daily !== null) {
      expect(daily).toMatchObject({ streak: 0, bestScore: null, lastDay: null });
      expect(daily.history).toEqual([]);
    }
    expect(h.analytics.map((r) => r.event)).not.toContain('share_click');
    expect(errors).toEqual([]);
  });

  test('a challenge link is not opened, and a Classic tally has no [Share]', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    const c = challengeFor(
      {
        seed: 4242,
        mode: 'classic',
        biome: 'karoo-autumn',
        weapon: 'dubbelloop',
        score: 1234,
        dailyNumber: null,
      },
      loadContentHash(),
      'Oom Koos',
    );
    await boot(page, `huntSeconds=3&c=${encodeChallenge(c)}`);
    await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined);
    let h = await hook(page);
    expect(h.scene, 'the title, not the "beat this" card').toBe('start');
    expect(h.challenge).toBeNull();
    await tapRect(page, touch, 'start');
    await waitScene(page, 'hunt');
    await waitScene(page, 'tally');
    h = await hook(page);
    expect(h.tally).toMatchObject({ share: false });
    expect(h.rects['share']).toBeUndefined();
    expect(errors).toEqual([]);
  });
});
