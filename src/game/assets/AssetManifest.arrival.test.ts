// v1.7e (review R12): a lazy file that timed out (a slow connection) is still taken by the
// manifest when it lands, so views polling upgrade() (TellView, FruitView, FaunaView) show it.
// The first download's files keep their behaviour: a timed-out one stays on its placeholder.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createPlaceholderManifest, loadBiomeArt } from '../placeholder/ProceduralAssetFactory';
import { parseAssetIndex } from './assetIndex';

/** Files that time out in this test: the tell sheet (late) and the crate box (common). */
const SLOW = /tells_sheet|crate_box/;
const landed = { path: '' };

vi.mock('./finalLoader', () => ({
  loadImage: (path: string) => Promise.resolve(SLOW.test(path) ? null : { path }),
  loadJson: () => Promise.resolve({}),
  loadBytes: () => Promise.resolve(null),
  // Each slow file lands a moment after its timeout.
  imageArrival: (path: string) =>
    new Promise((r) =>
      setTimeout(() => {
        landed.path = path;
        r({ path, late: true });
      }, 5),
    ),
}));

describe('a lazy file that outlives its timeout (review R12)', () => {
  it('is taken when it lands; a first-download file is not', async () => {
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
    const finals = (m as unknown as { finalImages: Map<string, unknown> }).finalImages;
    // Timed out: not there when the late group settles…
    expect(m.missingLate.map((x) => x.key)).toContain('tells/sheet');
    expect(finals.has('tells/sheet')).toBe(false);
    // …but taken once it lands.
    await new Promise((r) => setTimeout(r, 30));
    expect(landed.path).toMatch(/tells_sheet/);
    expect(finals.has('tells/sheet')).toBe(true);
    // The common group is the first download: its timed-out file stays on the placeholder.
    expect(finals.has('crate/box')).toBe(false);
  });
});
