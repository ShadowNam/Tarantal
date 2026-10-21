// M9 accessibility checklist (GDD §18.3), the parts that need the real game: the new Settings
// page by keyboard alone (tabs, toggles, text size), sound captions in a hunt, and hold to fire.
// The rest is unit-tested (see D-026 for the toggle → test table).
import { expect, test, type Page } from '@playwright/test';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  SCREENSHOTS,
  startHunt,
  tapAt,
  waitTicks,
} from './helpers';

const SAVE = 'tm.e2e.save.v1';

async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, s]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, JSON.stringify({ v: 1, settings: s }));
    },
    [SAVE, settings] as const,
  );
}

async function savedSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) =>
      (JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: Record<string, unknown> })
        .settings ?? {},
    SAVE,
  );
}

/**
 * Presses `key` until the menu focus is `id` (menus grow by milestone; no button counting). The
 * presses are dispatched inside the page: a round trip per key costs seconds on software GL.
 */
async function focusOn(page: Page, id: string, key = 'Tab'): Promise<void> {
  const ok = await page.evaluate(
    ([target, code]) => {
      for (let i = 0; i < 40; i++) {
        if (window.__TM__?.focus === target) return true;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: code, code, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: code, code, bubbles: true }));
      }
      return window.__TM__?.focus === target;
    },
    [id, key] as const,
  );
  expect(ok, `focus reaches ${id}`).toBe(true);
}

test('keyboard only: Settings → Display & access, captions, contrast, large text', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'keyboard: desktop');
  const errors = collectErrors(page);
  await boot(page, '');
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined);
  await focusOn(page, 'settings', 'ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await focusOn(page, 'settings.page.0');
  // → on a tab turns the page.
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__TM__?.focus === 'settings.page.1');
  await focusOn(page, 'settings.captions');
  await page.keyboard.press('Enter');
  await focusOn(page, 'settings.colour_blind');
  await page.keyboard.press('Enter');
  await focusOn(page, 'settings.contrast');
  await page.keyboard.press('Enter');
  // Contrast restyles the screen and keeps the row focused.
  await page.waitForFunction(() => window.__TM__?.focus === 'settings.contrast');
  await focusOn(page, 'settings.textSize');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__TM__?.focus === 'settings.textSize');
  expect(await savedSettings(page)).toMatchObject({
    captions: true,
    colourBlind: true,
    highContrast: true,
    textSize: 'large',
  });
  await page.screenshot({ path: `${SCREENSHOTS}/a11y-settings-access-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  await page.screenshot({ path: `${SCREENSHOTS}/a11y-title-large-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('sound captions: a reload is captioned in the hunt', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'hunts are played in landscape');
  await seedSettings(page, { captions: true });
  await boot(page, 'seed=3&huntSeconds=20');
  const touch = info.project.use.hasTouch === true;
  await startHunt(page, touch);
  await waitTicks(page, 30);
  // One shot, so there is something to reload.
  const h = await hook(page);
  await tapAt(page, touch, h.designWidth / 2, h.designHeight * 0.3);
  await page.waitForFunction((s) => (window.__TM__?.shots ?? 0) > s, h.shots);
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () => window.__TM__?.captions.includes('caption.reloaded') === true,
    null,
    { timeout: 60_000 },
  );
  await page.screenshot({ path: `${SCREENSHOTS}/a11y-captions-${info.project.name}.png` });
});

test('hold to fire: one held press keeps firing while the gun is ready', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'mouse hold: desktop');
  await seedSettings(page, { holdToFire: true });
  await boot(page, 'seed=3&huntSeconds=20');
  await startHunt(page, false);
  const h = await hook(page);
  const r = await page.locator('#game canvas').boundingBox();
  if (!r) throw new Error('no canvas');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * 0.4);
  await page.mouse.down();
  await page.waitForFunction((s) => (window.__TM__?.shots ?? 0) >= s + 2, h.shots, {
    timeout: 60_000,
  });
  await page.mouse.up();
  expect((await hook(page)).shots).toBeGreaterThanOrEqual(h.shots + 2);
});

/**
 * One touch gesture dispatched inside the page with real timing: `path` is [dx, dy, ms] steps in
 * design px from (x, y), after the press; the finger lifts after the last step.
 */
async function touchGesture(
  page: Page,
  x: number,
  y: number,
  path: readonly (readonly [number, number, number])[],
): Promise<void> {
  await page.evaluate(
    ([sx, sy, steps]) =>
      new Promise<void>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) throw new Error('game not booted');
        const r = canvas.getBoundingClientRect();
        const at = (dx: number, dy: number): PointerEventInit => ({
          clientX: r.left + ((sx + dx) / h.designWidth) * r.width,
          clientY: r.top + ((sy + dy) / h.designHeight) * r.height,
          pointerId: 77,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        });
        canvas.dispatchEvent(new PointerEvent('pointerdown', at(0, 0)));
        let i = 0;
        let last: [number, number] = [0, 0];
        const next = (): void => {
          const s = steps[i++];
          if (s === undefined) {
            canvas.dispatchEvent(new PointerEvent('pointerup', { ...at(...last), buttons: 0 }));
            resolve();
            return;
          }
          const move = (): void => {
            last = [s[0], s[1]];
            canvas.dispatchEvent(new PointerEvent('pointermove', at(s[0], s[1])));
            next();
          };
          // 0 ms: right away (a frame on software GL is far longer than a flick may take).
          if (s[2] === 0) move();
          else setTimeout(move, s[2]);
        };
        next();
      }),
    [x, y, path] as const,
  );
}

test('hold to fire on touch: a held finger repeats, a drag pans, a flick reloads', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'pixel7-landscape', 'touch gestures: Pixel 7 landscape');
  test.setTimeout(180_000);
  await seedSettings(page, { holdToFire: true });
  await boot(page, 'seed=3&huntSeconds=40');
  await startHunt(page, true);
  await waitTicks(page, 20);
  const h0 = await hook(page);
  const cx = h0.designWidth / 2;
  const cy = h0.designHeight * 0.35;

  // 1. Drag sideways: the camera pans, nothing fires.
  const camBefore = h0.cameraX;
  await touchGesture(page, cx, cy, [
    [-60, 0, 0],
    [-160, 2, 40],
    [-260, 4, 40],
    [-360, 4, 40],
  ]);
  await waitTicks(page, 20);
  let h = await hook(page);
  expect(h.shots).toBe(h0.shots);
  expect(h.cameraX).not.toBe(camBefore);

  // 2. Held still for 1.2 s: repeated shots from one finger.
  await touchGesture(page, cx, cy, [[0, 0, 1200]]);
  await waitTicks(page, 10);
  h = await hook(page);
  expect(h.shots).toBeGreaterThanOrEqual(h0.shots + 2);
  const afterHold = h.shots;

  // 3. Flick down: a reload, no shot.
  await touchGesture(page, cx, cy, [
    [0, 40, 0],
    [0, 90, 0],
  ]);
  await page.waitForFunction(() => window.__TM__?.reloading === true, null, { timeout: 30_000 });
  h = await hook(page);
  expect(h.shots).toBe(afterHold);
});
