// D-049: far birds are drawn smaller (plane scale 0.15) and touch assist on the far plane went
// 18 → 12 px; the body hit radius is at least 18 px. A tap (or click) at a far bird's body centre
// with the single-pellet Windbuks must still bag it, on desktop, Pixel 7 and iPhone 14 landscape.
// Namibië's Monday is calm (no wind drift) and starts with a far flock in view.
import { expect, test, type Page } from '@playwright/test';
import { boot, collectErrors, hook, isLandscape, isTouchProject, startHunt } from './helpers';

test.use({ serviceWorkers: 'block' });

/** The Windbuks equipped (one pellet, no spread: the tap point is the shot). */
async function windbuksSave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'medium' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'windbuks' },
        unlocks: { weapons: ['windbuks'] },
        barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
      }),
    );
  });
}

/**
 * Taps (pointer down + up, a fresh pointerId) at the body centre of a far bird well inside the
 * screen, in-page so the bird has not moved; returns its id and the score before, or null.
 */
async function tapFarBird(
  page: Page,
  touch: boolean,
  pointerId: number,
): Promise<{ id: number; score: number } | null> {
  return page.evaluate(
    ([isTouch, pid]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const g = window.__TM__;
      if (!canvas || !g) throw new Error('game not booted');
      const b = g.farBirds.find((x) => x.x > g.designWidth * 0.2 && x.x < g.designWidth * 0.8);
      if (b === undefined) return null;
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + (b.x / g.designWidth) * r.width,
        clientY: r.top + (b.y / g.designHeight) * r.height,
        pointerId: pid,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      return { id: b.id, score: g.score };
    },
    [touch, pointerId] as const,
  );
}

test('a tap at a far bird’s centre bags it (D-049: smaller far birds stay shootable)', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await windbuksSave(page);
  await boot(page, 'biome=namibie&layout=mon&seed=42&huntSeconds=60');
  await startHunt(page, touch);
  expect((await hook(page)).weapon).toBe('windbuks');
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      return (
        g !== undefined &&
        g.tick > 30 &&
        g.farBirds.some((b) => b.x > g.designWidth * 0.2 && b.x < g.designWidth * 0.8)
      );
    },
    null,
    { timeout: 120_000 },
  );
  // Two tries (a flock bird may duck behind a mate as it walks); one must bag the bird tapped.
  let bagged = false;
  for (let k = 0; k < 2 && !bagged; k++) {
    const shots = (await hook(page)).shots;
    const tap = await tapFarBird(page, touch, 700 + k);
    expect(tap, 'a far bird in view').not.toBeNull();
    if (tap === null) break;
    // Read the outcome in the same wait that sees the shot resolve.
    const h = await page
      .waitForFunction(
        ([id, score, n]) => {
          const g = window.__TM__;
          if (g === undefined || g.shots <= n || g.tick < 0) return null;
          const gone = !g.farBirds.some((b) => b.id === id);
          return gone || g.score > score ? { gone, score: g.score } : null;
        },
        [tap.id, tap.score, shots] as const,
        { timeout: 30_000, polling: 50 },
      )
      .catch(() => null);
    const out = h === null ? null : ((await h.jsonValue()) as { gone: boolean; score: number });
    bagged = out !== null && out.gone && out.score > tap.score;
    if (!bagged) {
      // The Windbuks reloads between shots: wait for the next pellet before trying again.
      await page.waitForFunction(() => window.__TM__?.reloading === false, null, {
        timeout: 60_000,
      });
    }
  }
  expect(bagged, 'a tap at the body centre bags the far bird').toBe(true);
  expect(errors).toEqual([]);
});
