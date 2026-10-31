// v1.11 (D-068): Die Braai on desktop, Pixel 7 and iPhone 14 landscape. A short Classic hunt (held
// at its start until the braai's lazy chunk and sheet are in, so the tally can show it) ends at
// the braai: every tally hook value and button is there and works ([Again] with one tap, [Menu],
// [Season Run]); the fire's real pixels are drawn where the hook says (lesson 14); Oupa and the
// fire stay clear of every tally rect; Oupa tells the hunt and a tap off the buttons skips the
// count-up and the story; "reduce motion" skips the dance. With no delivery, or with the braai's
// group missing, the plain slate shows at once (nothing waits). A Feesdae Daily (New Year, forced
// date) shows its decorations at the braai.
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../tools/assets/image';
import { release } from './christmasHelpers';
import { boot, collectErrors, hook, isLandscape, isTouchProject, tapAt, tapRect } from './helpers';

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const BASE = 'seed=42&huntSeconds=3&graphics=standard&baboons=0&omen=0';

test.use({ serviceWorkers: 'block' });

/** Starts the hunt held at its first ticks until the braai's files are in, then lets it end. */
async function huntToBraai(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'start');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__TM__?.braaiLoaded === true, null, {
    timeout: 120_000,
  });
  await release(page);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.braai != null, null, { timeout: 30_000 });
}

/** Counts warm, bright pixels (the flames and coals) in a box round a design point. */
async function firePixels(page: Page, x: number, y: number): Promise<number> {
  const png = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  const sx = png.width / h.designWidth;
  const sy = png.height / h.designHeight;
  let n = 0;
  for (let dy = -40; dy <= 20; dy++)
    for (let dx = -40; dx <= 40; dx++) {
      const px = Math.round((x + dx) * sx);
      const py = Math.round((y + dy) * sy);
      if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
      const i = (py * png.width + px) * 4;
      const r = png.data[i] ?? 0;
      const g = png.data[i + 1] ?? 0;
      const b = png.data[i + 2] ?? 0;
      if (r > 200 && g > 70 && b < 140 && r > b + 80) n++;
    }
  return n;
}

test('a short hunt ends at the braai: the tally, the fire drawn, Oupa clear of every rect, [Again]', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  const touch = isTouchProject(info);
  await boot(page, `${BASE}&holdAt=20`);
  await huntToBraai(page, touch);
  await page.waitForFunction(() => window.__TM__?.tallyDone === true, null, { timeout: 60_000 });
  const h = await hook(page);
  // Every tally value and button of the plain slate is still there.
  expect(h.scene).toBe('tally');
  expect(h.tally).not.toBeNull();
  for (const id of ['again', 'seasonRun', 'menu']) expect(h.rects[id], id).toBeDefined();
  expect(h.focus).toBe('again');
  const b = h.braai;
  if (b === null) throw new Error('no braai');
  expect(b.sheet).toBe('standard');
  expect(b.story.lines.length).toBeGreaterThanOrEqual(2);
  expect(b.story.lines.length).toBeLessThanOrEqual(4);
  // Oupa and the fire: on screen, clear of the slate's buttons and every other rect.
  if (b.oupa === null || b.fire === null || b.firePoint === null) throw new Error('no Oupa');
  for (const [id, r] of Object.entries(h.rects)) {
    expect(overlaps(b.oupa, r), `Oupa over ${id}`).toBe(false);
    expect(overlaps(b.fire, r), `fire over ${id}`).toBe(false);
  }
  for (const r of [b.oupa, b.fire]) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(h.designHeight);
  }
  // Real pixels: the fire burns where the hook says (lesson 14).
  expect(await firePixels(page, b.firePoint.x, b.firePoint.y)).toBeGreaterThan(60);
  // The hunt's own view is hidden under the braai; the braai draws on the tally's clock.
  expect(h.braaiFrames).toBeGreaterThan(0);
  // Oupa tells the hunt: the lines come one by one, with captions.
  await page.waitForFunction(() => (window.__TM__?.braai?.story.shown ?? 0) >= 2, null, {
    timeout: 60_000,
  });
  const told = await hook(page);
  expect(told.braai?.story.captions.length).toBeGreaterThanOrEqual(2);
  expect(told.braai?.story.captions.every((c) => c.length > 0 && !c.includes('{'))).toBe(true);
  await page.screenshot({ path: info.outputPath(`braai-${info.project.name}.png`) });
  // [Again] with one tap: the next hunt starts; the braai is gone with the tally.
  await tapRect(page, touch, 'again');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 60_000 });
  expect((await hook(page)).braai).toBeNull();
  expect(errors).toEqual([]);
});

test('a tap off the buttons skips the count-up and the story; [Menu] goes to the title', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await boot(page, `${BASE}&holdAt=20`);
  await huntToBraai(page, touch);
  const h = await hook(page);
  const b = h.braai;
  if (b === null) throw new Error('no braai');
  // A spot in the sky above the story bubble (no button there).
  const spot = { x: Math.max(40, (b.oupa?.x ?? 60) + 20), y: 30 };
  for (const r of Object.values(h.rects)) expect(overlaps({ ...spot, w: 1, h: 1 }, r)).toBe(false);
  await tapAt(page, touch, spot.x, spot.y);
  await page.waitForFunction(() => window.__TM__?.braai?.story.skipped === true, null, {
    timeout: 30_000,
  });
  const s = await hook(page);
  expect(s.braai?.story.shown).toBe(s.braai?.story.lines.length);
  // The count-up skipped to the hunt's own score (review: not the value mid-count).
  expect(s.tallyScore?.replace(/\D/g, '')).toBe(String(s.score));
  expect(s.scene).toBe('tally');
  await tapRect(page, touch, 'menu');
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  expect((await hook(page)).braai).toBeNull();
});

test('[Season Run] at the braai opens the run', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await boot(page, `${BASE}&holdAt=20`);
  await huntToBraai(page, touch);
  await tapRect(page, touch, 'seasonRun');
  await page.waitForFunction(() => window.__TM__?.run != null, null, { timeout: 60_000 });
  expect((await hook(page)).braai).toBeNull();
});

test('reduce motion: a perfect hunt does not dance; the sparks stay still', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, `${BASE}&holdAt=20&braaiDance=1`);
  await huntToBraai(page, isTouchProject(info));
  const h = await hook(page);
  expect(h.braai?.dance).toBe(true);
  // The dance's slot comes with the closer line (danceAt is set even with reduce motion); from
  // then on, for longer than the dance lasts, Oupa never stands up and the sparks stay still.
  await page.waitForFunction(() => window.__TM__?.braai?.danceAt != null, null, {
    timeout: 120_000,
  });
  const seen = await page.evaluate(async () => {
    const out = { dancing: false, sparks: new Set<number>() };
    const t0 = performance.now();
    for (let i = 0; i < 2000 && performance.now() - t0 < 5000; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const b = window.__TM__?.braai;
      if (b == null) break;
      out.dancing ||= b.dancing;
      out.sparks.add(b.spark);
    }
    return { dancing: out.dancing, sparks: [...out.sparks] };
  });
  expect(seen.dancing).toBe(false);
  expect(seen.sparks).toEqual([0]);
});

test('with no delivery the plain slate shows at once (nothing waits)', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(240_000);
  await page.route('**/assets/asset-index.json', (r) => r.fulfill({ status: 404, body: '' }));
  await boot(page, BASE);
  await tapRect(page, isTouchProject(info), 'start');
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.rects['again'] !== undefined);
  const h = await hook(page);
  expect(h.braai).toBeNull();
  expect(h.braaiLoaded).toBe(false);
  expect(h.tally).not.toBeNull();
});

test('with the braai group missing the plain slate shows at once', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(240_000);
  await page.route('**/assets/braai/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/assets/braai-hd/**', (r) => r.fulfill({ status: 404, body: '' }));
  await boot(page, BASE);
  await tapRect(page, isTouchProject(info), 'start');
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.rects['again'] !== undefined);
  expect((await hook(page)).braai).toBeNull();
  // The tally works as before: [Again] starts the next hunt.
  await tapRect(page, isTouchProject(info), 'again');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 60_000 });
});

test('a Feesdae Daily (New Year) shows its decorations at the braai', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(360_000);
  const touch = isTouchProject(info);
  await boot(
    page,
    'feesdag=newyear&today=2026-12-31&layout=none&seed=42&huntSeconds=4&graphics=standard&baboons=0&palms=0&omen=0&holdAt=20',
  );
  await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'daily');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.braaiLoaded === true, null, {
    timeout: 120_000,
  });
  await release(page);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.braai != null, null, { timeout: 30_000 });
  const h = await hook(page);
  expect(h.tally).toMatchObject({ frame: 'newyear', greeting: 'Happy New Year!' });
  expect(h.braai?.decorations).toContain('feesdae/newyear:hat_m');
  // The special's pieces on the slate stay clear of Oupa and the fire.
  const b = h.braai;
  for (const id of ['tallyBurst', 'tallyMoon']) {
    const r = h.rects[id];
    if (r === undefined || b?.oupa == null) continue;
    expect(overlaps(b.oupa, r), id).toBe(false);
  }
  await page.screenshot({ path: info.outputPath(`braai-newyear-${info.project.name}.png`) });
});
