// v1.8 (D-050, GDD §11.3): Blikkies in a real hunt and on the Skietbaan. Wednesday's Karoo map has
// a fence of four tin cans on the near plane; the test pans it to the middle, knocks a can off and
// juggles it in the air twice (aiming at the can as the hook shows it at the top of its arc), and
// checks the score, the chain and the dents. On the Skietbaan the Blikkies target puts a short
// fence up at the chosen distance and its stats count the knock-offs and the report shows them.
// Shots are in-page pointer events with a fresh pointerId each (blikkiesHelpers.ts).
import { expect, test } from '@playwright/test';
import weaponsJson from '../../content/weapons.json' with { type: 'json' };
import { boot, collectErrors, hook, isLandscape, isTouchProject, startHunt } from './helpers';
import { reloadIfEmpty } from './feesdaeHelpers';
import { NEAR_FENCE, fenceInView, juggle } from './blikkiesHelpers';

/** The Dubbelloop's fire cooldown in ticks, plus a margin. */
const COOLDOWN = (() => {
  const w = weaponsJson.weapons.find((x) => x.id === 'dubbelloop');
  const ms = w !== undefined && 'fireCooldownMs' in w ? w.fireCooldownMs : 300;
  return Math.ceil((ms * 60) / 1000) + 2;
})();

test.describe('Blikkies: tin cans on the fence posts (v1.8, D-050)', () => {
  test('knock a can off, juggle it twice in the air; the score and the chain show', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, NEAR_FENCE);
    await startHunt(page, touch);
    await fenceInView(page);
    const start = await hook(page);
    expect(start.cans?.plane).toBe('near');
    expect(start.cans?.spots.every((c) => c.state === 'rest')).toBe(true);
    const pops0 = start.pops.created;

    // Knock one off: a can in the air pays the knock-off.
    let run = await juggle(page, touch, 0, COOLDOWN);
    for (let i = 0; i < 4 && !run.log.some((e) => e.startsWith('knock')); i++) {
      if (run.empty) await reloadIfEmpty(page, touch);
      run = await juggle(page, touch, 0, COOLDOWN);
    }
    expect(
      run.log.some((e) => e.startsWith('knock')),
      run.log.join(' '),
    ).toBe(true);

    // Then keep one in the air for two more hits. A can that lands is lost: the next one goes up.
    for (let i = 0; i < 12 && run.bestChain < 2; i++) {
      if (run.empty) await reloadIfEmpty(page, touch);
      run = await juggle(page, touch, 2, COOLDOWN);
    }
    expect(run.bestChain, run.log.join(' ')).toBeGreaterThanOrEqual(2);
    const juggles = run.log.filter((e) => e.startsWith('juggle:'));
    // Air hits pay more as the chain grows (juggle:<chain>:<points>).
    const two = juggles.find((e) => e.startsWith('juggle:2:'));
    const one = juggles.find((e) => e.startsWith('juggle:1:'));
    expect(Number(two?.split(':')[2])).toBeGreaterThan(Number(one?.split(':')[2]));

    const h = await hook(page);
    expect(h.score, 'cans pay event bonuses').toBeGreaterThan(0);
    // The chain pops ("2× in the air!") and the knock-off's "Tink!" came with the hits.
    expect(h.pops.created).toBeGreaterThan(pops0 + 2);
    // Dents stay on the cans that were hit.
    expect(h.cans?.spots.some((c) => c.marks > 0)).toBe(true);
    // Perf (Pixel 7 profile and the others): drawing the fence and the cans in the air stays
    // well under a millisecond a frame on average.
    expect(h.sceneryFrames).toBeGreaterThan(0);
    expect(h.canMs / h.sceneryFrames, 'ms a frame drawing the cans').toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('the Skietbaan Blikkies target: knock-offs count and the report shows them', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await page.goto('/?e2e=1&admin=1');
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 90_000,
    });
    const press = async (selector: string): Promise<void> => {
      const el = page.locator(selector);
      await el.scrollIntoViewIfNeeded();
      if (touch) await el.tap();
      else await el.click();
    };
    await press('#tm-admin [data-action=skietbaan]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await press('#tm-range [data-role=plane] [data-value=near]');
    await press('#tm-range [data-role=target] [data-value=cans]');
    await press('#tm-range [data-action=start]');
    await page.waitForFunction(
      () => window.__TM__?.range?.view === 'range' && window.__TM__.range.target === 'cans',
      null,
      { timeout: 90_000 },
    );
    // Desktop: the bar sits in the left edge-pan band; rest the mouse in the middle.
    if (!touch) {
      const box = await page.locator('#game canvas').boundingBox();
      if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForFunction(() => (window.__TM__?.cans?.spots.length ?? 0) === 3, null, {
      timeout: 60_000,
    });
    // The range's reserve never runs out; keep shooting until a can is knocked off and counted.
    let run = await juggle(page, touch, 0, COOLDOWN);
    for (let i = 0; i < 4 && !run.log.some((e) => e.startsWith('knock')); i++) {
      if (run.empty) await reloadIfEmpty(page, touch);
      run = await juggle(page, touch, 0, COOLDOWN);
    }
    await page.waitForFunction(() => (window.__TM__?.range?.stats?.cans.knocks ?? 0) >= 1, null, {
      timeout: 60_000,
    });
    const stats = await page.evaluate(() => window.__TM__?.range?.stats ?? null);
    expect(stats?.hits).toBeGreaterThanOrEqual(1);
    expect(stats?.lines.join('\n')).toMatch(/Knocked off: \d+ in \d+ shots/);
    expect(stats?.lines.join('\n')).toMatch(/longest chain \d+/);
    // Unscored, like the rest of the range.
    expect((await hook(page)).score).toBe(0);
    expect(errors).toEqual([]);
  });
});
