// D-051: shared steps for the potjie specs (potjie.spec.ts, art-preview-karoo-polish.spec.ts).
// Taps are fired from inside the page with a fresh pointerId each (page.touchscreen taps after a
// held key did not register on WebKit's iPhone profile in CI), as weavers.spec.ts does.
import type { Page } from '@playwright/test';
import { hook, reload, waitTicks } from './helpers';

/** Waits until the late group's HD art shows on the aloes and the potjie (lid included). */
export async function waitHd(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const h = window.__TM__;
      return (
        h?.potjie?.hd === true && h.hdProps.length > 0 && h.hdProps.every((p) => p.hd)
      );
    },
    null,
    { timeout: 300_000 },
  );
}

/** Pans to the left end of the panorama (potjie and aloe clump a): hold A on desktop, drag right
 *  on touch (in-page). */
export async function panLeft(page: Page, touch: boolean): Promise<void> {
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

let nextPointer = 900;

/** One in-page tap at the lid as the hook shows it now (false: the lid is not on screen). */
export async function tapLid(page: Page, touch: boolean): Promise<boolean> {
  return page.evaluate(
    ([isTouch, id]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const h = window.__TM__;
      if (!canvas || !h) throw new Error('game not booted');
      const spot = h.secretSpots.find((s) => s.partId === 'lid' && s.ready);
      if (spot === undefined || spot.x < 0 || spot.x > h.designWidth) return false;
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + (spot.x / h.designWidth) * r.width,
        clientY: r.top + (spot.y / h.designHeight) * r.height,
        pointerId: id,
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
    [touch, nextPointer++] as const,
  );
}

/** Shoots the lid off: several quick shots (seeded hunts have fixed pellet patterns; a miss is
 *  known after ~20 ticks), until the lid secret has gone off. Returns the hunt's length before. */
export async function shootLidOff(page: Page, touch: boolean): Promise<number> {
  const before = (await hook(page)).durationTicks;
  for (let i = 0; i < 12; i++) {
    if (!(await tapLid(page, touch))) throw new Error('the lid is not on screen');
    await waitTicks(page, 20);
    const h = await hook(page);
    if (h.potjie?.lidOff === true) return before;
    // Reload when the gun is empty, then try again.
    if (h.ammo.length === 0) await reload(page, touch);
  }
  throw new Error('the lid never came off');
}
