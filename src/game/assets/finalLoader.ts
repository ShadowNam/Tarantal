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

/**
 * v1.6 (D-042 review): may the page run without an asset index? Only on purpose
 * (`?art=placeholder`, `placeholderArt`) or in a test build (dev server, Vitest, CI e2e builds
 * with VITE_TEST_HOOKS=1), where tests serve none on purpose. Every production build ships its
 * index, so there an absent one (a 404, an HTML soft-404) is a failure like any other: retried,
 * then the Retry message.
 */
export function absentIndexAccepted(
  problem: string | null,
  o: { readonly placeholderArt: boolean; readonly testBuild: boolean },
): boolean {
  if (problem === null || !problem.startsWith(ABSENT)) return false;
  return o.placeholderArt || o.testBuild;
}

export interface IndexLoad {
  readonly index: AssetIndex | null;
  /** Why there is no index (absent, invalid, timed out), for the test hook and the console. */
  readonly problem: string | null;
}

/** v1.6 (D-042): files that failed this page (path → why), for the console and the overlay. */
const failedFiles = new Map<string, string>();

/** Every delivered file that failed to load this page (newest last). */
export function failedAssetFiles(): readonly { path: string; why: string }[] {
  return [...failedFiles].map(([path, why]) => ({ path, why }));
}

/** Records a failed file once and names it in the console (never a silent placeholder). */
function failed(path: string, why: string): null {
  if (!failedFiles.has(path)) console.warn(`[assets] ${path}: ${why}`);
  failedFiles.set(path, why);
  return null;
}

/** A file came in after all (a retry): it no longer counts as failed. */
function arrived<T>(path: string, v: T): T {
  failedFiles.delete(path);
  return v;
}

/**
 * Reads the index; a missing index is normal (no final art delivered yet). v1.6 (D-042): a
 * timeout, an HTTP error or an unreadable index is retried (`attempts`, with a short back-off)
 * instead of leaving the whole session on placeholders.
 */
export async function fetchAssetIndex(timeoutMs: number, attempts = 3): Promise<IndexLoad> {
  let last: IndexLoad = { index: null, problem: 'index not fetched' };
  for (let k = 0; k < Math.max(1, attempts); k++) {
    if (k > 0) await new Promise((r) => window.setTimeout(r, 400 * k));
    last = await fetchIndexOnce(timeoutMs);
    if (last.index !== null || last.problem?.startsWith(ABSENT) === true) return last;
    console.warn(`[assets] ${ASSET_INDEX_PATH}: ${last.problem ?? 'failed'} (try ${k + 1})`);
  }
  return last;
}

async function fetchIndexOnce(timeoutMs: number): Promise<IndexLoad> {
  const get = async (): Promise<IndexLoad> => {
    try {
      // no-cache asks the network to revalidate; the service worker answers the index from the
      // network first (v1.6), so a deploy never pairs a stale index with new files.
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
        resolve(arrived(path, img));
      };
      img.onerror = () => {
        resolve(failed(path, 'image failed to load'));
      };
    });
    img.src = path;
    p = forget(
      images,
      path,
      withTimeout(load, timeoutMs, null).then((v) =>
        v === null && !failedFiles.has(path) ? failed(path, `timed out after ${timeoutMs} ms`) : v,
      ),
    );
  }
  return p;
}

/**
 * D-053: drops a decoded image from the page-long cache (HD files when the player goes back to
 * Standard: the textures are freed, and nothing keeps the decoded pixels either).
 */
export function forgetImage(path: string): void {
  images.delete(path);
}

/** Parsed JSON, or null. */
export function loadJson(path: string, timeoutMs: number): Promise<unknown> {
  let p = jsons.get(path);
  if (p === undefined) {
    p = forget(
      jsons,
      path,
      withTimeout(
        fetch(path).then((r) =>
          r.ok
            ? (r.json() as Promise<unknown>).then((v) => arrived(path, v))
            : failed(path, `HTTP ${r.status}`),
        ),
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
        fetch(path).then((r) =>
          r.ok ? r.arrayBuffer().then((v) => arrived(path, v)) : failed(path, `HTTP ${r.status}`),
        ),
        timeoutMs,
        null,
      ),
    );
  }
  return p;
}

/**
 * v1.5 (D-041): raw bytes without the page-long cache above (Oupa's voice packs: a language left
 * behind must not stay in memory). A failure resolves to null; the browser's HTTP cache and the
 * service worker still serve a repeat fetch.
 */
export function fetchBytesUncached(path: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  return withTimeout(
    fetch(path).then((r) => (r.ok ? r.arrayBuffer() : null)),
    timeoutMs,
    null,
  );
}
