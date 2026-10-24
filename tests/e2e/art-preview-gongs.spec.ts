// Skietbaan gongs (D-040) previews, on demand (not part of the regular suite): the clean steel
// plate, the plate after 1, 10 and 30 hits, a Ver plate hit seen through the Langloop's scope (3×
// and 9×), and a paper target with 30 holes. Run one profile at a time:
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-gongs.spec.ts --project=desktop-chromium
// Writes docs/art-preview/compare/skietbaan-gongs-<shot>-<project>.png (palette PNG, ≤ 1600 px
// wide): the whole canvas, and a close-up around the target ("-close").
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { decodePng, encodePng8, resize } from '../../tools/assets/image';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
        }),
      );
  });
});

function save(name: string, info: TestInfo, png: Buffer): void {
  mkdirSync(OUT, { recursive: true });
  let img = decodePng(png);
  if (img.width > 1600) img = resize(img, 1600, Math.round((img.height * 1600) / img.width));
  writeFileSync(
    join(OUT, `skietbaan-gongs-${name}-${device(info.project.name)}.png`),
    encodePng8(img),
  );
}

type Target = { x: number; y: number; r: number };

/** The whole canvas, and a close-up `span` target radii around the target (design px). */
async function shots(page: Page, info: TestInfo, name: string, t: Target | null, span = 2.4) {
  const canvas = page.locator('#game canvas');
  const box = await canvas.boundingBox();
  save(name, info, await canvas.screenshot());
  if (t === null || box === null) return;
  const h = await hook(page);
  const sx = box.width / h.designWidth;
  const sy = box.height / h.designHeight;
  const half = t.r * span;
  const x0 = Math.max(box.x, box.x + (t.x - half) * sx);
  const y0 = Math.max(box.y, box.y + (t.y - half * 1.15) * sy);
  const x1 = Math.min(box.x + box.width, box.x + (t.x + half) * sx);
  const y1 = Math.min(box.y + box.height, box.y + (t.y + half * 1.25) * sy);
  save(
    `${name}-close`,
    info,
    await page.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } }),
  );
}

async function press(page: Page, touch: boolean, selector: string): Promise<void> {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

/** Opens the Skietbaan and starts gun / distance / target (seed 42). */
async function range(page: Page, touch: boolean, gun: string, plane: string, target: string) {
  await page.goto('/?e2e=1&admin=1&seed=42');
  await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
    timeout: 90_000,
  });
  await press(page, touch, '#tm-admin [data-action=skietbaan]');
  await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
    timeout: 60_000,
  });
  await press(page, touch, `#tm-range [data-role=gun] [data-value="${gun}"]`);
  await press(page, touch, `#tm-range [data-role=target] [data-value=${target}]`);
  await press(page, touch, `#tm-range [data-role=plane] [data-value=${plane}]`);
  await press(page, touch, '#tm-range [data-action=start]');
  await page.waitForFunction(() => window.__TM__?.range?.view === 'range', null, {
    timeout: 90_000,
  });
  await page.waitForFunction(() => (window.__TM__?.range?.papers.length ?? 0) > 0, null, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  // The Start button may have left the mouse in an edge-pan band.
  if (!touch) await park(page);
}

async function target(page: Page, kind: string): Promise<Target> {
  const p = (await hook(page)).range?.papers.find((x) => x.kind === kind);
  if (p === undefined) throw new Error(`no ${kind} on the range`);
  return p;
}

/**
 * Reloads an empty gun: a tap on the shell belt on touch; Space on desktop. The belt sits in the
 * right edge-pan band (feel.json edgePanFraction, D-021), so clicking it with the real mouse would
 * leave the pointer there and pan the camera off the targets. Whatever DOM button had focus is
 * blurred first, or Space would press that button instead.
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

/** Fails loudly if the camera moved since `cam` (aim points read earlier would miss). */
async function cameraStill(page: Page, cam: number): Promise<void> {
  const now = (await hook(page)).cameraX;
  if (now !== cam) throw new Error(`the camera panned (${String(cam)} → ${String(now)})`);
}

/** Waits until the gun can fire again (a reload when it is empty). */
async function ready(page: Page, touch: boolean): Promise<void> {
  const now = await hook(page);
  if (now.shells === 0 && !now.reloading) await reload(page, touch);
  await page.waitForFunction(
    () => {
      const h = window.__TM__;
      return h !== undefined && !h.reloading && h.shells > 0 && h.zoom.raise === 0;
    },
    null,
    { timeout: 60_000 },
  );
  const t0 = (await hook(page)).tick;
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 40, t0, { timeout: 60_000 });
}

/** Pointer down (and, unless `keep`, up) at a design point on the canvas. */
async function pointer(page: Page, touch: boolean, x: number, y: number, keep = false) {
  await page.evaluate(
    ([dx, dy, t, k]) => {
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
      if (k) (window as { __TM_PRESS__?: PointerEventInit }).__TM_PRESS__ = init;
      else canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    },
    [x, y, touch, keep] as const,
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

/** The i-th aim point of a sunflower spread over `t` (so rifle marks don't stack). */
function spread(t: Target, i: number, n: number, fill = 0.72): { x: number; y: number } {
  const a = i * 2.39996;
  const d = t.r * fill * Math.sqrt((i + 0.5) / n);
  return { x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d };
}

/** Fires tap-to-shoot shots until the target has `want` marks. */
async function markUp(
  page: Page,
  touch: boolean,
  t: Target,
  kind: string,
  want: number,
  cam: number,
  n = 30,
) {
  const count = async (): Promise<number> =>
    (await hook(page)).range?.marks.find((m) => m.kind === kind)?.count ?? 0;
  for (let i = await count(), tries = 0; i < want && tries < want * 3; tries++) {
    await ready(page, touch);
    const p = spread(t, i, n);
    await cameraStill(page, cam);
    const landed = (await hook(page)).range?.stats?.shots ?? 0;
    await pointer(page, touch, p.x, p.y);
    // The shot lands (counted in the stats), hit or miss.
    await page.waitForFunction((s) => (window.__TM__?.range?.stats?.shots ?? 0) > s, landed, {
      timeout: 60_000,
    });
    i = await count();
  }
  // The plate settles (its swing and the newest mark's glint run out), the bake catches up.
  await page.waitForFunction(
    (k) => {
      const m = window.__TM__?.range?.marks.find((x) => x.kind === k);
      return m !== undefined && m.drawn === m.count;
    },
    kind,
    { timeout: 30_000 },
  );
  const t0 = (await hook(page)).tick;
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 330, t0, {
    timeout: 120_000,
  });
}

/**
 * Desktop: parks the mouse lower left, at 20% of the width — inside neither edge-pan band (the
 * outer 12% each side, D-021) nor the close-up crop around a centred target, and it keeps the
 * gun (which follows the pointer) out of the close-up. No crosshair over the target.
 */
async function park(page: Page): Promise<void> {
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.85);
  await page.waitForTimeout(800);
}

test.describe('art preview: Skietbaan gongs (D-040)', () => {
  test('the clean plate, then after 1, 10 and 30 hits', async ({ page }, info) => {
    test.setTimeout(900_000);
    const touch = isTouchProject(info);
    await range(page, touch, 'windbuks', 'near', 'plate');
    const t = await target(page, 'plate');
    const cam = (await hook(page)).cameraX;
    await page.waitForTimeout(2500);
    await park(page);
    await shots(page, info, 'clean', t);
    for (const n of [1, 10, 30]) {
      await markUp(page, touch, t, 'plate', n, cam);
      await park(page);
      await shots(page, info, `hits${String(n)}`, t);
    }
  });

  test('a Ver plate hit through the Langloop scope (3× and 9×)', async ({ page }, info) => {
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    await range(page, touch, 'langloop:scope_var', 'ver', 'plate');
    const t = await target(page, 'plate');
    const cam = (await hook(page)).cameraX;
    // Three shots through the scope (hold: it comes up; let go: it fires).
    for (let i = 0; i < 3; i++) {
      await ready(page, touch);
      await cameraStill(page, cam);
      const p = spread(t, i, 3, 0.5);
      const shots = (await hook(page)).shots;
      await pointer(page, touch, p.x, p.y, true);
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
        timeout: 60_000,
      });
      await letGo(page);
      await page.waitForFunction((s) => (window.__TM__?.shots ?? 0) > s, shots, {
        timeout: 60_000,
      });
    }
    // The 3-round magazine is empty now: the reload must not pan the camera off the plate.
    await ready(page, touch);
    await cameraStill(page, cam);
    // Raise the scope on the plate and hold it there for the picture.
    await pointer(page, touch, t.x, t.y, true);
    await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(1200);
    await shots(page, info, 'langloop-3x', null);
    if (!touch) {
      // Desktop: the wheel takes the variable scope up to 9×.
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => {
          const canvas = document.querySelector('#game canvas');
          canvas?.dispatchEvent(
            new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
          );
        });
        await page.waitForTimeout(400);
      }
      await page.waitForFunction(() => window.__TM__?.zoom.z === 9, null, { timeout: 30_000 });
      await page.waitForTimeout(1200);
      await shots(page, info, 'langloop-9x', null);
    }
    await letGo(page);
  });

  test('paper with 30 holes', async ({ page }, info) => {
    test.setTimeout(900_000);
    const touch = isTouchProject(info);
    await range(page, touch, 'windbuks', 'near', 'paper');
    const t = await target(page, 'paper');
    await markUp(page, touch, t, 'paper', 30, (await hook(page)).cameraX);
    await park(page);
    await shots(page, info, 'paper30', t);
  });
});
