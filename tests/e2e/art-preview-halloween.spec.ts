// D-048 Halloween Spookjag previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-halloween.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/halloween-<shot>-<device>.png (the whole view; some also a 2–4×
// close-up), palette PNG ≤ 1600 px wide:
//   title (the Daily button with its "Spookjag tonight!" badge, + close-up);
//   hunt (the dusk hunt, wide: moon, sky bats, lanterns, cobwebs);
//   hat (a guineafowl in a witch hat, close-up);
//   lantern (a lit pumpkin lantern, close-up; and lantern-out, the same one shot dark);
//   owl and bat (each crossing the view, close-up);
//   tally (the Halloween slate: frame, "Spookjag 2026", the Spookjag line).
// The special is forced with ?feesdag=halloween (?omen=0: no wind on the far shots). An in-page
// rAF watcher holds the sim (__TM_HOLD_AT__) the tick it sees what a frame wants; everything that
// moves on a held frame (bats round the moon, the lantern flicker, the flyers' wings) runs on sim
// ticks. On desktop the real mouse rests at the bottom centre, outside both edge-pan bands.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { boot, isTouchProject, tapRect } from './helpers';
import { lanternInView, shootLanternOut, spookRunning } from './feesdaeHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const QUERY = 'feesdag=halloween&seed=42&omen=0';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test gets 10 minutes.
  test.setTimeout(600_000);
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

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `halloween-${name}-${device(info.project.name)}.png`), encodePng8(out));
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

/** The whole canvas, and optionally a close-up of a design-px rect. */
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

/** Starts the Halloween Daily from the title and waits for its things. */
async function startSpookjag(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'daily');
  await spookRunning(page);
  await park(page, touch);
}

type Want = 'hat' | 'owl' | 'bat' | 'now';

/**
 * Holds the sim the tick it sees `want` well inside the view (a hat on a bird, an owl or a bat in
 * flight, or right away), and returns where it was (screen design px).
 */
async function holdOn(page: Page, want: Want, margin = 260): Promise<{ x: number; y: number }> {
  const h = await page.waitForFunction(
    ([w, m]) => {
      const g = window.__TM__;
      const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
      const box = window as unknown as { __hwHeld?: { x: number; y: number; t: number } };
      if (g === undefined || hold === undefined || g.spook === null) return null;
      if (box.__hwHeld !== undefined)
        return g.tick >= box.__hwHeld.t ? { x: box.__hwHeld.x, y: box.__hwHeld.y } : null;
      const inside = (p: { x: number; y: number }): boolean =>
        p.x > m && p.x < g.designWidth - m && p.y > 80 && p.y < g.designHeight - 160;
      const spot =
        w === 'now'
          ? { x: g.designWidth / 2, y: g.designHeight / 2 }
          : w === 'hat'
            ? g.spook.hats.find(inside)
            : g.spook.things.find((t) => t.kind === w && inside(t));
      if (spot === undefined) return null;
      box.__hwHeld = { x: spot.x, y: spot.y, t: g.tick + 1 };
      hold(g.tick + 1);
      return null;
    },
    [want, margin] as const,
    { timeout: 480_000, polling: 'raf' },
  );
  const at = (await h.jsonValue()) as { x: number; y: number };
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return at;
}

test('the title: the Daily button as Spookjag, with its badge', async ({ page }, info) => {
  await boot(page, QUERY);
  await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, isTouchProject(info));
  await page.waitForTimeout(1200);
  const h = await page.evaluate(() => ({
    badge: window.__TM__?.feesdag ?? null,
    rect: window.__TM__?.rects['daily'] ?? null,
  }));
  expect(h.badge?.id).toBe('halloween');
  const r = h.rect;
  await shoot(
    page,
    info,
    'title',
    r === null ? undefined : { x: r.x - 60, y: r.y - 110, w: r.w + 220, h: r.h + 150 },
  );
});

test('the dusk hunt, wide', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=90`);
  await startSpookjag(page, touch);
  // A few seconds in: the first bats are up, the lanterns glow, Oupa has had his say.
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 300, null, { timeout: 300_000 });
  await holdOn(page, 'now');
  expect(await page.evaluate(() => window.__TM__?.map?.lights ?? [])).toEqual(['dusk']);
  await shoot(page, info, 'hunt');
});

test('a guineafowl in a witch hat, close up', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=90`);
  await startSpookjag(page, touch);
  const at = await holdOn(page, 'hat');
  await shoot(page, info, 'hat', { x: at.x - 160, y: at.y - 80, w: 320, h: 240 });
});

test('a pumpkin lantern lit, then shot out', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=90`);
  await startSpookjag(page, touch);
  const id = await lanternInView(page, 300);
  const spot = async (): Promise<{ x: number; y: number }> =>
    page.evaluate((lid) => {
      const t = window.__TM__?.spook?.things.find((x) => x.id === lid);
      return { x: t?.x ?? 0, y: t?.y ?? 0 };
    }, id);
  let at = await spot();
  await page.waitForTimeout(1500);
  await shoot(page, info, 'lantern', { x: at.x - 120, y: at.y - 110, w: 240, h: 200 });
  expect(await shootLanternOut(page, touch, id)).toBe(true);
  await park(page, touch);
  // After the puff has cleared.
  const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 80, t0, {
    timeout: 120_000,
  });
  at = await spot();
  await holdOn(page, 'now');
  await shoot(page, info, 'lantern-out', { x: at.x - 120, y: at.y - 110, w: 240, h: 200 });
});

for (const kind of ['owl', 'bat'] as const)
  test(`${kind === 'owl' ? 'the spotted eagle-owl' : 'a bat'} crossing the view`, async ({
    page,
  }, info) => {
    const touch = isTouchProject(info);
    await boot(page, `${QUERY}&huntSeconds=90`);
    await startSpookjag(page, touch);
    const at = await holdOn(page, kind, kind === 'owl' ? 320 : 220);
    const r = kind === 'owl' ? { w: 420, h: 240 } : { w: 220, h: 150 };
    await shoot(page, info, kind, { x: at.x - r.w / 2, y: at.y - r.h / 2, w: r.w, h: r.h });
  });

test('the tally: the Halloween slate and share card', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=20`);
  await startSpookjag(page, touch);
  // One lantern out, so the Spookjag line has something to count.
  const id = await lanternInView(page, 300);
  await shootLanternOut(page, touch, id);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
  const tally = await page.evaluate(() => window.__TM__?.tally ?? null);
  expect(tally?.frame).toBe('halloween');
  // The count-up and the rank stamp are done.
  await page.waitForTimeout(6000);
  await park(page, touch);
  await shoot(page, info, 'tally');
});
