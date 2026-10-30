import type { TestHook } from '../GameContext';

/** What the hook's scene name needs of the HUD scene: its CREATE event, once. */
export interface HudCreated {
  once(event: 'create', fn: () => void): unknown;
}

/**
 * The test hook names the hunt's scene (`name`: 'range' on the Skietbaan, 'hunt' otherwise)
 * once the HUD is up: launch() creates the HUD on the next step, and its pause button exists only
 * then (a test that read 'hunt' a frame early tapped a pause button not yet there). `alive`: the
 * hunt scene is still running then.
 */
export function nameSceneWhenHudReady(
  hook: Pick<TestHook, 'scene'>,
  hud: HudCreated,
  name: 'hunt' | 'range',
  alive: () => boolean,
): void {
  hud.once('create', () => {
    if (alive()) hook.scene = name;
  });
}
