// M4: the Karoo biome on every landscape profile — secrets (fence bell → Meerkat Spotter, bakkie
// spare wheel, potjie lid → +5 s), the omen's wind sock, a crate weapon fired by holding
// (Mielie-Masjien), and the Generaal. Taps on moving things are fired from inside the page (one
// round trip), like the flock spec, because harness round trips cost seconds on software GL.
import { expect, test, type Page } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  waitTicks,
} from './helpers';

type SpotKind = 'secret' | 'crate';

/** Taps (in-page PointerEvents) at a secret part or the first crate as the hook shows it now.
 *  Returns false if there is nothing to tap. */
async function tapSpot(page: Page, touch: boolean, kind: SpotKind, partId = ''): Promise<boolean> {
  return page.evaluate(
    ([k, part, isTouch]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const h = window.__TM__;
      if (!canvas || !h) throw new Error('game not booted');
      const spot =
        k === 'crate' ? h.crateSpots[0] : h.secretSpots.find((s) => s.partId === part && s.ready);
      if (spot === undefined || spot.x < 0 || spot.x > h.designWidth) return false;
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + (spot.x / h.designWidth) * r.width,
        clientY: r.top + (spot.y / h.designHeight) * r.height,
        pointerId: 700 + h.shots,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      return true;
    },
    [kind, partId, touch] as const,
  );
}

/** Pans to the left end of the panorama: hold A on desktop, drag right on touch (in-page). */
async function panLeft(page: Page, touch: boolean): Promise<void> {
  if (!touch) {
    await page.keyboard.down('KeyA');
    await page.waitForFunction(() => (window.__TM__?.cameraX ?? 9999) <= 961, null, {
      timeout: 120_000,
    });
    await page.keyboard.up('KeyA');
    return;
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) throw new Error('game not booted');
        const r = canvas.getBoundingClientRect();
        let x = r.left + r.width * 0.2;
        const y = r.top + r.height * 0.5;
        const ev = (type: string): PointerEvent =>
          new PointerEvent(type, {
            clientX: x,
            clientY: y,
            pointerId: 650,
            pointerType: 'touch',
            isPrimary: true,
            buttons: type === 'pointerup' ? 0 : 1,
            bubbles: true,
            cancelable: true,
          });
        canvas.dispatchEvent(ev('pointerdown'));
        const step = (): void => {
          if (h.cameraX <= 961 || x > r.left + r.width * 0.9) {
            canvas.dispatchEvent(ev('pointerup'));
            if (h.cameraX <= 961) resolve();
            else {
              x = r.left + r.width * 0.2;
              canvas.dispatchEvent(ev('pointerdown'));
              requestAnimationFrame(step);
            }
            return;
          }
          x += r.width * 0.05;
          canvas.dispatchEvent(ev('pointermove'));
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

async function untilTrue(fn: () => Promise<boolean>, tries: number, page: Page): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return;
    await waitTicks(page, 12);
  }
  throw new Error('condition never held');
}

test('secrets: fence bell → Meerkat Spotter, spare wheel, potjie +5 s; wind sock in the omen', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=42&huntSeconds=60&omen=1&baboons=0');
  await startHunt(page, touch);
  expect((await hook(page)).wind).not.toBeNull();

  // The fence bell and the bakkie's spare wheel are in view at the start.
  await untilTrue(
    async () => {
      await tapSpot(page, touch, 'secret', 'bell');
      await waitTicks(page, 3);
      return (await hook(page)).powerups.includes('meerkat_spotter');
    },
    6,
    page,
  );
  await waitTicks(page, 10);
  await page.screenshot({ path: `${SCREENSHOTS}/karoo-meerkat-${info.project.name}.png` });

  await untilTrue(
    async () => {
      await tapSpot(page, touch, 'secret', 'spare_wheel');
      await waitTicks(page, 3);
      return !(await hook(page)).secretSpots.some((s) => s.partId === 'spare_wheel');
    },
    6,
    page,
  );

  // The potjie sits at the far left of the near plane.
  await panLeft(page, touch);
  const before = (await hook(page)).durationTicks;
  await untilTrue(
    async () => {
      await tapSpot(page, touch, 'secret', 'lid');
      await waitTicks(page, 3);
      return (await hook(page)).durationTicks === before + 300;
    },
    6,
    page,
  );
  await page.screenshot({ path: `${SCREENSHOTS}/karoo-potjie-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('crate weapon: shoot the crate, then hold to fire the Mielie-Masjien', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&huntSeconds=60&crate=mielie_masjien&baboons=0');
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
    timeout: 120_000,
  });
  await untilTrue(
    async () => {
      await tapSpot(page, touch, 'crate');
      await waitTicks(page, 3);
      return (await hook(page)).weapon === 'mielie_masjien';
    },
    10,
    page,
  );

  // Hold for 60 ticks (1 s) in the sky: it fires every 70 ms while held.
  const shotsBefore = (await hook(page)).shots;
  const held = await page.evaluate(
    (isTouch) =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) throw new Error('game not booted');
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + r.width * 0.5,
          clientY: r.top + r.height * 0.25,
          pointerId: 800,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        const start = h.tick;
        const wait = (): void => {
          if (h.tick >= start + 60) {
            canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
            resolve(h.tick - start);
            return;
          }
          requestAnimationFrame(wait);
        };
        wait();
      }),
    touch,
  );
  await page.screenshot({ path: `${SCREENSHOTS}/karoo-mielie-${info.project.name}.png` });
  const shots = (await hook(page)).shots - shotsBefore;
  // 15 a second; allow for the frame the hold started and ended on.
  expect(shots, `held ${held} ticks`).toBeGreaterThanOrEqual(10);
  expect(errors).toEqual([]);
});

test('the Generaal appears at the bakkie (with his pot) in a Classic hunt', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=42&huntSeconds=30&baboons=0');
  await startHunt(page, touch);
  await page.waitForFunction(
    () => window.__TM__?.specialBirds.some((b) => b.creature === 'generaal') === true,
    null,
    { timeout: 180_000 },
  );
  await waitTicks(page, 20);
  await page.screenshot({ path: `${SCREENSHOTS}/karoo-generaal-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
