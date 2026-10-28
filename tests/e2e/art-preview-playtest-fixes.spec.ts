// 1.9.2 (D-055) playtest fixes, previews on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-playtest-fixes.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/playtest-<shot>-<device>.png:
//   crate-pan: a falling crate mid-pan (frozen while the pan key is held), its single icon on
//     the canopy: the whole screen and a crop around the crate;
//   crate-std-hd: Standard | HD crops of the falling crate and its icon, same tick (?holdAt), same
//     pan (the hunt's start);
//   reddot-<gun>-before-after: the gun's scope raised at a sky point | the Rooikol's red dot at
//     the same point (the .22 with its small scope, and the Langloop);
//   pickup-<gun>: the pickup card the moment the Rooikol starts;
//   powerups-tab: the Gun Shed's Power-ups tab scrolled to the Rooikol card, and
//   powerups-icon-std-hd: Standard | HD crops of that card.
// The crate before the fix is not shown: the two-tag screen-layer drawing is gone from the code;
// crate-icon.spec.ts checks every frame that the one tag sits on the canopy. On desktop the
// real mouse rests at the bottom centre, outside both edge-pan bands. Each hunt waits until it
// runs in the Karoo with its late group (the icons) in.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { hook, isTouchProject, startHunt } from './helpers';
import { pickUpScoped, rifleSave } from './rooikolHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');

test.use({ serviceWorkers: 'block' });
test.beforeEach(({ browserName }, info) => {
  expect(browserName).toBeDefined();
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow and HD packs have to land.
  test.setTimeout(1_200_000);
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 2400) out = resize(out, 2400, Math.round((out.height * 2400) / out.width));
  writeFileSync(join(OUT, `playtest-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

interface Grab {
  img: Rgba;
  /** Device px per design px, and the canvas's top-left in device px. */
  k: number;
  ox: number;
  oy: number;
}

async function grab(page: Page): Promise<Grab> {
  const h = await hook(page);
  const box = await page.locator('#game canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  const img = decodePng(await page.screenshot());
  const css = page.viewportSize()?.width ?? img.width;
  const dpr = img.width / css;
  return { img, k: (box.height / h.designHeight) * dpr, ox: box.x * dpr, oy: box.y * dpr };
}

type Box = { x: number; y: number; w: number; h: number };

/** The device-px crop of a design rect, clamped to the image. */
function cut(g: Grab, r: Box): Rgba {
  const x0 = Math.max(0, Math.floor(g.ox + r.x * g.k));
  const y0 = Math.max(0, Math.floor(g.oy + r.y * g.k));
  const x1 = Math.min(g.img.width, Math.ceil(g.ox + (r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.ceil(g.oy + (r.y + r.h) * g.k));
  const out = blank(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = ((y0 + y) * g.img.width + (x0 + x)) * 4;
      const di = (y * out.width + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = g.img.data[si + c] ?? 0;
    }
  return out;
}

/** Two images side by side (n× nearest-neighbour), a 12 px white gap. */
function sideBySide(a: Rgba, b: Rgba, n = 1): Rgba {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const out = blank((w * 2 + 12) * n, h * n);
  out.data.fill(255);
  const put = (src: Rgba, left: number): void => {
    for (let y = 0; y < src.height * n; y++)
      for (let x = 0; x < src.width * n; x++) {
        const si = (Math.floor(y / n) * src.width + Math.floor(x / n)) * 4;
        const di = (y * out.width + left * n + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  };
  put(a, 0);
  put(b, w + 12);
  return out;
}

/** A design box of `size` around a point. */
const around = (x: number, y: number, w: number, h: number): Box => ({
  x: x - w / 2,
  y: y - h / 2,
  w,
  h,
});

/** Waits until the hunt runs in the Karoo with the late group (the power-up icons) in. */
async function huntReady(page: Page, hd: boolean): Promise<void> {
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.biome === 'karoo-autumn',
    null,
    { timeout: 180_000 },
  );
  await page.waitForFunction(() => window.__TM__?.assets.lateDone['karoo-autumn'] === true, null, {
    timeout: 180_000,
  });
  if (hd)
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 180_000,
    });
}

/** A returning player's save (quality high: the render scale is 1 on every profile). */
async function plainSave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
      }),
    );
  });
}

test('a falling crate mid-pan: one icon on its canopy', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await plainSave(page);
  await page.goto(
    '/?e2e=1&capture=1&layout=none&feesdag=none&seed=7&huntSeconds=90&ftue=0&graphics=standard&crate=blitslaai',
  );
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 180_000 });
  await startHunt(page, touch);
  await huntReady(page, false);
  await park(page, touch);
  await page.waitForFunction(() => window.__TM__?.crateSpots[0]?.drawn?.tag != null, null, {
    timeout: 180_000,
  });
  // Pan towards the side the crate is not on (it stays in view), freeze while the key is held.
  const h = await hook(page);
  const spot = h.crateSpots[0];
  const key = spot !== undefined && spot.x > h.designWidth / 2 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key);
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__TM__?.capture?.frozen === true, null, {
    timeout: 30_000,
  });
  await page.keyboard.up(key);
  await page.waitForTimeout(600);
  const g = await grab(page);
  const d = (await hook(page)).crateSpots[0]?.drawn;
  expect(d?.tags).toBe(1);
  save('crate-pan', info, g.img);
  if (d?.tag != null) save('crate-pan-crop', info, cut(g, around(d.tag.x, d.tag.y + 60, 360, 360)));
});

test('the falling crate and its icon: Standard | HD, same tick', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await plainSave(page);
  const shots: { g: Grab; tag: { x: number; y: number } }[] = [];
  for (const graphics of ['standard', 'hd'] as const) {
    await page.goto(
      `/?e2e=1&layout=none&feesdag=none&seed=7&huntSeconds=60&ftue=0&graphics=${graphics}&crate=blitslaai&holdAt=300`,
    );
    await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 180_000 });
    await startHunt(page, touch);
    await huntReady(page, graphics === 'hd');
    await park(page, touch);
    await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 300, null, {
      timeout: 180_000,
    });
    await page.waitForTimeout(1500);
    const d = (await hook(page)).crateSpots[0]?.drawn;
    if (d?.tag == null) throw new Error(`${graphics}: no crate tag at tick 300`);
    shots.push({ g: await grab(page), tag: d.tag });
  }
  const [std, hd] = shots;
  if (std === undefined || hd === undefined) throw new Error('missing a run');
  expect(hd.tag.x).toBeCloseTo(std.tag.x, 1);
  const box = around(std.tag.x, std.tag.y + 60, 300, 300);
  save('crate-std-hd', info, sideBySide(cut(std.g, box), cut(hd.g, box), 2));
});

for (const g of [
  { gun: 'twee_twee', sight: 'scope_small' },
  { gun: 'langloop', sight: 'scope_var' },
] as const)
  test(`red dot with ${g.gun}: scope | red dot, and the pickup card`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await rifleSave(page, g.gun, g.sight);
    await page.goto(
      '/?e2e=1&layout=none&feesdag=none&seed=7&huntSeconds=120&ftue=0&graphics=standard&crate=rooikol',
    );
    await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 180_000 });
    await startHunt(page, touch);
    await huntReady(page, false);
    await park(page, touch);
    const h = await hook(page);
    const at = { x: h.designWidth * 0.5, y: h.designHeight * 0.3 };
    const press = async (kind: 'pointerdown' | 'pointerup', id: number): Promise<void> => {
      await page.evaluate(
        ([k, x, y, pid, isTouch]) => {
          const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
          const tm = window.__TM__;
          if (!canvas || !tm) throw new Error('game not booted');
          const r = canvas.getBoundingClientRect();
          canvas.dispatchEvent(
            new PointerEvent(k, {
              clientX: r.left + (x / tm.designWidth) * r.width,
              clientY: r.top + ((y + (isTouch ? tm.aimOffsetPx : 0)) / tm.designHeight) * r.height,
              pointerId: pid,
              pointerType: isTouch ? 'touch' : 'mouse',
              isPrimary: true,
              button: 0,
              buttons: k === 'pointerup' ? 0 : 1,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        [kind, at.x, at.y, id, touch] as const,
      );
    };
    // Before: the gun's own scope, fully up.
    await press('pointerdown', 501);
    await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(400);
    const before = await grab(page);
    await press('pointerup', 501);
    // The Rooikol: picked up through the sight; the card shows at once.
    await pickUpScoped(page, touch, 'rooikol');
    save(`pickup-${g.gun}`, info, (await grab(page)).img);
    await page.waitForFunction(() => (window.__TM__?.cooldownTicks ?? 1) === 0, null, {
      timeout: 60_000,
    });
    // After: the red dot at the same point (up at once, no zoom).
    await press('pointerdown', 502);
    await page.waitForFunction(() => window.__TM__?.zoom.picture === 'red_dot', null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(300);
    const after = await grab(page);
    expect((await hook(page)).zoom.z).toBe(1);
    await press('pointerup', 502);
    const half = (img: Rgba): Rgba =>
      resize(img, Math.round(img.width / 2), Math.round(img.height / 2));
    save(`reddot-${g.gun}-before-after`, info, sideBySide(half(before.img), half(after.img)));
    save(`reddot-${g.gun}`, info, after.img);
  });

test('the Gun Shed Power-ups tab: the Rooikol card, Standard | HD icon', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await plainSave(page);
  const crops: Rgba[] = [];
  for (const graphics of ['standard', 'hd'] as const) {
    await page.goto(`/?e2e=1&layout=none&feesdag=none&seed=42&ftue=0&graphics=${graphics}`);
    await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 180_000 });
    await page.waitForFunction(
      () => window.__TM__?.assets.lateDone['karoo-autumn'] === true,
      null,
      {
        timeout: 180_000,
      },
    );
    if (graphics === 'hd')
      await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
        timeout: 180_000,
      });
    await park(page, touch);
    const tap = async (id: string): Promise<void> => {
      await page.waitForFunction((r) => window.__TM__?.rects[r] !== undefined, id, {
        timeout: 60_000,
      });
      const r = (await hook(page)).rects[id];
      if (r === undefined) throw new Error(`no ${id}`);
      const box = await page.locator('#game canvas').boundingBox();
      const h = await hook(page);
      if (box === null) throw new Error('no canvas');
      const x = box.x + ((r.x + r.w / 2) / h.designWidth) * box.width;
      const y = box.y + ((r.y + r.h / 2) / h.designHeight) * box.height;
      if (touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    };
    await tap('shed');
    await tap('shed.powerups');
    await page.waitForFunction(() => (window.__TM__?.shedPowerups?.cards.length ?? 0) > 0, null, {
      timeout: 60_000,
    });
    // Scroll until the Rooikol card is fully on screen (wheel; touch drags).
    for (let i = 0; i < 20; i++) {
      const h = await hook(page);
      const r = h.rects['shed.powerup.rooikol'];
      if (r !== undefined && r.y >= 0 && r.y + r.h <= h.designHeight * 0.95) break;
      await page.evaluate((isTouch) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const tm = window.__TM__;
        if (!canvas || !tm) throw new Error('game not booted');
        const b = canvas.getBoundingClientRect();
        const cx = b.left + b.width * 0.5;
        const cy = b.top + b.height * 0.6;
        if (!isTouch) {
          canvas.dispatchEvent(
            new WheelEvent('wheel', { clientX: cx, clientY: cy, deltaY: 200, bubbles: true }),
          );
          return;
        }
        const at = (y: number): PointerEventInit => ({
          clientX: cx,
          clientY: y,
          pointerId: 77,
          pointerType: 'touch',
          isPrimary: true,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        });
        canvas.dispatchEvent(new PointerEvent('pointerdown', at(cy)));
        for (let k = 1; k <= 8; k++)
          canvas.dispatchEvent(new PointerEvent('pointermove', at(cy - k * 20)));
        window.dispatchEvent(new PointerEvent('pointerup', { ...at(cy - 160), buttons: 0 }));
      }, touch);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(800);
    const g = await grab(page);
    const r = (await hook(page)).rects['shed.powerup.rooikol'];
    if (r === undefined) throw new Error('no Rooikol card');
    if (graphics === 'standard') save('powerups-tab', info, g.img);
    crops.push(cut(g, { x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 }));
  }
  const [std, hd] = crops;
  if (std === undefined || hd === undefined) throw new Error('missing a run');
  save('powerups-icon-std-hd', info, sideBySide(std, hd));
});
