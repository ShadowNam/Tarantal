// Whether a web font has arrived (v1.0.1, D-028 §4 review). Text drawn into a cached texture — the
// score-pop glyph atlas, a pooled POOF label — keeps whatever face the browser had when it was
// drawn. `loadFonts` gives up after feel.assets.fontTimeoutMs, so on a slow first load the first
// pops can be drawn in the system font; a Phaser `Text` made later picked the real font up by
// itself, a cached texture doesn't. Callers put `fontState(font)` into their cache key: 'fallback'
// until the font has loaded, then 'ready' for good, so a late font causes exactly one redraw.
// `onFontsLoaded` reports the browser's `loadingdone` so a cache can redraw before it is next used.

/** The part of the CSS Font Loading API used here (document.fonts). */
export interface FontSetLike {
  check(font: string): boolean;
  addEventListener(type: 'loadingdone', listener: () => void): void;
  removeEventListener(type: 'loadingdone', listener: () => void): void;
}

export type FontState = 'ready' | 'fallback';

export class FontReadiness {
  private readonly ready = new Set<string>();

  constructor(private readonly fonts: FontSetLike | undefined) {}

  /**
   * 'ready' once `font` (a CSS font shorthand) has loaded; it stays ready (no re-check per call).
   * Without the Font Loading API there is nothing to wait for: always 'ready'.
   */
  state(font: string): FontState {
    if (this.fonts === undefined || this.ready.has(font)) return 'ready';
    let ok: boolean;
    try {
      ok = this.fonts.check(font);
    } catch {
      // A font string the browser can't parse: treat it as loaded (nothing better will come).
      ok = true;
    }
    if (ok) this.ready.add(font);
    return ok ? 'ready' : 'fallback';
  }

  /** `fn` after each batch of font loads; returns the unsubscribe. */
  onFontsLoaded(fn: () => void): () => void {
    const fonts = this.fonts;
    if (fonts === undefined) return () => undefined;
    fonts.addEventListener('loadingdone', fn);
    return () => {
      fonts.removeEventListener('loadingdone', fn);
    };
  }
}

/** The page's fonts (document.fonts), or none outside a browser (Node tests, old browsers). */
export const fontReadiness = new FontReadiness(
  typeof document === 'undefined'
    ? undefined
    : (document as Partial<Pick<Document, 'fonts'>>).fonts,
);
