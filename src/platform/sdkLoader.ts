// Loads a portal SDK the way the portals ask: their own script from their own host, added to
// <head> once (Poki and CrazyGames forbid self-hosted copies). Only the portal builds call this;
// the URL lives in the portal's adapter. A blocked or slow script resolves false after the
// timeout, and the game runs without the SDK (no ads, no portal signals).

export function loadScript(src: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);
    try {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (existing?.dataset['loaded'] === '1') {
        finish(true);
        return;
      }
      const s = existing ?? document.createElement('script');
      s.addEventListener('load', () => {
        s.dataset['loaded'] = '1';
        finish(true);
      });
      s.addEventListener('error', () => {
        finish(false);
      });
      if (existing === null) {
        s.src = src;
        s.async = true;
        document.head.appendChild(s);
      }
    } catch {
      finish(false);
    }
  });
}

/** Races `p` against a timeout: the value, or `fallback` if it rejects or takes too long. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
