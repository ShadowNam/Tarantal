// v1.18 (D-081): a second, small hole low in the Harvest's fence. Yearlings (smaller warthogs,
// one hit) squeeze through it now and then, some with a piglet behind; in the hole they are slow
// and drawn low; the workers patch it late in the rush and nobody comes through after; anyone who
// came in by it runs out by the gap once it is patched.
import { describe, expect, it } from 'vitest';
import { ofType } from '../../../tools/simHarness';
import { loadContent } from '../../../tools/testContent';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import { createSim } from '../Sim';
import { coreWidth } from '../world';

const content = loadContent();
const H = content.modes.modes.harvest;
const oes = content.biomes.find((b) => b.id === 'oes');
const INTRO = secondsToTicks(H.intro.seconds);
const RUSH = secondsToTicks(H.huntSeconds);

function run(seed: number) {
  const s = createSim({ seed, content, mode: { id: 'harvest' }, inputKind: 'pointer' });
  const ev: SimEvent[] = [];
  let squeezed = { warthog: 0, piglet: 0 };
  let patchedSeen = false;
  let openSeen = false;
  for (let i = 0; i < 20000 && !s.isOver(); i++) {
    s.step([]);
    ev.push(...s.drainEvents());
    const h = s.snapshot().harvest;
    if (h === null) continue;
    if (h.hole?.patched === true) patchedSeen = true;
    else if (h.hole !== null) openSeen = true;
    for (const w of h.warthogs)
      if (w.squeeze) squeezed = { ...squeezed, warthog: squeezed.warthog + 1 };
    for (const p of h.piglets)
      if (p.squeeze) squeezed = { ...squeezed, piglet: squeezed.piglet + 1 };
  }
  return { ev, squeezed, patchedSeen, openSeen };
}

describe('the small hole in the fence (v1.18, D-081)', () => {
  it('is on the gap layer, away from the workers (left of the gap; they stand right)', () => {
    const map = oes?.harvest;
    if (map?.hole === undefined) throw new Error('no hole');
    expect(map.hole.u).toBeLessThan(map.gap.u);
    const w = coreWidth(0.6);
    expect((map.gap.u - map.hole.u) * w).toBeGreaterThan(map.gap.halfWidthPx + 400);
    for (const k of map.workers) expect(k.dx).toBeGreaterThan(0);
  });

  it('yearlings come through it, some piglets too, until the workers patch it late in the rush', () => {
    let young = 0;
    let withPiglet = 0;
    let squeezedW = 0;
    let squeezedP = 0;
    for (const seed of [3, 4, 5, 6]) {
      const r = run(seed);
      const ys = ofType(r.ev, 'warthogEntered').filter((e) => e.young);
      young += ys.length;
      withPiglet += ys.filter((e) => e.piglets > 0).length;
      squeezedW += r.squeezed.warthog;
      squeezedP += r.squeezed.piglet;
      const patched = ofType(r.ev, 'harvestHolePatched');
      expect(patched).toHaveLength(1);
      const at = patched[0]?.tick ?? 0;
      expect(at).toBe(INTRO + Math.ceil(RUSH * H.hole.patchAt));
      for (const e of ys) expect(e.tick).toBeLessThan(at);
      expect(r.openSeen && r.patchedSeen).toBe(true);
    }
    expect(young).toBeGreaterThan(3);
    expect(withPiglet).toBeGreaterThan(0);
    expect(squeezedW).toBeGreaterThan(0);
    expect(squeezedP).toBeGreaterThan(0);
  });

  it('a yearling is bagged with youngHitsToBag hits and pays youngPointsMul', () => {
    expect(H.hole.youngHitsToBag).toBeLessThan(H.warthogs.hitsToBag);
    expect(H.hole.youngPointsMul).toBeLessThan(H.warthogs.pointsMul);
  });
});
