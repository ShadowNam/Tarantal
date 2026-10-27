import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HD_INDEX_PATH, parseAssetIndex } from './assetIndex';
import { mergeHdIndex, parseHdIndex, splitHdIndex } from './hdIndex';

const pub = join(import.meta.dirname, '..', '..', '..', 'public');
const read = (p: string): unknown => JSON.parse(readFileSync(join(pub, p), 'utf8'));

describe('the HD half of the asset index (D-053)', () => {
  const hd = parseHdIndex(read(HD_INDEX_PATH));
  const base = parseAssetIndex(read('assets/asset-index.json')).index;

  it('the first-download index carries no HD parts', () => {
    expect(Object.keys(base.images).length).toBeGreaterThan(0);
    expect(JSON.stringify(base)).not.toContain('"hd"');
  });

  it('split(merge(index, hd)) gives the same two halves back', () => {
    if (hd === null) throw new Error('HD index missing');
    const full = mergeHdIndex(base, hd);
    expect(Object.keys(hd.images).length).toBeGreaterThan(0);
    const again = splitHdIndex(full);
    expect(again.index).toEqual(base);
    expect(again.hd).toEqual(hd);
  });
});
