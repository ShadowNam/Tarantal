// D-051 (Karoo polish): the HD aloes and potjie swap in once the late group lands; the potjie
// simmers (lid rattles), and the lid secret still pays +5 s with Oupa's "Kos is reg!" once per
// hunt, while the lid flies off and lies beside the pot. Desktop, Pixel 7 and iPhone 14 landscape.
import { expect, test } from '@playwright/test';
import { boot, collectErrors, hook, isLandscape, isTouchProject, startHunt } from './helpers';
import { panLeft, shootLidOff, waitHd } from './potjieHelpers';

test.use({ serviceWorkers: 'block' });

test('potjie: HD art lands, the lid rattles, shot it flies off (+5 s, bark, lid off)', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape profiles only');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=42&huntSeconds=180');
  await startHunt(page, touch);
  await waitHd(page);
  await panLeft(page, touch);

  // The lid sits on the pot and rattles every few seconds.
  await page.waitForFunction(() => (window.__TM__?.potjie?.rattles ?? 0) > 0, null, {
    timeout: 240_000,
  });
  const lidded = await hook(page);
  expect(lidded.potjie?.lidOff).toBe(false);
  expect(lidded.potjie?.lid).not.toBeNull();
  expect(lidded.potjie?.wisps ?? 0).toBeGreaterThan(0);

  const before = await shootLidOff(page, touch);
  // +5 s and the bark, read with the lid-off state in one look.
  const after = await page.waitForFunction(
    (b) => {
      const h = window.__TM__;
      const p = h?.potjie;
      if (!h || !p?.lidOff) return null;
      if (h.durationTicks !== b + 300) return null;
      if (!h.secretBarks.includes('bark.kos_is_reg')) return null;
      return { duration: h.durationTicks, barks: h.secretBarks.slice() };
    },
    before,
    { timeout: 120_000 },
  );
  const v = (await after.jsonValue()) as { duration: number; barks: string[] };
  expect(v.duration).toBe(before + 300);
  expect(v.barks.filter((b) => b === 'bark.kos_is_reg')).toHaveLength(1);

  // The lid lands beside the pot with its clang and settles (read once its bounce is over: on
  // WebKit the first read caught it mid-bounce); then it stays there, with no more rattles.
  await page.waitForFunction(
    () => {
      const p = window.__TM__?.potjie;
      return p?.clangs === 1 && p.lidSettled && (p.lid?.x ?? 0) > 100;
    },
    null,
    { timeout: 120_000 },
  );
  const landed = await hook(page);
  const rattles = landed.potjie?.rattles ?? 0;
  expect(landed.potjie?.lid?.y ?? 0).toBeGreaterThan(60);
  // Once per hunt: the lid part is spent.
  expect(landed.secretSpots.some((s) => s.partId === 'lid' && s.ready)).toBe(false);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, landed.tick + 5 * 60, {
    timeout: 120_000,
  });
  const later = await hook(page);
  expect(later.potjie?.rattles).toBe(rattles);
  expect(later.potjie?.lid).toEqual(landed.potjie?.lid);
  expect(later.durationTicks).toBe(before + 300);
  expect(errors).toEqual([]);
});
