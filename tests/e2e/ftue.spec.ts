// M5 "Done when": the FTUE "Oupa se Les" completes on phone and desktop without any text longer
// than one line (GDD §16). A 24 s lesson (the beats are fractions of the hunt) played from inside
// the page — harness round trips are too slow on software GL — with a screenshot of every prompt.
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, hook, isTouchProject, SCREENSHOTS, tapRect } from './helpers';

const PROFILES = [
  'desktop-chromium',
  'pixel7-landscape',
  'iphone14-landscape',
  'iphone14-landscape-chromium-fallback',
];

/** Plays like a new player: shoots the nearest flock every ~0.4 s, reloads when told to. */
function play(page: Page, touch: boolean): Promise<void> {
  return page.evaluate(
    (isTouch) =>
      new Promise<void>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) throw new Error('game not booted');
        let pid = 500;
        let lastShot = -999;
        let reloadAsked = -1;
        const press = (x: number, y: number, button: number): void => {
          const r = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX: r.left + (x / h.designWidth) * r.width,
            clientY: r.top + (y / h.designHeight) * r.height,
            pointerId: isTouch ? pid++ : 1,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button,
            buttons: button === 2 ? 2 : 1,
            bubbles: true,
            cancelable: true,
          };
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        };
        const loop = (): void => {
          if (h.scene === 'tally') {
            resolve();
            return;
          }
          if (h.scene === 'hunt' && !h.paused) {
            const prompt = h.ftue.prompts[h.ftue.prompts.length - 1]?.key ?? '';
            if (h.shells === 0) {
              // Let the RELOAD prompt show for ~2.5 s (for its screenshot), then reload as it says.
              if (prompt.startsWith('ftue.reload')) {
                if (reloadAsked < 0) reloadAsked = h.tick;
                if (h.tick - reloadAsked > 150) {
                  const belt = h.rects['belt'];
                  if (isTouch && belt) press(belt.x + belt.w / 2, belt.y + belt.h / 2, 0);
                  else press(h.designWidth / 2, h.designHeight / 2, 2);
                  reloadAsked = -1;
                }
              }
            } else if (h.tick - lastShot >= 25) {
              const mid = h.designWidth / 2;
              const spot = [...h.flockSpots]
                .filter((f) => f.x > 40 && f.x < h.designWidth - 40)
                .sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0];
              if (spot) {
                press(spot.x, spot.y, 0);
                lastShot = h.tick;
              }
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    touch,
  );
}

test('FTUE "Oupa se Les" completes with one line of text at a time', async ({ page }, info) => {
  test.skip(!PROFILES.includes(info.project.name), 'desktop, Pixel 7 and iPhone 14 landscape');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await page.goto('/?e2e=1&reenbui=0&brakkie=0&seed=7&huntSeconds=24');
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  // A new player's title is one giant START HUNT: no Skiet-Skuur or Settings yet.
  expect((await hook(page)).rects['shed']).toBeUndefined();
  await page.screenshot({ path: `${SCREENSHOTS}/ftue-title-${info.project.name}.png` });
  await tapRect(page, touch, 'start');
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.mode === 'ftue',
  );

  const done = play(page, touch);
  let shots = 0;
  for (;;) {
    const s = await page.evaluate(() => ({
      scene: window.__TM__?.scene ?? '',
      n: window.__TM__?.ftue.prompts.length ?? 0,
      key: window.__TM__?.ftue.prompts.at(-1)?.key ?? '',
    }));
    if (s.scene === 'tally') break;
    if (s.n > shots) {
      shots = s.n;
      await page.screenshot({
        path: `${SCREENSHOTS}/ftue-${info.project.name}-${s.n}-${s.key.replace('ftue.', '')}.png`,
      });
    }
    await page.waitForTimeout(250);
  }
  await done;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCREENSHOTS}/ftue-tally-${info.project.name}.png` });

  const h = await hook(page);
  expect(h.mode).toBe('ftue');
  expect(h.ftue.steps).toEqual(
    expect.arrayContaining(['start', 'first_shot', 'run', 'reload', 'flush', 'secret', 'complete']),
  );
  const kind = touch ? 'touch' : 'mouse';
  const keys = h.ftue.prompts.map((p) => p.key);
  expect(keys).toEqual(
    expect.arrayContaining([
      `ftue.shoot_${kind}`,
      'ftue.run',
      `ftue.reload_${kind}`,
      'ftue.flush',
      'ftue.secret',
    ]),
  );
  // GDD §16: never more than one line on screen during play, and it fits between the HUD.
  for (const p of h.ftue.prompts) {
    expect(p.lines, p.text).toBe(1);
    expect(p.text).not.toContain('\n');
    expect(p.width, p.text).toBeLessThanOrEqual(p.room + 0.5);
  }
  // Telemetry on every step (Tech §14 ftue_step), and the lesson is saved as done.
  const steps = h.analytics.filter((a) => a.event === 'ftue_step').map((a) => a.data['step']);
  expect(steps).toEqual(
    expect.arrayContaining(['start', 'run', 'reload', 'flush', 'secret', 'complete']),
  );
  const saved = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as { ftue?: { done: boolean } })
        .ftue,
  );
  expect(saved?.done).toBe(true);

  // [Again] (default focus) is now a real Classic hunt.
  await tapRect(page, touch, 'again');
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.mode === 'classic',
  );
  expect(errors).toEqual([]);
});
