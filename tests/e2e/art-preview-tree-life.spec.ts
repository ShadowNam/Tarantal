// 1.9.4 (D-057) tree-life previews, on demand (not part of the regular suite; playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-tree-life.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/tree-life-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   baobab-wide: the Bushveld at the west end of the pan, the baobab in view (Standard);
//   baobab-before-after: the baobab as the product owner saw it (main's art, served in place of
//     the new file by page.route; no residents, no swinging pods) | now, the same crop;
//   baobab-std-hd: the baobab, Standard | HD (the same pan, the same held tick);
//   resident-<id>: 2× close-ups of each resident at its hollow, on a held frame
//     (?treeLife=<id> keeps it out; galago, squirrel, owl, hornbill feeding, buffalo weaver);
//   resident-bees: the bees at their crack; resident-owl-std-hd: the owl, Standard | HD;
//   pods: a 2× close-up of the pods on their long stalks;
//   sausage-before-after, sausage-std-hd, sausage-fruit: the Okavango sausage tree (main's art |
//     now; Standard | HD; a 2× close-up of its fruit);
//   colony-<biome>, colony-<biome>-before-after, colony-<biome>-std-hd: the weaver tree with the
//     birds in flight and the pygmy falcon (?treeLife=falcon), Kalahari and Namibië (lovebirds);
//     before = ?treeLife=off.
// Everything that moves runs on sim time; every grab holds the sim (__TM_HOLD_AT__) at a fixed
// tick, so Standard and HD show the same birds. Crops are anchored on the prop's own on-screen
// box (graphics.bounds), so they line up across modes. On desktop the real mouse rests at the
// bottom centre, outside both edge-pan bands. A wanted shot that doesn't come within its bounded
// attempts fails the test. Each test waits until the hunt runs in the wanted area.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  blank,
  crop,
  decodePng,
  encodePng,
  encodePng8,
  resize,
  type Rgba,
} from '../../tools/assets/image';
import { CAMERA_MIN_X } from '../../src/sim/world';
import { hook, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const BEFORE = join(import.meta.dirname, '..', 'fixtures', 'tree-before');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const BASE = 'seed=42&huntSeconds=900&birds=0&layout=none';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and HD packs have to land: up to 25 minutes each.
  test.setTimeout(1_500_000);
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
      }),
    );
  }, SAVE);
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `tree-life-${name}-${device(info.project.name)}.png`), encodePng8(out));
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

/** a | b side by side, a 12 px white gap. */
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

/** "Before": main's tree art in place of the new file, and no fruit sprites (main's fruit sat
 *  elsewhere on the old tree): a transparent sheet of the same size. */
async function routeBefore(
  page: Page,
  file: 'bushveld_baobab' | 'okavango_sausage_tree',
): Promise<void> {
  const old = readFileSync(join(BEFORE, `${file}.png`));
  await page.route(new RegExp(`/${file}\\.[0-9a-f]+\\.png$`), (route) =>
    route.fulfill({ body: old, contentType: 'image/png' }),
  );
  const biome = file.startsWith('bushveld') ? 'bushveld-winter' : 'okavango-spring';
  await page.route(new RegExp(`/fruit_${biome}\\.[0-9a-f]+\\.png$`), async (route) => {
    const res = await route.fetch();
    const png = decodePng(await res.body());
    await route.fulfill({
      body: encodePng(blank(png.width, png.height)),
      contentType: 'image/png',
    });
  });
}

/** Boots a hunt on `query` and waits until it runs in `biome` with its own layers (HD: once HD
 *  textures are in). */
async function huntIn(page: Page, info: TestInfo, query: string, biome: string): Promise<void> {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&biome=${biome}&${query}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  const touch = isTouchProject(info);
  await startHunt(page, touch);
  if (query.includes('graphics=hd'))
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 300_000,
    });
  const prefix = `layer:${biome.split('-')[0] ?? biome}/`;
  await page.waitForFunction(
    ([want, pre]) => {
      const tm = window.__TM__;
      const layers = (tm?.graphics.bounds ?? []).filter((b) => b.key.startsWith('layer:'));
      return (
        tm?.scene === 'hunt' &&
        tm.biome === want &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        layers.length > 0 &&
        layers.every((b) => b.key.startsWith(pre))
      );
    },
    [biome, prefix] as const,
    { timeout: 300_000 },
  );
  await park(page, touch);
}

/** Pans to the west end of the panorama (the sim's camera limit: the same x everywhere). */
async function panWest(page: Page, touch: boolean): Promise<void> {
  const atEnd = async (): Promise<boolean> =>
    Math.abs((await hook(page)).cameraX - CAMERA_MIN_X) < 0.5;
  await page.keyboard.down('KeyA');
  for (let k = 0; k < 240 && !(await atEnd()); k++) await page.waitForTimeout(500);
  await page.keyboard.up('KeyA');
  if (!(await atEnd())) throw new Error(`pan: camera ${(await hook(page)).cameraX}`);
  await park(page, touch);
}

/** Pans until the Okavango's sausages are near the screen's centre (bounded). */
async function panToSausages(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(
    () => window.__TM__?.fruit?.spots.some((f) => f.species === 'sausage') ?? false,
    null,
    { timeout: 300_000 },
  );
  const off = async (): Promise<number> => {
    const h = await hook(page);
    const xs = (h.fruit?.spots ?? []).filter((f) => f.species === 'sausage').map((f) => f.x);
    const mid = xs.length === 0 ? h.designWidth / 2 : (Math.min(...xs) + Math.max(...xs)) / 2;
    return mid - h.designWidth / 2;
  };
  for (let k = 0; k < 120 && Math.abs(await off()) > 160; k++) {
    const key = (await off()) > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await page.waitForTimeout(250);
    await page.keyboard.up(key);
  }
  await park(page, touch);
}

/** Holds the sim at the first multiple of 30 s at least 2 s from now (the same tick in every
 *  mode as long as each run gets here in time), then lets frames draw. */
async function holdFixed(page: Page, touch: boolean): Promise<number> {
  const at = await page.evaluate(() => {
    const now = window.__TM__?.tick ?? 0;
    const t = Math.ceil((now + 120) / 1800) * 1800;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  });
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 600_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
  return at;
}

/** Holds the sim on the next tick (a resident in the wanted pose stays in it). */
async function holdNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const t = (window.__TM__?.tick ?? 0) + 1;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
  });
  await page.waitForTimeout(1200);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(1e12);
  });
}

interface Grab {
  img: Rgba;
  k: number;
  bounds: { key: string; x: number; y: number; w: number; h: number }[];
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight, bounds: h.graphics.bounds };
}

/** A design-px rect cut from a grab (clamped). */
function cut(g: Grab, r: { x: number; y: number; w: number; h: number }): Rgba {
  const x0 = Math.max(0, Math.round(r.x * g.k));
  const y0 = Math.max(0, Math.round(r.y * g.k));
  const x1 = Math.min(g.img.width, Math.round((r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.round((r.y + r.h) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** The prop `key`'s on-screen box, padded (design px). */
function propBox(g: Grab, key: string, pad = 24): { x: number; y: number; w: number; h: number } {
  const b = g.bounds.find((x) => x.key === key);
  if (b === undefined) throw new Error(`${key} is not on screen`);
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

test('the baobab: before | after (the product owner view), Standard | HD, the pods', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  const grabs = new Map<string, Grab>();
  for (const [mode, extra] of [
    ['before', '&graphics=standard&treeLife=off'],
    ['after', '&graphics=standard'],
    ['hd', '&graphics=hd'],
  ] as const) {
    if (mode === 'before') await routeBefore(page, 'bushveld_baobab');
    await huntIn(page, info, `${BASE}${extra}`, 'bushveld-winter');
    await panWest(page, touch);
    await holdFixed(page, touch);
    const g = await grab(page);
    grabs.set(mode, g);
    if (mode === 'after') {
      save('baobab-wide', info, g.img);
      // The pods: a 2× close-up round the hanging ones on screen.
      const pods = ((await hook(page)).fruit?.spots ?? []).filter(
        (f) => f.species === 'baobab_pod',
      );
      expect(pods.length, 'pods hang from the baobab').toBeGreaterThan(0);
      const xs = pods.map((p) => p.x);
      const ys = pods.map((p) => p.y);
      const r = {
        x: Math.min(...xs) - 40,
        y: Math.min(...ys) - 30,
        w: Math.max(...xs) - Math.min(...xs) + 80,
        h: Math.max(...ys) - Math.min(...ys) + 110,
      };
      save('pods', info, scaled(cut(g, r), 2));
    }
    await release(page);
    if (mode === 'before') await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
  const before = grabs.get('before');
  const after = grabs.get('after');
  const hd = grabs.get('hd');
  if (before === undefined || after === undefined || hd === undefined) throw new Error('grabs');
  save(
    'baobab-before-after',
    info,
    sideBySide(
      cut(before, propBox(before, 'bushveld/baobab')),
      cut(after, propBox(after, 'bushveld/baobab')),
    ),
  );
  save(
    'baobab-std-hd',
    info,
    sideBySide(
      cut(after, propBox(after, 'bushveld/baobab')),
      cut(hd, propBox(hd, 'bushveld/baobab')),
    ),
  );
});

// Each resident in a pose that shows it best (frames: src/game/view/tree/residentSheet.ts).
const RESIDENTS: readonly (readonly [string, string])[] = [
  ['galago', '^galago_(out|look)$'],
  ['squirrel', '^squirrel_(run_a|run_b|sit)$'],
  ['owl', '^owl_(front|left)$'],
  ['hornbill', '^hornbill_feed$'],
  ['buffaloWeaver', '^buffalo_perch$'],
];

test('each resident at its hollow (held frames), the bees, the owl Standard | HD', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  for (const [id, want] of RESIDENTS) {
    await huntIn(page, info, `${BASE}&graphics=standard&treeLife=${id}`, 'bushveld-winter');
    await panWest(page, touch);
    let got = false;
    // Bounded: at most 8 tries, each a wait of ≤ 90 s for the pose.
    for (let k = 0; k < 8 && !got; k++) {
      await page.waitForFunction(
        ([rid, re]) =>
          window.__TM__?.treeLife?.residents.some(
            (r) => r.id === rid && new RegExp(re).test(r.frame),
          ) === true,
        [id, want] as const,
        { timeout: 90_000, polling: 16 },
      );
      await holdNow(page);
      const h = await hook(page);
      const r = h.treeLife?.residents.find((x) => x.id === id && new RegExp(want).test(x.frame));
      if (r !== undefined) {
        const g = await grab(page);
        save(
          `resident-${id}`,
          info,
          scaled(cut(g, { x: r.x - 90, y: r.y - 80, w: 180, h: 150 }), 2),
        );
        if (id === 'owl') {
          // The bees' crack is low on the trunk's lit side (baobabShape.ts HOLLOWS: (−74, 200)
          // from the prop; the owl's cavity is at (−44, 118)).
          save(
            'resident-bees',
            info,
            scaled(cut(g, { x: r.x - 30 - 60, y: r.y + 82 - 45, w: 120, h: 90 }), 3),
          );
        }
        got = true;
      }
      await release(page);
    }
    expect(got, `${id} in the wanted pose`).toBe(true);
  }
  // The owl, Standard | HD (the same held tick: its pose cycle is a function of the tick).
  const cuts: Rgba[] = [];
  for (const mode of ['standard', 'hd'] as const) {
    await huntIn(page, info, `${BASE}&graphics=${mode}&treeLife=owl`, 'bushveld-winter');
    await panWest(page, touch);
    await holdFixed(page, touch);
    const g = await grab(page);
    const r = (await hook(page)).treeLife?.residents.find((x) => x.id === 'owl');
    expect(r, 'the owl is out').toBeDefined();
    if (r !== undefined) cuts.push(scaled(cut(g, { x: r.x - 70, y: r.y - 70, w: 140, h: 140 }), 2));
    await release(page);
  }
  const [s, hd] = cuts;
  if (s !== undefined && hd !== undefined) save('resident-owl-std-hd', info, sideBySide(s, hd));
});

test('the sausage tree: before | after, Standard | HD, its fruit', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const grabs = new Map<string, Grab>();
  for (const [mode, extra] of [
    ['before', '&graphics=standard'],
    ['after', '&graphics=standard'],
    ['hd', '&graphics=hd'],
  ] as const) {
    if (mode === 'before') await routeBefore(page, 'okavango_sausage_tree');
    await huntIn(page, info, `${BASE}${extra}`, 'okavango-spring');
    await panToSausages(page, touch);
    await holdFixed(page, touch);
    const g = await grab(page);
    grabs.set(mode, g);
    if (mode === 'after') {
      const fruit = ((await hook(page)).fruit?.spots ?? []).filter((f) => f.species === 'sausage');
      expect(fruit.length, 'sausages hang from the tree').toBeGreaterThan(0);
      const xs = fruit.map((p) => p.x);
      const ys = fruit.map((p) => p.y);
      save(
        'sausage-fruit',
        info,
        scaled(
          cut(g, {
            x: Math.min(...xs) - 30,
            y: Math.min(...ys) - 20,
            w: Math.max(...xs) - Math.min(...xs) + 60,
            h: Math.max(...ys) - Math.min(...ys) + 150,
          }),
          2,
        ),
      );
    }
    await release(page);
    if (mode === 'before') await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
  const before = grabs.get('before');
  const after = grabs.get('after');
  const hd = grabs.get('hd');
  if (before === undefined || after === undefined || hd === undefined) throw new Error('grabs');
  const key = 'okavango/sausage_tree';
  save(
    'sausage-before-after',
    info,
    sideBySide(cut(before, propBox(before, key)), cut(after, propBox(after, key))),
  );
  save(
    'sausage-std-hd',
    info,
    sideBySide(cut(after, propBox(after, key)), cut(hd, propBox(hd, key))),
  );
});

for (const [biome, key] of [
  ['kalahari-summer', 'kalahari/weaver_camelthorn'],
  ['namibie', 'namibie/nest_camelthorn'],
] as const) {
  test(`the weaver colony in ${biome}: birds in flight and the falcon; before | after; Standard | HD`, async ({
    page,
  }, info) => {
    const touch = isTouchProject(info);
    const grabs = new Map<string, Grab>();
    for (const [mode, extra] of [
      ['before', '&graphics=standard&treeLife=off'],
      ['after', '&graphics=standard&treeLife=falcon'],
      ['hd', '&graphics=hd&treeLife=falcon'],
    ] as const) {
      await huntIn(page, info, `${BASE}${extra}`, biome);
      await panWest(page, touch);
      await holdFixed(page, touch);
      if (mode !== 'before') {
        // The held tick shows the colony out and the falcon at the nest (a forced visit leaves
        // a second's gap: then the next 30 s mark, bounded).
        for (let k = 0; k < 4; k++) {
          const c = (await hook(page)).treeLife?.colony;
          if (c !== null && c !== undefined && c.falcon && c.weavers >= 4) break;
          await release(page);
          await holdFixed(page, touch);
        }
        const c = (await hook(page)).treeLife?.colony;
        expect(c?.falcon, 'the falcon is there').toBe(true);
        expect(c?.weavers ?? 0, 'weavers are out').toBeGreaterThanOrEqual(4);
        if (biome === 'namibie') expect(c?.lovebirds ?? 0).toBeGreaterThan(0);
      }
      const g = await grab(page);
      grabs.set(mode, g);
      // The colony's birds fly round and below the tree: a wider box than the prop's.
      if (mode === 'after') {
        const b = propBox(g, key, 120);
        save(`colony-${biome}`, info, cut(g, b));
      }
      await release(page);
    }
    const before = grabs.get('before');
    const after = grabs.get('after');
    const hd = grabs.get('hd');
    if (before === undefined || after === undefined || hd === undefined) throw new Error('grabs');
    save(
      `colony-${biome}-before-after`,
      info,
      sideBySide(cut(before, propBox(before, key, 120)), cut(after, propBox(after, key, 120))),
    );
    save(
      `colony-${biome}-std-hd`,
      info,
      sideBySide(cut(after, propBox(after, key, 60)), cut(hd, propBox(hd, key, 60))),
    );
  });
}
