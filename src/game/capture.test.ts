import { describe, expect, it } from 'vitest';
import { CaptureState, captureAllowed } from './capture';

describe('capture mode (M10)', () => {
  it('is available on web (and test-hook portal builds) only with ?capture=1', () => {
    expect(captureAllowed({ platform: 'web', testHooksFlag: false, captureParam: true })).toBe(
      true,
    );
    expect(captureAllowed({ platform: 'web', testHooksFlag: false, captureParam: false })).toBe(
      false,
    );
    expect(captureAllowed({ platform: 'poki', testHooksFlag: false, captureParam: true })).toBe(
      false,
    );
    expect(
      captureAllowed({ platform: 'crazygames', testHooksFlag: false, captureParam: true }),
    ).toBe(false);
    expect(captureAllowed({ platform: 'poki', testHooksFlag: true, captureParam: true })).toBe(
      true,
    );
  });

  it('S cycles slow-mo, F freezes, C pans end to end and turns around', () => {
    const c = new CaptureState({ speeds: [1, 0.5, 0.25], panTurnPx: 40 }, true);
    expect(c.timeScale).toBe(1);
    c.key('KeyS');
    expect(c.timeScale).toBe(0.5);
    c.key('KeyS');
    c.key('KeyS');
    expect(c.timeScale).toBe(1);
    c.key('KeyF');
    expect(c.timeScale).toBe(0);
    c.key('KeyF');
    expect(c.panDirection(500, 0, 1000)).toBe(0);
    expect(c.key('KeyC')).toBe(true);
    expect(c.panDirection(500, 0, 1000)).toBe(1);
    expect(c.panDirection(970, 0, 1000)).toBe(-1);
    expect(c.panDirection(500, 0, 1000)).toBe(-1);
    expect(c.panDirection(20, 0, 1000)).toBe(1);
    expect(c.key('KeyX')).toBe(false);
  });
});
