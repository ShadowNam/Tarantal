// M9 quality tiers and lazy biome bundles. The title benchmark runs with ?bench=1 (e2e runs keep
// a fixed tier otherwise); a forced low tier draws five parallax layers and no camera filters,
// medium six with the vignette; a biome other than the home one downloads its art chunk only when
// a hunt there starts.
import { expect, test, type Page } from '@playwright/test';
import karoo from '../../content/biomes/karoo-autumn.json' with { type: 'json' };
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

// v1.8b (D-062): a far ridge with a baboon troop is never merged (merged, its art would scroll at
// the far veld's rate while the troop's hit shapes stay at the ridge's): the merge is checked on
// a map without a troop (?baboons=0), and a troop map keeps the ridge as its own layer.
test('low tier: the far ridge merged (5 layers), no camera filters', async ({ page }, info) => {
  await seedQuality(page, 'low');
  await boot(page, 'baboons=0');
  expect((await hook(page)).quality).toMatchObject({ tier: 'low', layers: 5, filters: [] });
  await page.screenshot({ path: `${SCREENSHOTS}/quality-low-${info.project.name}.png` });
});

test('low tier: a troop map keeps its far ridge (6 layers), the troop on its seats', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'hunts are played in landscape');
  test.setTimeout(300_000);
  await seedQuality(page, 'low');
  await boot(page, 'seed=42&layout=mon&huntSeconds=60');
  expect((await hook(page)).quality).toMatchObject({ tier: 'low', layers: 6, filters: [] });
  await startHunt(page, isTouchProject(info));
  await page.waitForFunction(
    () =>
      (
        (window as unknown as { __TM__?: { baboons?: readonly { visible: boolean }[] | null } })
          .__TM__?.baboons ?? []
      ).length > 0,
    null,
    { timeout: 120_000 },
  );
  // Each listed member's feet are on one of the troop's seats (layer y: the ridge doesn't scroll
  // vertically; a walker is between two seats, a climber below them).
  const ys = karoo.baboons.troops[0]?.seats.map((x) => x.y) ?? [];
  const members = await page.evaluate(() =>
    (
      (
        window as unknown as {
          __TM__?: { baboons?: readonly { role: string; y: number; alpha: number }[] | null };
        }
      ).__TM__?.baboons ?? []
    ).filter((b) => b.role !== 'raider' && b.alpha === 1),
  );
  expect(members.length).toBeGreaterThan(0);
  for (const m of members) {
    expect(m.y).toBeGreaterThanOrEqual(Math.min(...ys) - 2);
    expect(m.y).toBeLessThanOrEqual(Math.max(...ys) + 2);
  }
  expect((await hook(page)).quality.layers).toBe(6);
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
