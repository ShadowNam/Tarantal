// D-064: Christmas in the sun on desktop, Pixel 7 and iPhone 14 landscape, forced with
// `?feesdag=christmas` (the date logic is unit-tested; the boot's day is 25 Dec as well): the
// title's badge with Oupa in his Santa hat beside it; a hunt in the sun with the tinsel tree, the
// heat shimmer and the presents drawn on the canvas (pixels, with and without them at one held
// tick); a present shot open, then the other — Presents found! +25 and Oupa's lines; the tally's
// Christmas frame and the share card's "Christmas in the sun 2026"; with Oupa's comments Off no
// Christmas line is shown or voiced; and each special loads only its own lazy files.
// ?presents=near puts the day's two presents either side of the tinsel tree; ?birds=0 keeps
// flocks from standing in front of them. Shots are in-page pointer events (feesdaeHelpers.fireAt).
import { expect, test, type Page } from '@playwright/test';
import { decodePng, type Rgba } from '../../tools/assets/image';
import { loadContent } from '../../tools/testContent';
import {
  hideXmas,
  holdNow,
  presentInView,
  release,
  shootPresentOpen,
  xmasRunning,
  xmasSheetIn,
} from './christmasHelpers';
import { spookRunning, tapRectInPage } from './feesdaeHelpers';
import { boot, collectErrors, hook, isLandscape, isTouchProject, tapRect } from './helpers';

const CHRISTMAS = loadContent().feesdae.specials.find((f) => f.id === 'christmas');
if (CHRISTMAS === undefined) throw new Error('no christmas in feesdae.json');
const B = CHRISTMAS.barks;
const XMAS_LINES = [B.start, B.present, B.presentsFound, B.dry, B.end].filter(
  (l): l is string => l !== undefined,
);
const PLANE_MID = loadContent().scoring.planes.mid.scale;
// The boot's day is Christmas itself; `layout=none` keeps boot() from forcing a Classic layout.
const DAY = 'today=2026-12-25&layout=none&baboons=0&palms=0';
const QUERY = `feesdag=christmas&seed=42&omen=0&graphics=standard&${DAY}`;

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test.use({ serviceWorkers: 'block' });

async function seedSave(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({ v: 1, settings: s, ftue: { done: true, skipped: false, step: '' } }),
      );
  }, settings);
}

/** No share sheet; the clipboard records what it was given (the desktop fallback path). */
async function stubClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
}

/** Pixels (design px) that change when the presents and tinsel are hidden, in a rect. */
function changed(on: Rgba, off: Rgba, k: number, r: R): { n: number; area: number; cx: number } {
  let n = 0;
  let sx = 0;
  let area = 0;
  for (let y = r.y; y <= r.y + r.h; y++)
    for (let x = r.x; x <= r.x + r.w; x++) {
      const px = Math.round(x * k);
      const py = Math.round(y * k);
      if (px < 0 || py < 0 || px >= on.width || py >= on.height) continue;
      area++;
      const i = (py * on.width + px) * 4;
      const d =
        Math.abs((on.data[i] ?? 0) - (off.data[i] ?? 0)) +
        Math.abs((on.data[i + 1] ?? 0) - (off.data[i + 1] ?? 0)) +
        Math.abs((on.data[i + 2] ?? 0) - (off.data[i + 2] ?? 0));
      if (d > 40) {
        n++;
        sx += x;
      }
    }
  return { n, area, cx: n === 0 ? NaN : sx / n };
}

async function startDaily(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'daily');
}

test.describe('Feesdae: Christmas in the sun (D-064)', () => {
  test('badge and Oupa, a hunt in the sun, presents drawn and opened, Presents found!, the framed tally', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    // Title, a 40-s hunt with the sheet's lazy load, two presents and the tally: about 5 min on
    // CI's slowest profile.
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await stubClipboard(page);
    await seedSave(page, { quality: 'medium' });
    await boot(page, `${QUERY}&huntSeconds=40&birds=0&presents=near`);
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
      timeout: 60_000,
    });
    let h = await hook(page);
    expect(h.feesdag).toEqual({ id: 'christmas', badge: 'Christmas in the sun!' });
    const badge = h.rects['dailyBadge'];
    const status = h.rects['dailyStatus'];
    const button = h.rects['daily'];
    expect(badge).toBeDefined();
    if (badge !== undefined && status !== undefined) {
      expect(status.x).toBeGreaterThanOrEqual(badge.x);
      expect(status.x + status.w).toBeLessThanOrEqual(badge.x + badge.w);
    }
    if (badge !== undefined && button !== undefined) expect(overlaps(badge, button)).toBe(false);
    // Oupa in his Santa hat waves beside the badge once Christmas's lazy group is in; he covers
    // no button, status line or the hint.
    await page.waitForFunction(() => window.__TM__?.rects['dailyOupa'] !== undefined, null, {
      timeout: 120_000,
    });
    h = await hook(page);
    const oupa = h.rects['dailyOupa'];
    for (const id of [
      'shed',
      'daily',
      'harvest',
      'run',
      'settings',
      'titleHint',
      'harvestStatus',
      'runStatus',
      'dailyStatus',
      'dailyBadge',
    ]) {
      const r = h.rects[id];
      if (oupa !== undefined && r !== undefined) expect(overlaps(oupa, r), id).toBe(false);
    }

    await tapRect(page, touch, 'daily');
    await xmasRunning(page);
    h = await hook(page);
    expect(h.mode).toBe('daily');
    expect(h.map?.lights).toEqual([CHRISTMAS.light]);
    expect(h.hudTag).toMatch(/^Christmas in the sun · DAILY #\d+$/);
    expect(h.spook?.presentsTotal).toBe(2);
    expect(h.spook?.tinsel?.prop).not.toBeNull();
    expect(h.spook?.tinsel?.garlands ?? 0).toBeGreaterThan(0);
    expect(h.spook?.heat ?? 0).toBeGreaterThan(0);
    // Oupa opens Christmas (his lines are kept in the hook's log), his Santa-hat face on the
    // bubble inside the screen (read in the frame that shows it).
    const face = await page.waitForFunction(
      (line) => {
        const g = window.__TM__;
        const r = g?.rects['barkPortrait'];
        const text = g?.rects['barkLine'];
        if (g === undefined || !g.barks.includes(line)) return null;
        return r === undefined || text === undefined
          ? null
          : { r, text, w: g.designWidth, h: g.designHeight };
      },
      B.start,
      { timeout: 120_000 },
    );
    const fr = (await face.jsonValue()) as { r: R; text: R; w: number; h: number };
    // His face sits in the name row: it never covers the line's first letters.
    expect(overlaps(fr.r, fr.text), "Oupa's face over the line").toBe(false);
    expect(fr.r.x).toBeGreaterThanOrEqual(0);
    expect(fr.r.y).toBeGreaterThanOrEqual(0);
    expect(fr.r.x + fr.r.w).toBeLessThanOrEqual(fr.w);
    expect(fr.r.y + fr.r.h).toBeLessThanOrEqual(fr.h);

    // The delivered sheet, then a present in view: its box is really drawn (pixels change where
    // it stands when the presents are hidden at the same held tick).
    await xmasSheetIn(page);
    const id = await presentInView(page);
    await holdNow(page);
    const spot = await page.evaluate(
      (pid) => window.__TM__?.spook?.things.find((t) => t.id === pid) ?? null,
      id,
    );
    expect(spot?.frame ?? '').toMatch(/^present_[abc]_shut$/);
    const grab = async (): Promise<Rgba> =>
      decodePng(await page.locator('#game canvas').screenshot());
    const on = await grab();
    await hideXmas(page, true);
    const off = await grab();
    await hideXmas(page, false);
    const k = on.height / h.designHeight;
    if (spot !== null) {
      const half = 60 * PLANE_MID;
      const box = { x: spot.x - half, y: spot.y - half, w: half * 2, h: 100 * PLANE_MID };
      const c = changed(on, off, k, box);
      // A box partly behind its prop: a good share of its rect changes, centred on the present.
      expect(c.n / Math.max(1, c.area)).toBeGreaterThan(0.25);
      expect(Math.abs(c.cx - spot.x)).toBeLessThan(half);
    }
    await release(page);

    expect(await shootPresentOpen(page, touch, id)).toBe(true);
    h = await hook(page);
    expect(h.spook?.presentsClosed).toBe(1);
    expect(h.spook?.things.find((t) => t.id === id)?.frame ?? '').toMatch(/_open$/);
    await page.waitForFunction(
      (line) => window.__TM__?.barks.includes(line) === true,
      B.present ?? '',
      { timeout: 30_000 },
    );

    const id2 = await presentInView(page);
    expect(id2).not.toBe(id);
    expect(await shootPresentOpen(page, touch, id2)).toBe(true);
    // Presents found! +25, once, and Oupa's line for it (read where the hook keeps them).
    await page.waitForFunction(
      (line) => window.__TM__?.spook?.tinsel?.found === 25 && window.__TM__.barks.includes(line),
      B.presentsFound ?? '',
      { timeout: 60_000 },
    );

    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, {
      timeout: 300_000,
    });
    h = await hook(page);
    expect(h.tally).toMatchObject({ frame: 'christmas', share: true });
    expect(h.tally?.title).toMatch(/^Christmas in the sun \d{4}$/);
    const head = h.rects['tallyMoon'];
    const tag = h.rects['tallyTag'];
    expect(head).toBeDefined();
    if (head !== undefined && tag !== undefined) expect(overlaps(head, tag)).toBe(false);
    // Oupa's head and the present on the frame: on screen, clear of the buttons.
    for (const piece of [head, h.rects['tallyPresent']]) {
      expect(piece).toBeDefined();
      if (piece === undefined) continue;
      expect(piece.x).toBeGreaterThanOrEqual(0);
      expect(piece.y).toBeGreaterThanOrEqual(0);
      expect(piece.x + piece.w).toBeLessThanOrEqual(h.designWidth);
      expect(piece.y + piece.h).toBeLessThanOrEqual(h.designHeight);
      for (const id of ['again', 'menu', 'share']) {
        const b = h.rects[id];
        if (b !== undefined) expect(overlaps(piece, b), id).toBe(false);
      }
    }
    await tapRectInPage(page, touch, 'share');
    await page.waitForFunction(() => window.__TM__?.lastShare != null, null, { timeout: 30_000 });
    h = await hook(page);
    expect(h.lastShare?.text).toMatch(
      /^✨🎁 🐦 Tarantal Madness · Christmas in the sun \d{4} · Daily #\d+/,
    );
    expect(h.lastShare?.text).toContain('🎅☀️');
    expect(errors).toEqual([]);
  });

  test("Oupa's comments Off: no Christmas line is shown or voiced", async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await seedSave(page, { oupa: 'off' });
    await boot(page, `${QUERY}&huntSeconds=40&presents=near`);
    await startDaily(page, touch);
    await xmasRunning(page);
    // Every frame up to tick 600 (past the idle wait, so the dry-spell line would be due): no
    // bubble, no line recorded, no voice played.
    const r = await page.waitForFunction(
      () => {
        const h = window.__TM__;
        if (!h) return null;
        const w = window as unknown as { __ob?: { bubble: boolean } };
        const s = (w.__ob ??= { bubble: false });
        if (h.bark !== null) s.bubble = true;
        return h.tick >= 600 || h.over
          ? { ...s, barks: [...h.barks], voice: [...h.voice.played], oupa: h.voice.oupa }
          : null;
      },
      null,
      { timeout: 300_000 },
    );
    const seen = (await r.jsonValue()) as {
      bubble: boolean;
      barks: string[];
      voice: string[];
      oupa: boolean;
    };
    expect(seen.oupa).toBe(false);
    expect(seen.bubble).toBe(false);
    expect(seen.barks.filter((l) => XMAS_LINES.includes(l))).toEqual([]);
    expect(seen.voice.filter((v) => XMAS_LINES.some((l) => v.endsWith(l)))).toEqual([]);
    expect(errors).toEqual([]);
  });

  for (const special of ['halloween', 'christmas'] as const)
    test(`a ${special} hunt loads only its own special's files`, async ({ page }, info) => {
      test.skip(!isLandscape(info), 'portrait shows the rotate card');
      test.setTimeout(600_000);
      const touch = isTouchProject(info);
      const errors = collectErrors(page);
      const urls: string[] = [];
      page.on('request', (r) => urls.push(r.url()));
      await seedSave(page, { quality: 'medium' });
      await boot(page, `${QUERY.replace('christmas', special)}&huntSeconds=30`);
      await startDaily(page, touch);
      if (special === 'christmas') {
        await xmasRunning(page);
        await xmasSheetIn(page);
      } else {
        await spookRunning(page);
        await page.waitForFunction(() => window.__TM__?.spook?.final === true, null, {
          timeout: 180_000,
        });
      }
      // Give the background loads (sounds, Oupa's lines) a moment to finish too.
      const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
      await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 240, t0, {
        timeout: 120_000,
      });
      const halloween = urls.filter(
        (u) => /\/assets\/feesdae\//.test(u) || /\/assets\/feesdae-voice-[a-z]{2}\//.test(u),
      );
      const christmas = urls.filter((u) => /feesdae-(voice-)?christmas/.test(u));
      if (special === 'christmas') {
        expect(halloween).toEqual([]);
        expect(christmas.length).toBeGreaterThan(0);
      } else {
        expect(christmas).toEqual([]);
        expect(halloween.length).toBeGreaterThan(0);
      }
      expect(errors).toEqual([]);
    });
});
