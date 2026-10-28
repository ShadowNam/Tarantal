import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { AimView, PowerupView, SimState } from '../../sim/types';
import { inputSightZoom, redDotIds, redDotUp } from './redDot';

const content = loadContent();
const ids = redDotIds(content);

const aim = (redDot: boolean): AimView => ({
  sight: 'scope_var',
  redDot,
  zoom: 3,
  progress: 1,
  dx: 0,
  sy: 300,
  swayDx: 0,
  swayDy: 0,
  breath: 'steady',
  heldTicks: 30,
});
const rooikol: PowerupView = { id: 'rooikol', ticksLeft: 100, totalTicks: 900, shellsLeft: null };
const weapon = { kind: 'primary', sight: 'scope_var', zoomStep: 2 } as SimState['weapon'];

describe('redDot (D-055)', () => {
  it('the content has one red-dot power-up: the Rooikol', () => {
    expect([...ids]).toEqual(['rooikol']);
  });

  it('idle: up while the Rooikol runs (the next press is a red dot)', () => {
    expect(redDotUp({ aim: null, powerups: [rooikol] }, ids)).toBe(true);
    expect(redDotUp({ aim: null, powerups: [] }, ids)).toBe(false);
  });

  it("holding: the hold's own red dot decides, whatever runs now", () => {
    // Pressed with the Rooikol, which has ended since: still a red dot until the release.
    expect(redDotUp({ aim: aim(true), powerups: [] }, ids)).toBe(true);
    // Pressed through the scope before the pickup: still the scope.
    expect(redDotUp({ aim: aim(false), powerups: [rooikol] }, ids)).toBe(false);
  });

  it('fine aim moves 1:1 under the red dot, ÷ the zoom through the scope', () => {
    expect(inputSightZoom({ weapon, aim: aim(true), powerups: [] }, content, ids)).toBe(1);
    expect(inputSightZoom({ weapon, aim: null, powerups: [rooikol] }, content, ids)).toBe(1);
    expect(inputSightZoom({ weapon, aim: aim(false), powerups: [rooikol] }, content, ids)).toBe(9);
    expect(inputSightZoom({ weapon, aim: null, powerups: [] }, content, ids)).toBe(9);
    const shotgun = { kind: 'primary', sight: null, zoomStep: 0 } as SimState['weapon'];
    expect(inputSightZoom({ weapon: shotgun, aim: null, powerups: [rooikol] }, content, ids)).toBe(
      null,
    );
  });
});
