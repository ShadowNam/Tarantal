// M8 (PR C): Lente · Okavango renders and plays — its own scenery and water (no missing
// textures), a kuifkop peeking out of the reeds, and a sun-shower in an omen hunt. `?biome=`
// (dev/e2e builds only) plays Classic in the biome. The rules are proven headless in
// src/sim/okavango.test.ts.
import { expect, test } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
} from './helpers';

test('Okavango: scenery, a kuifkop in the reeds, a sun-shower', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(240_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'biome=okavango-spring&omen=1&huntSeconds=40');
  await startHunt(page, touch);
  const h = await hook(page);
  expect(h.biome).toBe('okavango-spring');
  expect(h.missingTextures).toEqual([]);
  await page.waitForFunction(
    () => window.__TM__?.specialBirds.some((b) => b.creature === 'kuifkop' && b.phase !== 'hidden'),
    null,
    { timeout: 180_000 },
  );
  await page.screenshot({ path: `${SCREENSHOTS}/okavango-kuifkop-${info.project.name}.png` });
  await page.waitForFunction(() => window.__TM__?.rain === true, null, { timeout: 180_000 });
  await page.screenshot({ path: `${SCREENSHOTS}/okavango-rain-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
