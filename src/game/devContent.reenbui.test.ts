// v1.10 (D-067): the Reënbui test flags — off under ?e2e (no area), forced everywhere with
// ?reenbui=1, and ?reenbuiPhase= holding one phase after half-second earlier ones.
import { describe, expect, it } from 'vitest';
import { base } from '../../tools/simHarness';
import { createSim } from '../sim/Sim';
import { withNoReenbui, withReenbuiPreview } from './devContent';

describe('Reënbui test flags (D-067)', () => {
  it('?e2e without ?reenbui= has none, even on a forcing Wednesday', () => {
    const c = withNoReenbui(base);
    const mode = { id: 'classic' as const, biome: 'kalahari-summer', layout: 'wed' };
    expect(createSim({ seed: 1, content: c, mode, inputKind: 'pointer' }).snapshot().reenbui).toBe(
      null,
    );
    expect(
      createSim({ seed: 1, content: base, mode, inputKind: 'pointer' }).snapshot().reenbui,
    ).not.toBe(null);
  });

  it('?reenbui=1 brings it 2 s in on every map; ?reenbuiPhase= holds a phase', () => {
    const c = withReenbuiPreview(base, null);
    for (const biome of ['karoo-autumn', 'bushveld-winter', 'namibie']) {
      const v = createSim({
        seed: 3,
        content: c,
        mode: { id: 'classic', biome },
        inputKind: 'pointer',
      }).snapshot().reenbui;
      expect(v?.buildupTick).toBe(120);
    }
    const held = withReenbuiPreview(base, 'swarm');
    const v = createSim({
      seed: 3,
      content: held,
      mode: { id: 'classic' },
      inputKind: 'pointer',
    }).snapshot().reenbui;
    expect(v?.swarmTick).toBe(120 + 60);
    expect((v?.easingTick ?? 0) - (v?.swarmTick ?? 0)).toBe(600 * 60);
  });
});
