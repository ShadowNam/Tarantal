// v1.6 (D-042 review): the late and Ver groups' failed files are known once they settle, so a
// scoped hunt or the Skietbaan can retry them instead of starting on placeholders.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createPlaceholderManifest, loadBiomeArt } from '../placeholder/ProceduralAssetFactory';
import { neededLateMissing, type MissingFile } from './AssetManifest';
import { parseAssetIndex } from './assetIndex';

/** Files that "404" in this test: the scope picture and the Kalahari's Ver strip. */
const FAILING = /sight_scope|kalahari-summer-ver_veld/;

vi.mock('./finalLoader', () => ({
  loadImage: (path: string) => Promise.resolve(FAILING.test(path) ? null : {}),
  loadJson: () => Promise.resolve({}),
  loadBytes: () => Promise.resolve(null),
  imageArrival: () => Promise.resolve(null),
}));

describe('neededLateMissing', () => {
  const missing: MissingFile[] = [
    { key: 'sight/scope', path: 'a.png', group: 'ver' },
    { key: 'kalahari/ver_veld', path: 'b.png', group: 'ver' },
    { key: 'gun/langloop', path: 'c.png', group: 'ver' },
    { key: 'gun/pomp', path: 'd.png', group: 'late' },
    { key: 'bird/tarentaal/far', path: 'e.png', group: 'late' },
  ];
  const keys = (need: Parameters<typeof neededLateMissing>[1]): string[] =>
    neededLateMissing(missing, need).map((m) => m.key);

  it('a scoped hunt needs the sight pictures; the Ver strip only where the map opens Ver', () => {
    expect(keys({ sight: true, ver: false })).toEqual(['sight/scope']);
    expect(keys({ sight: true, ver: true })).toEqual(['sight/scope', 'kalahari/ver_veld']);
    expect(keys({ sight: false, ver: true })).toEqual(['kalahari/ver_veld']);
  });

  it('a rifle delivered with the Ver group counts only for that weapon', () => {
    expect(keys({ sight: true, ver: false, weapon: 'langloop' })).toEqual([
      'sight/scope',
      'gun/langloop',
    ]);
    expect(keys({ sight: true, ver: false, weapon: 'twee_twee' })).toEqual(['sight/scope']);
  });

  it('never the late group (rare variants, other guns keep their placeholders)', () => {
    expect(keys({ sight: true, ver: true, weapon: 'pomp' })).not.toContain('gun/pomp');
    expect(keys({ sight: true, ver: true })).not.toContain('bird/tarentaal/far');
  });
});

describe('AssetManifest.missingLate', () => {
  it('names the Ver-group files that failed once the late groups have settled', async () => {
    const content = loadContent();
    const kalahari = content.biomes.find((b) => b.id === 'kalahari-summer');
    if (!kalahari) throw new Error('no biome');
    expect(await loadBiomeArt(kalahari.id)).toBe(true);
    const raw: unknown = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', '..', 'public', 'assets', 'asset-index.json'),
        'utf8',
      ),
    );
    const { index, error } = parseAssetIndex(raw);
    expect(error).toBeNull();
    const m = createPlaceholderManifest(content, kalahari);
    await m.loadFinal(index, {
      atlasScale: 1,
      timeoutMs: 1000,
      audioFormat: null,
      biome: kalahari.id,
    });
    // Not known (and not done) until the late groups settle.
    expect(m.lateDone).toBe(false);
    expect(m.missingLate).toEqual([]);
    await m.lateLoaded;
    expect(m.lateDone).toBe(true);
    const late = m.missingLate.map((x) => x.key);
    expect(late).toContain('sight/scope');
    expect(late).toContain('kalahari/ver_veld');
    // The other sight pictures arrived.
    expect(late).not.toContain('sight/peep');
    expect(m.missingLate.find((x) => x.key === 'sight/scope')?.group).toBe('ver');
    // What a Skietbaan session on the Kalahari (Ver open) with a scope waits for.
    expect(
      neededLateMissing(m.missingLate, { sight: true, ver: true })
        .map((x) => x.key)
        .sort(),
    ).toEqual(['kalahari/ver_veld', 'sight/scope']);
    // The main groups' failures stay in missingFinal, never in missingLate.
    for (const f of m.missingFinal) expect(late).not.toContain(f.key);
  });
});
