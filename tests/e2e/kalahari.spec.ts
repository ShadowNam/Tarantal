// M8 (PR D): Somer · Kalahari renders and plays — its own scenery (no missing textures), and in
// an omen hunt the heat haze turning into the thunderstorm: rain, gloom and lightning, with and
// without "reduce flashes" (screenshots for the human photosensitivity check; the ≤ 2 flashes a
// second cap is proven headless in src/sim/kalahari.test.ts). `?biome=` is dev/e2e only.
import { expect, test, type Page } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
} from './helpers';

async function reduceFlashes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem('tm.save.v1') !== null) return;
    localStorage.setItem(
      'tm.save.v1',
      JSON.stringify({
        v: 1,
        ftue: { done: true, skipped: false, step: '' },
        settings: { reduceFlashes: true },
      }),
    );
  });
}

for (const reduced of [false, true]) {
  test(`Kalahari: haze, then the storm with lightning${reduced ? ' (reduce flashes)' : ''}`, async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(240_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    if (reduced) await reduceFlashes(page);
    await boot(page, 'biome=kalahari-summer&omen=1&huntSeconds=24');
    await startHunt(page, touch);
    const h = await hook(page);
    expect(h.biome).toBe('kalahari-summer');
    expect(h.missingTextures).toEqual([]);
    expect(h.rain).toBe(false);
    if (!reduced)
      await page.screenshot({ path: `${SCREENSHOTS}/kalahari-heat-${info.project.name}.png` });
    await page.waitForFunction(() => window.__TM__?.rain === true, null, { timeout: 180_000 });
    await page.waitForFunction(() => window.__TM__?.lightning === true, null, {
      timeout: 180_000,
      polling: 16,
    });
    await page.screenshot({
      path: `${SCREENSHOTS}/kalahari-flash${reduced ? '-reduced' : ''}-${info.project.name}.png`,
    });
    expect(errors).toEqual([]);
  });
}
