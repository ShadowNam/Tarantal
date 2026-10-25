// v1.7b (D-046): power-ups explained, and Oupa's switch, on every landscape profile (desktop,
// Pixel 7, iPhone 14). The Gun Shed's Power-ups tab shows all eight cards with their icons and
// scrolls; a hunt with `?crate=boeretroos` picks up the first crate: its card says what it does
// (the full sentence the first time, its numbers from content) and its chip counts down; with
// Oupa's comments Off no bark is shown or voiced in a hunt; with Text only his bubble shows but
// no voice plays. Transient values (the card, the bubble, the chip's countdown) are read inside
// the waitForFunction that sees them; taps on the falling crate are fired from inside the page.
import { expect, test, type Page } from '@playwright/test';
import powerups from '../../content/powerups.json' with { type: 'json' };
import en from '../../src/i18n/en.json' with { type: 'json' };
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapRect,
} from './helpers';

/** Boeretroos' sentence as the game builds it, from the content and the English strings. */
const coffee = powerups.powerups.find((p) => p.id === 'boeretroos');
const pct = Math.round((coffee?.effect.creatureTimeScale ?? 1) * 100);
const COFFEE_TEXT = en['guide.effect.boeretroos']
  .replace('{s}', String((coffee?.durationMs ?? 0) / 1000))
  .replace('{speed}', pct === 50 ? en['guide.half'] : `${pct} %`);
const ALL = [
  'chilli_biltong',
  'boeretroos',
  'bush_buckshot',
  'meerkat_spotter',
  'blitslaai',
  'oupa_laai',
  'voorlaaier',
  'mielie_masjien',
];

/** A save written before the page loads: settings (and a done lesson) merged in. */
async function seed(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({ v: 1, settings: s, ftue: { done: true, skipped: false, step: '' } }),
      );
  }, settings);
}

/** Taps the first crate from inside the page (every few frames) until `id` is running. */
async function pickUp(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
    timeout: 120_000,
  });
  await page.evaluate(
    ([isTouch, want]) =>
      new Promise<void>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) {
          reject(new Error('game not booted'));
          return;
        }
        let last = -99;
        let n = 0;
        const loop = (): void => {
          if (h.powerups.includes(want)) {
            resolve();
            return;
          }
          if (h.over) {
            reject(new Error('the hunt ended first'));
            return;
          }
          const spot = h.crateSpots[0];
          if (spot !== undefined && h.tick - last >= 6 && spot.x > 0 && spot.x < h.designWidth) {
            last = h.tick;
            const r = canvas.getBoundingClientRect();
            const init: PointerEventInit = {
              clientX: r.left + (spot.x / h.designWidth) * r.width,
              clientY: r.top + (spot.y / h.designHeight) * r.height,
              pointerId: 700 + n++,
              pointerType: isTouch ? 'touch' : 'mouse',
              isPrimary: true,
              button: 0,
              buttons: 1,
              bubbles: true,
              cancelable: true,
            };
            canvas.dispatchEvent(new PointerEvent('pointerdown', init));
            canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          }
          requestAnimationFrame(loop);
        };
        loop();
      }),
    [touch, id] as const,
  );
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(({ browserName }, info) => {
  expect(browserName).toBeDefined();
  test.skip(!isLandscape(info), 'landscape profiles only');
  // Software GL is slow: generous budgets.
  test.setTimeout(420_000);
});

test('the Gun Shed explains all eight power-ups and crate guns, with icons', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=42');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'shed');
  await page.waitForFunction(() => window.__TM__?.rects['shed.powerups'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'shed.powerups');
  await page.waitForFunction(() => (window.__TM__?.shedPowerups?.cards.length ?? 0) > 0, null, {
    timeout: 60_000,
  });
  const p = (await hook(page)).shedPowerups;
  if (p === undefined) throw new Error('no power-ups tab');
  expect(p.cards.map((c) => c.id)).toEqual(ALL);
  expect(p.cards.every((c) => c.icon)).toBe(true);
  // A fresh save has met none of them, and every card still explains itself.
  expect(p.cards.every((c) => !c.found)).toBe(true);
  expect(p.cards.find((c) => c.id === 'boeretroos')?.effect).toBe(COFFEE_TEXT);
  await page.screenshot({ path: `${SCREENSHOTS}/shed-powerups-${info.project.name}.png` });
  // The list scrolls (drag on touch, the wheel with a mouse) to its last card.
  if (p.maxScroll > 0) {
    const card = (await hook(page)).rects['shed.powerup.chilli_biltong'];
    if (card === undefined) throw new Error('no first card');
    await page.evaluate(
      ([x, y, dy, isTouch]) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) throw new Error('game not booted');
        const r = canvas.getBoundingClientRect();
        const at = (yy: number): PointerEventInit => ({
          clientX: r.left + (x / h.designWidth) * r.width,
          clientY: r.top + (yy / h.designHeight) * r.height,
          pointerId: 55,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        });
        if (isTouch) {
          canvas.dispatchEvent(new PointerEvent('pointerdown', at(y)));
          for (let k = 1; k <= 10; k++)
            canvas.dispatchEvent(new PointerEvent('pointermove', at(y - (dy * k) / 10)));
          window.dispatchEvent(new PointerEvent('pointerup', { ...at(y - dy), buttons: 0 }));
        } else {
          canvas.dispatchEvent(
            new WheelEvent('wheel', {
              clientX: r.left + (x / h.designWidth) * r.width,
              clientY: r.top + (y / h.designHeight) * r.height,
              deltaY: 5000,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      },
      [card.x + card.w / 2, card.y + card.h / 2, 5000, touch] as const,
    );
    await page.waitForFunction(
      () => {
        const s = window.__TM__?.shedPowerups;
        return s !== undefined && s.scroll === s.maxScroll;
      },
      null,
      { timeout: 30_000 },
    );
    const last = (await hook(page)).rects['shed.powerup.mielie_masjien'];
    expect(last?.h ?? 0).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
});

test('a crate pickup: its card says what it does, and its chip counts down', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&huntSeconds=90&crate=boeretroos');
  await startHunt(page, touch);
  // The crate shows the item it holds.
  const spot = await page.waitForFunction(
    () => window.__TM__?.crateSpots.find((c) => c.icon !== null) ?? null,
    null,
    { timeout: 120_000 },
  );
  expect(await spot.jsonValue()).toMatchObject({
    item: 'boeretroos',
    icon: 'ui/pu_boeretroos',
  });
  await pickUp(page, touch, 'boeretroos');
  // The card is on screen for a few seconds: read it in the frame that sees it.
  const seen = await page.waitForFunction(() => window.__TM__?.pickupCard ?? null, null, {
    timeout: 30_000,
    polling: 'raf',
  });
  const card = (await seen.jsonValue()) as NonNullable<
    Awaited<ReturnType<typeof hook>>['pickupCard']
  >;
  expect(card.id).toBe('boeretroos');
  expect(card.first).toBe(true);
  expect(card.name).toBe('Farm Coffee');
  expect(card.line).toBe(COFFEE_TEXT);
  expect(card.line).toBe('For 10 seconds everything moves at half speed.');
  // Top centre, clear of the middle of the screen (the crosshair and the flock).
  const h0 = await hook(page);
  expect(card.rect.y + card.rect.h).toBeLessThan(h0.designHeight * 0.4);
  // The chip: its icon, its name and seconds that go down; the slow-motion look is on.
  const counted = await page.waitForFunction(
    () => {
      const h = window.__TM__;
      if (!h) return null;
      const w = window as unknown as { __cd?: string[] };
      const times = (w.__cd ??= []);
      const chip = h.chips?.find((c) => c.id === 'boeretroos');
      if (chip !== undefined && times.at(-1) !== chip.time) times.push(chip.time);
      return times.length >= 3 ? { times: [...times], chip, looks: h.powerupLooks ?? null } : null;
    },
    null,
    { timeout: 60_000, polling: 'raf' },
  );
  const c = (await counted.jsonValue()) as {
    times: string[];
    chip: { label: string; icon: string | null };
    looks: { slowTint: boolean; soundRate: number } | null;
  };
  const secs = c.times.map((s) => Number.parseInt(s, 10));
  expect(secs.every((n, i) => i === 0 || n < (secs[i - 1] ?? 0))).toBe(true);
  expect(c.chip.label).toBe('Farm Coffee');
  expect(c.chip.icon).toBe('ui/pu_boeretroos');
  expect(c.looks?.slowTint).toBe(true);
  expect(c.looks?.soundRate ?? 1).toBeLessThan(1);
  await page.screenshot({ path: `${SCREENSHOTS}/pickup-chip-${info.project.name}.png` });
  // The save remembers it: the Gun Shed shows it found from now on.
  const saved = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as {
          powerups?: { seen: string[] };
        }
      ).powerups?.seen ?? [],
  );
  expect(saved).toContain('boeretroos');
  expect(errors).toEqual([]);
});

test("Oupa's comments Off: no bark is shown or voiced in a hunt", async ({ page }, info) => {
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await seed(page, { oupa: 'off' });
  // A fresh day (his greeting) and a first pickup (his word on it): both would bark when On.
  await boot(page, 'seed=7&huntSeconds=40&crate=boeretroos');
  await startHunt(page, touch);
  await pickUp(page, touch, 'boeretroos');
  // Watch every frame up to tick 900: no bubble, no line recorded, no voice played.
  const r = await page.waitForFunction(
    () => {
      const h = window.__TM__;
      if (!h) return null;
      const w = window as unknown as { __ob?: { bubble: boolean; card: boolean } };
      const s = (w.__ob ??= { bubble: false, card: false });
      if (h.bark !== null) s.bubble = true;
      if (h.pickupCard != null) s.card = true;
      return h.tick >= 900 || h.over
        ? { ...s, barks: [...h.barks], voice: [...h.voice.played], oupa: h.voice.oupa }
        : null;
    },
    null,
    { timeout: 240_000, polling: 'raf' },
  );
  const v = (await r.jsonValue()) as {
    bubble: boolean;
    card: boolean;
    barks: string[];
    voice: string[];
    oupa: boolean;
  };
  expect(v.bubble).toBe(false);
  expect(v.barks).toEqual([]);
  expect(v.voice).toEqual([]);
  expect(v.oupa).toBe(false);
  // The pickup card (an instruction, not Oupa) still shows.
  expect(v.card).toBe(true);
  expect(errors).toEqual([]);
});

test("Oupa's comments Text only: his bubble shows, no voice line plays", async ({ page }, info) => {
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await seed(page, { oupa: 'text', voiceVolume: 1, masterVolume: 1 });
  await boot(page, 'seed=7&huntSeconds=40&crate=boeretroos');
  await startHunt(page, touch);
  // The day's greeting: the bubble is up (read in the frame that sees it) and nothing is voiced.
  const r = await page.waitForFunction(
    () => {
      const h = window.__TM__;
      return h?.bark == null ? null : { line: h.bark.line, voice: [...h.voice.played] };
    },
    null,
    { timeout: 90_000, polling: 'raf' },
  );
  const b = (await r.jsonValue()) as { line: string; voice: string[] };
  expect(b.line.startsWith('bark.')).toBe(true);
  expect(b.voice).toEqual([]);
  await page.screenshot({ path: `${SCREENSHOTS}/oupa-text-only-${info.project.name}.png` });
  // His word on the first pickup: shown, still never voiced.
  await pickUp(page, touch, 'boeretroos');
  const said = await page.waitForFunction(
    () => {
      const h = window.__TM__;
      return h?.barks.includes('bark.pu.boeretroos') === true
        ? { voice: [...h.voice.played], oupa: h.voice.oupa }
        : null;
    },
    null,
    { timeout: 60_000, polling: 'raf' },
  );
  const s = (await said.jsonValue()) as { voice: string[]; oupa: boolean };
  expect(s.voice).toEqual([]);
  expect(s.oupa).toBe(false);
  expect(errors).toEqual([]);
});

test("Settings: Oupa's comments cycle On → Text only → Off and are saved", async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'seed=42');
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'settings');
  await page.waitForFunction(() => window.__TM__?.rects['settings.oupa'] !== undefined, null, {
    timeout: 60_000,
  });
  const read = (): Promise<string | null> =>
    page.evaluate(
      () =>
        (
          JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as {
            settings?: { oupa?: string };
          }
        ).settings?.oupa ?? null,
    );
  await tapRect(page, touch, 'settings.oupa');
  await expect.poll(read, { timeout: 30_000 }).toBe('text');
  await expect.poll(async () => (await hook(page)).voice.oupa).toBe(false);
  await tapRect(page, touch, 'settings.oupa');
  await expect.poll(read, { timeout: 30_000 }).toBe('off');
  // Every row on the page stays a ≥ 64 px tap target, clear of the Back button.
  const h = await hook(page);
  const row = h.rects['settings.oupa'];
  const back = h.rects['settings.back'];
  expect(row?.h ?? 0).toBeGreaterThanOrEqual(64);
  for (const id of ['settings.privacy', 'settings.oupa', 'settings.voiceLanguage']) {
    const r = h.rects[id];
    if (r !== undefined && back !== undefined) expect(r.y + r.h).toBeLessThan(back.y);
  }
  await page.screenshot({ path: `${SCREENSHOTS}/settings-oupa-${info.project.name}.png` });
  await tapRect(page, touch, 'settings.oupa');
  await expect.poll(read, { timeout: 30_000 }).toBe('on');
});
