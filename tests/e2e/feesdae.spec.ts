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
  reloadIfEmpty,
  shootLanternOut,
  spookRunning,
  tapRectInPage,
} from './feesdaeHelpers';

const HALLOWEEN = loadContent().feesdae.specials.find((f) => f.id === 'halloween');
if (HALLOWEEN === undefined) throw new Error('no halloween in feesdae.json');
const B = HALLOWEEN.barks;
const SPOOK_LINES = [B.start, B.bat, B.owl, B.lanternsOut, B.end];
// No weather (the Daily's wind would drift the far shots), a short hunt.
// 1.9.3 (D-056, review M20): palms=0 — the Daily's map (its seed follows the content hash) may
// have makalani palms, whose nuts hang where the owls and bats fly: a pattern that hits the owl
// also cracks a nut or two (−10 + 5 a nut), and the lantern and bat counts move the same way.
// These tests are about the Spookjag, not the palms (makalani.spec covers those).
// DAY: the Spookjag plays the Daily's map, and the Daily's biome and layout change with the UTC
// day. Without a fixed day the owl test passed on 28 Oct and timed out on 29 Oct (another map,
// so the owls flew elsewhere). 2026-10-28 is the day the 1.9.5 full CI passed on. `layout=none`
// keeps what boot() adds when no day is given (it only touches Classic hunts).
const DAY = 'today=2026-10-28&layout=none&baboons=0';
const QUERY = `feesdag=halloween&seed=42&omen=0&huntSeconds=40&palms=0&${DAY}`;

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
    // The badge is the pill behind the Daily's status line: it holds the line and covers neither
    // the Daily button nor the hint line under the buttons (the map line is gone on a special day).
    const badge = h.rects['dailyBadge'];
    const status = h.rects['dailyStatus'];
    const button = h.rects['daily'];
    const hint = h.rects['titleHint'];
    expect(badge).toBeDefined();
    expect(status).toBeDefined();
    if (badge !== undefined && status !== undefined) {
      expect(status.x).toBeGreaterThanOrEqual(badge.x);
      expect(status.x + status.w).toBeLessThanOrEqual(badge.x + badge.w);
      expect(status.y).toBeGreaterThanOrEqual(badge.y);
      expect(status.y + status.h).toBeLessThanOrEqual(badge.y + badge.h);
    }
    if (badge !== undefined && button !== undefined) expect(overlaps(badge, button)).toBe(false);
    if (badge !== undefined && hint !== undefined) expect(overlaps(badge, hint)).toBe(false);
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

  // No birds or crates (nothing else scores), two owls early in the hunt (?spook=early). Their
  // times and lanes follow the Daily's seed, which follows the content hash, so the two owls can
  // cross together: each half below plays its own hunt and needs only the first owl.
  async function owlHunt(page: Page, touch: boolean): Promise<void> {
    await seedSave(page, { quality: 'medium' });
    await boot(
      page,
      `feesdag=halloween&seed=42&omen=0&huntSeconds=60&birds=0&spook=early&palms=0&${DAY}`,
    );
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
      timeout: 60_000,
    });
    await tapRect(page, touch, 'daily');
    await spookRunning(page);
  }

  test('an owl that crosses unhit costs nothing', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await owlHunt(page, touch);
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
    expect(errors).toEqual([]);
  });

  test('a shot owl is −10 and Oupa scolds', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await owlHunt(page, touch);
    await page.waitForFunction(
      () => (window.__TM__?.spook?.things ?? []).some((t) => t.kind === 'owl'),
      null,
      { timeout: 120_000 },
    );
    // Pan towards the owl until it is well inside the view, fire in-page.
    // A seeded hunt's pellet patterns are the same every run for the same content (the Daily's
    // seed follows the content hash), so a shot can miss: it gets many shots, a miss is decided
    // 20 ticks after the shot (no long wait while the owl flies off), the gun is reloaded when
    // empty, and it waits while a bat crosses near the owl (a bat in front takes the pellets).
    // `score` is the change the shot made, so a bat hit earlier doesn't spoil the count.
    let hit: { score: number; bark: boolean } | null = null;
    for (let i = 0; i < 200 && hit === null; i++) {
      await reloadIfEmpty(page, touch);
      const owl = await page.evaluate(() => {
        const g = window.__TM__;
        const things = g?.spook?.things ?? [];
        const o = things.find((t) => t.kind === 'owl');
        if (g === undefined || o === undefined) return null;
        const batNear = things.some(
          (t) => t.kind === 'bat' && Math.abs(t.x - o.x) < 280 && Math.abs(t.y - o.y) < 220,
        );
        return { id: o.id, x: o.x, w: g.designWidth, batNear };
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
      if (owl.batNear) {
        await page.waitForTimeout(120);
        continue;
      }
      const before = await fireAt(page, touch, { id: owl.id });
      if (before === null) continue;
      const out = await page
        .waitForFunction(
          ([n, s0]) => {
            const g = window.__TM__;
            if (g === undefined || g.shots <= n) return null;
            const w = window as unknown as { __owlShotTick?: number };
            w.__owlShotTick ??= g.tick;
            if (g.score !== s0) return g.score - s0;
            return g.tick - w.__owlShotTick >= 20 ? 'miss' : null;
          },
          [before.shots, before.score] as const,
          { timeout: 20_000 },
        )
        .then((h) => h.jsonValue())
        .catch(() => null);
      await page.evaluate(() => {
        delete (window as unknown as { __owlShotTick?: number }).__owlShotTick;
      });
      if (out !== -10) continue;
      // Oupa's scold (his lines are kept in the hook's log, so a later read still sees it).
      const bark = await page
        .waitForFunction(
          (line) => window.__TM__?.barks.includes(line) === true,
          HALLOWEEN.barks.owl,
          {
            timeout: 15_000,
          },
        )
        .then(() => true)
        .catch(() => false);
      hit = { score: out, bark };
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
