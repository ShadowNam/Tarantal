// v1.18 (D-081, review): a Phase 2 baboon is never drawn invisible while the sim can hit it: until
// the lazy Phase 2 sheet is in, its climb and drop borrow a run frame from the baboon sheet.
import { describe, expect, it } from 'vitest';
import { phase2BaboonFrame } from './HarvestView';

describe('phase2BaboonFrame (v1.18, D-081, review)', () => {
  it('climbing or dropping before the Phase 2 sheet is in: a run frame (never none)', () => {
    for (const phase of ['climb', 'drop'] as const)
      for (let t = 0; t < 30; t++) {
        const f = phase2BaboonFrame(phase, t, false, 60);
        expect(['run_a', 'run_b']).toContain(f.frame);
        expect(f.alpha).toBe(1);
      }
  });

  it('with the sheet in: its own climb and drop frames', () => {
    expect(phase2BaboonFrame('climb', 0, true, 60).frame).toBe('bb_climb_a');
    expect(phase2BaboonFrame('drop', 0, true, 60).frame).toBe('bb_drop');
  });

  it('every phase has a frame, sheet or not', () => {
    const phases = ['approach', 'climb', 'drop', 'go', 'eat', 'flee', 'tumble'] as const;
    for (const ready of [false, true])
      for (const phase of phases)
        expect(
          phase2BaboonFrame(phase, 3, ready, 60).frame,
          `${phase} ${String(ready)}`,
        ).toBeTruthy();
  });
});
