import { describe, expect, it } from 'vitest';
import type { TestHook } from '../GameContext';
import { nameSceneWhenHudReady, type HudCreated } from './hudReadyScene';

function fakeHud(): HudCreated & { create(): void } {
  let fns: (() => void)[] = [];
  return {
    once: (_e, fn) => fns.push(fn),
    create: () => {
      const run = fns;
      fns = [];
      for (const fn of run) fn();
    },
  };
}

describe('nameSceneWhenHudReady', () => {
  it('a hunt reads "hunt" only once the HUD is created', () => {
    const hook: Pick<TestHook, 'scene'> = { scene: 'start' };
    const hud = fakeHud();
    nameSceneWhenHudReady(hook, hud, 'hunt', () => true);
    expect(hook.scene).toBe('start');
    hud.create();
    expect(hook.scene).toBe('hunt');
  });

  it('the Skietbaan keeps "range" (as skietbaan.spec reads it), never "hunt"', () => {
    const hook: Pick<TestHook, 'scene'> = { scene: 'skietbaan' };
    const hud = fakeHud();
    nameSceneWhenHudReady(hook, hud, 'range', () => true);
    // Skietbaan.attach() names it at once; the HUD's create must not overwrite it.
    hook.scene = 'range';
    hud.create();
    expect(hook.scene).toBe('range');
  });

  it('a Season Run hunt goes from "run" to "hunt"; a hunt left before the HUD came keeps its name', () => {
    const run: Pick<TestHook, 'scene'> = { scene: 'run' };
    const hud = fakeHud();
    nameSceneWhenHudReady(run, hud, 'hunt', () => true);
    hud.create();
    expect(run.scene).toBe('hunt');
    const left: Pick<TestHook, 'scene'> = { scene: 'start' };
    const hud2 = fakeHud();
    nameSceneWhenHudReady(left, hud2, 'hunt', () => false);
    hud2.create();
    expect(left.scene).toBe('start');
  });
});
