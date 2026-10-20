// M6 "Done when": every launch charm has at least one effect test. Each charm id must name a
// describe block in src/sim/charms/charms.test.ts (scoring, ammo, world) or src/sim/run/run.test.ts
// (economy charms act on the run).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from './testContent';

const root = join(import.meta.dirname, '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('every launch charm has an effect test', () => {
  it('names each charm id in a describe of the charm or run tests', () => {
    const files = [read('src/sim/charms/charms.test.ts'), read('src/sim/run/run.test.ts')];
    const charms = loadContent().charms.charms;
    expect(charms).toHaveLength(24);
    for (const c of charms) {
      const pattern = new RegExp(`describe\\('[^']*\\b${c.id}\\b`);
      expect(
        files.some((f) => pattern.test(f)),
        c.id,
      ).toBe(true);
    }
  });
});
