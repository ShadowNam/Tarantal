import { describe, expect, it } from 'vitest';
import { EMPTY_INDEX, type AssetIndex } from '../../src/game/assets/assetIndex';
import { audit, clipsNeeded, formatAudit, type AuditInputs } from './audit';
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

  it('D-029: interim deliveries are their own group; --strict fails on them', () => {
    const gunCat: Catalog = {
      ...catalog,
      entries: new Map([
        ...catalog.entries,
        ['gun/pomp', entry('gun/pomp', 'texture', { width: 420, height: 520 })],
      ]),
    };
    const atlas = {
      pages: [{ image: f('assets/common/guns/p.png'), data: f('assets/common/guns/p.json') }],
    };
    const index: AssetIndex = {
      ...EMPTY_INDEX,
      images: {
        'ui/shell': {
          group: 'common',
          origin: 'interim',
          file: f('assets/common/img/shell.png'),
          width: 40,
          height: 80,
        },
      },
      guns: {
        pomp: {
          group: 'common',
          origin: 'interim',
          x1: atlas,
          originX: 0.5,
          originY: 1,
          tipX: 0.5,
          tipY: 0.04,
          clips: { idle: { frames: ['idle/00'], fps: 1, loop: false } },
        },
      },
    };
    const r = audit(
      base({
        catalog: gunCat,
        index,
        files: [
          'assets/common/img/shell.png',
          'assets/common/guns/p.png',
          'assets/common/guns/p.json',
        ],
        sources: new Map([
          ...base().sources,
          ['content/weapons.json', '{ "id": "pomp" }'],
          ['src/game/view/WeaponView.ts', 'gunKey(id)'],
        ]),
      }),
    );
    expect(r.rows.find((x) => x.key === 'ui/shell')?.status).toBe('interim');
    expect(r.rows.find((x) => x.key === 'gun/pomp')?.status).toBe('interim');
    expect([r.finals, r.interims, r.placeholders]).toEqual([0, 2, 3]);
    expect(r.problems.filter((p) => !p.includes('fx/orphan'))).toEqual([]);
    const text = formatAudit(r, true);
    expect(text).toContain('== INTERIM');
    expect(text).toContain('strict: 2 interim key(s) remain');
  });

  it('a TEX constant without a manifest entry is a missing key', () => {
    const r = audit(base({ tex: { shell: 'ui/shell', orphan: 'fx/orphan', ghost: 'fx/ghost' } }));
    expect(r.problems).toContain('missing key: TEX.ghost = "fx/ghost" has no manifest entry');
  });
});

describe('makalani keys (1.9.3, D-056)', () => {
  it('the nut sheet by its constant and the palm textures by their key builders are used', () => {
    const keys = [
      'fx/makalani',
      'okavango/makalani_trunk_near',
      'okavango/makalani_crown_mid',
    ] as const;
    const cat: Catalog = {
      ...catalog,
      entries: new Map(
        keys.map((k) => [
          k,
          entry(k, 'texture', { width: 8, height: 8, group: 'okavango-spring' }),
        ]),
      ),
    };
    const r = audit(
      base({
        catalog: cat,
        sources: new Map([
          [
            'src/game/view/palms/MakalaniView.ts',
            'textures.exists(NUT_SHEET); add.image(0, 0, palmTrunkKey(p.plane)); palmCrownKey(p.plane)',
          ],
        ]),
        tex: {},
      }),
    );
    for (const k of keys)
      expect(r.rows.find((x) => x.key === k)?.usedIn).toContain(
        'src/game/view/palms/MakalaniView.ts',
      );
    expect(r.problems.filter((p) => p.includes('makalani'))).toEqual([]);
    // Without the builders' calls the palm textures are unused.
    const bare = audit(
      base({ catalog: cat, sources: new Map([['src/x.ts', 'NUT_SHEET']]), tex: {} }),
    );
    expect(bare.problems.some((p) => p.includes('okavango/makalani_trunk_near'))).toBe(true);
  });
});

describe('the baobab residents sheet (1.9.4, D-057)', () => {
  it('is seen where its constant is used, and unused without it', () => {
    const cat: Catalog = {
      ...catalog,
      entries: new Map([
        [
          'bushveld/baobab_life',
          entry('bushveld/baobab_life', 'texture', {
            width: 8,
            height: 8,
            group: 'bushveld-winter',
          }),
        ],
      ]),
    };
    const used = audit(
      base({
        catalog: cat,
        sources: new Map([['src/game/view/tree/BaobabLifeView.ts', 'exists(RESIDENT_SHEET)']]),
        tex: {},
      }),
    );
    expect(used.rows.find((x) => x.key === 'bushveld/baobab_life')?.usedIn).toContain(
      'src/game/view/tree/BaobabLifeView.ts',
    );
    const bare = audit(base({ catalog: cat, sources: new Map([['src/x.ts', 'x']]), tex: {} }));
    expect(bare.problems.some((p) => p.includes('bushveld/baobab_life'))).toBe(true);
  });
});

describe("Reënbui's sheet (v1.10, D-067)", () => {
  it('is used where ReenbuiView names its constant, unused otherwise', () => {
    const cat: Catalog = {
      ...catalog,
      entries: new Map([
        [
          'reenbui/sheet',
          entry('reenbui/sheet', 'texture', { width: 8, height: 8, group: 'late' }),
        ],
      ]),
    };
    const view = 'src/game/view/reenbui/ReenbuiView.ts';
    const used = audit(
      base({ catalog: cat, sources: new Map([[view, 'exists(REENBUI_SHEET)']]), tex: {} }),
    );
    expect(used.rows.find((x) => x.key === 'reenbui/sheet')?.usedIn).toContain(view);
    const bare = audit(base({ catalog: cat, sources: new Map([['src/x.ts', 'x']]), tex: {} }));
    expect(bare.problems.some((p) => p.includes('reenbui/sheet'))).toBe(true);
  });
});

describe("Die Braai's keys (v1.11, D-068)", () => {
  it('the sheet and sounds are used by their constants, the story lines by tell(line.say)', () => {
    const keys: [string, 'texture' | 'sound'][] = [
      ['braai/sheet', 'texture'],
      ['sfx/braai_fire', 'sound'],
      ['voice/en/braai.say.open_some', 'sound'],
    ];
    const cat: Catalog = {
      ...catalog,
      entries: new Map(
        keys.map(([k, kind]) => [
          k,
          entry(
            k,
            kind,
            kind === 'texture' ? { width: 8, height: 8, group: 'braai' } : { group: 'braai' },
          ),
        ]),
      ),
    };
    const view = 'src/game/braai/BraaiView.ts';
    const used = audit(
      base({
        catalog: cat,
        sources: new Map([
          [
            view,
            'addImage(BRAAI_SHEET, s); setBraai({ ambience: BRAAI_SOUNDS.fire }); this.s.tell(line.say, c); voiceKey(l, k)',
          ],
        ]),
        tex: {},
      }),
    );
    for (const [k] of keys) expect(used.rows.find((x) => x.key === k)?.usedIn, k).toContain(view);
    const bare = audit(base({ catalog: cat, sources: new Map([['src/x.ts', 'x']]), tex: {} }));
    for (const [k] of keys)
      expect(
        bare.problems.some((p) => p.includes(k)),
        k,
      ).toBe(true);
  });
});

describe('the veld soundscape calls (v1.9, D-066)', () => {
  it('are used when soundscape.json names them and the director plays soundscape calls', () => {
    const key = 'sfx/amb_reed_frog';
    const cat: Catalog = {
      ...catalog,
      entries: new Map([[key, entry(key, 'sound', { group: 'soundscape' })]]),
    };
    const json = ['content/client/soundscape.json', `{ "sound": "${key}" }`] as const;
    const used = audit(
      base({
        catalog: cat,
        sources: new Map([json, ['src/game/audio/soundscapeRuntime.ts', 'audio.ambient(c.key)']]),
        tex: {},
      }),
    );
    expect(used.rows.find((x) => x.key === key)?.usedIn).toContain(
      'content/client/soundscape.json',
    );
    // Named but never played, or played but not named: unused.
    const unplayed = audit(base({ catalog: cat, sources: new Map([json]), tex: {} }));
    expect(unplayed.problems.some((p) => p.includes(key))).toBe(true);
    const unnamed = audit(
      base({ catalog: cat, sources: new Map([['src/x.ts', 'audio.ambient(k)']]), tex: {} }),
    );
    expect(unnamed.problems.some((p) => p.includes(key))).toBe(true);
  });
});

describe('delivered bird clips (M10 review)', () => {
  it('the near plane needs only the pop-up clip; other planes need the whole flock set', () => {
    expect(clipsNeeded('near')).toEqual(['peek']);
    expect(clipsNeeded('mid')).toEqual(
      ['alert', 'flap', 'forage_walk', 'glide', 'land', 'peck', 'peek', 'run', 'takeoff'].sort(),
    );
  });

  it('a delivered plane whose clips (and fallbacks) miss a state is a problem', () => {
    const f = (path: string) => ({ path, bytes: 1, hash: '0123456789ab' });
    const atlas = { pages: [{ image: f('a.png'), data: f('a.json') }] };
    const clip = { frames: ['x'], fps: 12, loop: true };
    const index: AssetIndex = {
      ...EMPTY_INDEX,
      birds: {
        tarentaal: {
          // forage_walk alone: flap (flyovers, flushed flocks) has no fallback.
          mid: {
            group: 'common',
            x1: atlas,
            scale: 1,
            originX: 0.5,
            originY: 0.5,
            clips: { forage_walk: clip },
          },
          // peek falls back to alert → forage_walk: complete.
          near: {
            group: 'common',
            x1: atlas,
            scale: 1,
            originX: 0.5,
            originY: 0.5,
            clips: { forage_walk: clip },
          },
        },
      },
    };
    const r = audit(base({ index }));
    expect(r.problems).toContain(
      'incomplete bird: tarentaal mid has no clip (or fallback) for flap, glide, takeoff',
    );
    expect(r.problems.some((p) => p.includes('tarentaal near'))).toBe(false);
  });
});
