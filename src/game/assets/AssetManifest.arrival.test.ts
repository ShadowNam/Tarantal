// v1.7e (review R12): a late or Ver image may take LAZY_TIMEOUT_MUL × the timeout (a slow
// connection: it lands mid-hunt and the views that poll upgrade() show it); the first download's
// and the area chunks' files keep the normal timeout.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createPlaceholderManifest, loadBiomeArt } from '../placeholder/ProceduralAssetFactory';
import { LAZY_TIMEOUT_MUL } from './AssetManifest';
import { parseAssetIndex } from './assetIndex';

const asked = new Map<string, number>();

vi.mock('./finalLoader', () => ({
  loadImage: (path: string, timeoutMs: number) => {
    asked.set(path, timeoutMs);
    return Promise.resolve({ path });
  },
  loadJson: () => Promise.resolve({}),
  loadBytes: () => Promise.resolve(null),
}));

describe('lazy images get a longer timeout (review R12)', () => {
  it('late and Ver images × LAZY_TIMEOUT_MUL; the first download and the area as before', async () => {
    const content = loadContent();
    const bushveld = content.biomes.find((b) => b.id === 'bushveld-winter');
    if (!bushveld) throw new Error('no biome');
    expect(await loadBiomeArt(bushveld.id)).toBe(true);
    const raw: unknown = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', '..', 'public', 'assets', 'asset-index.json'),
        'utf8',
      ),
    );
    const { index, error } = parseAssetIndex(raw);
    expect(error).toBeNull();
    const m = createPlaceholderManifest(content, bushveld);
    await m.loadFinal(index, {
      atlasScale: 1,
      timeoutMs: 1000,
      audioFormat: null,
      biome: bushveld.id,
    });
    await m.lateLoaded;
    const of = (key: string): number | undefined => {
      const e = index.images[key];
      return e === undefined ? undefined : asked.get(e.file.path);
    };
    expect(LAZY_TIMEOUT_MUL).toBeGreaterThan(1);
    expect(of('tells/sheet')).toBe(1000 * LAZY_TIMEOUT_MUL);
    expect(of('crate/box')).toBe(1000);
    expect(of('bushveld/baobab')).toBe(1000);
  });
});
