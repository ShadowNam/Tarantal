// v1.3x (D-037) the Skietbaan (training ground) on the web build: opened from the admin page,
// the .22 with the small scope at Ver (5 shots through the sight → 5 shots in the stats), then
// the Dubbelloop near on the paper target (its holes are drawn), and the save is byte-identical
// afterwards. Without ?admin=1 there is no Skietbaan button and its chunk never loads. Screenshots
// of the setup page and the range go to docs/art-preview/compare/skietbaan-*.png.
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, hook, isLandscape, isTouchProject, tapAt, tapRect } from './helpers';

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';
const SHOTS_DIR = 'docs/art-preview/compare';

/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');

/** Every localStorage key and value (the whole save: player, admin and e2e namespaces). */
async function storage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) out[k] = localStorage.getItem(k) ?? '';
    }
    return out;
  });
}

/** Clicks (desktop) or taps (touch) a DOM element. */
async function press(page: Page, touch: boolean, selector: string): Promise<void> {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

/** Puts a finger (or the mouse button) down on the canvas at a design point and keeps it there. */
async function holdAt(page: Page, touch: boolean, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([dx, dy, t]) => {
      const canvas = document.querySelector('#game canvas');
      const h = window.__TM__;
      if (!(canvas instanceof HTMLCanvasElement) || !h) throw new Error('no game');
      const r = canvas.getBoundingClientRect();
      const init = {
        pointerId: t ? 21 : 1,
        pointerType: t ? 'touch' : 'mouse',
        button: 0,
        buttons: 1,
        clientX: r.left + (dx / h.designWidth) * r.width,
        clientY: r.top + (dy / h.designHeight) * r.height,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      (window as { __TM_PRESS__?: PointerEventInit }).__TM_PRESS__ = init;
    },
    [x, y, touch] as const,
  );
}

async function letGo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas');
    const init = (window as { __TM_PRESS__?: PointerEventInit }).__TM_PRESS__;
    if (!canvas || init === undefined) return;
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  });
}

/**
 * Taps the first range bird on screen from inside the page (pointerdown + pointerup at once): the
 * sim applies the shot before its birds move on the next tick, so no lead is needed even at a few
 * frames a second. False when no bird is in view yet.
 */
async function tapBird(page: Page, touch: boolean): Promise<boolean> {
  return page.evaluate((t) => {
    const canvas = document.querySelector('#game canvas');
    const h = window.__TM__;
    if (!(canvas instanceof HTMLCanvasElement) || !h) throw new Error('no game');
    const b = h.range?.birds.find((v) => v.x > 120 && v.x < h.designWidth - 120);
    if (b === undefined) return false;
    const r = canvas.getBoundingClientRect();
    const init = {
      pointerId: t ? 22 : 1,
      pointerType: t ? 'touch' : 'mouse',
      button: 0,
      buttons: 1,
      clientX: r.left + (b.x / h.designWidth) * r.width,
      clientY: r.top + (b.y / h.designHeight) * r.height,
      bubbles: true,
      cancelable: true,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    return true;
  }, touch);
}

async function paper(page: Page): Promise<{ x: number; y: number; r: number }> {
  await page.waitForFunction(() => (window.__TM__?.range?.papers.length ?? 0) > 0, null, {
    timeout: 60_000,
  });
  const p = (await hook(page)).range?.papers[0];
  if (p === undefined) throw new Error('no paper target');
  return p;
}

/** Waits until the gun can fire again (cooldown, a reload). */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const h = window.__TM__;
      return h !== undefined && !h.reloading && h.shells > 0 && h.zoom.raise === 0;
    },
    null,
    { timeout: 60_000 },
  );
  // The fire cooldown has no hook field: a few ticks more covers it.
  const t0 = (await hook(page)).tick;
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 40, t0, { timeout: 60_000 });
}

test.describe('Skietbaan (training ground)', () => {
  test.skip(PLATFORM !== 'web', 'web build only (portal builds carry no admin page)');

  test('the .22 at Ver, then the Dubbelloop near on paper; the save is untouched', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'the admin page is used in landscape');
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    const name = device(info.project.name);
    await page.goto('/?e2e=1&admin=1');
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 90_000,
    });
    const before = await storage(page);

    // The admin page's Skietbaan button loads the range chunk and opens the setup page.
    await press(page, touch, '#tm-admin [data-action=skietbaan]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    expect((await hook(page)).scene).toBe('skietbaan');
    await expect(page.locator('#tm-admin')).toHaveCount(0);
    // Every gun, locked ones too (the .22 once per sight), the 4 biomes, 4 distances, 4 targets.
    await expect(page.locator('#tm-range [data-role=gun] button')).toHaveCount(9);
    await expect(page.locator('#tm-range [data-role=biome] button')).toHaveCount(4);
    await expect(page.locator('#tm-range [data-role=plane] button')).toHaveCount(4);
    await expect(page.locator('#tm-range [data-role=target] button')).toHaveCount(4);
    // Shotguns can't reach Ver: it stays selectable, with a note that the shots fall short.
    await press(page, touch, '#tm-range [data-role=gun] [data-value=dubbelloop]');
    const ver = page.locator('#tm-range [data-role=plane] [data-value=ver]');
    await expect(ver).toBeEnabled();
    await press(page, touch, '#tm-range [data-role=plane] [data-value=ver]');
    await expect(page.locator('#tm-range [data-role=reach-note]')).toBeVisible();
    // The .22 with the small scope at Ver, on the paper target: no note.
    await press(page, touch, '#tm-range [data-role=gun] [data-value="twee_twee:scope_small"]');
    await expect(page.locator('#tm-range [data-role=reach-note]')).toHaveCount(0);
    await press(page, touch, '#tm-range [data-role=target] [data-value=paper]');
    await expect(ver).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan-setup-${name}.png` });

    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'range', null, {
      timeout: 90_000,
    });
    let h = await hook(page);
    expect(h.scene).toBe('range');
    expect(h.mode).toBe('range');
    expect(h.weapon).toBe('twee_twee');
    expect(h.range?.plane).toBe('ver');
    await expect(page.locator('#tm-range-bar')).toBeVisible();

    // 5 shots through the scope at the Ver paper target (hold: the scope comes up; let go: fire).
    const target = await paper(page);
    for (let i = 0; i < 5; i++) {
      await ready(page);
      const shots = (await hook(page)).shots;
      await holdAt(page, touch, target.x, target.y);
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
        timeout: 60_000,
      });
      if (i === 4) await page.screenshot({ path: `${SHOTS_DIR}/skietbaan-scope-${name}.png` });
      await letGo(page);
      await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
        timeout: 60_000,
      });
    }
    await page.waitForFunction(() => window.__TM__?.range?.stats?.shots === 5, null, {
      timeout: 30_000,
    });
    h = await hook(page);
    expect(h.range?.stats?.shots).toBe(5);
    expect((h.range?.stats?.hits ?? 0) + (h.range?.stats?.misses ?? 0)).toBe(5);
    expect(h.score).toBe(0);
    await expect(page.locator('#tm-range-bar [data-role=lines]')).toContainText('5');
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan-range-ver-${name}.png` });

    // Back to the setup page (the stats stay), then the Dubbelloop near on the paper target.
    await press(page, touch, '#tm-range-bar [data-action=setup]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await expect(
      page.locator('#tm-range [data-role=stats] [data-cell="twee_twee:scope_small|ver|paper"]'),
    ).toContainText('5');
    await press(page, touch, '#tm-range [data-role=gun] [data-value=dubbelloop]');
    await press(page, touch, '#tm-range [data-role=plane] [data-value=near]');
    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(
      () => window.__TM__?.range?.view === 'range' && window.__TM__.range.plane === 'near',
      null,
      { timeout: 90_000 },
    );
    expect((await hook(page)).weapon).toBe('dubbelloop');
    const near = await paper(page);
    for (let i = 0; i < 2; i++) {
      await ready(page);
      const shots = (await hook(page)).shots;
      await tapAt(page, touch, near.x, near.y);
      await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
        timeout: 60_000,
      });
    }
    await page.waitForFunction(() => (window.__TM__?.range?.drawnImpacts ?? 0) > 0, null, {
      timeout: 30_000,
    });
    h = await hook(page);
    expect(h.range?.stats?.shots).toBe(2);
    expect(h.range?.stats?.impacts ?? 0).toBeGreaterThan(0);
    expect(h.range?.drawnImpacts).toBe(Math.min(20, h.range?.stats?.impacts ?? 0));
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan-range-near-${name}.png` });

    // A bird target: the Dubbelloop at middle distance on the fly-over, fired at until one is
    // bagged (a bounded number of shots, reloading on the belt when it is empty).
    await press(page, touch, '#tm-range-bar [data-action=setup]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await press(page, touch, '#tm-range [data-role=plane] [data-value=mid]');
    // The setup page keeps its scroll position when a choice is tapped (Target is below the fold
    // on a phone): bring it into view, then tap it without any further scrolling.
    const scroller = page.locator('#tm-range [data-role=scroll]');
    const flyover = page.locator('#tm-range [data-role=target] [data-value=flyover]');
    await flyover.scrollIntoViewIfNeeded();
    const scrolled = await scroller.evaluate((e) => e.scrollTop);
    if (touch) await flyover.tap();
    else await flyover.click();
    await expect(page.locator('#tm-range [data-role=target] [data-value=flyover]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(Math.abs((await scroller.evaluate((e) => e.scrollTop)) - scrolled)).toBeLessThanOrEqual(
      1,
    );
    await expect(page.locator('#tm-range [data-action=start]')).toBeInViewport();
    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(
      () => window.__TM__?.range?.view === 'range' && window.__TM__.range.target === 'flyover',
      null,
      { timeout: 90_000 },
    );
    let birdShots = 0;
    for (let i = 0; i < 40 && ((await hook(page)).range?.stats?.hits ?? 0) < 1; i++) {
      const now = await hook(page);
      if (now.shells === 0 && !now.reloading) await tapRect(page, touch, 'belt');
      await ready(page);
      await page.waitForFunction(
        () =>
          (window.__TM__?.range?.birds ?? []).some(
            (b) => b.x > 120 && b.x < (window.__TM__?.designWidth ?? 0) - 120,
          ),
        null,
        { timeout: 60_000 },
      );
      const shots = (await hook(page)).shots;
      if (!(await tapBird(page, touch))) continue;
      await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
        timeout: 60_000,
      });
      birdShots++;
    }
    h = await hook(page);
    expect(h.range?.stats?.hits ?? 0).toBeGreaterThanOrEqual(1);
    expect(h.range?.stats?.shots).toBe(birdShots);
    expect(h.range?.drawnImpacts).toBe(0);
    expect(h.score).toBe(0);
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan-range-flyover-${name}.png` });

    // Setup again: every row in the session's stats; then back to the admin list.
    await press(page, touch, '#tm-range-bar [data-action=setup]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await expect(page.locator('#tm-range [data-role=stats] [data-cell]')).toHaveCount(3);
    // The session table (below the choices on a phone) in view for the screenshot.
    await page.locator('#tm-range [data-role=stats]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan-setup-stats-${name}.png` });
    await press(page, touch, '#tm-range [data-action=back]');
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 60_000,
    });

    // Nothing was written: every save key and value is as it was before the range.
    expect(await storage(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('no Skietbaan without ?admin=1: no button, no chunk', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'landscape profiles');
    const errors = collectErrors(page);
    await page.goto('/?e2e=1');
    await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 90_000 });
    const h = await hook(page);
    expect(h.admin).toBeNull();
    expect(h.range).toBeNull();
    await expect(page.locator('#tm-admin')).toHaveCount(0);
    await expect(page.locator('[data-action=skietbaan]')).toHaveCount(0);
    await expect(page.locator('#tm-range, #tm-range-bar')).toHaveCount(0);
    const loaded = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => e.name),
    );
    expect(loaded.filter((n) => /Skietbaan/i.test(n))).toEqual([]);
    expect(errors).toEqual([]);
  });
});
