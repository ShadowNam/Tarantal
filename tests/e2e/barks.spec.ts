// v1.0.1 (D-028 §3): Oupa's barks. A fresh save's first hunt of the day opens with his greeting:
// a speech bubble in the HUD's bark slot that never covers the score, belt, pause or timer and
// never takes a tap (a tap on it fires a shot). The save remembers the day. The text follows the
// language (af here). ?holdAt=45 (0.75 s in, after the bubble's fade-in) holds the hunt and its
// HUD tweens, so the screenshot shows the bubble: under software GL a Playwright round trip can
// take longer than the bubble's 2.8 s.
import { expect, test, type Page } from '@playwright/test';
import { loadFeel } from '../../tools/testContent';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapRect,
} from './helpers';

const greeting = loadFeel().barks.triggers.firstToday.lines[0];

interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: R, b: R): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function waitBark(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.bark != null, null, { timeout: 60_000 });
}

test('the first hunt of the day: Oupa greets in a bubble clear of the HUD', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=42&huntSeconds=30&holdAt=45&baboons=0');
  await startHunt(page, touch);
  await waitBark(page);
  const h = await hook(page);
  await page.screenshot({ path: `${SCREENSHOTS}/bark-${info.project.name}.png` });
  const b = h.bark;
  if (b === null) throw new Error('bark gone before it was read');
  expect(b.line).toBe(greeting);
  expect(h.barks).toEqual([greeting]);
  // Inside the safe area, clear of every HUD part a player reads or taps.
  const safe = h.safe ?? { x: 0, y: 0, w: h.designWidth, h: h.designHeight };
  expect(b.x).toBeGreaterThanOrEqual(safe.x);
  expect(b.y + b.h).toBeLessThanOrEqual(safe.y + safe.h);
  for (const k of ['score', 'belt', 'pause', 'timer', 'frenzy', 'gadget', 'reloadPrompt']) {
    const r = h.rects[k];
    if (r !== undefined) expect(overlap(b, r), `bubble over ${k}`).toBe(false);
  }
  // The pop stack hangs under the score, right-aligned: the bubble stays on the left half.
  expect(b.x + b.w).toBeLessThan(h.designWidth / 2);
  // The save remembers today: the next hunt today doesn't greet again.
  const saved = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as {
          barks?: { lastHuntDay: number | null };
        }
      ).barks?.lastHuntDay ?? null,
  );
  expect(saved).not.toBeNull();
  expect(errors).toEqual([]);
});

test('a tap on the bubble is a shot (it never takes input)', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  await boot(page, 'seed=42&huntSeconds=30&baboons=0');
  await startHunt(page, touch);
  // Tap the bubble's centre in-page the frame it appears (a round trip could outlast it).
  const tapped = await page.evaluate(
    (isTouch) =>
      new Promise<{ shots: number; line: string }>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const watch = (): void => {
          const h = window.__TM__;
          const b = h?.bark;
          if (!canvas || !h || b == null) {
            requestAnimationFrame(watch);
            return;
          }
          const r = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX: r.left + ((b.x + b.w / 2) / h.designWidth) * r.width,
            clientY: r.top + ((b.y + b.h / 2) / h.designHeight) * r.height,
            pointerId: 77,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          const shots = h.shots;
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          resolve({ shots, line: b.line });
        };
        watch();
      }),
    touch,
  );
  expect(tapped.line).toBe(greeting);
  await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, tapped.shots, {
    timeout: 30_000,
  });
});

test('Oupa speaks the save language (af)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one profile is enough for the text');
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('tm.e2e.save.v1') === null)
      localStorage.setItem(
        'tm.e2e.save.v1',
        JSON.stringify({ v: 1, settings: { language: 'af' } }),
      );
  });
  await boot(page, 'seed=42&huntSeconds=30&holdAt=45&baboons=0');
  await startHunt(page, false);
  await waitBark(page);
  const h = await hook(page);
  await page.screenshot({ path: `${SCREENSHOTS}/bark-af-${info.project.name}.png` });
  expect(h.bark?.text).toBe('Môre, my kind! Die voëls is vroeg op.');
  expect(errors).toEqual([]);
});

test('no barks in Oupa se Les (the FTUE has his own prompts)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one profile');
  test.setTimeout(180_000);
  await boot(page, 'ftue=1');
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined);
  await tapRect(page, false, 'start');
  await page.waitForFunction(() => window.__TM__?.ftue.active === true, null, { timeout: 60_000 });
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 300, null, { timeout: 90_000 });
  expect((await hook(page)).barks).toEqual([]);
});
