// The Android test app's adapter (D-058) against a fake Capacitor shell.
import { describe, expect, it, vi } from 'vitest';
import {
  CapacitorPlatform,
  isShareCancel,
  PUBLIC_GAME_URL,
  publicShareUrl,
  shimVisibility,
  type NativeApp,
  type VisibilityDoc,
} from './capacitor';
import type { PlatformOptions } from './local';

const opts: PlatformOptions = { log: false, adTimeoutMs: 1000, sdkTimeoutMs: 1000 };

interface FakeShell extends NativeApp {
  calls: string[];
  back: () => void;
  active: (a: boolean) => void;
}

function fakeShell(share?: NativeApp['share']): FakeShell {
  const shell: FakeShell = {
    calls: [],
    back: () => undefined,
    active: () => undefined,
    onBackButton: (fn) => {
      shell.back = fn;
      return Promise.resolve();
    },
    onAppActive: (fn) => {
      shell.active = fn;
      return Promise.resolve();
    },
    minimize: () => shell.calls.push('minimize'),
    keepAwake: (on) => shell.calls.push(`awake:${String(on)}`),
    openUrl: (url) => shell.calls.push(`open:${url}`),
    ...(share === undefined ? {} : { share }),
  };
  return shell;
}

class FakeDoc extends EventTarget implements VisibilityDoc {
  get visibilityState(): DocumentVisibilityState {
    return this.real;
  }
  real: DocumentVisibilityState = 'visible';
}

async function make(shell: FakeShell, doc = new FakeDoc()): Promise<CapacitorPlatform> {
  const p = new CapacitorPlatform(opts, () => Promise.resolve(shell), doc);
  await p.init();
  return p;
}

describe('CapacitorPlatform (D-058)', () => {
  it('has no ads: breaks resolve at once, no rewarded ads', async () => {
    const p = await make(fakeShell());
    await expect(p.commercialBreak()).resolves.toBeUndefined();
    await expect(p.rewardedBreak()).resolves.toBe(false);
    expect(p.rewardedAvailable()).toBe(false);
    expect(p.isAdBusy()).toBe(false);
  });

  it('is the app: no PWA, no admin page, standalone, no fullscreen button', async () => {
    const p = await make(fakeShell());
    expect(p.id).toBe('capacitor');
    expect(p.pwa).toBe(false);
    expect(p.adminPage).toBe(false);
    expect('onUpdateReady' in p).toBe(false);
    expect(p.capabilities()).toEqual({ fullscreen: false, standalone: true, iphone: false });
    await expect(p.requestFullscreen()).resolves.toBeUndefined();
  });

  it('registers its listeners one at a time, both in place before init() resolves', async () => {
    // Capacitor's web loader keeps one plugin copy only when calls don't overlap (e2e in a browser).
    const order: string[] = [];
    let release = (): void => undefined;
    const shell = fakeShell();
    shell.onBackButton = (fn) => {
      order.push('back:start');
      shell.back = fn;
      return new Promise<void>((resolve) => {
        release = () => {
          order.push('back:done');
          resolve();
        };
      });
    };
    shell.onAppActive = (fn) => {
      order.push('active:start');
      shell.active = fn;
      return Promise.resolve();
    };
    const p = new CapacitorPlatform(opts, () => Promise.resolve(shell), new FakeDoc());
    let ready = false;
    const init = p.init().then(() => {
      ready = true;
    });
    await vi.waitFor(() => {
      expect(order).toEqual(['back:start']);
    });
    expect(ready).toBe(false);
    release();
    await init;
    expect(order).toEqual(['back:start', 'back:done', 'active:start']);
    expect(ready).toBe(true);
  });

  it('opens external links in the system browser', async () => {
    const shell = fakeShell();
    const p = await make(shell);
    expect(p.canShowExternalLinks).toBe(true);
    p.openExternal('https://example.org/');
    expect(shell.calls).toEqual(['open:https://example.org/']);
  });

  it('keeps the screen on while a hunt is played, and lets it sleep in the background', async () => {
    const shell = fakeShell();
    const p = await make(shell);
    p.gameplayStart();
    p.gameplayStart();
    expect(p.keepingAwake).toBe(true);
    p.gameplayStop();
    p.gameplayStart();
    shell.active(false);
    expect(shell.calls).toEqual(['awake:true', 'awake:false', 'awake:true', 'awake:false']);
  });

  it('back: the game decides; unhandled (the title) sends the app to the background', async () => {
    const shell = fakeShell();
    const p = await make(shell);
    shell.back(); // nobody registered yet: the app goes to the background
    let handled = true;
    p.onBackButton(() => handled);
    shell.back();
    handled = false;
    shell.back();
    expect(shell.calls).toEqual(['minimize', 'minimize']);
  });

  it('shares through the native sheet; a closed sheet is a cancel, not an error', async () => {
    const seen: unknown[] = [];
    const ok = await make(
      fakeShell((d) => {
        seen.push(d);
        return Promise.resolve();
      }),
    );
    await expect(ok.share({ text: 'Klaar!', url: 'https://x.test/?c=1' })).resolves.toBe('shared');
    expect(seen).toEqual([{ text: 'Klaar!', url: 'https://x.test/?c=1' }]);
    const closed = await make(fakeShell(() => Promise.reject(new Error('Share canceled'))));
    await expect(closed.share({ text: 'Klaar!', url: '' })).resolves.toBe('cancelled');
  });

  it('falls back to the clipboard when the native sheet fails', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const p = await make(fakeShell(() => Promise.reject(new Error('no share target'))));
    await expect(p.share({ text: 'Klaar!', url: 'https://x.test/' })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Klaar! https://x.test/');
    vi.unstubAllGlobals();
  });

  it('runs on the web paths when the shell is missing (a browser opening dist-android/)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = new CapacitorPlatform(
      opts,
      () => Promise.reject(new Error('no shell')),
      new FakeDoc(),
    );
    await expect(p.init()).resolves.toBeUndefined();
    p.gameplayStart();
    p.pressBack();
    expect(p.keepingAwake).toBe(true);
    warn.mockRestore();
  });

  it('share links point at the public web build, keeping the challenge', () => {
    expect(publicShareUrl('https://localhost/index.html?c=abc')).toBe(`${PUBLIC_GAME_URL}?c=abc`);
    expect(publicShareUrl('https://localhost/')).toBe(PUBLIC_GAME_URL);
    expect(publicShareUrl('not a url')).toBe(PUBLIC_GAME_URL);
    expect(isShareCancel(new Error('Share canceled'))).toBe(true);
    expect(isShareCancel(new Error('boom'))).toBe(false);
  });
});

describe('background shim (D-058)', () => {
  it('reports hidden in the background when the WebView does not, and undoes it on return', async () => {
    const doc = new FakeDoc();
    const seen: string[] = [];
    doc.addEventListener('visibilitychange', () => seen.push(doc.visibilityState));
    const shell = fakeShell();
    await make(shell, doc);
    shell.active(false);
    shell.active(true);
    expect(seen).toEqual(['hidden', 'visible']);
  });

  it('stays out of the way when the WebView reports the change itself', () => {
    const doc = new FakeDoc();
    let events = 0;
    doc.addEventListener('visibilitychange', () => events++);
    doc.real = 'hidden';
    expect(shimVisibility(doc, false)).toBe(false);
    doc.real = 'visible';
    expect(shimVisibility(doc, true)).toBe(false);
    expect(events).toBe(0);
  });
});
