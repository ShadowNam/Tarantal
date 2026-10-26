// D-048: the Halloween Spookjag Daily on desktop, Pixel 7 and iPhone 14 landscape, forced with
// `?feesdag=halloween` (the real date logic is unit-tested): the title's badge; a dusk hunt with
// lanterns and a bat; a lantern shot dark (in-page pointer events); Oupa's opening line; the
// tally's Halloween frame and the share card's "Spookjag 2026"; with Oupa's comments Off no
// Halloween line is shown or voiced. Transient hook values are read in the same waitForFunction
// that sees them.
import { expect, test, type Page } from '@playwright/test';
import { loadContent } from '../../tools/testContent';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  tapRect,
} from './helpers';
import {
  fireAt,
  lanternInView,
  shootLanternOut,
  spookRunning,
  tapRectInPage,
} from './feesdaeHelpers';

const HALLOWEEN = loadContent().feesdae.specials.find((f) => f.id === 'halloween');
if (HALLOWEEN === undefined) throw new Error('no halloween in feesdae.json');
const B = HALLOWEEN.barks;
const SPOOK_LINES = [B.start, B.bat, B.owl, B.lanternsOut, B.end];
// No weather (the Daily's wind would drift the far shots), a short hunt.
const QUERY = 'feesdag=halloween&seed=42&omen=0&huntSeconds=40';

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

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
    const copied: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = copied;
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          copied.push(t);
          return Promise.resolve();
        },
      },
    });
  });
}

test.describe('Feesdae: the Halloween Spookjag (D-048)', () => {
  test('badge, a dusk hunt with lanterns and a bat, a lantern shot dark, the framed tally', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await stubClipboard(page);
    await seedSave(page, { quality: 'medium' });
    await boot(page, QUERY);
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
      timeout: 60_000,
    });
    let h = await hook(page);
    expect(h.feesdag).toEqual({ id: 'halloween', badge: 'Spookjag tonight!' });
    // The badge covers neither the Daily's status line nor (gone on a special day) the map line.
    const badge = h.rects['dailyBadge'];
    const status = h.rects['dailyStatus'];
    expect(badge).toBeDefined();
    expect(status).toBeDefined();
    if (badge !== undefined && status !== undefined) expect(overlaps(badge, status)).toBe(false);
    await page.screenshot({ path: `${SCREENSHOTS}/feesdae-title-${info.project.name}.png` });

    await tapRect(page, touch, 'daily');
    await spookRunning(page);
    h = await hook(page);
    expect(h.mode).toBe('daily');
    expect(h.map?.lights).toEqual([HALLOWEEN.light]);
    expect(h.hudTag).toMatch(/^Spookjag · DAILY #\d+$/);
    const lanterns = h.spook?.things.filter((t) => t.kind === 'lantern') ?? [];
    expect(lanterns.length).toBeGreaterThanOrEqual(HALLOWEEN.twist.lanterns.count[0]);
    expect(lanterns.length).toBeLessThanOrEqual(HALLOWEEN.twist.lanterns.count[1]);
    // Oupa opens the Spookjag (read with the hook frame that has it).
    await page.waitForFunction(
      (line) => window.__TM__?.barks.includes(line) === true,
      HALLOWEEN.barks.start,
      { timeout: 120_000 },
    );
    // A bat comes over (bats fly from the first seconds).
    await page.waitForFunction(
      () => window.__TM__?.spook?.things.some((t) => t.kind === 'bat') === true,
      null,
      { timeout: 180_000 },
    );

    const id = await lanternInView(page);
    expect(await shootLanternOut(page, touch, id)).toBe(true);
    h = await hook(page);
    expect(h.spook?.lanternsLit).toBe((h.spook?.lanternsTotal ?? 0) - 1);
    await page.screenshot({ path: `${SCREENSHOTS}/feesdae-hunt-${info.project.name}.png` });

    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, {
      timeout: 300_000,
    });
    h = await hook(page);
    expect(h.tally).toMatchObject({ frame: 'halloween', share: true });
    expect(h.tally?.title).toMatch(/^Spookjag \d{4}$/);
    const moon = h.rects['tallyMoon'];
    const tag = h.rects['tallyTag'];
    expect(moon).toBeDefined();
    if (moon !== undefined && tag !== undefined) expect(overlaps(moon, tag)).toBe(false);
    await page.screenshot({ path: `${SCREENSHOTS}/feesdae-tally-${info.project.name}.png` });
    // In-page: after a held arrow key, a page.touchscreen tap does not land on WebKit's iPhone.
    await tapRectInPage(page, touch, 'share');
    await page.waitForFunction(() => window.__TM__?.lastShare != null, null, { timeout: 30_000 });
    h = await hook(page);
    expect(h.lastShare?.text).toMatch(/^🎃🦇 🐦 Tarantal Madness · Spookjag \d{4} · Daily #\d+/);
    expect(h.lastShare?.text).toContain('🦇🌕');
    expect(h.lastShare?.url).toContain('?c=');
    expect(errors).toEqual([]);
  });

  test('an owl that crosses unhit costs nothing; a shot owl is −10 and Oupa scolds', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await seedSave(page, { quality: 'medium' });
    // No birds or crates (nothing else scores), two owls early in the hunt (?spook=early).
    await boot(page, 'feesdag=halloween&seed=42&omen=0&huntSeconds=60&birds=0&spook=early');
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
      timeout: 60_000,
    });
    await tapRect(page, touch, 'daily');
    await spookRunning(page);
    // An owl crosses the view (in, then out again) with nothing fired: the score stays 0.
    const crossed = await page.waitForFunction(
      () => {
        const g = window.__TM__;
        const w = window as unknown as { __owlIn?: number };
        if (g === undefined) return null;
        const inView = (x: number): boolean => x > 0 && x < g.designWidth;
        const owls = (g.spook?.things ?? []).filter((t) => t.kind === 'owl');
        if (w.__owlIn === undefined) {
          const o = owls.find((t) => inView(t.x));
          if (o !== undefined) w.__owlIn = o.id;
          return null;
        }
        const o = owls.find((t) => t.id === w.__owlIn);
        return o === undefined || !inView(o.x) ? { score: g.score, shots: g.shots } : null;
      },
      null,
      { timeout: 300_000 },
    );
    expect(await crossed.jsonValue()).toEqual({ score: 0, shots: 0 });
    // Then an owl is shot: pan towards one until it is well inside the view, fire in-page.
    let hit: { score: number; bark: boolean } | null = null;
    for (let i = 0; i < 120 && hit === null; i++) {
      const owl = await page.evaluate(() => {
        const g = window.__TM__;
        const o = g?.spook?.things.find((t) => t.kind === 'owl');
        return g === undefined || o === undefined ? null : { id: o.id, x: o.x, w: g.designWidth };
      });
      if (owl === null) {
        await page.waitForTimeout(250);
        continue;
      }
      if (owl.x < 200 || owl.x > owl.w - 200) {
        const key = owl.x < 200 ? 'ArrowLeft' : 'ArrowRight';
        await page.keyboard.down(key);
        await page.waitForTimeout(350);
        await page.keyboard.up(key);
        continue;
      }
      const before = await fireAt(page, touch, { id: owl.id });
      if (before === null) continue;
      // The score and Oupa's scold, read in the same frame that has both.
      hit = await page
        .waitForFunction(
          ([n, line]) => {
            const g = window.__TM__;
            if (g === undefined || g.shots <= n) return null;
            return g.score === -10 && g.barks.includes(line)
              ? { score: g.score, bark: true }
              : null;
          },
          [before.shots, HALLOWEEN.barks.owl] as const,
          { timeout: 15_000 },
        )
        .then(async (r) => (await r.jsonValue()) as { score: number; bark: boolean })
        .catch(() => null);
    }
    expect(hit).toEqual({ score: -10, bark: true });
    expect(errors).toEqual([]);
  });

  test("Oupa's comments Off: no Halloween line is shown or voiced", async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await seedSave(page, { oupa: 'off' });
    await boot(page, QUERY);
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
      timeout: 60_000,
    });
    await tapRect(page, touch, 'daily');
    await spookRunning(page);
    // Every frame up to tick 600: no bubble, no line recorded, no voice played.
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
    expect(seen.barks.filter((l) => SPOOK_LINES.includes(l))).toEqual([]);
    expect(seen.voice.filter((v) => SPOOK_LINES.some((l) => v.endsWith(l)))).toEqual([]);
    expect(errors).toEqual([]);
  });
});
