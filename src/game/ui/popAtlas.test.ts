import { beforeEach, describe, expect, it } from 'vitest';
import { FontReadiness, type FontSetLike } from './fontReady';
import {
  ensurePopAtlas,
  resetPopAtlasesForTests,
  type AtlasContext,
  type PopAtlasDeps,
} from './popAtlas';
import type { PopLook } from './popGlyphs';

/** document.fonts stand-in: `loaded` decides check(); `finishLoading` fires loadingdone. */
class FakeFonts implements FontSetLike {
  loaded = false;
  private readonly listeners = new Set<() => void>();
  check(): boolean {
    return this.loaded;
  }
  addEventListener(_: 'loadingdone', fn: () => void): void {
    this.listeners.add(fn);
  }
  removeEventListener(_: 'loadingdone', fn: () => void): void {
    this.listeners.delete(fn);
  }
  finishLoading(): void {
    this.loaded = true;
    for (const fn of this.listeners) fn();
  }
}

/** Bitmap-font cache + texture manager stand-in that records every atlas drawn. */
function fakeDeps(readiness: FontReadiness): PopAtlasDeps & {
  drawn: string[];
  fonts: Set<string>;
  textures: Set<string>;
} {
  const fonts = new Set<string>();
  const textures = new Set<string>();
  const drawn: string[] = [];
  return {
    drawn,
    fonts,
    textures,
    hasFont: (k) => fonts.has(k),
    addFont: (k) => {
      fonts.add(k);
    },
    removeFont: (k) => {
      fonts.delete(k);
    },
    hasTexture: (k) => textures.has(k),
    removeTexture: (k) => {
      textures.delete(k);
    },
    createCanvas: (k) => {
      textures.add(k);
      drawn.push(k);
      const ctx: AtlasContext = {
        font: '',
        textBaseline: 'alphabetic',
        lineJoin: 'round',
        lineWidth: 1,
        strokeStyle: '',
        fillStyle: '',
        strokeText: () => undefined,
        fillText: () => undefined,
      };
      return { ctx, refresh: () => undefined };
    },
    measure: () => 20,
    fontState: (f) => readiness.state(f),
  };
}

const look: PopLook = {
  family: '"Baloo 2", system-ui',
  weight: '900',
  sizePx: 52,
  stroke: '#1B1410',
  strokePx: 8,
};

describe('pop atlas and late web fonts (v1.0.1, D-028 §4 review)', () => {
  beforeEach(() => {
    resetPopAtlasesForTests();
  });

  it('drawn before the font arrived, rebuilt once when it does, then cached for good', () => {
    const fonts = new FakeFonts();
    const readiness = new FontReadiness(fonts);
    const deps = fakeDeps(readiness);
    const first = ensurePopAtlas(deps, look);
    expect(first.fill).toMatch(/:fallback:fill$/);
    expect(deps.drawn).toHaveLength(2); // outline + fill
    ensurePopAtlas(deps, look);
    expect(deps.drawn).toHaveLength(2); // same look, same state: cached

    // The font lands late; the HUD's loadingdone listener rebuilds before the next pop.
    let rebuilt = first;
    readiness.onFontsLoaded(() => {
      rebuilt = ensurePopAtlas(deps, look);
    });
    fonts.finishLoading();
    expect(rebuilt.fill).toMatch(/:ready:fill$/);
    expect(rebuilt.fill).not.toBe(first.fill);
    expect(deps.drawn).toHaveLength(4);

    // Ready stays ready (no re-check flips it back), and no further rebuilds.
    fonts.loaded = false;
    expect(ensurePopAtlas(deps, look)).toEqual(rebuilt);
    expect(deps.drawn).toHaveLength(4);
  });

  it('without the Font Loading API the font counts as ready', () => {
    expect(new FontReadiness(undefined).state('900 52px Bangers')).toBe('ready');
  });

  it('keeps the current and previous looks; drops older ones', () => {
    const fonts = new FakeFonts();
    fonts.loaded = true;
    const deps = fakeDeps(new FontReadiness(fonts));
    const a = ensurePopAtlas(deps, look);
    const b = ensurePopAtlas(deps, { ...look, sizePx: 62 });
    expect(deps.fonts.has(a.fill)).toBe(true); // previous look: a pop may still show it
    const c = ensurePopAtlas(deps, { ...look, sizePx: 72 });
    expect(deps.fonts.has(a.fill) || deps.textures.has(a.stroke)).toBe(false);
    expect(deps.fonts.has(b.fill) && deps.fonts.has(c.fill)).toBe(true);
    expect(deps.textures.size).toBe(4);
  });
});
