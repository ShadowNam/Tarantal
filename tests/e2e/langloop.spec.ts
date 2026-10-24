// v1.4 Die Langloop (D-038) on desktop, Pixel 7 and iPhone 14 landscape:
//   - the variable scope steps 3× → 6× → 9× and back: the mouse wheel on desktop, the − / +
//     buttons beside the ammo on touch (while a finger holds the sight up), and the step is a
//     recorded command (the hunt's replay matches Node);
//   - on demand (ART_PREVIEW=1): the scope at 3× and 9× on Die Verste, the rifle cartridges full
//     and partly spent, and the Skiet-Skuur card, written to
//     docs/art-preview/compare/v14-<shot>-<device>.png.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadContent } from '../../tools/testContent';
import { decodeInputLogText } from '../../src/sim/replay/inputLog';
import { runReplay } from '../../src/sim/replay/verify';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapRect,
} from './helpers';

const ROOT = join(import.meta.dirname, '..', '..');
const COMPARE = join(ROOT, 'docs', 'art-preview', 'compare');
const PREVIEW = process.env['ART_PREVIEW'] === '1';
/** 2026-10-19, a Monday: the save's bonus unlocks are for this UTC day. */
const DAY = { key: '2026-10-19', n: 20745 } as const;

test.use({ serviceWorkers: 'block' });

/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (info: TestInfo): string => info.project.name.replace(/-chromium-fallback$/, '');

function gate(info: TestInfo): void {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
}

/** A save with the Langloop unlocked and equipped, and Die Verste open today. */
async function langloopSave(page: Page): Promise<void> {
  await page.addInitScript((d) => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'medium' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'langloop', sights: { langloop: 'scope_var' } },
        unlocks: { weapons: ['twee_twee', 'langloop'], sights: [] },
        bestRank: 'bosveldjagter',
        bonusMaps: {
          day: d,
          unlocked: ['karoo-autumn/verder', 'karoo-autumn/nogVerder', 'karoo-autumn/dieVerste'],
          bests: {},
        },
      }),
    );
  }, DAY.n);
}

/** Holds a press (mouse) or a finger (touch, a synthetic pointer) at a design point. */
async function press(page: Page, touch: boolean, x: number, y: number): Promise<void> {
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

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas');
    const init = (window as { __TM_PRESS__?: PointerEventInit }).__TM_PRESS__;
    if (!canvas || init === undefined) return;
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  });
}

/** One zoom step the way a player takes it: the wheel on desktop, a − / + button on touch. */
async function zoomStep(page: Page, touch: boolean, dir: -1 | 1): Promise<void> {
  if (touch) {
    // A second finger on the button (a synthetic pointer: the first one holds the sight up).
    await page.evaluate((d) => {
      const canvas = document.querySelector('#game canvas');
      const h = window.__TM__;
      const r = h?.rects[d > 0 ? 'zoomIn' : 'zoomOut'];
      if (!(canvas instanceof HTMLCanvasElement) || !h || !r) throw new Error('no zoom button');
      const c = canvas.getBoundingClientRect();
      const init = {
        pointerId: 22,
        pointerType: 'touch',
        button: 0,
        buttons: 1,
        clientX: c.left + ((r.x + r.w / 2) / h.designWidth) * c.width,
        clientY: c.top + ((r.y + r.h / 2) / h.designHeight) * c.height,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    }, dir);
    return;
  }
  await page.evaluate((d) => {
    const canvas = document.querySelector('#game canvas');
    if (!canvas) throw new Error('no game');
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: d > 0 ? -100 : 100, bubbles: true, cancelable: true }),
    );
  }, dir);
}

async function zoomIs(page: Page, z: number): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const zoom = window.__TM__?.zoom;
      return zoom !== undefined && zoom.z === want && zoom.raise >= 1;
    },
    z,
    { timeout: 60_000 },
  );
}

/** A Ver flock on screen (Die Verste has several), clear of the screen edges. */
async function verFlock(page: Page): Promise<{ x: number; y: number }> {
  await page.waitForFunction(
    () => (window.__TM__?.flockSpots ?? []).some((f) => f.plane === 'ver'),
    null,
    { timeout: 120_000 },
  );
  const h = await hook(page);
  const f = h.flockSpots.find((s) => s.plane === 'ver');
  if (f === undefined) throw new Error('no Ver flock');
  return { x: Math.min(h.designWidth - 400, Math.max(400, f.x)), y: f.y - 2 };
}

test.describe('Die Langloop (v1.4)', () => {
  test('the scope steps 3× → 9× and back, and the zoomed hunt replays the same in Node', async ({
    page,
  }, info) => {
    gate(info);
    test.skip(PREVIEW, 'previews run on their own');
    test.setTimeout(400_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await langloopSave(page);
    await boot(page, `seed=38&today=${DAY.key}&bonus=dieVerste&huntSeconds=12`);
    await startHunt(page, touch);
    let h = await hook(page);
    expect(h.zoom.sight).toBe('scope_var');
    const at = await verFlock(page);
    await press(page, touch, at.x, at.y);
    await zoomIs(page, 3);
    await zoomStep(page, touch, 1);
    await zoomIs(page, 6);
    await zoomStep(page, touch, 1);
    await zoomIs(page, 9);
    await zoomStep(page, touch, 1); // already at 9×: nothing
    await zoomStep(page, touch, -1);
    await zoomIs(page, 6);
    const shots = (await hook(page)).shots;
    await release(page);
    await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, {
      timeout: 300_000,
    });
    h = await hook(page);
    const log = decodeInputLogText(h.replay ?? '');
    expect(log.mode).toMatchObject({ weapon: 'langloop', sight: 'scope_var', bonus: 'dieVerste' });
    expect(log.commands.filter(([, c]) => c.t === 'zoom').map(([, c]) => c)).toEqual([
      { t: 'zoom', step: 1 },
      { t: 'zoom', step: 2 },
      { t: 'zoom', step: 1 },
    ]);
    const node = runReplay(log, loadContent());
    expect(node.result.score).toBe(h.result?.score);
    expect(errors).toEqual([]);
  });

  test('preview: the scope at 3× and 9× on Die Verste, and the ammo full and partly spent', async ({
    page,
  }, info) => {
    gate(info);
    test.skip(!PREVIEW, 'on demand: ART_PREVIEW=1');
    test.setTimeout(400_000);
    const touch = isTouchProject(info);
    const name = (shot: string): string => join(COMPARE, `v14-${shot}-${device(info)}.png`);
    mkdirSync(COMPARE, { recursive: true });
    await langloopSave(page);
    await boot(page, `seed=42&today=${DAY.key}&bonus=dieVerste&huntSeconds=60`);
    await startHunt(page, touch);
    const at = await verFlock(page);
    // The open view: three rounds on the belt, the zoom row beside it.
    await page.screenshot({ path: name('ammo-full') });
    await press(page, touch, at.x, at.y);
    await zoomIs(page, 3);
    await page.waitForTimeout(700); // the breath settles
    await page.screenshot({ path: name('scope-3x') });
    await zoomStep(page, touch, 1);
    await zoomIs(page, 6);
    await zoomStep(page, touch, 1);
    await zoomIs(page, 9);
    await page.waitForTimeout(700);
    await page.screenshot({ path: name('scope-9x') });
    const shots = (await hook(page)).shots;
    await release(page);
    await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, {
      timeout: 60_000,
    });
    await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 1) === 0, null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(400);
    // One round fired: two cartridges and an empty case.
    expect((await hook(page)).shells).toBe(2);
    await page.screenshot({ path: name('ammo-spent') });
  });

  test('preview: the Skiet-Skuur card', async ({ page }, info) => {
    gate(info);
    test.skip(!PREVIEW, 'on demand: ART_PREVIEW=1');
    test.setTimeout(300_000);
    const touch = isTouchProject(info);
    await langloopSave(page);
    await boot(page, `today=${DAY.key}`);
    await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
      timeout: 60_000,
    });
    await tapRect(page, touch, 'shed');
    await page.waitForFunction(() => (window.__TM__?.shedIcons ?? []).includes('langloop'), null, {
      timeout: 90_000,
    });
    await page.waitForTimeout(500);
    mkdirSync(COMPARE, { recursive: true });
    await page.screenshot({ path: join(COMPARE, `v14-shed-${device(info)}.png`) });
  });
});
