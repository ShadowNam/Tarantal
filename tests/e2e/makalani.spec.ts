// 1.9.3 (D-056, GDD §11.3b): makalani nuts in a real Okavango hunt, and the Karoo's far-fence cans.
// Monday's Okavango map (seed 42) has a near palm at the west end: the test pans to it, cracks a
// nut off (it falls: the hook shows it in the air, then lower), then hits a nut in the air (the
// chain shows). On Wednesday's Karoo map it shoots a can on the far fence (it flies). Shots are
// in-page pointer events with a fresh pointerId each (makalaniHelpers.ts); a seeded hunt has fixed
// pellet patterns, so each goal gets several shots.
import { expect, test } from '@playwright/test';
import weaponsJson from '../../content/weapons.json' with { type: 'json' };
import { boot, collectErrors, hook, isLandscape, isTouchProject, startHunt } from './helpers';
import { reloadIfEmpty } from './feesdaeHelpers';
import { FAR_FENCE_WED, PALMS_MON, shootThings, thingsInView } from './makalaniHelpers';

/** The Dubbelloop's fire cooldown in ticks, plus a margin. */
const COOLDOWN = (() => {
  const w = weaponsJson.weapons.find((x) => x.id === 'dubbelloop');
  const ms = w !== undefined && 'fireCooldownMs' in w ? w.fireCooldownMs : 300;
  return Math.ceil((ms * 60) / 1000) + 2;
})();

test.describe('Makalani nuts (1.9.3, D-056)', () => {
  test('crack a nut off: it falls; hit one in the air: the chain shows', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, PALMS_MON);
    await startHunt(page, touch);
    await thingsInView(page, 'nuts', 'near');
    const start = await hook(page);
    expect(start.nuts?.palms.length ?? 0).toBeGreaterThan(0);
    expect(start.nuts?.nuts.every((n) => n.state === 'rest')).toBe(true);
    // The palm art is in and drawn.
    await page.waitForFunction(
      () => (window.__TM__?.nuts?.palms ?? []).some((p) => p.built),
      null,
      { timeout: 60_000 },
    );

    // Crack one off (or pop it: three pellets on it). A cracked nut is in the air, then lower.
    let run = await shootThings(page, touch, 'nuts', 'knock', COOLDOWN, { plane: 'near' });
    for (let i = 0; i < 6 && !run.log.some((e) => e.startsWith('nut-knock')); i++) {
      if (run.empty) await reloadIfEmpty(page, touch);
      run = await shootThings(page, touch, 'nuts', 'knock', COOLDOWN, { plane: 'near' });
    }
    expect(
      run.log.some((e) => e.startsWith('nut-knock')),
      run.log.join(' '),
    ).toBe(true);
    const fell = await page.evaluate(() => {
      const n = (window.__TM__?.nuts?.nuts ?? []).find(
        (x) => x.state !== 'rest' && x.state !== 'popped',
      );
      return n === undefined ? null : { id: n.id, y: n.y };
    });
    if (fell !== null) {
      // Read in the same wait that sees it lower (a transient hook value).
      const lower = await page.waitForFunction(
        ([id, y0]) => {
          const n = (window.__TM__?.nuts?.nuts ?? []).find((x) => x.id === id);
          return n !== undefined && n.y > y0 + 5 ? n.y : false;
        },
        [fell.id, fell.y] as const,
        { timeout: 60_000 },
      );
      expect(await lower.jsonValue()).toBeGreaterThan(fell.y);
    }

    // An air hit: the juggle shows in the log and as a pop.
    const pops0 = (await hook(page)).pops.shown;
    for (let i = 0; i < 14 && !run.log.some((e) => e.startsWith('nut-juggle')); i++) {
      if (run.empty) await reloadIfEmpty(page, touch);
      run = await shootThings(page, touch, 'nuts', 'juggle', COOLDOWN, { plane: 'near' });
    }
    expect(
      run.log.some((e) => e.startsWith('nut-juggle:1:')),
      run.log.join(' '),
    ).toBe(true);
    const h = await hook(page);
    expect(h.nuts?.bestChain ?? 0).toBeGreaterThanOrEqual(1);
    expect(h.pops.shown).toBeGreaterThan(pops0);
    expect(h.score, 'nuts pay event bonuses').toBeGreaterThan(0);
    // Drawing the palms, nuts and cans stays well under a millisecond a frame on average.
    expect(h.sceneryFrames).toBeGreaterThan(0);
    expect(h.canMs / h.sceneryFrames, 'ms a frame drawing cans and nuts').toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('a can on the Karoo far fence flies when shot', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, FAR_FENCE_WED);
    await startHunt(page, touch);
    await thingsInView(page, 'farCans');
    const start = await hook(page);
    expect(start.farCans?.plane).toBe('mid');
    expect(start.cans?.plane).toBe('near');
    let run = await shootThings(page, touch, 'farCans', 'knock', COOLDOWN);
    for (let i = 0; i < 6 && !run.log.some((e) => e.startsWith('knock')); i++) {
      if (run.empty) await reloadIfEmpty(page, touch);
      run = await shootThings(page, touch, 'farCans', 'knock', COOLDOWN);
    }
    expect(
      run.log.some((e) => e.startsWith('knock')),
      run.log.join(' '),
    ).toBe(true);
    // The far can flies (read where the hook sees it in the air).
    const flying = await page.waitForFunction(
      () => {
        const s = window.__TM__?.farCans?.spots ?? [];
        const c = s.find((x) => x.state === 'air' || x.state === 'bounced' || x.state === 'landed');
        return c === undefined ? false : c.state;
      },
      null,
      { timeout: 60_000 },
    );
    expect(['air', 'bounced', 'landed']).toContain(await flying.jsonValue());
    expect(errors).toEqual([]);
  });
});
