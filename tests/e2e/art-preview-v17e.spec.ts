// v1.7e (D-061) Bushveld rocks and middle distance previews, on demand (not part of the regular
// suite; playwright.config.ts ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v17e.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v17e-bushveld-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   centre-<variant>: the Bushveld as a hunt opens (no pan);
//   koppie-<variant>: panned until the dassie koppie is at the screen's centre;
//   mid-<variant>: a 1.5× close-up of the middle distance round the koppie and the boulders;
//   far-<variant>: a 1.5× close-up of the far hills and the far veld above the koppie;
//   <shot>-before-after: the pair, once both variants are there;
//   rocks-std-hd: the dassie koppie and the cracked boulder, Standard | HD (the same pan).
//   tell-<species>-wide / -rest / -act / -seq / -std-hd: each secret's tell animal (cue A),
//     one test per area: the view panned to it, a 3× close-up resting and doing its action, three
//     stills 1 s apart, and the close-up Standard | HD; tell-glow-bushveld: Saturday's dusk map
//     lights the tells (Oupa se Kaart's warm outline).
// "Before": run this spec on a main checkout with V17E_VARIANT=before (only the first test runs;
// it saves the -before files), then on this branch (it saves -after and the pairs). The file
// imports nothing that only this branch has, so it typechecks and runs on main too.
// No birds, no weekday layout (props at their base places). Every grab holds the sim
// (__TM_HOLD_AT__) at a near multiple of 300 ticks; anything that moves runs on sim time. On
// desktop the real mouse rests at the bottom centre, outside both edge-pan bands. Each test waits
// until the hunt runs in the Bushveld with its own layers (a lazy area's first frames still show
// the title's Karoo behind the veil).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { hook, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const VARIANT = process.env['V17E_VARIANT'] === 'before' ? 'before' : 'after';
const SAVE = 'tm.e2e.save.v1';
const BASE = 'biome=bushveld-winter&seed=42&huntSeconds=900&birds=0&layout=none&faunaIdle=0';
const KOPPIE = 'bushveld/dassie_koppie';
const CRACK = 'bushveld/boulder_crack';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and the HD pack has to land: up to 25 minutes each.
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

const fileOf = (name: string, info: TestInfo): string =>
  join(OUT, `v17e-bushveld-${name}-${device(info.project.name)}.png`);

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(fileOf(name, info), encodePng8(out));
}

/** Nearest-neighbour scale by n (whole numbers) or a smooth resize (fractions). */
function scaled(src: Rgba, n: number): Rgba {
  if (!Number.isInteger(n))
    return resize(src, Math.round(src.width * n), Math.round(src.height * n));
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

/** Boots a Bushveld hunt and waits until it runs there with its own layers (HD: the pack in). */
async function huntIn(
  page: Page,
  info: TestInfo,
  gfx: 'standard' | 'hd',
  biome = 'bushveld-winter',
  layout = 'none',
): Promise<void> {
  const base = BASE.replace('biome=bushveld-winter', `biome=${biome}`).replace(
    'layout=none',
    `layout=${layout}`,
  );
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&${base}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  const touch = isTouchProject(info);
  await startHunt(page, touch);
  if (gfx === 'hd')
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

/** Pans (A/D, short presses) until prop `key` is within 80 px of the screen's centre (bounded). */
async function panToProp(page: Page, touch: boolean, key: string): Promise<void> {
  const off = async (): Promise<number | null> => {
    const h = await hook(page);
    const b = h.graphics.bounds.find((x) => x.key === key);
    return b === undefined ? null : b.x + b.w / 2 - h.designWidth / 2;
  };
  for (let k = 0; k < 160; k++) {
    const o = await off();
    if (o !== null && Math.abs(o) <= 80) break;
    // Off screen: the koppie lies east of the opening view.
    const dir = o === null || o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(dir);
    await page.waitForTimeout(o === null || Math.abs(o) > 500 ? 400 : 120);
    await page.keyboard.up(dir);
  }
  const o = await off();
  if (o === null || Math.abs(o) > 80) throw new Error(`pan to ${key}: off by ${o}`);
  await park(page, touch);
}

/** Holds the sim at the next multiple of 300 ticks at least 120 ticks ahead (bounded by ticks). */
async function holdFixed(page: Page, touch: boolean): Promise<void> {
  const at = await page.evaluate(() => {
    const now = window.__TM__?.tick ?? 0;
    const t = Math.ceil((now + 120) / 300) * 300;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  });
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 600_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(1e12);
  });
}

interface Grab {
  img: Rgba;
  k: number;
  w: number;
  bounds: { key: string; x: number; y: number; w: number; h: number }[];
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight, w: h.designWidth, bounds: h.graphics.bounds };
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

/** The middle distance round the koppie (the band from the far veld to the near grass). */
const midBox = (g: Grab): { x: number; y: number; w: number; h: number } => ({
  x: g.w / 2 - Math.min(560, g.w * 0.3),
  y: 560,
  w: Math.min(1120, g.w * 0.6),
  h: 320,
});
/** The far hills and the far veld (above the koppie's top). */
const farBox = (g: Grab): { x: number; y: number; w: number; h: number } => ({
  x: g.w / 2 - Math.min(640, g.w * 0.34),
  y: 430,
  w: Math.min(1280, g.w * 0.68),
  h: 190,
});

function pair(name: string, info: TestInfo): void {
  const before = fileOf(`${name}-before`, info);
  const after = fileOf(`${name}-after`, info);
  if (existsSync(before) && existsSync(after))
    save(
      `${name}-before-after`,
      info,
      sideBySide(decodePng(readFileSync(before)), decodePng(readFileSync(after))),
    );
}

test('the Bushveld: centre, the koppie view, mid-distance and far close-ups (before | after)', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await huntIn(page, info, 'standard');
  await holdFixed(page, touch);
  const centre = await grab(page);
  save(`centre-${VARIANT}`, info, centre.img);
  await release(page);
  await panToProp(page, touch, KOPPIE);
  await holdFixed(page, touch);
  const g = await grab(page);
  save(`koppie-${VARIANT}`, info, g.img);
  save(`mid-${VARIANT}`, info, scaled(cut(g, midBox(g)), 1.5));
  save(`far-${VARIANT}`, info, scaled(cut(g, farBox(g)), 1.5));
  if (VARIANT === 'before') return;
  for (const name of ['centre', 'koppie', 'mid', 'far']) pair(name, info);
});

test('the redrawn rocks: the dassie koppie and the cracked boulder, Standard | HD', async ({
  page,
}, info) => {
  test.skip(VARIANT === 'before', 'this branch only');
  const touch = isTouchProject(info);
  const grabs: Grab[] = [];
  for (const gfx of ['standard', 'hd'] as const) {
    await huntIn(page, info, gfx);
    await panToProp(page, touch, KOPPIE);
    await holdFixed(page, touch);
    grabs.push(await grab(page));
  }
  const [std, hd] = grabs as [Grab, Grab];
  save(
    'koppie-std-hd',
    info,
    scaled(sideBySide(cut(std, propBox(std, KOPPIE)), cut(hd, propBox(hd, KOPPIE))), 2),
  );
  // The cracked boulder is right of the koppie: in view on the wider screens only.
  if (std.bounds.some((b) => b.key === CRACK) && hd.bounds.some((b) => b.key === CRACK))
    save(
      'crack-std-hd',
      info,
      scaled(sideBySide(cut(std, propBox(std, CRACK)), cut(hd, propBox(hd, CRACK))), 2),
    );
});

// --- the tell animals (cue A, D-061) ----------------------------------------------------------

/** This branch's hook field (absent on main), read loosely. */
interface LooseTell {
  readonly species: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly glow: boolean;
}
async function tellsOf(page: Page): Promise<readonly LooseTell[]> {
  return page.evaluate(
    () => (window as unknown as { __TM__?: { tells?: LooseTell[] | null } }).__TM__?.tells ?? [],
  );
}

/** Pans (A/D) until the tell is within 60 px of the screen's centre (bounded). */
async function panToTell(page: Page, touch: boolean, species: string): Promise<void> {
  const off = async (): Promise<number | null> => {
    const t = (await tellsOf(page)).find((x) => x.species === species);
    const w = (await hook(page)).designWidth;
    return t === undefined ? null : t.x - w / 2;
  };
  for (let k = 0; k < 200; k++) {
    const o = await off();
    if (o !== null && Math.abs(o) <= 60) break;
    const dir = o === null || o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(dir);
    await page.waitForTimeout(o === null || Math.abs(o) > 500 ? 400 : 100);
    await page.keyboard.up(dir);
  }
  const o = await off();
  if (o === null || Math.abs(o) > 60) throw new Error(`pan to ${species}: off by ${o}`);
  await park(page, touch);
}

/** Holds the sim on the first tick (within `ticks`) where the tell shows a frame matching `re`. */
async function holdOnFrame(page: Page, species: string, re: string, ticks: number): Promise<void> {
  const ok = await page
    .waitForFunction(
      ([sp, pattern, until]) => {
        const tm = window as unknown as {
          __TM__?: { tick: number; tells?: LooseTell[] | null };
          __TM_HOLD_AT__?: (t: number) => void;
        };
        const t = tm.__TM__?.tells?.find((x) => x.species === sp);
        if (t?.visible === true && t.frame !== null && new RegExp(pattern).test(t.frame)) {
          tm.__TM_HOLD_AT__?.((tm.__TM__?.tick ?? 0) + 1);
          return true;
        }
        return (tm.__TM__?.tick ?? 0) >= until ? 'late' : false;
      },
      [species, re, (await hook(page)).tick + ticks] as const,
      { timeout: 600_000 },
    )
    .then(async (h) => (await h.jsonValue()) === true);
  if (!ok) throw new Error(`${species}: no ${re} frame within ${ticks} ticks`);
  await page.waitForTimeout(1500);
}

/** A crop round the tell's feet (design px box), for close-ups. */
function tellBox(t: LooseTell): { x: number; y: number; w: number; h: number } {
  return { x: t.x - 70, y: t.y - 90, w: 140, h: 110 };
}

const TELL_AREAS: readonly (readonly [string, readonly string[]])[] = [
  ['bushveld-winter', ['fork_tailed_drongo', 'rock_agama', 'striped_skink']],
  ['kalahari-summer', ['lilac_breasted_roller', 'flap_necked_chameleon']],
  ['karoo-autumn', ['rock_kestrel', 'cape_wagtail', 'striped_mouse', 'fiscal_shrike']],
  ['namibie', ['pied_crow']],
  ['okavango-spring', ['malachite_kingfisher', 'red_billed_oxpecker', 'african_jacana']],
];

for (const [biome, species] of TELL_AREAS)
  test(`the tell animals: ${biome}`, async ({ page }, info) => {
    test.skip(VARIANT === 'before', 'this branch only');
    // Two boots (Standard, HD) per tell: up to 15 minutes each on software GL.
    test.setTimeout(species.length * 900_000);
    const touch = isTouchProject(info);
    for (const sp of species) {
      const grabs: Grab[] = [];
      for (const gfx of ['standard', 'hd'] as const) {
        await huntIn(page, info, gfx, biome);
        await page.waitForFunction(
          (want) =>
            (
              (window as unknown as { __TM__?: { tells?: LooseTell[] | null } }).__TM__?.tells ?? []
            ).some((t) => t.species === want && t.frame !== null),
          sp,
          { timeout: 300_000 },
        );
        await panToTell(page, touch, sp);
        // Resting (held), then its action (held), then the sequence.
        await holdOnFrame(page, sp, '_rest$', 600);
        const rest = await grab(page);
        const tr = (await tellsOf(page)).find((t) => t.species === sp);
        if (tr === undefined) throw new Error(`${sp} is gone`);
        if (gfx === 'hd') {
          grabs.push(rest);
          const std = grabs[0];
          if (std !== undefined)
            save(
              `tell-${sp}-std-hd`,
              info,
              scaled(sideBySide(cut(std, tellBox(tr)), cut(rest, tellBox(tr))), 3),
            );
          continue;
        }
        grabs.push(rest);
        save(`tell-${sp}-wide`, info, rest.img);
        save(`tell-${sp}-rest`, info, scaled(cut(rest, tellBox(tr)), 3));
        await release(page);
        await holdOnFrame(page, sp, '_act_[ab]$', 900);
        const act = await grab(page);
        save(`tell-${sp}-act`, info, scaled(cut(act, tellBox(tr)), 3));
        // Three stills 1 s (60 ticks) apart, side by side.
        const seq: Rgba[] = [];
        for (let k = 0; k < 3; k++) {
          await release(page);
          const at = await page.evaluate(() => {
            const t = (window.__TM__?.tick ?? 0) + 60;
            (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
            return t;
          });
          await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, {
            timeout: 600_000,
          });
          await page.waitForTimeout(1200);
          seq.push(scaled(cut(await grab(page), tellBox(tr)), 2));
        }
        const [a, b, c] = seq as [Rgba, Rgba, Rgba];
        save(`tell-${sp}-seq`, info, sideBySide(sideBySide(a, b), c));
      }
    }
  });

test('the tell animals glow on a dusk map (Bushveld Saturday)', async ({ page }, info) => {
  test.skip(VARIANT === 'before', 'this branch only');
  const touch = isTouchProject(info);
  await huntIn(page, info, 'standard', 'bushveld-winter', 'sat');
  await page.waitForFunction(
    () =>
      ((window as unknown as { __TM__?: { tells?: LooseTell[] | null } }).__TM__?.tells ?? []).some(
        (t) => t.species === 'rock_agama' && t.glow,
      ),
    null,
    { timeout: 300_000 },
  );
  await panToTell(page, touch, 'rock_agama');
  await holdOnFrame(page, 'rock_agama', '_(rest|act_[ab])$', 600);
  const g = await grab(page);
  const t = (await tellsOf(page)).find((x) => x.species === 'rock_agama');
  if (t === undefined) throw new Error('no agama');
  save('tell-glow-bushveld', info, g.img);
  save('tell-glow-bushveld-closeup', info, scaled(cut(g, tellBox(t)), 3));
});
