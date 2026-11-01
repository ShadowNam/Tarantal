// D-054: the far animals are assembled right in the game: every animal's head (with its neck)
// sits on its body (their boxes overlap at the neck), every part is drawn at its frame's size,
// with Standard and HD. The Karoo's sheets come with the late group (swapped in during the
// hunt); the hook lists each part as drawn (window.__TM__.fauna). Attaches the parts and a
// screenshot of the herds for diagnosis.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { FAUNA_HERDS } from '../../src/game/view/faunaHerds';
import type { FaunaProbe } from '../../src/game/GameContext';
import { hook, isLandscape, isTouchProject, startHunt } from './helpers';

async function huntWithHerds(
  page: Page,
  info: TestInfo,
  biome: string,
  graphics: string,
): Promise<FaunaProbe[]> {
  await page.goto(
    `/?e2e=1&reenbui=0&brakkie=0&biome=${biome}&layout=none&feesdag=none&seed=3&huntSeconds=120&ftue=0&graphics=${graphics}`,
  );
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 120_000 });
  await startHunt(page, isTouchProject(info));
  const herds = (FAUNA_HERDS[biome] ?? []).map((h) => h.key);
  const want = (FAUNA_HERDS[biome] ?? []).reduce((n, h) => n + h.animals.length, 0);
  try {
    await page.waitForFunction(
      ([keys, n, hd]) => {
        const f = window.__TM__?.fauna ?? [];
        const bodies = f.filter((p) => p.part === 'body');
        const ok = keys.every((k) => bodies.some((p) => p.herd === k)) && bodies.length >= n;
        // HD: the late-hd sheets land in the background; wait until they draw.
        return ok && (!hd || f.every((p) => p.source.w > 0 && p.scale.y !== 0));
      },
      [herds, want, graphics === 'hd'] as const,
      { timeout: 120_000 },
    );
  } catch {
    const f = (await hook(page)).fauna;
    throw new Error(
      `far animals not all drawn after 120 s: herds drawn ${[...new Set(f.map((p) => p.herd))].join(', ') || 'none'} of ${herds.join(', ')}`,
    );
  }
  return (await hook(page)).fauna;
}

const overlaps = (a: FaunaProbe['box'], b: FaunaProbe['box']): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The Karoo (late sheets) and the Bushveld (elephants and giraffes, facing both ways).
for (const biome of ['karoo-autumn', 'bushveld-winter'])
  for (const graphics of ['standard', 'hd'])
    test(`far animals are assembled (${biome}, ${graphics}): heads on bodies, parts at frame size`, async ({
      page,
    }, info) => {
      test.skip(!isLandscape(info), 'portrait shows the rotate card');
      test.setTimeout(300_000);
      const parts = await huntWithHerds(page, info, biome, graphics);
      if (biome === 'bushveld-winter')
        for (const sp of ['elephant', 'giraffe'])
          for (const facing of [1, -1])
            expect(
              parts.some(
                (p) =>
                  p.frame.startsWith(`${sp}.`) &&
                  p.part === 'body' &&
                  Math.sign(p.scale.x) === facing,
              ),
              `${sp} facing ${facing} drawn`,
            ).toBe(true);
      await info.attach(`fauna-parts-${biome}-${graphics}.json`, {
        body: JSON.stringify(parts, null, 1),
        contentType: 'application/json',
      });
      await info.attach(`fauna-${biome}-${graphics}.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      const problems: string[] = [];
      const animals = new Map<string, FaunaProbe[]>();
      for (const p of parts) {
        const id = `${p.herd}#${p.animal}`;
        animals.set(id, [...(animals.get(id) ?? []), p]);
        // Drawn at the frame's size (design px): cut ÷ texture px per design px × the part's scale.
        const w = p.cut.w * Math.abs(p.scale.y);
        const h = p.cut.h * Math.abs(p.scale.y);
        if (
          p.part !== 'ear' &&
          Math.abs(p.angle) < 0.01 &&
          (Math.abs(p.box.w - w) > 2 || Math.abs(p.box.h - h) > 2)
        )
          problems.push(`${id} ${p.part}: drawn ${p.box.w}×${p.box.h}, frame ${w}×${h}`);
      }
      for (const [id, ps] of animals) {
        const body = ps.find((p) => p.part === 'body');
        const head = ps.find((p) => p.part === 'head');
        if (body === undefined || head === undefined) {
          problems.push(`${id}: no ${body === undefined ? 'body' : 'head'}`);
          continue;
        }
        if (!overlaps(body.box, head.box)) problems.push(`${id}: head off its body`);
        // A head never reaches further from its body than the body is long.
        const gap = Math.max(
          head.box.x - (body.box.x + body.box.w),
          body.box.x - (head.box.x + head.box.w),
          0,
        );
        if (gap > 0) problems.push(`${id}: head ${gap} px beside its body`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
