// v1.4 B (D-039) the Namibië pack on desktop, Pixel 7 and iPhone 14 landscape:
//   - a new save shows the area card locked, saying how to unlock it, and a tap on it does nothing;
//   - a save that reached Die Verste has it open (and keeps the unlock in the save); picking it on
//     the title makes Classic play in Namibië, and a scoped Langloop shot at a Ver bird fires.
// The rules are proven headless in src/sim/namibie.test.ts and src/meta/areas.test.ts.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

/** 2026-10-20, a Tuesday (the mirage map; Ver open). */
const DAY = { key: '2026-10-20', n: 20746 } as const;

test.use({ serviceWorkers: 'block' });

function gate(info: TestInfo): void {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
}

/** A returning player's save; `verste` = Die Verste was reached (in the Karoo, on an earlier day). */
async function seed(page: Page, verste: boolean): Promise<void> {
  await page.addInitScript((v) => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'medium' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'langloop', sights: { langloop: 'scope_var' } },
        unlocks: { weapons: ['twee_twee', 'langloop'], sights: [] },
        bestRank: 'bosveldjagter',
        bonusMaps: {
          day: 20700,
          unlocked: [],
          bests: v ? { 'karoo-autumn/dieVerste': { score: 900, rank: 'bosveldjagter' } } : {},
        },
      }),
    );
  }, verste);
}

async function openAreas(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['area'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'area');
  await page.waitForFunction(() => window.__TM__?.menu === 'area', null, { timeout: 30_000 });
}

test('Namibië: locked on a new save, with how to unlock it', async ({ page }, info) => {
  gate(info);
  test.setTimeout(240_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await seed(page, false);
  await boot(page, `today=${DAY.key}`);
  await openAreas(page, touch);
  let h = await hook(page);
  expect(h.areas).toEqual([
    { id: 'karoo-autumn', unlocked: true, chosen: true },
    { id: 'namibie', unlocked: false, chosen: false },
  ]);
  expect(h.rects['area_namibie_locked']).toBeDefined();
  await page.screenshot({ path: `${SCREENSHOTS}/namibie-locked-${info.project.name}.png` });
  // A tap on the locked card changes nothing: the picker stays up, Classic stays in the Karoo.
  await tapRect(page, touch, 'area_namibie_locked');
  await page.waitForTimeout(500);
  h = await hook(page);
  expect(h.menu).toBe('area');
  await tapRect(page, touch, 'area.back');
  await page.waitForFunction(() => window.__TM__?.scene === 'start', null, { timeout: 30_000 });
  expect((await hook(page)).classicArea).toBe('karoo-autumn');
  expect(errors).toEqual([]);
});

test('Namibië: Die Verste reached opens it; Classic plays there and the Langloop reaches Ver', async ({
  page,
}, info) => {
  gate(info);
  test.setTimeout(400_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await seed(page, true);
  await boot(page, `seed=46&today=${DAY.key}&huntSeconds=25`);
  await openAreas(page, touch);
  expect((await hook(page)).areas).toContainEqual({ id: 'namibie', unlocked: true, chosen: false });
  // The unlock is kept in the save (the bonus unlock is for one day only).
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as {
        areas?: { unlocked: string[] };
      },
  );
  expect(stored.areas?.unlocked).toEqual(['namibie']);
  await tapRect(page, touch, 'area_namibie');
  await page.waitForFunction(() => window.__TM__?.classicArea === 'namibie', null, {
    timeout: 30_000,
  });
  await page.screenshot({ path: `${SCREENSHOTS}/namibie-title-${info.project.name}.png` });
  await startHunt(page, touch);
  await page.waitForFunction(() => window.__TM__?.biome === 'namibie', null, { timeout: 120_000 });
  const h = await hook(page);
  expect(h.missingTextures).toEqual([]);
  // A Ver flock (the waterhole) on screen: raise the scope on it and fire.
  await page.waitForFunction(
    () => (window.__TM__?.flockSpots ?? []).some((f) => f.plane === 'ver'),
    null,
    { timeout: 120_000 },
  );
  const hv = await hook(page);
  const f = hv.flockSpots.find((s) => s.plane === 'ver');
  if (f === undefined) throw new Error('no Ver flock');
  const at = { x: Math.min(hv.designWidth - 400, Math.max(400, f.x)), y: f.y - 2 };
  const shots = hv.shots;
  await page.evaluate(
    ([dx, dy, t]) => {
      const canvas = document.querySelector('#game canvas');
      const g = window.__TM__;
      if (!(canvas instanceof HTMLCanvasElement) || !g) throw new Error('no game');
      const r = canvas.getBoundingClientRect();
      const init = {
        pointerId: t ? 31 : 1,
        pointerType: t ? 'touch' : 'mouse',
        button: 0,
        buttons: 1,
        clientX: r.left + (dx / g.designWidth) * r.width,
        clientY: r.top + (dy / g.designHeight) * r.height,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      (window as { __TM_NAM__?: PointerEventInit }).__TM_NAM__ = init;
    },
    [at.x, at.y, touch] as const,
  );
  await page.waitForFunction(
    () => {
      const z = window.__TM__?.zoom;
      return z !== undefined && z.raise >= 1 && z.z >= 3;
    },
    null,
    { timeout: 60_000 },
  );
  await page.screenshot({ path: `${SCREENSHOTS}/namibie-scope-${info.project.name}.png` });
  await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas');
    const init = (window as { __TM_NAM__?: PointerEventInit }).__TM_NAM__;
    if (canvas && init !== undefined)
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  });
  await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, shots, { timeout: 60_000 });
  expect((await hook(page)).weapon).toBe('langloop');
  expect(errors).toEqual([]);
});

test('Namibië: with Verder unlocked there today, the title starts Verder in Namibië', async ({
  page,
}, info) => {
  gate(info);
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await page.addInitScript((d) => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'medium' },
        ftue: { done: true, skipped: false, step: '' },
        areas: { unlocked: ['namibie'], classic: 'namibie' },
        bonusMaps: { day: d, unlocked: ['namibie/verder'], bests: {} },
      }),
    );
  }, DAY.n);
  await boot(page, `seed=47&today=${DAY.key}&huntSeconds=20`);
  await page.waitForFunction(() => window.__TM__?.rects['verder'] !== undefined, null, {
    timeout: 60_000,
  });
  expect((await hook(page)).classicArea).toBe('namibie');
  await tapRect(page, touch, 'verder');
  await page.waitForFunction(
    () => window.__TM__?.biome === 'namibie' && window.__TM__.map?.bonus === 'verder',
    null,
    { timeout: 120_000 },
  );
  expect(errors).toEqual([]);
});
