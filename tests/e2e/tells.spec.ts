// v1.7e (D-061): the secrets' tell animals (the cue that replaced the hint glint), in the Bushveld:
// every secret that pays has its tell on screen (the agama, the drongo, the skink), a hit on one
// costs nothing (the score stays, no penalty) and it leaves and comes back, a held frame holds
// them still, and a dusk map (Saturday) lights them with the warm outline (Oupa se Kaart's look).
// Shots are in-page pointer events with a fresh pointerId each (feesdaeHelpers.fireAt); the
// seeded pellet patterns are fixed, so the hit takes several shots, each a miss after ~25 ticks.
import { expect, test, type Page } from '@playwright/test';
import birds from '../../content/birds.json' with { type: 'json' };
import bushveld from '../../content/biomes/bushveld-winter.json' with { type: 'json' };
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { boot, hook, isTouchProject, startHunt, waitTicks } from './helpers';

const BASE = 'biome=bushveld-winter&seed=42&huntSeconds=300&birds=0&graphics=standard';

interface Tell {
  readonly species: string;
  readonly propId: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly glow: boolean;
}

/** The hook's tells (null until the tell chunk is in). */
async function tellsOf(page: Page): Promise<readonly Tell[] | null> {
  return page.evaluate(
    () => (window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells ?? null,
  );
}

/** The biome's props, read loosely (only the secret's reward and tell matter here). */
interface LooseProp {
  readonly id: string;
  readonly secret?: { readonly reward: object; readonly tell?: { readonly species: string } };
}
const paying = (bushveld.props as readonly LooseProp[]).filter(
  (p) => p.secret !== undefined && !('penalty' in p.secret.reward),
);

/** Waits until every tell is listed and drawn from the delivered sheet (the late group). */
async function tellsIn(page: Page): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const t = (window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells;
      return (t?.length ?? 0) === n && (t ?? []).every((x) => x.frame !== null || !x.visible);
    },
    paying.length,
    { timeout: 300_000 },
  );
}

test.use({ serviceWorkers: 'block' });

test('every Bushveld secret has its tell animal on screen, drawn from the sheet', async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  await boot(page, BASE);
  await startHunt(page, isTouchProject(info));
  await tellsIn(page);
  const tells = (await tellsOf(page)) ?? [];
  expect(tells.map((t) => t.propId).sort()).toEqual(paying.map((p) => p.id).sort());
  for (const p of paying) {
    const want = p.secret?.tell?.species;
    expect(tells.find((t) => t.propId === p.id)?.species, p.id).toBe(want);
  }
  // Each one is shown (resting or acting) at some tick in the first seconds.
  await page.waitForFunction(
    () => {
      const t = (window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells;
      return (t ?? []).length > 0 && (t ?? []).every((x) => x.visible && x.frame !== null);
    },
    null,
    { timeout: 120_000 },
  );
});

test('a hit on the drongo costs nothing; it leaves and comes back', async ({ page }, info) => {
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await boot(page, BASE);
  await startHunt(page, touch);
  await tellsIn(page);
  // Pan west until the baobab's drongo is well inside the screen (bounded).
  const drongo = async (): Promise<Tell | undefined> =>
    (await tellsOf(page))?.find((t) => t.species === 'fork_tailed_drongo');
  const w = (await hook(page)).designWidth;
  for (let k = 0; k < 120; k++) {
    const d = await drongo();
    if (d !== undefined && d.x > 300 && d.x < w - 300) break;
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(150);
    await page.keyboard.up('KeyA');
  }
  const hit = birds.tells.species.find((s) => s.id === 'fork_tailed_drongo')?.hit;
  if (hit === undefined) throw new Error('no drongo in birds.json');
  let gone = false;
  let scoreBefore = -1;
  for (let shot = 0; shot < 30 && !gone; shot++) {
    await reloadIfEmpty(page, touch);
    const d = await drongo();
    if (d === undefined || !d.visible) {
      await waitTicks(page, 20);
      continue;
    }
    const fired = await fireAt(page, touch, { x: d.x + hit.ox, y: d.y + hit.oy });
    if (fired === null) continue;
    if (scoreBefore < 0) scoreBefore = fired.score;
    const t0 = (await hook(page)).tick;
    // Read the transient state in the same wait that sees it: the drongo gone.
    gone = await page
      .waitForFunction(
        (until) => {
          const tm = (window as unknown as { __TM__?: { tick: number; tells?: Tell[] | null } })
            .__TM__;
          const t = tm?.tells?.find((x) => x.species === 'fork_tailed_drongo');
          if (t !== undefined && (!t.visible || t.frame?.endsWith('_flee') === true)) return true;
          return (tm?.tick ?? 0) >= until ? 'miss' : false;
        },
        t0 + 25,
        { timeout: 120_000 },
      )
      .then(async (h) => (await h.jsonValue()) === true);
  }
  expect(gone, 'the drongo was hit within 30 shots').toBe(true);
  const after = await hook(page);
  // No birds on this map: a shot scores nothing but a bag, and a tell costs nothing.
  expect(after.score).toBe(scoreBefore);
  // It comes back within goneSeconds (+ its flight), on sim time.
  const back = (((birds.tells.goneSeconds as readonly number[])[1] ?? 9) + 1) * 60;
  const tBack = after.tick + back;
  await page.waitForFunction(
    (until) => {
      const tm = (window as unknown as { __TM__?: { tick: number; tells?: Tell[] | null } }).__TM__;
      const t = tm?.tells?.find((x) => x.species === 'fork_tailed_drongo');
      return (
        (t?.visible === true && t.frame?.endsWith('_flee') === false) || (tm?.tick ?? 0) > until
      );
    },
    tBack,
    { timeout: 300_000 },
  );
  const d = await drongo();
  expect(d?.visible, 'the drongo is back').toBe(true);
});

test('a held frame holds the tells; a dusk map lights them', async ({ page }, info) => {
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  // Saturday is the dusk map: the secrets are lit (the tells' warm outline).
  await boot(page, `${BASE}&layout=sat`);
  await startHunt(page, touch);
  await tellsIn(page);
  await page.waitForFunction(
    () =>
      ((window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells ?? []).some(
        (t) => t.visible && t.glow,
      ),
    null,
    { timeout: 120_000 },
  );
  const at = await page.evaluate(() => {
    const t = (window.__TM__?.tick ?? 0) + 30;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  });
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 300_000 });
  await page.waitForTimeout(500);
  const a = await tellsOf(page);
  await page.waitForTimeout(1500);
  const b = await tellsOf(page);
  expect(b).toEqual(a);
  expect((await hook(page)).tick).toBe(at);
});
