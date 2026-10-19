// docs/04-BUILD-PLAN.md M1: "src/sim has zero imports outside src/sim and src/content types".
// Scans every runtime file in src/sim (tests excluded) and checks each import.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const simDir = join(root, 'src', 'sim');
const contentDir = join(root, 'src', 'content');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}

interface Import {
  readonly file: string;
  readonly spec: string;
  readonly typeOnly: boolean;
}

const IMPORT_RE = /^\s*(import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/gm;
const BARE_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]/gm;

function importsOf(file: string): Import[] {
  const text = readFileSync(file, 'utf8');
  const out: Import[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    out.push({ file, spec: m[3] ?? '', typeOnly: m[2] !== undefined });
  }
  for (const m of text.matchAll(BARE_IMPORT_RE))
    out.push({ file, spec: m[1] ?? '', typeOnly: false });
  return out;
}

const files = walk(simDir);
const imports = files.flatMap(importsOf);

describe('src/sim import boundary', () => {
  it('scans the sim', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(imports.length).toBeGreaterThan(40);
  });

  it('imports only relative paths inside src/sim, or types from src/content', () => {
    const bad: string[] = [];
    for (const imp of imports) {
      const where = relative(root, imp.file);
      if (!imp.spec.startsWith('.')) {
        bad.push(`${where}: package import "${imp.spec}"`);
        continue;
      }
      const target = resolve(dirname(imp.file), imp.spec);
      if (target.startsWith(simDir)) continue;
      if (target.startsWith(contentDir) && imp.typeOnly) continue;
      bad.push(`${where}: "${imp.spec}"${imp.typeOnly ? '' : ' (value import)'}`);
    }
    expect(bad).toEqual([]);
  });
});
