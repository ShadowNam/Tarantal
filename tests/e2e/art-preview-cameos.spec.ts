// v1.13 (D-075) veld cameo previews, on demand (not part of the regular suite; playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-cameos.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v113-cameos-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   bushveld, warthogs-2x, beetle-2x, warthogs-bolt-2x, beetle-tumble-2x;
//   karoo, tortoise-2x, ostrich-2x, tortoise-hide-2x, ostrich-veer-2x;
//   kalahari, springbok-2x, springbok-pronk-2x;
//   namibie, gemsbok-2x, gemsbok-run-2x;
//   journal-1…4: the shed Journal's field guide, the cameos' pages (a save that has seen them all),
//     then okavango-trumpet (+ -2x): the far elephants flapping for the trumpet;
//   std-hd: Standard | HD close-up of the springbok at the same held tick (the Standard crop
//     from the Kalahari test);
//   brakkie-gun-before-after: v1.12 review polish — Brakkie resting with his head in the gun's
//     barrel (?brakkieGunStripe=0, the old rule) | at a rest spot after the fix.
// Each cameo is brought out in view by ?cameoPreview= (0.5 s in, walking slowly towards the centre)
// and reacts at ?cameoReact= (lesson 11: the moment comes quickly, held, a missing one fails).
// Eight short boots per device (two for the polish's before | after) (≤ ~12 min each on software GL, lessons 13, 23): every grab holds
// the sim (__TM_HOLD_AT__) on a fresh frame; the far herds are still (?faunaIdle=0) except in the
// trumpet shot; on desktop the real mouse rests at the bottom centre, outside both edge-pan bands.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { defaultSave } from '../../src/meta/saveSchema';
import { sightingKey } from '../../src/meta/journal';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
/** The cameos react this many seconds in (the preview flag); held a few ticks after. */
const REACT_S = 4;
const REACT_TICK = REACT_S * 60;
const q = (biome: string, kinds: string, extra = ''): string =>
  `biome=${biome}&layout=none&seed=42&huntSeconds=120&baboons=0&reenbui=0&omen=0&brakkie=0&birds=0&cameoPreview=${kinds}&cameoReact=${String(REACT_S)}${extra}`;

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(1_200_000);
  // A returning player who has seen every cameo (the Journal's pages); the hunts are unaffected.
  const save = defaultSave();
  save.ftue = { done: true, skipped: false, step: '' };
  save.settings.quality = 'high';
  save.settings.language = 'en';
  save.settings.oupa = 'text';
  save.birdBook.creatures = [
    'warthog',
    'dungBeetle',
    'tortoise',
    'ostrich',
    'springbok',
    'gemsbok',
    'elephant',
  ].map(sightingKey);
  await page.addInitScript(
    ([key, data]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, data);
    },
    [SAVE, JSON.stringify(save)] as const,
  );
});

const fileOf = (name: string, info: TestInfo): string =>
  join(OUT, `v113-cameos-${name}-${device(info.project.name)}.png`);

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(fileOf(name, info), encodePng8(out));
}

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

function sideBySide(a: Rgba, b: Rgba): Rgba {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const out = blank(w * 2 + 12, h);
  out.data.fill(255);
  const put = (src: Rgba, left: number): void => {
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + left + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  };
  put(a, 0);
  put(b, w + 12);
  return out;
}

async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

interface Member {
  visible: boolean;
  x: number;
  y: number;
  groundY: number;
  facing: number;
}
interface Visit {
  kind: string;
  phase: string;
  reaction: string | null;
  members: Member[];
}
interface Dog {
  phase: string;
  pose: string;
  plane: string;
  visible: boolean;
  x: number;
  y: number;
  facing: number;
}
type Hooked = {
  __TM__?: {
    tick: number;
    sceneryFrames: number;
    designWidth: number;
    cameos?: { sheet: string | null; visits: Visit[]; trumpets: number } | null;
    brakkie?: Dog | null;
    graphics: { bounds: { key: string; x: number; y: number; w: number; h: number }[] };
  };
  __TM_HOLD_AT__?: (tick: number) => void;
};

async function bootTitle(page: Page, query: string, gfx: 'standard' | 'hd'): Promise<void> {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&${query}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 300_000,
  });
}

/** Starts the hunt from the title; waits until it runs (and, with `sheet`, the cameo sheet is in). */
async function hunt(
  page: Page,
  info: TestInfo,
  gfx: 'standard' | 'hd',
  sheet: boolean,
): Promise<void> {
  const touch = isTouchProject(info);
  await tapRect(page, touch, 'start');
  if (gfx === 'hd')
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 600_000,
    });
  await page.waitForFunction(
    (s) => {
      const tm = window.__TM__;
      const h = (window as unknown as Hooked).__TM__;
      return (
        tm?.scene === 'hunt' &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        (!s || (h?.cameos?.sheet ?? null) !== null)
      );
    },
    sheet,
    { timeout: 600_000 },
  );
  await park(page, touch);
}

async function fresh(page: Page, touch: boolean): Promise<void> {
  await park(page, touch);
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 3, f0, {
    timeout: 120_000,
  });
  await page.waitForTimeout(1000);
}

/** Holds the sim at tick `at` and waits for a fresh frame (lesson 28). */
async function holdAt(page: Page, touch: boolean, at: number): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(t);
  }, at);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 900_000 });
  await fresh(page, touch);
}

interface Grab {
  img: Rgba;
  k: number;
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight };
}

type Box = { x: number; y: number; w: number; h: number };
function cut(g: Grab, r: Box): Rgba {
  const x0 = Math.max(0, Math.round(r.x * g.k));
  const y0 = Math.max(0, Math.round(r.y * g.k));
  const x1 = Math.min(g.img.width, Math.round((r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.round((r.y + r.h) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** How tall each kind is drawn (design px), for its crop. */
const TALL: Record<string, number> = {
  warthogs: 100,
  dungBeetle: 60,
  tortoise: 80,
  ostrich: 230,
  springbok: 130,
  gemsbok: 200,
};

/** The box round a visit's drawn members (feet at the bottom). */
async function visitBox(page: Page, kind: string): Promise<Box> {
  const v = (
    await page.evaluate(() => (window as unknown as Hooked).__TM__?.cameos?.visits ?? [])
  ).find((x) => x.kind === kind);
  const ms = (v?.members ?? []).filter((m) => m.visible);
  if (ms.length === 0) throw new Error(`no ${kind} drawn on screen`);
  const tall = TALL[kind] ?? 120;
  const pad = Math.max(60, tall * 0.7);
  const x0 = Math.min(...ms.map((m) => m.x)) - pad;
  const x1 = Math.max(...ms.map((m) => m.x)) + pad;
  const gy = Math.max(...ms.map((m) => m.groundY));
  return { x: x0, y: gy - tall - 30, w: x1 - x0, h: tall + 50 };
}

/** One area: its cameos in view, each close up, then each reacting (`reactAt` ticks after). */
async function area(
  page: Page,
  info: TestInfo,
  name: string,
  biome: string,
  kinds: readonly { kind: string; shot: string; react: string; reactAt: number }[],
): Promise<{ grab: Grab; box: Box }> {
  const touch = isTouchProject(info);
  await bootTitle(page, `faunaIdle=0&${q(biome, kinds.map((k) => k.kind).join(','))}`, 'standard');
  await hunt(page, info, 'standard', true);
  await holdAt(page, touch, 150);
  const g = await grab(page);
  save(name, info, g.img);
  const firstKind = kinds[0]?.kind ?? '';
  const box = await visitBox(page, firstKind);
  for (const k of kinds)
    save(`${k.shot}-2x`, info, scaled(cut(g, await visitBox(page, k.kind)), 2));
  for (const k of [...kinds].sort((a, b) => a.reactAt - b.reactAt)) {
    await holdAt(page, touch, REACT_TICK + k.reactAt);
    const r = await grab(page);
    save(`${k.react}-2x`, info, scaled(cut(r, await visitBox(page, k.kind)), 2));
  }
  return { grab: g, box: { ...box, w: Math.min(box.w, 420) } };
}

/** The shed Journal's field guide on the title: the cameos' pages (then back to the title). */
async function journalPages(page: Page, info: TestInfo): Promise<void> {
  const touch = isTouchProject(info);
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined);
  await tapRect(page, touch, 'shed');
  await page.waitForFunction(() => window.__TM__?.menu === 'shed.loadout');
  await tapRect(page, touch, 'shed.journal');
  await page.waitForFunction(() => window.__TM__?.journal?.section === 'field');
  // Two species a page: the cameos are entries 9–15 (pages 5–8).
  for (let p = 1; p <= 4; p++) {
    await tapRect(page, touch, 'journal.next');
    await page.waitForFunction((n) => window.__TM__?.journal?.page === n, p);
  }
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(2500);
    await park(page, touch);
    save(`journal-${String(i)}`, info, (await grab(page)).img);
    if (i < 4) {
      await tapRect(page, touch, 'journal.next');
      await page.waitForFunction((n) => window.__TM__?.journal?.page === n, 4 + i);
    }
  }
  await tapRect(page, touch, 'shed.back');
  await page.waitForFunction(() => window.__TM__?.menu === null);
}

test('Bushveld: the warthog family and the dung beetle, then the bolt and the tumble', async ({
  page,
}, info) => {
  await area(page, info, 'bushveld', 'bushveld-winter', [
    { kind: 'warthogs', shot: 'warthogs', react: 'warthogs-bolt', reactAt: 10 },
    { kind: 'dungBeetle', shot: 'beetle', react: 'beetle-tumble', reactAt: 12 },
  ]);
});

test('Karoo: the tortoise and the ostrich, then hiding and veering', async ({ page }, info) => {
  await area(page, info, 'karoo', 'karoo-autumn', [
    { kind: 'tortoise', shot: 'tortoise', react: 'tortoise-hide', reactAt: 20 },
    { kind: 'ostrich', shot: 'ostrich', react: 'ostrich-veer', reactAt: 8 },
  ]);
});

test('Kalahari: the springbok herd, then pronking', async ({ page }, info) => {
  const g = await area(page, info, 'kalahari', 'kalahari-summer', [
    { kind: 'springbok', shot: 'springbok', react: 'springbok-pronk', reactAt: 50 },
  ]);
  // The Standard half of std-hd: the springbok at tick 150 (the HD boot holds the same tick).
  save('std-crop', info, cut(g.grab, g.box));
  writeFileSync(fileOf('std-box', info).replace(/\.png$/, '.json'), JSON.stringify(g.box));
});

test('Namibië: gemsbok crossing, then cantering off', async ({ page }, info) => {
  await area(page, info, 'namibie', 'namibie', [
    { kind: 'gemsbok', shot: 'gemsbok', react: 'gemsbok-run', reactAt: 45 },
  ]);
});

test('Standard | HD close-up of the springbok at the same held tick', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const stdFile = fileOf('std-crop', info);
  const boxFile = fileOf('std-box', info).replace(/\.png$/, '.json');
  if (!existsSync(stdFile) || !existsSync(boxFile))
    throw new Error('run the Kalahari test first (it writes the Standard crop)');
  await bootTitle(page, `faunaIdle=0&${q('kalahari-summer', 'springbok')}`, 'hd');
  await hunt(page, info, 'hd', true);
  await holdAt(page, touch, 150);
  const box = JSON.parse(readFileSync(boxFile, 'utf8')) as Box;
  const hd = cut(await grab(page), box);
  save('std-hd', info, scaled(sideBySide(decodePng(readFileSync(stdFile)), hd), 2));
});

test('The Journal field guide, then the Okavango elephants flap and trumpet', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await bootTitle(page, q('okavango-spring', 'elephants'), 'standard');
  await journalPages(page, info);
  await hunt(page, info, 'standard', false);
  await page.waitForFunction(
    () => ((window as unknown as Hooked).__TM__?.cameos?.trumpets ?? 0) >= 1,
    null,
    { timeout: 600_000 },
  );
  // Mid-flap (the trumpet window is 2.4 s from the preview's trumpet at 0.5 s).
  await holdAt(page, touch, 30 + 50);
  const g = await grab(page);
  save('okavango-trumpet', info, g.img);
  const herd = (
    await page.evaluate(() => (window as unknown as Hooked).__TM__?.graphics.bounds ?? [])
  ).find((b) => b.key.includes('okavango_elephants'));
  if (herd === undefined) throw new Error('the elephant herd is not on screen');
  save(
    'okavango-trumpet-2x',
    info,
    scaled(cut(g, { x: herd.x - 30, y: herd.y - 30, w: herd.w + 60, h: herd.h + 50 }), 2),
  );
});

for (const side of ['before', 'after'] as const)
  test(`Polish: Brakkie rests clear of the gun barrel (${side})`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await bootTitle(
      page,
      `faunaIdle=0&biome=karoo-autumn&layout=none&seed=42&huntSeconds=120&baboons=0&reenbui=0&omen=0&cameos=0&brakkie=1${side === 'before' ? '&brakkieGunStripe=0' : ''}`,
      'standard',
    );
    await tapRect(page, touch, 'start');
    await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 600_000 });
    await park(page, touch);
    // A rest spot on the near plane (before: one with his head in the gun's stripe, 65–360 px
    // from the centre); held in the same frame (bounded).
    const d = (await (
      await page.waitForFunction(
        (before) => {
          const w = window as unknown as Hooked;
          const dog = w.__TM__?.brakkie;
          const tm = w.__TM__;
          if (
            dog?.visible !== true ||
            dog.phase !== 'rest' ||
            dog.plane !== 'near' ||
            tm === undefined
          )
            return false;
          const head = Math.abs(dog.x + 74 * dog.facing - tm.designWidth / 2);
          if (before && (head < 65 || head > 360)) return false;
          w.__TM_HOLD_AT__?.(tm.tick + 1);
          return dog;
        },
        side === 'before',
        { timeout: 600_000, polling: 'raf' },
      )
    ).jsonValue()) as Dog;
    await fresh(page, touch);
    const shot = cut(await grab(page), { x: d.x - 320, y: 560, w: 760, h: 520 });
    if (side === 'before') {
      save('brakkie-gun-before', info, shot);
      return;
    }
    const beforeFile = fileOf('brakkie-gun-before', info);
    if (!existsSync(beforeFile)) throw new Error('run the "before" test first');
    save('brakkie-gun-before-after', info, sideBySide(decodePng(readFileSync(beforeFile)), shot));
  });
