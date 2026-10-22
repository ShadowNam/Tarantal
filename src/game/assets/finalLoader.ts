// Fetches final asset files named in the asset index (M10). Plain DOM loading (no Phaser loader),
// so it can run before the game boots and between scenes. Every load is bounded by a timeout and
// resolves to null on any failure: the caller then keeps that key's placeholder. Each URL is
// fetched once per page, even when several biome manifests share it.
import { ASSET_INDEX_PATH, parseAssetIndex, type AssetIndex } from './assetIndex';

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Problem text when no index was delivered (normal until art lands): not worth a warning. */
export const ABSENT = 'no asset index';

export interface IndexLoad {
  readonly index: AssetIndex | null;
  /** Why there is no index (absent, invalid, timed out), for the test hook and the console. */
  readonly problem: string | null;
}

/** Reads the index; a missing index is normal (no final art delivered yet). */
export async function fetchAssetIndex(timeoutMs: number): Promise<IndexLoad> {
  const get = async (): Promise<IndexLoad> => {
    try {
      // no-cache asks the network to revalidate; the PWA worker may still serve its precached copy
      // for one session after a deploy, which is consistent (it cached the matching files too).
      const res = await fetch(ASSET_INDEX_PATH, { cache: 'no-cache' });
      // Static hosts answer 404; SPA-style servers (vite preview) send index.html instead. Both
      // mean "nothing delivered". Any other answer is parsed (a host may label JSON oddly), and
      // a failure there is a real problem worth a warning.
      const type = res.headers.get('content-type') ?? '';
      if (res.status === 404 || (res.ok && type.includes('html')))
        return { index: null, problem: `${ABSENT} (HTTP ${res.status}, ${type || 'no type'})` };
      if (!res.ok) return { index: null, problem: `index HTTP ${res.status}` };
      const { index, error } = parseAssetIndex(JSON.parse(await res.text()));
      return error === null ? { index, problem: null } : { index: null, problem: error };
    } catch (e) {
      return { index: null, problem: `index unreadable: ${String(e)}` };
    }
  };
  return withTimeout(get(), timeoutMs, { index: null, problem: 'index timed out' });
}

/**
 * Caches a load by path, but forgets a failed or timed-out one (null), so a later biome or a
 * later page visit can try again instead of staying on the placeholder for the whole session.
 */
function forget<T>(cache: Map<string, Promise<T | null>>, path: string, p: Promise<T | null>) {
  cache.set(path, p);
  void p.then((v) => {
    if (v === null && cache.get(path) === p) cache.delete(path);
  });
  return p;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
const jsons = new Map<string, Promise<unknown>>();
const buffers = new Map<string, Promise<ArrayBuffer | null>>();

/** A decoded image, or null. */
export function loadImage(path: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  let p = images.get(path);
  if (p === undefined) {
    const img = new Image();
    img.decoding = 'async';
    const load = new Promise<HTMLImageElement | null>((resolve) => {
      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };
    });
    img.src = path;
    p = forget(images, path, withTimeout(load, timeoutMs, null));
  }
  return p;
}

/** Parsed JSON, or null. */
export function loadJson(path: string, timeoutMs: number): Promise<unknown> {
  let p = jsons.get(path);
  if (p === undefined) {
    p = forget(
      jsons,
      path,
      withTimeout(
        fetch(path).then((r) => (r.ok ? (r.json() as Promise<unknown>) : null)),
        timeoutMs,
        null,
      ),
    );
  }
  return p;
}

/** Raw bytes (audio, decoded later once an AudioContext exists), or null. */
export function loadBytes(path: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  let p = buffers.get(path);
  if (p === undefined) {
    p = forget(
      buffers,
      path,
      withTimeout(
        fetch(path).then((r) => (r.ok ? r.arrayBuffer() : null)),
        timeoutMs,
        null,
      ),
    );
  }
  return p;
}
