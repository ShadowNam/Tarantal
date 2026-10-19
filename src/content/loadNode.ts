// Node-only: reads content/ from disk into RawContent. Used by tools/ and unit tests.
// The browser build never imports this file.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RawContent } from './bundle';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function readContentDir(dir: string): RawContent {
  const files: Record<string, unknown> = {};
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith('.json')) files[name] = readJson(join(dir, name));
  }
  const biomes: Record<string, unknown> = {};
  const biomeDir = join(dir, 'biomes');
  for (const name of readdirSync(biomeDir).sort()) {
    if (name.endsWith('.json')) biomes[`biomes/${name}`] = readJson(join(biomeDir, name));
  }
  return { files, biomes };
}

/** Flattens a nested i18n JSON object into dotted keys ("biome.karoo_autumn"). */
export function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return prefix === '' ? [] : [prefix];
  return Object.entries(value).flatMap(([k, v]) => flattenKeys(v, prefix === '' ? k : `${prefix}.${k}`));
}

export function readI18nKeys(path: string): Set<string> {
  return new Set(flattenKeys(readJson(path)));
}
