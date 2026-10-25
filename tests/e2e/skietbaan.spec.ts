// v1.3x (D-037) the Skietbaan (training ground) on the web build: opened from the admin page,
// the .22 with the small scope at Ver (5 shots through the sight → 5 shots in the stats), then
// the Dubbelloop near on the paper target (its holes are drawn), and the save is byte-identical
// afterwards. Without ?admin=1 there is no Skietbaan button and its chunk never loads. Screenshots
// of the setup page and the range go to docs/art-preview/compare/skietbaan-*.png.
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, hook, isLandscape, isTouchProject, tapAt, tapRect } from './helpers';
import weaponsJson from '../../content/weapons.json' with { type: 'json' };
import { loadContent } from '../../tools/testContent';

/** The guns the Skietbaan lists, from content: each primary (a rifle once per sight), then the
 *  crate guns. */
const RANGE_GUN_COUNT = weaponsJson.weapons.reduce(
  (n, w) => n + ('aim' in w ? w.aim.sights.length : 1),
  0,
);

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';
/** v1.4 B (D-039): the admin Skietbaan offers every playable biome, like admin hunts (every
 *  biome has art on the web build, so all are playable — Namibië too, locked or not). */
const ALL_BIOMES = loadContent().biomes.map((b) => b.id);
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

/** Fires at a design point from inside the page (pointerdown + pointerup at once). */
async function fireAt(page: Page, touch: boolean, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([dx, dy, t]) => {
      const canvas = document.querySelector('#game canvas');
      const h = window.__TM__;
      if (!(canvas instanceof HTMLCanvasElement) || !h) throw new Error('no game');
      const r = canvas.getBoundingClientRect();
      const init = {
        pointerId: t ? 23 : 1,
        pointerType: t ? 'touch' : 'mouse',
        button: 0,
        buttons: 1,
        clientX: r.left + (dx / h.designWidth) * r.width,
        clientY: r.top + (dy / h.designHeight) * r.height,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    },
    [x, y, touch] as const,
  );
}

/**
 * Reloads an empty gun: a tap on the shell belt on touch; Space on desktop. The belt sits in the
 * right edge-pan band (feel.json edgePanFraction, D-021), so clicking it with the real mouse would
 * leave the pointer there and pan the camera away from the targets. Whatever DOM button had focus
 * is blurred first, or Space would press that button instead.
 */
async function reload(page: Page, touch: boolean): Promise<void> {
  if (touch) {
    await tapRect(page, touch, 'belt');
    return;
  }
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
  await page.keyboard.press('Space');
}

/** Desktop: rests the real mouse at the canvas centre, outside both edge-pan bands. */
async function parkMouse(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** Fails loudly if the camera moved since `cam` (aim points read earlier would miss). */
async function cameraStill(page: Page, cam: number): Promise<void> {
  expect((await hook(page)).cameraX, 'the camera panned: the aim point is stale').toBe(cam);
}

/** Holds (or lets go of) the range's markers and plate swings for a screenshot. */
async function hold(page: Page, on: boolean): Promise<void> {
  await page.evaluate((v) => {
    if (window.__TM__) window.__TM__.rangeHold = v;
  }, on);
}

/** Opens the Skietbaan's setup page from the admin list. */
async function openRange(page: Page, touch: boolean, query = ''): Promise<void> {
  await page.goto(`/?e2e=1&admin=1${query}`);
  await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
    timeout: 90_000,
  });
  await press(page, touch, '#tm-admin [data-action=skietbaan]');
  await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
    timeout: 60_000,
  });
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
    // Every gun, locked ones too (each rifle once per sight), every playable biome (Namibië
    // too on a fresh admin save), 4 distances + All, 5 targets + Mixed.
    await expect(page.locator('#tm-range [data-role=gun] button')).toHaveCount(RANGE_GUN_COUNT);
    await expect(page.locator('#tm-range [data-role=biome] button')).toHaveCount(ALL_BIOMES.length);
    await expect(page.locator('#tm-range [data-role=biome] [data-value=namibie]')).toHaveCount(1);
    await expect(page.locator('#tm-range [data-role=plane] button')).toHaveCount(5);
    await expect(page.locator('#tm-range [data-role=target] button')).toHaveCount(6);
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
    // D-040: every hole is drawn (only the group stats stop at 20).
    await page.waitForFunction(
      () =>
        window.__TM__?.range?.drawnImpacts ===
        window.__TM__?.range?.marks
          .filter((m) => m.kind === 'paper')
          .reduce((n, m) => n + m.count, 0),
      null,
      { timeout: 30_000 },
    );
    h = await hook(page);
    expect(h.range?.stats?.shots).toBe(2);
    expect(h.range?.stats?.impacts ?? 0).toBeGreaterThan(0);
    expect(h.range?.drawnImpacts ?? 0).toBeGreaterThanOrEqual(
      Math.min(20, h.range?.stats?.impacts ?? 0),
    );
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
      if (now.shells === 0 && !now.reloading) await reload(page, touch);
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

  test('24 Oct: the mixed course (near and far hits, markers), a Kettie at Ver falls short', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'the admin page is used in landscape');
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    const name = device(info.project.name);
    await openRange(page, touch);
    const before = await storage(page);

    // The air rifle on the mixed course: All picks Mixed.
    await press(page, touch, '#tm-range [data-role=gun] [data-value=windbuks]');
    await press(page, touch, '#tm-range [data-role=plane] [data-value=all]');
    await expect(page.locator('#tm-range [data-role=target] [data-value=mixed]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Ver is on the course and beyond the air rifle's reach: the note says so.
    await expect(page.locator('#tm-range [data-role=reach-note]')).toBeVisible();
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan2-setup-mixed-${name}.png` });
    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(
      () => window.__TM__?.range?.view === 'range' && window.__TM__.range.target === 'mixed',
      null,
      { timeout: 90_000 },
    );
    await expect(page.locator('#tm-range-bar [data-action=shuffle]')).toBeVisible();
    await paper(page);
    // Every distance has a target; Shuffle until a paper or plate stands near and far in view.
    type Static = { x: number; y: number; r: number; plane: string; kind: string };
    const inView = (p: Static, w: number): boolean => p.x > 140 && p.x < w - 140;
    const pickTargets = async (): Promise<{ near: Static; far: Static } | null> => {
      const h = await hook(page);
      const ps = h.range?.papers ?? [];
      const near = ps.find((p) => p.plane === 'near' && inView(p, h.designWidth));
      const far = ps.find((p) => p.plane === 'far' && inView(p, h.designWidth));
      return near !== undefined && far !== undefined ? { near, far } : null;
    };
    let targets = await pickTargets();
    for (let i = 0; i < 12 && targets === null; i++) {
      const seed = (await hook(page)).range?.seed;
      await press(page, touch, '#tm-range-bar [data-action=shuffle]');
      await page.waitForFunction(
        (s) =>
          window.__TM__?.range?.view === 'range' &&
          window.__TM__.range.seed !== s &&
          window.__TM__.range.papers.length > 0,
        seed,
        { timeout: 90_000 },
      );
      targets = await pickTargets();
    }
    if (targets === null) throw new Error('no near and far paper or plate after 12 shuffles');
    let h = await hook(page);
    expect(
      new Set([...(h.range?.papers ?? []), ...(h.range?.birds ?? [])].map((t) => t.plane)),
    ).toEqual(new Set(['near', 'mid', 'far', 'ver']));
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan2-mixed-course-${name}.png` });

    // One shot at the near target, one at the far one: each gets its HIT marker.
    for (const t of [targets.near, targets.far]) {
      await ready(page);
      const hits = (await hook(page)).range?.feedback?.hit ?? 0;
      if (t === targets.far) await hold(page, true);
      await fireAt(page, touch, t.x, t.y);
      await page.waitForFunction(
        ([n, plane]) =>
          (window.__TM__?.range?.feedback?.hit ?? 0) > n &&
          window.__TM__?.range?.feedback?.lastHit === plane,
        [hits, t.plane] as const,
        { timeout: 60_000 },
      );
    }
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan2-hit-far-${name}.png` });
    h = await hook(page);
    const fb = h.range?.feedback;
    expect(fb?.pulses ?? 0).toBeGreaterThanOrEqual(2);
    const kinds = [targets.near.kind, targets.far.kind];
    expect(fb?.blinks ?? 0).toBe(kinds.filter((k) => k === 'paper').length);
    expect(fb?.swings ?? 0).toBe(kinds.filter((k) => k === 'plate').length);
    await hold(page, false);
    const cells = h.range?.cells ?? [];
    expect(
      cells.some((c) => c.plane === 'near' && c.target === targets.near.kind && c.hits === 1),
    ).toBe(true);
    expect(
      cells.some((c) => c.plane === 'far' && c.target === targets.far.kind && c.hits === 1),
    ).toBe(true);

    // The setup table shows both distances.
    await press(page, touch, '#tm-range-bar [data-action=setup]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    const table = page.locator('#tm-range [data-role=stats]');
    await expect(table.locator(`[data-cell="windbuks|near|${targets.near.kind}"]`)).toHaveCount(1);
    await expect(table.locator(`[data-cell="windbuks|far|${targets.far.kind}"]`)).toHaveCount(1);

    // Steel plates on their own at middle distance: a hit swings the plate (held for the shot).
    await press(page, touch, '#tm-range [data-role=target] [data-value=plate]');
    await press(page, touch, '#tm-range [data-role=plane] [data-value=mid]');
    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(
      () => window.__TM__?.range?.view === 'range' && window.__TM__.range.target === 'plate',
      null,
      { timeout: 90_000 },
    );
    const plate = await paper(page);
    expect((await hook(page)).range?.papers[0]?.kind).toBe('plate');
    await ready(page);
    // Held from the shot: the plate stays kicked out and its HIT marker up for the screenshot.
    await hold(page, true);
    await fireAt(page, touch, plate.x, plate.y);
    await page.waitForFunction(() => (window.__TM__?.range?.feedback?.swings ?? 0) > 0, null, {
      timeout: 60_000,
    });
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan2-plate-${name}.png` });
    await hold(page, false);
    await press(page, touch, '#tm-range-bar [data-action=setup]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });

    // The Kettie at Ver on the paper target: its stones fall short.
    await press(page, touch, '#tm-range [data-role=gun] [data-value=kettie]');
    await press(page, touch, '#tm-range [data-role=plane] [data-value=ver]');
    await press(page, touch, '#tm-range [data-role=target] [data-value=paper]');
    await expect(page.locator('#tm-range [data-role=reach-note]')).toBeVisible();
    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(
      () => window.__TM__?.range?.view === 'range' && window.__TM__.range.plane === 'ver',
      null,
      { timeout: 90_000 },
    );
    const ver = await paper(page);
    for (let i = 0; i < 3; i++) {
      // The Kettie has no belt (endless stones): wait out its fire cooldown only.
      const t0 = (await hook(page)).tick;
      await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 40, t0, {
        timeout: 60_000,
      });
      // Held from the first stone: all three SHORT markers stay up for the screenshot.
      if (i === 0) await hold(page, true);
      const shots = (await hook(page)).shots;
      await fireAt(page, touch, ver.x + (i - 1) * 150, ver.y);
      await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
        timeout: 60_000,
      });
    }
    await page.waitForFunction(() => window.__TM__?.range?.stats?.short === 3, null, {
      timeout: 60_000,
    });
    h = await hook(page);
    expect(h.range?.stats).toMatchObject({ shots: 3, hits: 0, misses: 3, short: 3 });
    expect(h.range?.feedback?.short ?? 0).toBe(3);
    await expect(page.locator('#tm-range-bar [data-role=lines]')).toContainText('3');
    await page.screenshot({ path: `${SHOTS_DIR}/skietbaan2-kettie-ver-short-${name}.png` });
    await hold(page, false);

    // The table's "fell short" column, then back to the admin list; the save is byte-identical.
    await press(page, touch, '#tm-range-bar [data-action=setup]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await expect(table.locator('[data-cell="kettie|ver|paper"] td').nth(6)).toHaveText('3');
    await press(page, touch, '#tm-range [data-action=back]');
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 60_000,
    });
    expect(await storage(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  // D-040 (product owner, 24 Oct: "when shot, the shot should be visible and stay visible during
  // the session"): 25 hits on one plate leave 25 marks; they stay through a gun swap and a switch
  // of distance and back; Repaint clears them; leaving the Skietbaan clears them.
  test('D-040: 25 hits on a plate stay through a gun swap and a distance switch', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'the admin page is used in landscape');
    // Every wait below is bounded on its own, so a stall fails with its step's message instead of
    // running into the test timeout (it once hung 600 s in setup() on desktop CI).
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    await openRange(page, touch, '&seed=42');
    const start = async (plane: string): Promise<void> => {
      await press(page, touch, `#tm-range [data-role=plane] [data-value=${plane}]`);
      await press(page, touch, '#tm-range [data-action=start]');
      await page.waitForFunction(
        (pl) => window.__TM__?.range?.view === 'range' && window.__TM__.range.plane === pl,
        plane,
        { timeout: 90_000 },
      );
      await paper(page);
      await parkMouse(page, touch);
    };
    /** A button of the range's top bar: visible within 15 s, then pressed, the mouse parked. */
    const barButton = async (action: string): Promise<void> => {
      const b = page.locator(`#tm-range-bar [data-action=${action}]`);
      await expect(b, `the bar's ${action} button`).toBeVisible({ timeout: 15_000 });
      try {
        if (touch) await b.tap({ timeout: 15_000 });
        else await b.click({ timeout: 15_000 });
      } catch (e) {
        // Visible but never "stable" or hit-testable (the stats line pulses on each hit): press
        // it through the DOM, which runs the same handler, and say so in the log.
        console.warn(
          `bar ${action}: pointer press failed (${String(e).split('\n')[0]}); DOM click`,
        );
        await b.evaluate((el) => {
          (el as HTMLButtonElement).click();
        });
      }
      // The bar sits in the left edge-pan band: never leave the mouse there (D-021).
      await parkMouse(page, touch);
    };
    const setup = async (): Promise<void> => {
      await barButton('setup');
      await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
        timeout: 30_000,
      });
    };
    /** The plate's marks on the hook once the bake has caught up with the store. */
    const plateMarks = async (n: number): Promise<{ count: number; drawn: number }> => {
      await page.waitForFunction(
        (want) => {
          const m = window.__TM__?.range?.marks.find((x) => x.kind === 'plate');
          return m !== undefined && m.count === want && m.drawn === want;
        },
        n,
        { timeout: 60_000 },
      );
      const m = (await hook(page)).range?.marks.find((x) => x.kind === 'plate');
      return { count: m?.count ?? -1, drawn: m?.drawn ?? -1 };
    };

    // The air rifle (one pellet a shot), near, on the steel plate.
    await press(page, touch, '#tm-range [data-role=gun] [data-value=windbuks]');
    await press(page, touch, '#tm-range [data-role=target] [data-value=plate]');
    await start('near');
    expect(await plateMarks(0)).toEqual({ count: 0, drawn: 0 });
    const plate = await paper(page);
    const cam = (await hook(page)).cameraX;
    let fired = 0;
    for (let i = 0; i < 60 && ((await hook(page)).range?.stats?.hits ?? 0) < 25; i++) {
      const now = await hook(page);
      if (now.shells === 0 && !now.reloading) await reload(page, touch);
      await ready(page);
      await cameraStill(page, cam);
      await fireAt(page, touch, plate.x, plate.y);
      fired++;
      await page.waitForFunction((n) => window.__TM__?.range?.stats?.shots === n, fired, {
        timeout: 60_000,
      });
    }
    const h = await hook(page);
    expect(h.range?.stats?.hits).toBe(25);
    expect(h.range?.stats?.pelletsOn).toBe(25);
    // Every hit is marked, past the 20 the group stats keep.
    expect(await plateMarks(25)).toEqual({ count: 25, drawn: 25 });
    expect(h.range?.stats?.impacts).toBe(20);

    // A gun swap (the Kettie, same plate): the marks are still there.
    await setup();
    await press(page, touch, '#tm-range [data-role=gun] [data-value=kettie]');
    await start('near');
    expect((await hook(page)).weapon).toBe('kettie');
    expect(await plateMarks(25)).toEqual({ count: 25, drawn: 25 });

    // Another distance (and the air rifle again) has its own clean plate; back near, the 25 are
    // there again.
    await setup();
    await press(page, touch, '#tm-range [data-role=gun] [data-value=windbuks]');
    await start('mid');
    expect(await plateMarks(0)).toEqual({ count: 0, drawn: 0 });
    await setup();
    await start('near');
    expect(await plateMarks(25)).toEqual({ count: 25, drawn: 25 });

    // Repaint clears them on purpose.
    await barButton('repaint');
    expect(await plateMarks(0)).toEqual({ count: 0, drawn: 0 });

    // A hit after the Repaint, then leaving the Skietbaan and coming back: freshly painted.
    const now = await hook(page);
    if (now.shells === 0 && !now.reloading) await reload(page, touch);
    await ready(page);
    const back = await paper(page);
    await cameraStill(page, cam);
    await fireAt(page, touch, back.x, back.y);
    await page.waitForFunction(
      () => (window.__TM__?.range?.marks.find((x) => x.kind === 'plate')?.count ?? 0) > 0,
      null,
      { timeout: 60_000 },
    );
    await setup();
    await press(page, touch, '#tm-range [data-action=back]');
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 60_000,
    });
    await press(page, touch, '#tm-admin [data-action=skietbaan]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'range', null, {
      timeout: 90_000,
    });
    await paper(page);
    expect(await plateMarks(0)).toEqual({ count: 0, drawn: 0 });
    expect(errors).toEqual([]);
  });

  test('D-040: a held frame with marks is drawn the same twice', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'the admin page is used in landscape');
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    // The range holds at tick HOLD (?holdAt). The last shot lands within ~30 ticks before it, so
    // the held frame has the plate mid-swing and the newest mark glinting: both run on sim time
    // and must not move (a wall-clock swing would keep swinging under the hold).
    const HOLD = 900;
    const FIRE_AT = HOLD - 32;
    await openRange(page, touch, `&seed=42&holdAt=${String(HOLD)}`);
    await press(page, touch, '#tm-range [data-role=gun] [data-value=windbuks]');
    await press(page, touch, '#tm-range [data-role=target] [data-value=plate]');
    await press(page, touch, '#tm-range [data-role=plane] [data-value=near]');
    await press(page, touch, '#tm-range [data-action=start]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'range', null, {
      timeout: 90_000,
    });
    const plate = await paper(page);
    await parkMouse(page, touch);
    const cam = (await hook(page)).cameraX;
    // Two earlier marks, well before the hold.
    for (let i = 0; i < 2 && (await hook(page)).tick < FIRE_AT - 200; i++) {
      await ready(page);
      await cameraStill(page, cam);
      const shots = (await hook(page)).shots;
      await fireAt(page, touch, plate.x + (i - 1) * plate.r * 0.4, plate.y);
      await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
        timeout: 60_000,
      });
    }
    // The gun is loaded and cool well before the last shot, and the camera hasn't moved.
    await ready(page);
    await cameraStill(page, cam);
    expect((await hook(page)).tick).toBeLessThan(FIRE_AT);
    // The last shot, fired from inside the page on the first frame at or after FIRE_AT (a
    // Playwright round trip could overshoot the hold).
    await page.evaluate(
      ([x, y, t, at]) =>
        new Promise<void>((resolve) => {
          const step = (): void => {
            const h = window.__TM__;
            const canvas = document.querySelector('#game canvas');
            if (!h || !(canvas instanceof HTMLCanvasElement) || h.tick < at) {
              requestAnimationFrame(step);
              return;
            }
            const r = canvas.getBoundingClientRect();
            const init = {
              pointerId: t ? 23 : 1,
              pointerType: t ? 'touch' : 'mouse',
              button: 0,
              buttons: 1,
              clientX: r.left + (x / h.designWidth) * r.width,
              clientY: r.top + (y / h.designHeight) * r.height,
              bubbles: true,
              cancelable: true,
            };
            canvas.dispatchEvent(new PointerEvent('pointerdown', init));
            canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
            resolve();
          };
          step();
        }),
      [plate.x + plate.r * 0.3, plate.y - plate.r * 0.2, touch, FIRE_AT] as const,
    );
    await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, HOLD, {
      timeout: 120_000,
    });
    await page.waitForTimeout(500);
    const h = await hook(page);
    expect(h.tick).toBe(HOLD);
    const m = h.range?.marks.find((x) => x.kind === 'plate');
    expect(m?.count ?? 0).toBeGreaterThanOrEqual(1);
    expect(m?.drawn).toBe(m?.count);
    // The last mark landed just before the hold: the plate is swinging and the mark glints.
    expect(m?.lastTick ?? 0).toBeGreaterThanOrEqual(FIRE_AT);
    expect(m?.lastTick ?? HOLD).toBeLessThan(HOLD);
    expect(Math.abs(m?.swing ?? 0)).toBeGreaterThan(0.001);
    expect(m?.lit).toBe(true);
    const canvas = page.locator('#game canvas');
    const a = await canvas.screenshot();
    await page.waitForTimeout(700);
    const b = await canvas.screenshot();
    expect(a.equals(b)).toBe(true);
    const after = (await hook(page)).range?.marks.find((x) => x.kind === 'plate');
    expect(after?.swing).toBe(m?.swing);
    expect(after?.lit).toBe(true);
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
    expect(loaded.filter((n) => /Skietbaan|assets\/range\//i.test(n))).toEqual([]);
    expect(errors).toEqual([]);
  });
});
