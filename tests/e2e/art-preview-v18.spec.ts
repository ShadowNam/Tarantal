// v1.8 Blikkies (D-050) previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v18.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v18-blikkies-<shot>-<device>.png (the whole view, and a 2× close-up
// of the fence), palette PNG ≤ 1600 px wide:
//   fence-near / fence-mid / fence-far (Wednesday's, Tuesday's and Friday's Karoo maps);
//   somersault (a can just knocked off its post, spinning);
//   juggle (a can in the air at a chain of 3 or more, the chain pop on screen);
//   landed (cans lying on the ground with their dents);
//   skietbaan (the Blikkies target on the range) and skietbaan-report (its stats on the setup page).
// Shots are in-page pointer events (blikkiesHelpers.ts); frames are held with __TM_HOLD_AT__ (the
// cans, their shadows and the pops run on sim time or the hunt's tweens). On desktop the real
// mouse rests at the bottom centre, outside both edge-pan bands.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import weaponsJson from '../../content/weapons.json' with { type: 'json' };
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { boot, isTouchProject, startHunt } from './helpers';
import { reloadIfEmpty } from './feesdaeHelpers';
import { FAR_FENCE, MID_FENCE, NEAR_FENCE, fenceInView, juggle } from './blikkiesHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const COOLDOWN = (() => {
  const w = weaponsJson.weapons.find((x) => x.id === 'dubbelloop');
  const ms = w !== undefined && 'fireCooldownMs' in w ? w.fireCooldownMs : 300;
  return Math.ceil((ms * 60) / 1000) + 2;
})();

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test is small, but gets 10 minutes or more.
  test.setTimeout(900_000);
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
          barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
        }),
      );
  });
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(
    join(OUT, `v18-blikkies-${name}-${device(info.project.name)}.png`),
    encodePng8(out),
  );
}

/** Nearest-neighbour n× (close-ups stay crisp). */
function scaled(src: Rgba, n: number): Rgba {
  const out = blank(src.width * n, src.height * n);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / n) * src.width + Math.floor(x / n)) * 4;
      const di = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k] ?? 0;
    }
  return out;
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** The cans' box on screen (design px), padded: the close-up. */
async function fenceBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate(() => {
    const s = window.__TM__?.cans?.spots ?? [];
    const xs = s.map((c) => c.x);
    const ys = s.map((c) => c.y);
    const pad = 140;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad * 1.6 };
  });
}

/** The whole canvas, and optionally a 2× close-up of a design-px rect. */
async function shoot(
  page: Page,
  info: TestInfo,
  name: string,
  close?: { x: number; y: number; w: number; h: number },
): Promise<void> {
  const shot = decodePng(await page.locator('#game canvas').screenshot());
  save(name, info, shot);
  if (close === undefined) return;
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  const k = shot.width / w;
  const x0 = Math.max(0, Math.round(close.x * k));
  const y0 = Math.max(0, Math.round(close.y * k));
  const x1 = Math.min(shot.width, Math.round((close.x + close.w) * k));
  const y1 = Math.min(shot.height, Math.round((close.y + close.h) * k));
  const n = Math.max(2, Math.min(4, Math.floor(1600 / Math.max(1, x1 - x0))));
  save(`${name}-closeup`, info, scaled(crop(shot, x0, y0, x1 - x0, y1 - y0), n));
}

/** Holds the sim `after` ticks from now (sim time: the cans and pops stop), then lets frames draw. */
async function holdSoon(page: Page, touch: boolean, after: number): Promise<void> {
  const at = await page.evaluate((n) => {
    const t = (window.__TM__?.tick ?? 0) + n;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  }, after);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

/** Starts a hunt on `query` with the fence in the middle of the screen. */
async function onFence(page: Page, touch: boolean, query: string): Promise<void> {
  await boot(page, query);
  await startHunt(page, touch);
  await park(page, touch);
  await fenceInView(page);
}

/** Juggles until the hunt's longest chain is `want` (0: one knock-off), reloading as needed. */
async function juggleTo(
  page: Page,
  touch: boolean,
  want: number,
  holdOnDone = false,
): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const run = await juggle(page, touch, want, COOLDOWN, 90_000, holdOnDone);
    const ok = want === 0 ? run.log.some((e) => e.startsWith('knock')) : run.bestChain >= want;
    if (ok) return true;
    if (run.empty) await reloadIfEmpty(page, touch);
  }
  return false;
}

test.describe('v1.8 Blikkies previews', () => {
  for (const [name, query] of [
    ['fence-near', NEAR_FENCE],
    ['fence-mid', MID_FENCE],
    ['fence-far', FAR_FENCE],
  ] as const) {
    test(name, async ({ page }, info) => {
      const touch = isTouchProject(info);
      await onFence(page, touch, query);
      await holdSoon(page, touch, 5);
      await shoot(page, info, name, await fenceBox(page));
    });
  }

  test('somersault: a can knocked off its post', async ({ page }, info) => {
    const touch = isTouchProject(info);
    await onFence(page, touch, NEAR_FENCE);
    const box = await fenceBox(page);
    if (!(await juggleTo(page, touch, 0))) throw new Error('no can was knocked off');
    await holdSoon(page, touch, 6);
    await shoot(page, info, 'somersault', box);
  });

  test('juggle: a can in the air at a chain of 3+', async ({ page }, info) => {
    const touch = isTouchProject(info);
    // The near fence: a mid can is tiny in the picture.
    await onFence(page, touch, NEAR_FENCE);
    const box = await fenceBox(page);
    // Hit at the top of each arc; the sim stays held as the 3rd air hit lands, so its
    // "3× in the air!" pop (sim time) is on screen in the shot.
    if (!(await juggleTo(page, touch, 3, true))) throw new Error('no chain of 3');
    await holdSoon(page, touch, 0);
    await shoot(page, info, 'juggle', { ...box, y: Math.max(0, box.y - 400), h: box.h + 400 });
  });

  test('landed cans with their dents', async ({ page }, info) => {
    const touch = isTouchProject(info);
    await onFence(page, touch, NEAR_FENCE);
    const box = await fenceBox(page);
    // Knock off cans until two lie on the ground with dents.
    for (let i = 0; i < 12; i++) {
      const lying = await page.evaluate(
        () =>
          window.__TM__?.cans?.spots.filter((c) => c.state === 'landed' && c.marks > 0).length ?? 0,
      );
      if (lying >= 2) break;
      await juggleTo(page, touch, 0);
      await page.waitForFunction(
        () =>
          !(
            window.__TM__?.cans?.spots.some((c) => c.state === 'air' || c.state === 'bounced') ??
            true
          ),
        null,
        { timeout: 60_000 },
      );
      // juggle() stops at the hunt's first knock-off: let the next round start fresh.
      await page.evaluate(() => {
        const g = window.__TM__;
        if (g !== undefined) g.canLog = g.canLog.filter((e) => !e.startsWith('knock'));
      });
    }
    await holdSoon(page, touch, 2);
    await shoot(page, info, 'landed', { ...box, h: box.h + 120 });
  });

  test('the Skietbaan Blikkies target and its report', async ({ page }, info) => {
    const touch = isTouchProject(info);
    await page.goto('/?e2e=1&admin=1');
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 90_000,
    });
    const press = async (selector: string): Promise<void> => {
      const el = page.locator(selector);
      await el.scrollIntoViewIfNeeded();
      if (touch) await el.tap();
      else await el.click();
    };
    await press('#tm-admin [data-action=skietbaan]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await press('#tm-range [data-role=plane] [data-value=mid]');
    await press('#tm-range [data-role=target] [data-value=cans]');
    await press('#tm-range [data-action=start]');
    await page.waitForFunction(
      () => window.__TM__?.range?.view === 'range' && window.__TM__.range.target === 'cans',
      null,
      { timeout: 90_000 },
    );
    await park(page, touch);
    await page.waitForFunction(() => (window.__TM__?.cans?.spots.length ?? 0) === 3, null, {
      timeout: 60_000,
    });
    await page.evaluate(() => {
      if (window.__TM__) window.__TM__.rangeHold = true;
    });
    await juggleTo(page, touch, 1);
    await holdSoon(page, touch, 2);
    await shoot(page, info, 'skietbaan', await fenceBox(page));
    // The setup page with the session's stats (the Blikkies lines).
    await page.evaluate(() => {
      if (window.__TM__) window.__TM__.rangeHold = false;
    });
    await press('#tm-range-bar [data-action=setup]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(1000);
    save('skietbaan-report', info, decodePng(await page.screenshot({ fullPage: true })));
  });
});
