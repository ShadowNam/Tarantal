// Exploratory content overrides for the balance tools (`--set path=json`).
import type { ContentBundle } from '../src/content/schemas';

/**
 * Applies `path=json` overrides to a content copy, e.g. `birds.flockDefaults.spawnSpreadPx=320`
 * or `biomes.0.pacing.keyframes.*.flyoversPerMin=8` (`*` = every array element). For exploring
 * only: values are not re-validated, and final values belong in content/ (tune skill).
 */
export function withOverrides(content: ContentBundle, overrides: readonly string[]): ContentBundle {
  if (overrides.length === 0) return content;
  const copy: unknown = structuredClone(content);
  for (const o of overrides) {
    const eq = o.indexOf('=');
    if (eq < 0) throw new Error(`--set ${o}: expected path=value`);
    const value: unknown = JSON.parse(o.slice(eq + 1));
    setPath(copy, o.slice(0, eq).split('.'), value, o);
  }
  // Same shape as the validated input with plain values swapped in (not re-validated).
  return copy as ContentBundle;
}

function setPath(node: unknown, keys: readonly string[], value: unknown, where: string): void {
  const [k, ...rest] = keys;
  if (k === undefined || typeof node !== 'object' || node === null)
    throw new Error(`--set ${where}: bad path`);
  const rec = node as Record<string, unknown>;
  const targets = k === '*' && Array.isArray(node) ? node.map((_, i) => String(i)) : [k];
  for (const t of targets) {
    if (!(t in rec)) throw new Error(`--set ${where}: no key "${t}"`);
    if (rest.length === 0) rec[t] = value;
    else setPath(rec[t], rest, value, where);
  }
}
