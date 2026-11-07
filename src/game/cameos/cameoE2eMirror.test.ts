// v1.13 (D-075, review round 2): the e2e's aimed shot (tests/e2e/cameos.spec.ts) replayed in Node
// with the same flags — the Karoo's plain map, seed 42, ?birds=0&baboons=0&brakkie=0&reenbui=0
// &cameoPreview=tortoise — so the shot can't silently fail every time: nothing a player aims at
// stands within hit.guardPx of the preview tortoise (else the benefit of the doubt would spare it),
// and a shot at its body is charged −10.
import { describe, expect, it } from 'vitest';
import { base } from '../../../tools/simHarness';
import { createSim } from '../../sim/Sim';
import {
  withCameoParams,
  withNoBaboons,
  withNoBirds,
  withNoBrakkie,
  withNoReenbui,
} from '../devContent';

describe('the cameos e2e, mirrored (D-075)', () => {
  it('a shot at the preview tortoise on the Karoo, seed 42, is aimed and costs −10', () => {
    const content = withCameoParams(
      withNoBrakkie(withNoBaboons(withNoBirds(withNoReenbui(base)))),
      new URLSearchParams('cameoPreview=tortoise'),
    );
    for (const inputKind of ['pointer', 'touch'] as const) {
      const s = createSim({
        seed: 42,
        content,
        mode: { id: 'classic', biome: 'karoo-autumn' },
        inputKind,
      });
      let v = s.snapshot().cameos?.visits.find((x) => x.kind === 'tortoise');
      for (let i = 0; i < 600 && v === undefined; i++) {
        s.step([]);
        v = s.snapshot().cameos?.visits.find((x) => x.kind === 'tortoise');
      }
      const m = v?.members[0];
      if (v === undefined || m === undefined) throw new Error('no preview tortoise');
      const body = content.cameos.kinds.tortoise.hitboxes.adult[0];
      if (body === undefined) throw new Error('no hitbox');
      // The near plane's scroll factor is 1: screen dx = layer x − the camera.
      const st = s.snapshot();
      s.drainEvents();
      s.step([{ t: 'fire', dx: m.x + body.ox * v.facing - st.cameraX, sy: m.y + body.oy }]);
      const hit = s.drainEvents().find((e) => e.type === 'cameoHit');
      expect(hit?.type === 'cameoHit' && hit.aimed, inputKind).toBe(true);
      expect(s.snapshot().score).toBe(-content.cameos.hit.penalty);
    }
  });
});
