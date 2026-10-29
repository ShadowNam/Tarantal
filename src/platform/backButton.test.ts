import { describe, expect, it } from 'vitest';
import { handleBack, titleOnTop } from './backButton';

describe('Android back button (D-058)', () => {
  it('is Escape wherever Escape is used: pause in a hunt, Back in menus', () => {
    let sent = 0;
    // In a hunt the InputMapper takes Escape (opens the pause menu); in a menu, its onBack does.
    expect(
      handleBack({
        sendEscape: () => {
          sent++;
          return true;
        },
        atTitle: () => false,
      }),
    ).toBe(true);
    expect(sent).toBe(1);
  });

  it('never leaves the game outside the title, even when nothing used the press', () => {
    // A hunt's countdown, its tally or a scene change: swallowed, the app stays.
    expect(handleBack({ sendEscape: () => false, atTitle: () => false })).toBe(true);
  });

  it('sends the app to the background from the title screen only', () => {
    expect(handleBack({ sendEscape: () => false, atTitle: () => true })).toBe(false);
  });

  it('knows when the title is on top', () => {
    expect(titleOnTop(['Title'])).toBe(true);
    expect(titleOnTop(['Hunt', 'Title'])).toBe(true);
    expect(titleOnTop(['Title', 'Settings'])).toBe(false);
    expect(titleOnTop(['Title', 'Shed'])).toBe(false);
    expect(titleOnTop(['Hunt', 'Hud'])).toBe(false);
    expect(titleOnTop(['Hunt', 'Hud', 'Pause'])).toBe(false);
    expect(titleOnTop(['Tally'])).toBe(false);
    expect(titleOnTop([])).toBe(false);
  });
});
