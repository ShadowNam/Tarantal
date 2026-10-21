import { describe, expect, it } from 'vitest';
import { EMPTY_INDEX, type AssetIndex } from '../../src/game/assets/assetIndex';
import { audit, formatAudit, type AuditInputs } from './audit';
import type { Catalog, CatalogEntry } from './catalog';

const entry = (
  key: string,
  kind: CatalogEntry['kind'],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  key,
  kind,
  group: 'common',
  biomes: ['karoo-autumn'],
  ...extra,
});
const catalog: Catalog = {
  homeBiome: 'karoo-autumn',
  biomes: ['karoo-autumn'],
  entries: new Map([
    ['ui/shell', entry('ui/shell', 'texture', { width: 40, height: 80 })],
    ['karoo/mid', entry('karoo/mid', 'layer', { group: 'karoo-autumn' })],
    ['sfx/shot', entry('sfx/shot', 'sound')],
    ['fx/orphan', entry('fx/orphan', 'texture', { width: 8, height: 8 })],
  ]),
  layers: new Map(),
  birds: new Map(),
};
const f = (path: string) => ({ path, bytes: 2048, hash: '0123456789ab' });
const base = (over: Partial<AuditInputs> = {}): AuditInputs => ({
  catalog,
  index: null,
  files: [],
  sources: new Map([
    ['src/game/scenes/HudScene.ts', 'add.image(0, 0, TEX.shell)'],
    ['src/game/audio/AudioDirector.ts', "this.play('shot', 0)"],
    ['content/biomes/karoo-autumn.json', '{ "asset": "karoo/mid" }'],
    // A mention inside the placeholder factory is a definition, not a use.
    ['src/game/placeholder/ProceduralAssetFactory.ts', 'TEX.orphan'],
  ]),
  tex: { shell: 'ui/shell', orphan: 'fx/orphan' },
  bytesOf: () => 2048,
  ...over,
});

describe('asset audit (M10)', () => {
  it('with nothing delivered every key is a placeholder; unused keys are problems', () => {
    const r = audit(base());
    expect(r.finals).toBe(0);
    expect(r.placeholders).toBe(4);
    expect(r.rows.find((x) => x.key === 'ui/shell')?.usedIn).toEqual([
      'src/game/scenes/HudScene.ts',
    ]);
    expect(r.rows.find((x) => x.key === 'ui/shell')?.size).toBe('40×80 drawn');
    expect(r.problems).toEqual([
      'unused key: fx/orphan (texture) — nothing in src/ or content/ uses it',
    ]);
    expect(formatAudit(r, true)).toContain('strict: 4 placeholder(s) remain');
  });

  it('delivered keys are final; unused deliveries, stray files and missing files fail', () => {
    const index: AssetIndex = {
      ...EMPTY_INDEX,
      images: {
        'ui/shell': {
          group: 'common',
          file: f('assets/common/img/shell.png'),
          width: 40,
          height: 80,
        },
        'ui/typo': { group: 'common', file: f('assets/common/img/typo.png'), width: 4, height: 4 },
      },
      layers: {
        'karoo/mid': {
          group: 'karoo-autumn',
          tiles: [f('assets/karoo-autumn/layers/mid-0.png')],
          tileWidth: 2048,
          left: -300,
          top: 630,
          height: 280,
        },
      },
    };
    const r = audit(
      base({
        index,
        files: [
          'assets/common/img/shell.png',
          'assets/common/img/typo.png',
          'assets/common/img/stray.png',
        ],
        bytesOf: (p) => (p.includes('mid-0') ? null : 2048),
      }),
    );
    expect(r.rows.find((x) => x.key === 'ui/shell')?.status).toBe('final');
    expect(r.rows.find((x) => x.key === 'karoo/mid')?.status).toBe('placeholder');
    expect(r.problems).toEqual(
      expect.arrayContaining([
        'missing file: karoo/mid → assets/karoo-autumn/layers/mid-0.png is in the index but not on disk',
        'unused delivery: image "ui/typo" is not a manifest key',
        'unused file: public/assets/common/img/stray.png is not referenced by the asset index',
      ]),
    );
  });

  it('a TEX constant without a manifest entry is a missing key', () => {
    const r = audit(base({ tex: { shell: 'ui/shell', orphan: 'fx/orphan', ghost: 'fx/ghost' } }));
    expect(r.problems).toContain('missing key: TEX.ghost = "fx/ghost" has no manifest entry');
  });
});
