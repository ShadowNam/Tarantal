// M10 juice pass (GDD §17): a short hunt ends on the Bakkie Tally, which counts up with its ticks
// and lands the rank stamp with a thud (feel.json tally pacing) — no errors, [Again] reachable.
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

test('the tally counts up and stamps the rank on its feel.json pacing', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  const errors = collectErrors(page);
  await boot(page, 'seed=3&huntSeconds=3');
  await startHunt(page, isTouchProject(info));
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__TM__?.rects['again'] !== undefined, null, {
    timeout: 30_000,
  });
  // After the count-up, the stamp and the news line (countUpMs + newsDelayMs + fades, < 2 s).
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/juice-tally-${info.project.name}.png` });
  expect((await hook(page)).scene).toBe('tally');
  expect(errors).toEqual([]);
});
