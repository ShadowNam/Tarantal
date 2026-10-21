// M8 "Done when": the Season Run plays through all four real seasons — here a run saved at the
// start of Lente (hunt 7) resumes after a page load and its hunt plays on the real Okavango, not
// the old Karoo stand-in; then a run saved at Somer plays on the Kalahari. The saved run is built
// in Node with the run engine (six/nine passed hunts), exactly as the browser saves it. The full
// run through all four seasons is proven headless (src/sim/run/run.test.ts).
import { expect, test, type Page } from '@playwright/test';
import { createRun, huntSetup, leavePadstal, openPadstal, settleHunt } from '../../src/sim/run/run';
import type { RunState } from '../../src/sim/run/run';
import { createSim } from '../../src/sim/Sim';
import { loadContent } from '../../tools/testContent';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  SCREENSHOTS,
  tapRect,
} from './helpers';

/** A run that passed its first `hunts` hunts and left the last Padstal (phase 'hunt'). */
function savedRunAt(hunts: number): RunState {
  const content = loadContent();
  let run = createRun(content, {
    seed: 77,
    weapon: 'dubbelloop',
    pool: content.charms.charms.map((c) => c.id),
  });
  for (let i = 0; i < hunts; i++) {
    const { seed, mode } = huntSetup(content, run);
    const result = createSim({ seed, content, mode, inputKind: 'pointer' }).result();
    run = settleHunt(content, run, { ...result, score: 99_999 });
    run = leavePadstal(openPadstal(content, run));
  }
  return run;
}

async function withSavedRun(page: Page, run: RunState): Promise<void> {
  await page.addInitScript((r) => {
    if (localStorage.getItem('tm.e2e.save.v1') !== null) return;
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({ v: 1, ftue: { done: true, skipped: false, step: '' }, run: r }),
    );
  }, run);
}

for (const [season, hunts, biome] of [
  ['lente', 6, 'okavango-spring'],
  ['somer', 9, 'kalahari-summer'],
] as const) {
  test(`a run saved at ${season} resumes and plays on the real ${biome}`, async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'the run is played in landscape');
    test.setTimeout(240_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    const saved = savedRunAt(hunts);
    expect(saved).toMatchObject({ phase: 'hunt', huntIndex: hunts });
    await withSavedRun(page, saved);
    await boot(page, 'huntSeconds=4&quotaMul=0');
    await page.waitForFunction(() => window.__TM__?.rects['seasonRun'] !== undefined);
    await tapRect(page, touch, 'seasonRun'); // "Continue run"
    await page.waitForFunction(
      (i) =>
        window.__TM__?.scene === 'run' &&
        window.__TM__.run?.view === 'intro' &&
        window.__TM__.run.huntIndex === i,
      hunts,
      { timeout: 90_000 },
    );
    await tapRect(page, touch, 'run.go');
    await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 60_000 });
    const h = await hook(page);
    expect(h.mode).toBe('seasonHunt');
    expect(h.biome).toBe(biome);
    expect(h.missingTextures).toEqual([]);
    await page.screenshot({ path: `${SCREENSHOTS}/season-${season}-${info.project.name}.png` });
    await page.waitForFunction(
      (i) => window.__TM__?.run?.view === 'tally' && window.__TM__.run.huntIndex === i,
      hunts,
      { timeout: 120_000 },
    );
    expect(errors).toEqual([]);
  });
}
