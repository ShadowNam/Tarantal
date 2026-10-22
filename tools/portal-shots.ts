// `npm run portal:shots` (M10): renders the store and portal page images from the web build, in
// capture mode with a fixed seed, into release/portal-assets/ (gitignored). Nothing is uploaded.
//   CrazyGames covers (docs.crazygames.com/requirements/game-covers): 1920×1080 (16:9),
//     800×1200 (2:3), 800×800 (1:1); the game title only, no borders, logos or "Play now".
//   Poki thumbnail (developers.poki.com/guide/game-thumbnail): full-bleed square ≥ 628×628, no
//     text; rendered at 628 and 1256.
//   Screenshots: 1920×1080 title, hunt (HUD on), tally.
// The scenes are the placeholder art today: re-run after the art swap (docs/07-PORTAL-SUBMISSION).
// Covers are composed in a page with the game's own display font (Bangers, OFL).
// v1.0.1 (D-028): built with VITE_TEST_HOOKS=1, so the `?e2e` title and tally look as a player
// sees them (a public build marks `?e2e` Dailies "practice only" and hides [Share]). That dist/ is
// a test build: `npm run release` rebuilds dist/ without the flag before zipping.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { loadDailyMeta } from './testContent';

const root = join(import.meta.dirname, '..');
const out = join(root, 'release', 'portal-assets');
const PORT = Number(process.env['PORTAL_SHOTS_PORT'] ?? 4175);
const ORIGIN = `http://localhost:${PORT}`;
/** Fixed day and seed: the same images every run (until the epoch is set). */
// The title shows Daily #1: today = the epoch (content/meta/daily.json, its only copy, D-028).
const BASE = `?e2e=1&ftue=0&today=${loadDailyMeta().epoch}&seed=42`;
const TITLE = (
  JSON.parse(readFileSync(join(root, 'src', 'i18n', 'en.json'), 'utf8')) as Record<string, string>
)['app.title'];

async function serve(): Promise<ChildProcess> {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return p;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error(`vite preview did not start on ${ORIGIN} (run npm run build first)`);
}

async function ready(page: Page, query: string): Promise<void> {
  // A fixed quality tier ("auto" follows the machine's cores): high = full render scale and
  // bloom, the best look for store images, and the same images on every machine.
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(key, JSON.stringify({ v: 1, settings: { quality: 'high' } }));
  });
  await page.goto(`${ORIGIN}/${query}`);
  await page.waitForFunction(
    () => window.__TM__?.ready === true && window.__TM__.fontsReady,
    null,
    {
      timeout: 90_000,
    },
  );
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
}

async function tapStart(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const h = window.__TM__;
    const c = document.querySelector('#game canvas')?.getBoundingClientRect();
    const s = h?.rects['start'];
    if (!h || !c || !s) throw new Error('no start button');
    return {
      x: c.left + ((s.x + s.w / 2) / h.designWidth) * c.width,
      y: c.top + ((s.y + s.h / 2) / h.designHeight) * c.height,
    };
  });
  await page.mouse.click(r.x, r.y);
  // Park the cursor mid-screen (the outer 12 % would edge-pan the camera away).
  await page.mouse.move(960, 540);
}

const atTick = (page: Page, tick: number) =>
  page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, tick, { timeout: 180_000 });

/** A capture-mode frame (no HUD, no gun) at 2× for the covers: the Karoo flock foraging. */
async function sceneFrame(browser: Browser, holdAt: number): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  await ready(page, `${BASE}&capture=1&gun=0&holdAt=${holdAt}`);
  await tapStart(page);
  await atTick(page, holdAt);
  await page.waitForTimeout(1000);
  const png = await page.screenshot();
  await page.close();
  return png;
}

/** Composes a cover: the frame cropped to w×h around (fx, fy) (fractions), plus the title. */
async function cover(
  browser: Browser,
  frame: Buffer,
  w: number,
  h: number,
  focus: { fx: number; fy: number },
  title: string | null,
): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const font = readFileSync(join(root, 'public', 'fonts', 'bangers-400.woff2')).toString('base64');
  const titleSize = Math.round(Math.min(w / 7, h / 4.2));
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Bangers; src: url(data:font/woff2;base64,${font}) format('woff2'); }
    html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #1b1410; }
    .bg { position: absolute; inset: 0; background: url(data:image/png;base64,${frame.toString('base64')});
      background-size: cover; background-position: ${focus.fx * 100}% ${focus.fy * 100}%; }
    .title { position: absolute; left: 0; right: 0; top: ${Math.round(h * 0.06)}px; text-align: center;
      font-family: Bangers; font-size: ${titleSize}px; line-height: 0.95; letter-spacing: 0.02em;
      color: #FFD25A; -webkit-text-stroke: ${Math.max(4, Math.round(titleSize / 12))}px #1B1410;
      paint-order: stroke fill; text-shadow: 0 ${Math.round(titleSize / 14)}px 0 #1B1410;
      transform: rotate(-3deg); padding: 0 4%; }
  </style></head><body><div class="bg"></div>${title === null ? '' : `<div class="title">${title}</div>`}</body></html>`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const png = await page.screenshot();
  await page.close();
  return png;
}

/** A 1920×1080 screenshot with the HUD (store screenshots). */
async function screenshot(
  browser: Browser,
  name: string,
  run: (page: Page) => Promise<void>,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await run(page);
  await page.waitForTimeout(1000);
  writeFileSync(join(out, `screenshot-${name}-1920x1080.png`), await page.screenshot());
  await page.close();
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const flock = await sceneFrame(browser, 300);
    writeFileSync(join(out, 'frame-flock-3840x2160.png'), flock);
    // The flock forages right of centre; keep it in every crop.
    const focus = { fx: 0.62, fy: 0.75 };
    const covers: [string, number, number, Buffer, string | null][] = [
      ['crazygames-cover-16x9-1920x1080', 1920, 1080, flock, TITLE ?? null],
      ['crazygames-cover-2x3-800x1200', 800, 1200, flock, TITLE ?? null],
      ['crazygames-cover-1x1-800x800', 800, 800, flock, TITLE ?? null],
      ['poki-thumbnail-1x1-628x628', 628, 628, flock, null],
      ['poki-thumbnail-1x1-1256x1256', 1256, 1256, flock, null],
    ];
    for (const [name, w, h, frame, title] of covers) {
      writeFileSync(join(out, `${name}.png`), await cover(browser, frame, w, h, focus, title));
      console.log(`${name}.png`);
    }
    await screenshot(browser, 'title', async (p) => {
      await ready(p, BASE);
    });
    await screenshot(browser, 'hunt', async (p) => {
      await ready(p, `${BASE}&holdAt=420`);
      await tapStart(p);
      await atTick(p, 420);
    });
    await screenshot(browser, 'tally', async (p) => {
      await ready(p, `${BASE}&huntSeconds=8`);
      await tapStart(p);
      await p.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 120_000 });
      await p.waitForTimeout(2500);
    });
    console.log(`portal:shots — written to release/portal-assets/`);
  } finally {
    await browser.close();
    server.kill();
  }
}

await main();
