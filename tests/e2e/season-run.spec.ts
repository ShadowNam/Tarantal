// M6 "Done when": a full 12-hunt Season Run is completable, and the run resumes after a page
// reload (it is saved after every Padstal step). Short hunts (?huntSeconds) and zero quotas
// (?quotaMul=0, dev/e2e builds only) keep the 12 hunts quick; the run engine and its balance are
// proven headless (src/sim/run, tools/season-sim.ts). Screenshots: hunt card, HUD, Padstal, summary.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  SCREENSHOTS,
  tapRect,
} from './helpers';

type RunHook = NonNullable<Awaited<ReturnType<typeof hook>>['run']>;

async function runHook(page: Page): Promise<RunHook> {
  const r = (await hook(page)).run;
  if (r === null) throw new Error('no run on screen');
  return r;
}

/** Waits for a Run screen (hook.run is published after its buttons are laid out). */
async function waitView(page: Page, view: string, huntIndex?: number): Promise<void> {
  await page.waitForFunction(
    ([v, i]) => {
      const h = window.__TM__;
      return h?.scene === 'run' && h.run?.view === v && (i === null || h.run.huntIndex === i);
    },
    [view, huntIndex ?? null] as const,
    { timeout: 90_000 },
  );
}

/** HUNT! on the hunt card, then wait for the run tally of that hunt. */
async function playHunt(page: Page, touch: boolean, index: number): Promise<void> {
  await tapRect(page, touch, 'run.go');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 60_000 });
  await waitView(page, 'tally', index);
}

/** Buys the first charm the run can afford (Padstal), if any; returns its id. */
async function buyCharm(page: Page, touch: boolean): Promise<string | null> {
  const r = await runHook(page);
  const k = r.offers.findIndex((o) => {
    const [kind, , price, state] = o.split(':');
    return kind === 'charm' && state === 'open' && Number(price) <= r.doppies;
  });
  if (k < 0 || r.charms.length >= 5) return null;
  const id = r.offers[k]?.split(':')[1] ?? null;
  await tapRect(page, touch, `run.offer.${k}`);
  await page.waitForFunction((n) => (window.__TM__?.run?.charms.length ?? 0) > n, r.charms.length);
  return id;
}

function landscapeOnly(info: TestInfo): void {
  test.skip(!isLandscape(info), 'the run is played in landscape');
}

test('a full 12-hunt Season Run completes (short hunts, zero quotas)', async ({ page }, info) => {
  landscapeOnly(info);
  test.skip(
    !['desktop-chromium', 'desktop-webkit'].includes(info.project.name),
    'desktop only: the full run is long; phones get the resume spec',
  );
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=5&huntSeconds=1&quotaMul=0');
  await page.waitForFunction(() => window.__TM__?.rects['seasonRun'] !== undefined);
  await tapRect(page, touch, 'seasonRun');
  await waitView(page, 'intro', 0);
  for (let i = 0; i < 12; i++) {
    await playHunt(page, touch, i);
    if (i === 11) break;
    await tapRect(page, touch, 'run.padstal');
    await waitView(page, 'padstal', i);
    await buyCharm(page, touch);
    await tapRect(page, touch, 'run.next');
    await waitView(page, 'intro', i + 1);
  }
  await tapRect(page, touch, 'run.summary');
  await waitView(page, 'summary');
  const r = await runHook(page);
  expect(r.phase).toBe('victory');
  expect(r.charms.length).toBeGreaterThan(0);
  const h = await hook(page);
  expect(h.hunts).toBe(12);
  await page.screenshot({ path: `${SCREENSHOTS}/season-summary-${info.project.name}.png` });
  // The run left the save; the title offers a new run, with the win counted.
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as {
        run: unknown;
        runStats: { won: number };
      },
  );
  expect(saved.run).toBeNull();
  expect(saved.runStats.won).toBe(1);
  expect(errors).toEqual([]);
});

test('the run resumes after a page reload (saved after every Padstal step)', async ({
  page,
}, info) => {
  landscapeOnly(info);
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=9&huntSeconds=6&quotaMul=0');
  await page.waitForFunction(() => window.__TM__?.rects['seasonRun'] !== undefined);
  await tapRect(page, touch, 'seasonRun');
  await waitView(page, 'intro', 0);
  await page.screenshot({ path: `${SCREENSHOTS}/season-intro-${info.project.name}.png` });
  await playHunt(page, touch, 0);
  await tapRect(page, touch, 'run.padstal');
  await waitView(page, 'padstal', 0);
  const bought = await buyCharm(page, touch);
  expect(bought).not.toBeNull();
  await page.screenshot({ path: `${SCREENSHOTS}/season-padstal-${info.project.name}.png` });
  const before = await runHook(page);

  await page.reload();
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__TM__?.rects['seasonRun'] !== undefined);
  await tapRect(page, touch, 'seasonRun'); // now "Continue run"
  await waitView(page, 'padstal', 0);
  const after = await runHook(page);
  expect(after.charms).toEqual(before.charms);
  expect(after.doppies).toBe(before.doppies);
  expect(after.offers).toEqual(before.offers);

  await tapRect(page, touch, 'run.next');
  await waitView(page, 'intro', 1);
  await tapRect(page, touch, 'run.go');
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.tick > 60,
    null,
    {
      timeout: 60_000,
    },
  );
  const h = await hook(page);
  expect(h.mode).toBe('seasonHunt');
  for (const id of ['quota', 'charms', 'gadget']) expect(h.rects[id], id).toBeDefined();
  // The run HUD draws the quota and one chip per equipped charm.
  expect(h.seasonHud).toMatchObject({ quota: 0, chips: before.charms.length });
  await page.screenshot({ path: `${SCREENSHOTS}/season-hud-${info.project.name}.png` });
  await waitView(page, 'tally', 1);
  expect(errors).toEqual([]);
});
