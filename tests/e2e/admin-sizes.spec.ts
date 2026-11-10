// v1.22.1 (D-086): the admin page's Sizes tab and the size editor on the web build, in landscape
// (desktop, Pixel 7, iPhone 14): open the tab, open the Karoo in the game, tap the ostrich
// sprinting past, press +10 % and see it drawn ~10 % taller (the editor's hook box, and the real
// canvas pixels: its art's top above its feet), save, reload (still 10 %), back to the tab, turn
// on "Use my sizes in the game", the export carries the edit, and the game shows ⇲ 1.
import { expect, test, type Page } from '@playwright/test';
import { decodePng, type Rgba } from '../../tools/assets/image';
import { boot, collectErrors, hook, isLandscape, isTouchProject, tapAt, toClient } from './helpers';

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';
const ADMIN = '/?e2e=1&reenbui=0&admin=1&graphics=standard';
/** The editor's hold tick (src/game/sizes/sizeAreas.ts SIZE_HOLD_TICK). */
const HOLD = 480;
const PICKER = '#tm-sizes select[name=animal]';

async function press(page: Page, touch: boolean, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(
    (hold) =>
      window.__TM__?.sizes?.view === 'editor' &&
      (window.__TM__.tick ?? 0) >= hold &&
      window.__TM__.sizes.spots['cameo_ostrich'] !== undefined,
    HOLD,
    { timeout: 120_000 },
  );
}

async function pick(page: Page, id: string): Promise<void> {
  await page.locator(PICKER).selectOption(id);
  await page.waitForFunction(
    (want) => window.__TM__?.sizes?.selected === (want === '' ? null : want),
    id,
    { timeout: 30_000 },
  );
}

/** A screenshot of a client-px box, decoded (two frames after the last change). */
async function grab(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<Rgba> {
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            r();
          });
        });
      }),
  );
  await page.waitForTimeout(400);
  return decodePng(await page.screenshot({ clip }));
}

/** The highest row (px from the clip's top) where a and b differ in at least 2 pixels. */
function topDiff(a: Rgba, b: Rgba): number {
  for (let y = 0; y < a.height; y++) {
    let n = 0;
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const d =
        Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) +
        Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)) +
        Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0));
      if (d > 60) n++;
    }
    if (n >= 2) return y;
  }
  return -1;
}

test.describe('admin Sizes', () => {
  test.skip(PLATFORM !== 'web', 'web build only (portals ignore ?admin=1)');
  test.use({ serviceWorkers: 'block' });

  test('set the Karoo ostrich by eye, save, use it in the game, export', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'the admin page is used in landscape');
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);

    // The Sizes tab lists each area's animals.
    await page.goto(ADMIN);
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 90_000,
    });
    await press(page, touch, '#tm-admin [data-action=tab-sizes]');
    await page.waitForFunction(() => window.__TM__?.sizes?.view === 'tab', null, {
      timeout: 60_000,
    });
    expect((await hook(page)).sizes?.knobs).toBeGreaterThan(30);
    await expect(page.locator('#tm-admin [data-area=karoo] [data-knob=cameo_ostrich]')).toHaveCount(
      1,
    );
    await expect(page.locator('#tm-admin [data-area=oes] [data-knob=harvest_worker]')).toHaveCount(1);

    // Open in game: the Karoo, every sized animal out, held still.
    await press(page, touch, '#tm-admin [data-action=sizes-open-karoo]');
    await page.waitForURL(/sizes=karoo/, { timeout: 60_000 });
    await editorReady(page);
    const spot = (await hook(page)).sizes?.spots['cameo_ostrich'];
    if (spot === undefined) throw new Error('no ostrich on screen');
    await tapAt(page, touch, spot.x, spot.y);
    await page.waitForFunction(() => window.__TM__?.sizes?.selected === 'cameo_ostrich', null, {
      timeout: 30_000,
    });
    const before = (await hook(page)).sizes;
    if (before?.sprite == null || before.feet == null) throw new Error('no ostrich sprite');
    expect(before.value).toBe(2.76);
    expect(before.shownM ?? 0).toBeGreaterThan(2.3);
    expect(before.shownM ?? 0).toBeLessThan(2.7);
    // The step buttons are at least 64 design px.
    const btn = await page.locator('#tm-sizes [data-action=size-step-3]').boundingBox();
    const canvas = await page.locator('#game canvas').boundingBox();
    if (btn === null || canvas === null) throw new Error('no button or canvas');
    expect(btn.height * (1080 / canvas.height)).toBeGreaterThanOrEqual(63);

    // Real pixels: the art at 1 (A), at 0.9 (C) and at 1.1 (B), with nothing outlined.
    const box = before.sprite;
    const tl = await toClient(page, Math.max(0, box.x), Math.max(0, box.y - box.h * 0.3));
    const br = await toClient(page, box.x + box.w, before.feet.y);
    const feetY = br.y;
    const clip = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
    await pick(page, '');
    const a = await grab(page, clip);
    await pick(page, 'cameo_ostrich');
    await press(page, touch, '#tm-sizes [data-action=size-step-0]');
    await page.waitForFunction(() => window.__TM__?.sizes?.factor === 0.9, null, {
      timeout: 30_000,
    });
    await pick(page, '');
    const c = await grab(page, clip);
    await pick(page, 'cameo_ostrich');
    await press(page, touch, '#tm-sizes [data-action=size-reset]');
    await press(page, touch, '#tm-sizes [data-action=size-step-3]');
    await page.waitForFunction(() => window.__TM__?.sizes?.factor === 1.1, null, {
      timeout: 30_000,
    });
    // The editor's box: 10 % taller about the same feet.
    await page.waitForFunction(
      (h0) => Math.abs((window.__TM__?.sizes?.sprite?.h ?? 0) / h0 - 1.1) < 0.01,
      box.h,
      { timeout: 30_000 },
    );
    const after = (await hook(page)).sizes;
    expect(after?.value).toBe(3.036);
    expect(after?.feet?.y).toBeCloseTo(before.feet.y, 0);
    expect((after?.shownM ?? 0) / (before.shownM ?? 1)).toBeCloseTo(1.1, 3);
    await pick(page, '');
    const b = await grab(page, clip);
    const topA = topDiff(a, c);
    const topB = topDiff(a, b);
    expect(topA, 'the ostrich at 1 vs 0.9').toBeGreaterThanOrEqual(0);
    expect(topB, 'the ostrich at 1 vs 1.1').toBeGreaterThanOrEqual(0);
    const hA = feetY - (clip.y + topA);
    const hB = feetY - (clip.y + topB);
    expect(hB / hA, `drawn ${hA.toFixed(1)} → ${hB.toFixed(1)} client px`).toBeGreaterThan(1.06);
    expect(hB / hA).toBeLessThan(1.14);

    // Save; a reload keeps it (the store on this device).
    await pick(page, 'cameo_ostrich');
    await press(page, touch, '#tm-sizes [data-action=size-save]');
    await page.waitForFunction(() => window.__TM__?.sizes?.dirty === false, null, {
      timeout: 30_000,
    });
    await page.reload();
    await editorReady(page);
    await pick(page, 'cameo_ostrich');
    await page.waitForFunction(() => window.__TM__?.sizes?.factor === 1.1, null, {
      timeout: 30_000,
    });
    expect((await hook(page)).sizes?.value).toBe(3.036);

    // Back to the tab: the size is listed; use it in the game; the export carries it.
    await press(page, touch, '#tm-sizes [data-action=size-back]');
    await page.waitForFunction(() => window.__TM__?.sizes?.view === 'tab', null, {
      timeout: 90_000,
    });
    expect((await hook(page)).sizes?.changed).toBe(1);
    await expect(
      page.locator('#tm-admin [data-area=karoo] [data-knob=cameo_ostrich] .mine'),
    ).toContainText('3.036');
    await press(page, touch, '#tm-admin [data-action=sizes-apply]');
    await page.waitForFunction(() => window.__TM__?.sizes?.apply === true, null, {
      timeout: 30_000,
    });
    await press(page, touch, '#tm-admin [data-action=sizes-copy]');
    await page.waitForFunction(() => window.__TM__?.sizes?.lastExport != null, null, {
      timeout: 30_000,
    });
    const file = JSON.parse((await hook(page)).sizes?.lastExport ?? '{}') as {
      version: number;
      build: { version: string; commit: string };
      edits: { id: string; area: string; path: string; from: number; to: number }[];
    };
    expect(file.version).toBe(1);
    expect(file.build.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(file.edits).toEqual([
      expect.objectContaining({
        id: 'cameo_ostrich',
        area: 'karoo',
        path: 'content/cameos.json#kinds.ostrich.sizeMul',
        from: 2.76,
        to: 3.036,
      }),
    ]);

    // The game on this device uses it: ⇲ 1 on the build stamp.
    await boot(page, 'graphics=standard');
    await page.waitForFunction(() => window.__TM__?.stamp !== undefined, null, { timeout: 60_000 });
    expect((await hook(page)).stamp?.text).toContain('⇲ 1');
    expect(errors).toEqual([]);
  });
});
