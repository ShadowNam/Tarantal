import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { defaultSave, type SaveData } from '../../src/meta/saveSchema';
import { awardPlaques, recordHunt, recordRival, sightingKey } from '../../src/meta/journal';
import { loadContentHash } from '../../tools/testContent';
import {
  boot,
  hook,
  isLandscape,
  isTouchProject,
  tapRect,
  startHunt,
  waitTicks,
  SCREENSHOTS,
  collectErrors,
} from './helpers';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';

const HASH = loadContentHash();
const QUERY = 'seed=42&graphics=standard&brakkie=content&reenbui=content';
function collection(): SaveData {
  const save = defaultSave();
  save.ftue = { done: true, skipped: true, step: '' };
  save.settings.graphics = 'standard';
  save.settings.language = 'en';
  save.settings.oupa = 'text';
  save.birdBook.creatures = ['galago', 'squirrel', 'owl'].map(sightingKey);
  return awardPlaques(save);
}
async function seed(page: Page, save: SaveData): Promise<void> {
  await page.addInitScript((data: SaveData) => {
    localStorage.setItem('tm.e2e.save.v1', JSON.stringify(data));
  }, save);
}
async function openJournal(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined);
  await tapRect(page, touch, 'shed');
  await page.waitForFunction(() => window.__TM__?.menu === 'shed.loadout');
  await tapRect(page, touch, 'shed.journal');
  await page.waitForFunction(() => window.__TM__?.journal?.section === 'field');
}

test.use({ serviceWorkers: 'block' });
test('journal: illustrated discoveries, paging, keyboard lessons and earned keepsakes', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape');
  test.setTimeout(360_000);
  const touch = isTouchProject(info),
    errors = collectErrors(page);
  await seed(page, collection());
  await boot(page, QUERY);
  await openJournal(page, touch);
  await page.waitForFunction(() => window.__TM__?.journalPortraits === 2);
  expect((await hook(page)).journal?.seen).toEqual(['galago', 'squirrel', 'owl']);
  await page.screenshot({ path: `${SCREENSHOTS}/journal-field-${info.project.name}.png` });
  await tapRect(page, touch, 'journal.next');
  await page.waitForFunction(() => window.__TM__?.journal?.page === 1);
  await tapRect(page, touch, 'journal.coach');
  await page.waitForFunction(() => window.__TM__?.journal?.section === 'coach');
  await page.screenshot({ path: `${SCREENSHOTS}/journal-coach-${info.project.name}.png` });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__TM__?.journal?.section === 'rivals');
  await tapRect(page, touch, 'journal.plaques');
  await page.waitForFunction(() => window.__TM__?.journal?.section === 'plaques');
  await tapRect(page, touch, 'journal.equip.hunter');
  expect((await hook(page)).journal?.equipped).toBeNull();
  await tapRect(page, touch, 'journal.equip.observer');
  await page.waitForFunction(() => window.__TM__?.journal?.equipped === 'observer');
  await page.screenshot({ path: `${SCREENSHOTS}/journal-keepsakes-${info.project.name}.png` });
  await tapRect(page, touch, 'shed.back');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  expect((await hook(page)).journalPortraits).toBe(0);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as SaveData,
  );
  expect(saved.journal.plaque).toBe('observer');
  expect(saved.journal.earned).toContain('observer');
  expect(errors).toEqual([]);
});

test('journal: setup-specific goals, friendly rematch and actual shot recognition', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape');
  test.setTimeout(420_000);
  const touch = isTouchProject(info),
    errors = collectErrors(page);
  let save = collection();
  save.journal = recordHunt(
    save.journal,
    {
      mode: 'classic',
      biome: 'karoo-autumn',
      layout: null,
      bonus: null,
      weapon: 'dubbelloop',
      sight: null,
      rules: HASH.slice(0, 8),
      score: 200,
      accuracy: 0.8,
      penalties: 0,
      shots: 20,
      bagged: 10,
      baggedFar: 2,
      baggedVer: 0,
      bonusUnlocked: null,
      wingShots: 1,
      wholeFlocks: 1,
      secrets: 0,
      crates: 0,
      creaturesSeen: [],
      secretsFound: [],
      rank: 'stadsjapie',
    },
    true,
  ).journal;
  save.journal = recordRival(
    save.journal,
    {
      v: 1,
      seed: 42,
      mode: 'classic',
      biome: 'karoo-autumn',
      weapon: 'dubbelloop',
      score: 150,
      by: 'Hanneke',
      h: HASH.slice(0, 8),
    },
    200,
    HASH,
  );
  save = awardPlaques(save);
  await seed(page, save);
  await boot(page, QUERY);
  await openJournal(page, touch);
  expect(await page.evaluate(() => window.__TM_TOOLS__?.contentHash)).toBe(HASH);
  await tapRect(page, touch, 'journal.goals');
  await page.waitForFunction(() => window.__TM__?.journal?.section === 'goals');
  expect((await hook(page)).journalGoals?.find((g) => g.id === 'score')?.target).toBeGreaterThan(
    200,
  );
  expect((await hook(page)).journalGoals?.find((g) => g.id === 'accuracy')?.best).toBe(0.8);
  await page.screenshot({ path: `${SCREENSHOTS}/journal-goals-${info.project.name}.png` });
  await tapRect(page, touch, 'journal.rivals');
  await page.waitForFunction(() => window.__TM__?.journal?.section === 'rivals');
  expect((await hook(page)).journal?.rivals).toBe(1);
  await page.screenshot({ path: `${SCREENSHOTS}/journal-rivals-${info.project.name}.png` });
  await tapRect(page, touch, 'journal.rematch.0');
  await page.waitForFunction(() => window.__TM__?.scene === 'challenge');
  await tapRect(page, touch, 'accept');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt' && window.__TM__.tick > 30);
  expect((await hook(page)).challenge?.score).toBe(150);
  // Bagging a far bird takes luck with the Dubbelloop's spread: 10 tries missed every time on
  // desktop WebKit (run 42367243545). Bounded by tries and by the hunt; which events make which
  // moment is unit-tested (src/meta/journal.test.ts shotMoment).
  for (let i = 0; i < 60; i++) {
    const now = await hook(page);
    if (now.shotMoment != null || now.over) break;
    const h = await hook(page);
    const bird = h.targetBirds.find(
      (b) => b.plane === 'far' && b.x > 120 && b.x < h.designWidth - 120 && b.y > 160 && b.y < 900,
    );
    if (bird !== undefined) {
      await reloadIfEmpty(page, touch);
      await fireAt(page, touch, { x: bird.x, y: bird.y });
    }
    await waitTicks(page, 30);
  }
  expect(['double', 'horizon', 'long']).toContain((await hook(page)).shotMoment);
  await page.screenshot({ path: `${SCREENSHOTS}/journal-shot-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('journal: a visible resident becomes a discovery only after a completed hunt', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape');
  test.setTimeout(420_000);
  const touch = isTouchProject(info),
    errors = collectErrors(page);
  await boot(
    page,
    'biome=bushveld-winter&seed=42&huntSeconds=30&birds=0&treeLife=galago&graphics=standard',
  );
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30);
  await page.keyboard.down('ArrowLeft');
  try {
    await page.waitForFunction(
      () => {
        const h = window.__TM__;
        return (
          h?.secretSpots.some(
            (s) => s.partId === 'pod' && s.x > 260 && s.x < h.designWidth - 260,
          ) === true ||
          (h !== undefined && h.cameraX > 0 && h.cameraX <= 961)
        );
      },
      null,
      { timeout: 120_000 },
    );
  } finally {
    await page.keyboard.up('ArrowLeft');
  }
  await page.waitForFunction(
    () => window.__TM__?.journalSightings?.includes('galago') === true,
    null,
    { timeout: 120_000 },
  );
  const during = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as SaveData,
  );
  expect(during.birdBook.creatures).not.toContain(sightingKey('galago'));
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as SaveData,
  );
  expect(after.birdBook.creatures).toContain(sightingKey('galago'));
  expect((await hook(page)).score).toBe(0);
  expect(errors).toEqual([]);
});

test('journal: a missing portrait leaves readable cards and usable controls', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one browser for a network-failure case');
  test.setTimeout(240_000);
  const index = JSON.parse(readFileSync('public/assets/asset-index.json', 'utf8')) as {
    images: Record<string, { file: { path: string } }>;
  };
  const path = index.images['bushveld/baobab_life']?.file.path;
  if (path === undefined) throw new Error('resident sheet absent');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`**/${path}`, (route) => route.fulfill({ status: 404, body: '' }));
  await seed(page, collection());
  await boot(page, QUERY);
  await openJournal(page, false);
  expect((await hook(page)).journal?.seen).toHaveLength(3);
  await tapRect(page, false, 'journal.next');
  await page.waitForFunction(() => window.__TM__?.journal?.page === 1);
  await tapRect(page, false, 'shed.back');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  expect(errors).toEqual([]);
});

test('journal: a selected keepsake gets its name when delayed guide text arrives', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one browser for delayed text');
  test.setTimeout(240_000);
  const save = collection();
  save.journal.plaque = 'observer';
  await page.route('**/guideTables-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  const errors = collectErrors(page);
  await seed(page, save);
  await boot(page, QUERY);
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined);
  await tapRect(page, false, 'shed');
  await page.waitForFunction(() => window.__TM__?.menu === 'shed.loadout');
  await page.waitForFunction(() => window.__TM__?.shedPlaque === '★ Sharp eyes');
  await page.screenshot({ path: `${SCREENSHOTS}/journal-shed-plaque-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
