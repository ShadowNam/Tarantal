// M9 quality tiers and lazy biome bundles. The title benchmark runs with ?bench=1 (e2e runs keep
// a fixed tier otherwise); a forced low tier draws five parallax layers and no camera filters,
// medium six with the vignette; a biome other than the home one downloads its art chunk only when
// a hunt there starts.
import { expect, test, type Page } from '@playwright/test';
import { boot, hook, isLandscape, isTouchProject, SCREENSHOTS, startHunt } from './helpers';

const SAVE = 'tm.e2e.save.v1';

async function seedQuality(page: Page, quality: string): Promise<void> {
  await page.addInitScript(
    ([key, q]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, JSON.stringify({ v: 1, settings: { quality: q } }));
    },
    [SAVE, quality] as const,
  );
}

test('title benchmark picks a tier and saves it for the next visit', async ({ page }) => {
  // 105 frames: a few seconds on a GPU, longer under software GL.
  test.setTimeout(240_000);
  await boot(page, 'bench=1');
  await page.waitForFunction(() => window.__TM__?.quality.benchRan === true, null, {
    timeout: 200_000,
  });
  const q = (await hook(page)).quality;
  expect(['low', 'medium', 'high']).toContain(q.bench?.tier);
  const saved = await page.evaluate(
    (key) =>
      (JSON.parse(localStorage.getItem(key) ?? '{}') as { device?: { benchTier: string } }).device
        ?.benchTier,
    SAVE,
  );
  expect(saved).toBe(q.bench?.tier);
  // Settings → quality "auto" follows it.
  expect(q.tier).toBe(q.bench?.tier);
});

test('low tier: the far ridge merged (5 layers), no camera filters', async ({ page }, info) => {
  await seedQuality(page, 'low');
  await boot(page, '');
  expect((await hook(page)).quality).toMatchObject({ tier: 'low', layers: 5, filters: [] });
  await page.screenshot({ path: `${SCREENSHOTS}/quality-low-${info.project.name}.png` });
});

test('medium tier: 6 layers and the vignette', async ({ page }) => {
  await seedQuality(page, 'medium');
  await boot(page, '');
  expect((await hook(page)).quality).toMatchObject({
    tier: 'medium',
    layers: 6,
    filters: ['vignette'],
  });
});

test('lazy biome: its art chunk loads only when a hunt there starts', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'hunts are played in landscape');
  const chunks: string[] = [];
  page.on('request', (r) => {
    const m = /assets\/(bushveld|okavango|kalahari)-[\w-]+\.js$/.exec(r.url());
    if (m?.[1] !== undefined) chunks.push(m[1]);
  });
  await boot(page, 'biome=bushveld-winter&huntSeconds=2');
  // The title shows the home biome: no other biome's art downloaded yet.
  expect(chunks).toEqual([]);
  await startHunt(page, isTouchProject(info));
  expect((await hook(page)).biome).toBe('bushveld-winter');
  expect(chunks).toEqual(['bushveld']);
});
