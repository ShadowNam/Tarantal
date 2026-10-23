// v1.3 low-tier texture memory (budget < 128 MB, CLAUDE.md). Gun atlases go to the GPU on first
// use; before v1.3 they were never released, so the title after a hunt that showed both crate guns
// held them all (about 132.5 MB). Leaving a hunt now drops every gun atlas but the equipped one.
// Measured on the Pixel 7 profile with the low tier pinned (test hook `textureBytes`).
import { expect, test } from '@playwright/test';
import { boot, startHunt, tapRect } from './helpers';

test.use({ serviceWorkers: 'block' });

const mb = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;

test('texture memory: the title after a hunt that used both crate guns (low tier)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'pixel7-landscape', 'measured on the Pixel 7 profile');
  test.setTimeout(400_000);
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      settings?: Record<string, unknown>;
    };
    localStorage.setItem(
      key,
      JSON.stringify({ ...save, settings: { ...save.settings, quality: 'low' } }),
    );
  });
  await boot(page, 'seed=42&huntSeconds=6&layout=none');
  await startHunt(page, true);
  // Both crate guns as a crate would arm them: each one's atlas goes to the GPU (ensureGun).
  // Their art is in the late group, so wait until each rig is the one drawn.
  for (const id of ['voorlaaier', 'mielie_masjien']) {
    await page.waitForFunction(
      (gun) => {
        const w = window as { __TM_GUN__?: (id: string, clip: string | null) => void };
        w.__TM_GUN__?.(gun, 'fire');
        return (window.__TM__?.gunAtlases ?? []).some((k) => k.startsWith(`final:gun/${gun}@`));
      },
      id,
      { timeout: 120_000, polling: 500 },
    );
  }
  const inHunt = mb(await page.evaluate(() => window.__TM__?.textureBytes ?? 0));
  // Back to the equipped gun (a crate gun runs out the same way).
  await page.evaluate(() => {
    (window as { __TM_GUN__?: (id: string, clip: string | null) => void }).__TM_GUN__?.(
      'dubbelloop',
      null,
    );
  });
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
  await tapRect(page, true, 'menu');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);
  const title = await page.evaluate(() => ({
    bytes: window.__TM__?.textureBytes ?? 0,
    keys: window.__TM__?.gunAtlases ?? [],
  }));
  // The Skiet-Skuur opened from that title (its gun icons are small canvases, D-035).
  await tapRect(page, true, 'shed');
  await page.waitForFunction(() => (window.__TM__?.shedIcons ?? []).length >= 4, null, {
    timeout: 90_000,
  });
  await page.waitForTimeout(500);
  const shed = mb(await page.evaluate(() => window.__TM__?.textureBytes ?? 0));
  const report = {
    unit: 'MB',
    tier: 'low',
    bothCrateGunsInHunt: inHunt,
    titleAfter: mb(title.bytes),
    shedAfter: shed,
  };
  console.log(`[memory] ${JSON.stringify({ ...report, gunAtlases: title.keys })}`);
  await info.attach('memory.json', {
    body: JSON.stringify(report),
    contentType: 'application/json',
  });
  expect(title.keys.some((k) => k.includes('voorlaaier') || k.includes('mielie'))).toBe(false);
  expect(mb(title.bytes)).toBeLessThan(128);
  expect(shed).toBeLessThan(128);
});
