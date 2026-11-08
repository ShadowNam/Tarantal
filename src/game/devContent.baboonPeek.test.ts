// v1.16 (D-078): ?baboonPeek= (e2e and art previews): the content stays valid, every troop is
// there, no raid comes, and a member is up over the ridge within a few seconds (a sentinel in
// `sentinel` mode) — the screenshot and e2e moments come quickly (lesson 10).
import { describe, expect, it } from 'vitest';
import { base } from '../../tools/simHarness';
import { BaboonsSchema } from '../content/schemas';
import { createSim } from '../sim/Sim';
import { BABOON_PEEKS, withBaboonPeek } from './devContent';

describe('baboon peek test flags (D-078)', () => {
  for (const mode of BABOON_PEEKS)
    it(`${mode}: valid tuning, a troop on the Karoo, up within seconds, no raid`, () => {
      const b = withBaboonPeek(base, mode);
      expect(BaboonsSchema.safeParse(b.birds.baboons).success).toBe(true);
      const sim = createSim({
        seed: 42,
        content: b,
        mode: { id: 'classic', biome: 'karoo-autumn', huntSeconds: 120 },
        inputKind: 'pointer',
      });
      let up = -1;
      for (let k = 0; k < 60 * 30 && up < 0; k++) {
        sim.step([]);
        sim.drainEvents();
        const m = sim
          .snapshot()
          .baboons?.troops[0]?.members.find((x) =>
            mode === 'sentinel' ? x.pose === 'sentinel' : x.pose === 'peek',
          );
        if (m !== undefined) up = k;
        expect(sim.snapshot().baboons?.raid ?? null).toBeNull();
      }
      expect(up).toBeGreaterThanOrEqual(0);
      expect(up).toBeLessThan(60 * (mode === 'sentinel' ? 20 : 5));
    });
});
