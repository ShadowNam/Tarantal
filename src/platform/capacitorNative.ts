// The real Capacitor shell for capacitor.ts (D-058). Imported only by `import()` from the
// capacitor build's adapter, so the web and portal builds never carry @capacitor/* code.
// TmScreen is the app's own small plugin (android/app/src/main/java/…/TmScreenPlugin.java):
// it keeps the screen on while a hunt is played.
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import type { NativeApp } from './capacitor';

interface TmScreen {
  keepAwake(options: { on: boolean }): Promise<void>;
}

const tmScreen = registerPlugin<TmScreen>('TmScreen');

/** Logs a failed native call instead of throwing into the game. */
function quietly(p: Promise<unknown>, what: string): void {
  void settled(p, what);
}

/** Resolves when the call is done, failed or not (a failure is logged). */
async function settled(p: Promise<unknown>, what: string): Promise<void> {
  try {
    await p;
  } catch (e: unknown) {
    console.warn(`capacitor ${what} failed`, e);
  }
}

export function capacitorNative(): Promise<NativeApp> {
  const native: NativeApp = {
    onBackButton: (fn) =>
      settled(
        App.addListener('backButton', () => {
          fn();
        }),
        'backButton listener',
      ),
    onAppActive: (fn) =>
      settled(
        App.addListener('appStateChange', (s) => {
          fn(s.isActive);
        }),
        'appStateChange listener',
      ),
    minimize: () => {
      quietly(App.minimizeApp(), 'minimizeApp');
    },
    keepAwake: (on) => {
      quietly(tmScreen.keepAwake({ on }), 'keepAwake');
    },
    share: async (d) => {
      await Share.share(d.url === undefined ? { text: d.text } : { text: d.text, url: d.url });
    },
    // Capacitor opens any page off the app's own origin in the system browser.
    openUrl: (url) => {
      window.open(url, '_blank');
    },
  };
  return Promise.resolve(native);
}
