// v1.18 (D-081): the Harvest screenshot spec's flags. ?harvestShots=1 makes its moments last (the
// raid's climb down the koppie, a piglet squeezing through the small hole) and is still valid
// content; ?harvestPhase2=1 starts Phase 2 at once, ?harvestPhase2Seconds shortens its clock.
import { describe, expect, it } from 'vitest';
import { BiomeSchema, ModesSchema } from '../content/schemas';
import type { SimEvent } from '../sim/events';
import { ofType } from '../../tools/simHarness';
import { loadContent } from '../../tools/testContent';
import { createSim } from '../sim/Sim';
import { withHarvestPreview } from './devContent';

const base = loadContent();

describe('the Harvest screenshot flags (v1.18, D-081)', () => {
  it('shots: a raid comes down at once and slowly; piglets squeeze through the hole', () => {
    const c = withHarvestPreview(base, { shots: true });
    expect(() => ModesSchema.parse(c.modes)).not.toThrow();
    for (const b of c.biomes) expect(() => BiomeSchema.parse(b)).not.toThrow();
    const s = createSim({ seed: 42, content: c, mode: { id: 'harvest' }, inputKind: 'pointer' });
    let climbTicks = 0;
    let squeezing = 0;
    for (let i = 0; i < 60 * 25; i++) {
      s.step([]);
      s.drainEvents();
      const v = s.snapshot();
      if ((v.baboons?.descenders ?? []).some((d) => d.pose === 'climb')) climbTicks++;
      if ((v.harvest?.piglets ?? []).some((p) => p.squeeze)) squeezing++;
    }
    expect(climbTicks).toBeGreaterThan(60 * 8);
    expect(squeezing).toBeGreaterThan(60 * 3);
  });

  it('shots: the rush outlasts the raid, so its dash into the rows can be shot', () => {
    const c = withHarvestPreview(base, { shots: true });
    const s = createSim({ seed: 42, content: c, mode: { id: 'harvest' }, inputKind: 'pointer' });
    let raiderAt: number | null = null;
    for (let i = 0; i < 60 * 90 && raiderAt === null && !s.isOver(); i++) {
      s.step([]);
      s.drainEvents();
      if ((s.snapshot().baboons?.raiders ?? []).length > 0) raiderAt = i;
    }
    expect(raiderAt, 'a raider reaches the rows before the rush ends').not.toBeNull();
    // Room to pan to the dash and step to it: the rush (30 s) still runs 5 s later.
    for (let i = 0; i < 60 * 5; i++) {
      s.step([]);
      s.drainEvents();
    }
    expect(s.isOver()).toBe(false);
    expect(s.snapshot().harvest?.phase2 ?? null).toBeNull();
  });

  it('phase2 + phase2Seconds: Phase 2 from the start, its clock shortened', () => {
    const c = withHarvestPreview(base, { phase2: true, phase2Seconds: 5 });
    const s = createSim({ seed: 42, content: c, mode: { id: 'harvest' }, inputKind: 'pointer' });
    const ev: SimEvent[] = [];
    for (let i = 0; i < 60 * 20 && !s.isOver(); i++) {
      s.step([]);
      ev.push(...s.drainEvents());
    }
    const started = ofType(ev, 'phase2Started')[0];
    expect(started?.endTick).toBe((started?.tick ?? 0) + 300);
    expect(ofType(ev, 'phase2Ended')[0]?.reason).toBe('time');
  });
});
