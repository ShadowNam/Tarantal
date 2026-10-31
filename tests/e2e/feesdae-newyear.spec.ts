// D-065: the New Year countdown on desktop, Pixel 7 and iPhone 14 landscape, forced with
// `?feesdag=newyear` (the date logic is unit-tested; the boot's day is 31 Dec as well): the
// title's badge with Oupa in his party hat beside it, clear of every title rect; a hunt at dusk
// with fireworks drawn on the canvas (pixels, with and without them at one held tick), never more
// than 3 bursts a second and no frame much brighter than the same frame without them; the big
// countdown in the last 10 s inside the safe area and clear of every HUD rect, with its ×2 tag; a
// bag in the countdown scoring ×2 (on top of the Stampede); the tally's "Happy New Year!" and its
// frame, and the share card's "New Year 2027"; with Oupa's comments Off no New Year line is shown
// or voiced; and each special loads only its own lazy files.
// ?fireworks=max puts a burst in every slot (3 a second, the most the rule allows).
import { expect, test, type Page } from '@playwright/test';
import { decodePng, type Rgba } from '../../tools/assets/image';
import { loadContent } from '../../tools/testContent';
import feel from '../../content/client/feel.json' with { type: 'json' };
import { tapRectInPage } from './feesdaeHelpers';
import { boot, collectErrors, hook, isLandscape, isTouchProject, tapRect } from './helpers';
import { bagInCountdown, countdownOn, hideNy, nyRunning, nySheetIn } from './newyearHelpers';
import { release } from './christmasHelpers';

const NEW_YEAR = loadContent().feesdae.specials.find((f) => f.id === 'newyear');
if (NEW_YEAR === undefined) throw new Error('no newyear in feesdae.json');
const B = NEW_YEAR.barks;
const NY_LINES = [B.start, B.countdown, B.countdownShot, B.end].filter(
  (l): l is string => l !== undefined,
);
const FW = feel.feesdae.looks.newyear.fireworks;
// The boot's day is New Year's Eve 2026 (the card says 2027); `layout=none` keeps boot() from
// forcing a Classic layout.
const DAY = 'today=2026-12-31&layout=none&baboons=0&palms=0';
const QUERY = `feesdag=newyear&seed=42&omen=0&graphics=standard&${DAY}`;

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

/** Pixels (design px) that differ between two grabs in a rect, and the rect's area. */
function changed(on: Rgba, off: Rgba, k: number, r: R): { n: number; area: number } {
  let n = 0;
  let area = 0;
  for (let y = Math.floor(r.y); y <= r.y + r.h; y++)
    for (let x = Math.floor(r.x); x <= r.x + r.w; x++) {
      const px = Math.round(x * k);
      const py = Math.round(y * k);
      if (px < 0 || py < 0 || px >= on.width || py >= on.height) continue;
      area++;
      const i = (py * on.width + px) * 4;
      const d =
        Math.abs((on.data[i] ?? 0) - (off.data[i] ?? 0)) +
        Math.abs((on.data[i + 1] ?? 0) - (off.data[i + 1] ?? 0)) +
        Math.abs((on.data[i + 2] ?? 0) - (off.data[i + 2] ?? 0));
      if (d > 40) n++;
    }
  return { n, area };
}

/** Mean luminance (0 … 255) of a whole grab. */
function luminance(img: Rgba): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 16) {
    sum +=
      0.2126 * (img.data[i] ?? 0) +
      0.7152 * (img.data[i + 1] ?? 0) +
      0.0722 * (img.data[i + 2] ?? 0);
    n++;
  }
  return sum / Math.max(1, n);
}

async function startDaily(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'daily');
}

test.describe('Feesdae: New Year countdown (D-065)', () => {
  test('badge and Oupa, fireworks drawn and within the flash rule, the countdown, ×2, the framed tally', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    // Title, a 24-s hunt with the sheet's lazy load, a held frame, the countdown and the tally:
    // about 5 min on CI's slowest profile.
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await stubClipboard(page);
    await seedSave(page, { quality: 'medium' });
    await boot(page, `${QUERY}&huntSeconds=24&fireworks=max`);
    await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
      timeout: 60_000,
    });
    let h = await hook(page);
    expect(h.feesdag).toEqual({ id: 'newyear', badge: 'New Year countdown!' });
    const badge = h.rects['dailyBadge'];
    const button = h.rects['daily'];
    expect(badge).toBeDefined();
    if (badge !== undefined && button !== undefined) expect(overlaps(badge, button)).toBe(false);
    // Oupa in his party hat beside the badge once New Year's lazy group is in, clear of EVERY
    // title rect and inside the screen, on every aspect ratio.
    await page.waitForFunction(() => window.__TM__?.titleOupa != null, null, { timeout: 120_000 });
    h = await hook(page);
    expect(h.titleOupa).toBe('drawn');
    const oupa = h.rects['dailyOupa'];
    expect(oupa).toBeDefined();
    if (oupa !== undefined) {
      expect(oupa.x).toBeGreaterThanOrEqual(0);
      expect(oupa.y).toBeGreaterThanOrEqual(0);
      expect(oupa.x + oupa.w).toBeLessThanOrEqual(h.designWidth);
      expect(oupa.y + oupa.h).toBeLessThanOrEqual(h.designHeight);
      for (const [id, r] of Object.entries(h.rects))
        if (id !== 'dailyOupa') expect(overlaps(oupa, r), `Oupa over ${id}`).toBe(false);
    }

    await tapRect(page, touch, 'daily');
    await nyRunning(page);
    h = await hook(page);
    expect(h.mode).toBe('daily');
    expect(h.map?.lights).toEqual([NEW_YEAR.light]);
    expect(h.hudTag).toMatch(/^New Year · DAILY #\d+$/);
    expect(h.spook?.things).toEqual([]);
    expect(h.spook?.newYear?.stars ?? 0).toBeGreaterThan(0);
    await page.waitForFunction((line) => window.__TM__?.barks.includes(line) === true, B.start, {
      timeout: 120_000,
    });

    // A burst on the canvas: with the delivered sheet (its baked frames), hold a frame that shows
    // one well drawn (alpha ≥ 0.3, read and held in the same in-page check), grab it with the
    // fireworks shown and hidden at that held tick. Bounded: up to 6 bursts within 900 sim ticks
    // (each wait ≤ 30 s), so a failing try stays short; a hard failure, with the numbers, if no
    // burst's pixels are ever there.
    await nySheetIn(page);
    await page.waitForFunction(() => window.__TM__?.spook?.final === true, null, {
      timeout: 120_000,
    });
    const grab = async (): Promise<Rgba> =>
      decodePng(await page.locator('#game canvas').screenshot());
    let best = 0;
    let tries = 0;
    let shot: { on: Rgba; off: Rgba } | null = null;
    const from = await page.evaluate(() => window.__TM__?.tick ?? 0);
    for (let attempt = 0; attempt < 6 && best <= 12; attempt++) {
      const now = await page.evaluate(() => window.__TM__?.tick ?? 0);
      if (now - from > 900) break;
      tries++;
      const held = await page.waitForFunction(
        () => {
          const g = window.__TM__;
          const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void })
            .__TM_HOLD_AT__;
          if (g === undefined || hold === undefined) return null;
          const b = (g.spook?.newYear?.bursts ?? []).find(
            (x) => x.alpha >= 0.3 && x.x > 100 && x.x < g.designWidth - 100,
          );
          if (b === undefined) return null;
          hold(g.tick + 1);
          return b;
        },
        null,
        { timeout: 30_000, polling: 'raf' },
      );
      const burst = (await held.jsonValue()) as {
        x: number;
        y: number;
        r: number;
        alpha: number;
      };
      await page.waitForTimeout(600);
      h = await hook(page);
      const on = await grab();
      await hideNy(page, true);
      const off = await grab();
      await hideNy(page, false);
      const k = on.height / h.designHeight;
      const r = burst.r + 8;
      // The baked burst drifts down as it falls: the box reaches below its centre too.
      const c = changed(on, off, k, { x: burst.x - r, y: burst.y - r, w: r * 2, h: r * 2.6 });
      best = Math.max(best, c.n);
      // Small and local: never a large flash (the burst's box is a sliver of the screen).
      expect((r * 2) ** 2).toBeLessThan(h.designWidth * h.designHeight * 0.02);
      expect(burst.alpha).toBeLessThanOrEqual(FW.alpha);
      shot = { on, off };
      await release(page);
      if (best <= 12) {
        const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
        await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 20, t0, {
          timeout: 30_000,
        });
      }
    }
    // Some sparks really drawn round it (a burst is a ring of small sparks, not a disc).
    expect(
      best,
      `a burst’s sparks drawn on the canvas: best ${best} px changed over ${tries} bursts`,
    ).toBeGreaterThan(12);
    // No large flash: the whole frame is barely brighter with the fireworks than without.
    if (shot !== null) expect(luminance(shot.on) - luminance(shot.off)).toBeLessThan(4);

    // The countdown: read its rects in the frame it shows, inside the safe area and clear of
    // every other HUD rect, with the ×2 tag.
    const at = await countdownOn(page);
    const shown = await page.waitForFunction(
      () => {
        const g = window.__TM__;
        const c = g?.rects['countdown'];
        if (
          g === undefined ||
          c === undefined ||
          g.countdown === null ||
          g.safe === null ||
          g.notices === null
        )
          return null;
        return {
          rects: g.rects,
          safe: g.safe,
          n: g.countdown.n,
          tag: g.countdown.tag,
          notices: g.notices,
        };
      },
      null,
      { timeout: 120_000 },
    );
    const cd = (await shown.jsonValue()) as {
      rects: Record<string, R>;
      safe: R;
      n: number;
      tag: string;
      notices: { banner: R; callout: R };
    };
    expect(cd.n).toBeGreaterThanOrEqual(1);
    expect(cd.n).toBeLessThanOrEqual(10);
    expect(cd.tag).toBe('×2');
    for (const id of ['countdown', 'countdownTag']) {
      const r = cd.rects[id];
      expect(r, id).toBeDefined();
      if (r === undefined) continue;
      expect(r.x).toBeGreaterThanOrEqual(cd.safe.x);
      expect(r.y).toBeGreaterThanOrEqual(cd.safe.y);
      expect(r.x + r.w).toBeLessThanOrEqual(cd.safe.x + cd.safe.w);
      expect(r.y + r.h).toBeLessThanOrEqual(cd.safe.y + cd.safe.h);
      for (const [other, o] of Object.entries(cd.rects))
        if (other !== 'countdown' && other !== 'countdownTag')
          expect(overlaps(r, o), `${id} over ${other}`).toBe(false);
    }
    // The notice lines (the banner; the call-out, e.g. "Go-away bird — don't shoot!") go below
    // the countdown while it shows: their slots never cross its digit, on every device.
    const digit = cd.rects['countdown'];
    if (digit !== undefined)
      for (const [id, o] of Object.entries(cd.notices))
        expect(overlaps(digit, o), `the countdown over the ${id} line`).toBe(false);
    expect(overlaps(cd.notices.banner, cd.notices.callout), 'banner over call-out').toBe(false);
    // The call-out ("don't shoot!") is the first line under the countdown, the banner below it.
    expect(cd.notices.callout.y).toBeLessThan(cd.notices.banner.y);
    if (digit !== undefined)
      expect(cd.notices.callout.y - (digit.y + digit.h)).toBeLessThanOrEqual(20);

    // A bag in the countdown: its pipeline has the countdown's ×2 after the Stampede's, and the
    // score went up by the award (read where the hook keeps them).
    const bag = await bagInCountdown(page, touch, at);
    expect(bag, 'a bag in the countdown').not.toBeNull();
    if (bag !== null) {
      expect(bag.kinds).toContain('countdown');
      expect(bag.kinds).toContain('stampede');
      expect(bag.kinds.indexOf('countdown')).toBeGreaterThan(bag.kinds.indexOf('stampede'));
      expect(bag.mult).toBeGreaterThanOrEqual(4);
      expect(bag.delta).toBeGreaterThanOrEqual(bag.award);
    }

    // The flash rule over the whole hunt: never more than 3 bursts start in any second.
    h = await hook(page);
    const starts = h.spook?.newYear?.starts ?? [];
    expect(starts.length).toBeGreaterThan(3);
    for (let i = 3; i < starts.length; i++)
      expect(
        (starts[i] ?? 0) - (starts[i - 3] ?? 0),
        `bursts ${i - 3}…${i} start at ${starts.slice(i - 3, i + 1).join(', ')}`,
      ).toBeGreaterThanOrEqual(60);

    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, {
      timeout: 300_000,
    });
    h = await hook(page);
    expect(h.tally).toMatchObject({ frame: 'newyear', share: true, greeting: 'Happy New Year!' });
    expect(h.tally?.title).toBe('New Year 2027');
    const head = h.rects['tallyMoon'];
    const tag = h.rects['tallyTag'];
    expect(head).toBeDefined();
    if (head !== undefined && tag !== undefined) expect(overlaps(head, tag)).toBe(false);
    for (const piece of [head, h.rects['tallyBurst']]) {
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
    expect(h.lastShare?.text).toMatch(/^🎊🥳 🐦 Tarantal Madness · New Year 2027 · Daily #\d+/);
    expect(h.lastShare?.text).toContain('🎆🎊');
    expect(errors).toEqual([]);
  });

  test('reduce flashes: the fireworks only twinkle, dimmer than the sky', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await seedSave(page, { reduceFlashes: true });
    await boot(page, `${QUERY}&huntSeconds=30&fireworks=max`);
    await startDaily(page, touch);
    await nyRunning(page);
    const seen = await page.waitForFunction(
      () => {
        const n = window.__TM__?.spook?.newYear;
        const b = n?.bursts ?? [];
        return b.length > 0
          ? { twinkle: n?.twinkle, alpha: Math.max(...b.map((x) => x.alpha)) }
          : null;
      },
      null,
      { timeout: 180_000 },
    );
    const s = (await seen.jsonValue()) as { twinkle: boolean; alpha: number };
    expect(s.twinkle).toBe(true);
    expect(s.alpha).toBeLessThanOrEqual(FW.twinkleAlpha);
    expect(errors).toEqual([]);
  });

  test("Oupa's comments Off: no New Year line is shown or voiced", async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await seedSave(page, { oupa: 'off' });
    // A 20-s hunt: the countdown (its line would be due) comes at tick 600.
    await boot(page, `${QUERY}&huntSeconds=20`);
    await startDaily(page, touch);
    await nyRunning(page);
    const r = await page.waitForFunction(
      () => {
        const h = window.__TM__;
        if (!h) return null;
        const w = window as unknown as { __ob?: { bubble: boolean } };
        const s = (w.__ob ??= { bubble: false });
        if (h.bark !== null) s.bubble = true;
        return h.tick >= 700 || h.over
          ? { ...s, barks: [...h.barks], voice: [...h.voice.played], oupa: h.voice.oupa }
          : null;
      },
      null,
      { timeout: 300_000 },
    );
    const seenOff = (await r.jsonValue()) as {
      bubble: boolean;
      barks: string[];
      voice: string[];
      oupa: boolean;
    };
    expect(seenOff.oupa).toBe(false);
    expect(seenOff.bubble).toBe(false);
    expect(seenOff.barks.filter((l) => NY_LINES.includes(l))).toEqual([]);
    expect(seenOff.voice.filter((v) => NY_LINES.some((l) => v.endsWith(l)))).toEqual([]);
    expect(errors).toEqual([]);
  });

  for (const special of ['halloween', 'christmas', 'newyear'] as const)
    test(`a ${special} hunt loads only its own special's files (New Year's never otherwise)`, async ({
      page,
    }, info) => {
      test.skip(!isLandscape(info), 'portrait shows the rotate card');
      test.setTimeout(600_000);
      const touch = isTouchProject(info);
      const errors = collectErrors(page);
      const urls: string[] = [];
      page.on('request', (r) => urls.push(r.url()));
      await seedSave(page, { quality: 'medium' });
      await boot(page, `${QUERY.replace('newyear', special)}&huntSeconds=30`);
      await startDaily(page, touch);
      await page.waitForFunction(
        (id) => window.__TM__?.spook?.id === id && window.__TM__.spook.final,
        special,
        { timeout: 180_000 },
      );
      // Give the background loads (sounds, Oupa's lines) a moment to finish too.
      const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
      await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 240, t0, {
        timeout: 120_000,
      });
      const halloween = urls.filter(
        (u) => /\/assets\/feesdae\//.test(u) || /\/assets\/feesdae-voice-[a-z]{2}\//.test(u),
      );
      const christmas = urls.filter((u) => /feesdae-(voice-)?christmas/.test(u));
      const newyear = urls.filter((u) => /feesdae-(voice-)?newyear/.test(u));
      const own = { halloween, christmas, newyear };
      for (const [id, list] of Object.entries(own))
        if (id === special) expect(list.length, id).toBeGreaterThan(0);
        else expect(list, id).toEqual([]);
      expect(errors).toEqual([]);
    });
});
