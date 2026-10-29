// The Android back button (D-058). It reuses the Escape key's paths, so it means exactly what
// Escape means: in a hunt the InputMapper opens the pause menu, in the pause menu it resumes, and
// in every other menu it is that menu's Back. Only on the title screen, where Escape does nothing,
// does the app go to the background. It never leaves a hunt without the pause menu.

export interface BackDeps {
  /** Sends a cancelable Escape keydown to the page; true when a listener used it. */
  readonly sendEscape: () => boolean;
  /** The title screen is the top scene (no hunt, no menu over it). */
  readonly atTitle: () => boolean;
}

/** True: the game handled the press. False: the app should go to the background. */
export function handleBack(d: BackDeps): boolean {
  if (d.sendEscape()) return true;
  // Unhandled outside the title (a hunt's countdown or tally, a scene change): swallow it.
  return !d.atTitle();
}

/** The real Escape: a keydown on the document body (it bubbles to the window listeners). */
export function sendEscapeKey(target: EventTarget): boolean {
  const e = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** Scenes that sit over the title (menus) or belong to a hunt in play. */
const NOT_ROOT = [
  'Shed',
  'Settings',
  'Area',
  'Privacy',
  'Challenge',
  'Admin',
  'Pause',
  'Tally',
  'Run',
  'Hud',
];

/** The title is up with no menu or hunt over it (the running scenes' keys, any order). */
export function titleOnTop(activeScenes: readonly string[]): boolean {
  return activeScenes.includes('Title') && !activeScenes.some((k) => NOT_ROOT.includes(k));
}
