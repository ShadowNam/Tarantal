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
      // no-cache: the index names hashed files, so it is the one file that must be fresh.
      const res = await fetch(ASSET_INDEX_PATH, { cache: 'no-cache' });
      // Static hosts answer 404; SPA-style servers (vite preview) send index.html instead.
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('json'))
        return { index: null, problem: `${ABSENT} (HTTP ${res.status}, ${type || 'no type'})` };
      const { index, error } = parseAssetIndex(await res.json());
      return error === null ? { index, problem: null } : { index: null, problem: error };
    } catch (e) {
      return { index: null, problem: `index unreadable: ${String(e)}` };
    }
  };
  return withTimeout(get(), timeoutMs, { index: null, problem: 'index timed out' });
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
    p = withTimeout(load, timeoutMs, null);
    images.set(path, p);
  }
  return p;
}

/** Parsed JSON, or null. */
export function loadJson(path: string, timeoutMs: number): Promise<unknown> {
  let p = jsons.get(path);
  if (p === undefined) {
    p = withTimeout(
      fetch(path).then((r) => (r.ok ? (r.json() as Promise<unknown>) : null)),
      timeoutMs,
      null,
    );
    jsons.set(path, p);
  }
  return p;
}

/** Raw bytes (audio, decoded later once an AudioContext exists), or null. */
export function loadBytes(path: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  let p = buffers.get(path);
  if (p === undefined) {
    p = withTimeout(
      fetch(path).then((r) => (r.ok ? r.arrayBuffer() : null)),
      timeoutMs,
      null,
    );
    buffers.set(path, p);
  }
  return p;
}
