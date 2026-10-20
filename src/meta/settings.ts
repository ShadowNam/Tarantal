// Player settings that exist before the Settings screen (M5). Stored via storage.ts.
import { isBoolean, readValue, writeValue } from './storage';

const SHAKE = 'settings.screenShake';

/** Screen shake on by default unless the OS asks for reduced motion. */
export function screenShakeEnabled(prefersReducedMotion: boolean): boolean {
  return readValue(SHAKE, !prefersReducedMotion, isBoolean);
}

export function setScreenShake(on: boolean): void {
  writeValue(SHAKE, on);
}
