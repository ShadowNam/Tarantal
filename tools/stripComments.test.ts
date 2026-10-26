import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/content/hash';
import { readContentDir } from '../src/content/loadNode';
import { isContentJson, withoutComments } from './stripComments';

describe('content comments in the bundle (D-048)', () => {
  it('drops every $comment and nothing else; the content hash text is the same', () => {
    const raw = readContentDir('content');
    for (const v of [...Object.values(raw.files), ...Object.values(raw.biomes)]) {
      const stripped = withoutComments(v);
      expect(JSON.stringify(stripped)).not.toContain('"$comment"');
      expect(canonicalJson(stripped)).toBe(canonicalJson(v));
    }
  });

  it('only touches content/ JSON', () => {
    expect(isContentJson('/repo/content/biomes/karoo-autumn.json')).toBe(true);
    expect(isContentJson('/repo/content/client/feel.json?import')).toBe(true);
    expect(isContentJson('/repo/src/i18n/en.json')).toBe(false);
    expect(isContentJson('/repo/public/assets/asset-index.json')).toBe(false);
  });
});
