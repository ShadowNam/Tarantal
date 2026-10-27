// D-053: reads a public/ or dist/ folder's asset index with its HD half merged back in, for the
// tools that must see every delivered file (size check, service worker, audit).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSET_INDEX_PATH,
  HD_INDEX_PATH,
  parseAssetIndex,
  type AssetIndex,
} from '../../src/game/assets/assetIndex';
import { mergeHdIndex, parseHdIndex } from '../../src/game/assets/hdIndex';

/** The index (null when absent), its parse error, and the HD half merged in when present. */
export function readFullIndex(dir: string): { index: AssetIndex | null; error: string | null } {
  const path = join(dir, ASSET_INDEX_PATH);
  if (!existsSync(path)) return { index: null, error: null };
  const { index, error } = parseAssetIndex(JSON.parse(readFileSync(path, 'utf8')));
  if (error !== null) return { index: null, error };
  const hdPath = join(dir, HD_INDEX_PATH);
  if (!existsSync(hdPath)) return { index, error: null };
  const hd = parseHdIndex(JSON.parse(readFileSync(hdPath, 'utf8')));
  if (hd === null) return { index: null, error: `${HD_INDEX_PATH} is invalid` };
  return { index: mergeHdIndex(index, hd), error: null };
}
