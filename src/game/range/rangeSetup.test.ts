// v1.3x (D-037) Skietbaan setup: the guns offered, reach, the mode a choice becomes, the report
// and the range's own string tables.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { setLanguage, LANGUAGES } from '../../i18n/i18n';
import af from '../../i18n/range/af.json';
import de from '../../i18n/range/de.json';
import en from '../../i18n/range/en.json';
import nl from '../../i18n/range/nl.json';
import { layoutForDay } from '../../meta/maps';
import { createRangeProgram } from '../../sim/range/program';
import { createSim } from '../../sim/Sim';
import {
  bodyWidthPx,
  defaultChoice,
  pickPlane,
  pickTarget,
  shuffleSeed,
  rangeGuns,
  rangeMode,
  reaches,
  RANGE_PLANES,
} from './rangeGuns';
import { rt } from './rangeI18n';
import { centreText, groupText, rangeReport } from './rangeReport';
import { RangeStats } from './rangeStats';

const content = loadContent();
const DAY = 20_385; // 2025-10-24, a Friday

describe('range guns', () => {
  it('every gun, locked ones too: primaries (the .22 once per sight), then the crate guns', () => {
    expect(rangeGuns(content).map((g) => g.id)).toEqual([
      'dubbelloop',
      'windbuks',
      'kettie',
      'pomp',
      'twee_twee:iron',
      'twee_twee:peep',
      'twee_twee:scope_small',
      'langloop:scope_var',
      'voorlaaier',
      'mielie_masjien',
    ]);
  });

  it('only rifles reach Ver; every gun reaches near, middle and far', () => {
    for (const g of rangeGuns(content)) {
      for (const p of RANGE_PLANES)
        expect(reaches(g, p), `${g.id} ${p}`).toBe(
          p !== 'ver' || g.weapon === 'twee_twee' || g.weapon === 'langloop',
        );
    }
  });

  it('a choice becomes a range mode the sim accepts, on today’s weekday light', () => {
    for (const g of rangeGuns(content)) {
      const mode = rangeMode(
        content,
        { gun: g.id, biome: 'okavango-spring', plane: 'mid', target: 'flock' },
        DAY,
      );
      expect(mode.id).toBe('range');
      expect(mode.layout).toBe(layoutForDay(DAY));
      expect(mode.sight).toBe(g.sight ?? undefined);
      expect(mode.range?.crate).toBe(g.crate ? g.weapon : undefined);
      const sim = createSim({
        seed: 1,
        content,
        mode,
        inputKind: 'pointer',
        rangeProgram: createRangeProgram,
      });
      expect(sim.snapshot().weapon.id).toBe(g.weapon);
      expect(sim.snapshot().weapon.sight).toBe(g.sight);
    }
  });

  it('starts on the range gun in the Karoo, near, on the paper target', () => {
    expect(defaultChoice(content)).toEqual({
      gun: 'dubbelloop',
      biome: 'karoo-autumn',
      plane: 'near',
      target: 'paper',
    });
  });

  it('compares groups with the guineafowl body width at each distance', () => {
    const rx = 110;
    expect(bodyWidthPx(content, 'near')).toBeCloseTo(2 * rx, 9);
    expect(bodyWidthPx(content, 'ver')).toBeCloseTo(2 * rx * 0.1, 9);
  });
});

describe('range report', () => {
  it('is plain text: header, unranked line, then each cell and its lines', () => {
    setLanguage('en');
    const s = new RangeStats();
    const sel = { gun: 'dubbelloop', plane: 'near' as const, target: 'paper' as const, pellets: 8 };
    s.ingest(
      [
        {
          type: 'shotFired',
          tick: 1,
          shotId: 1,
          weapon: 'dubbelloop',
          dx: 0,
          sy: 0,
          shellsLeft: 7,
        },
        { type: 'rangeShot', tick: 1, shotId: 1, plane: 'near', target: 'paper', x: 0, y: 0 },
        { type: 'paperHit', tick: 1, shotId: 1, paperId: 1, x: 3, y: 4, aimX: 0, aimY: 0 },
        {
          type: 'rangeOutcome',
          tick: 1,
          shotId: 1,
          hits: [{ plane: 'near', target: 'paper', id: 1, pellets: 1 }],
          short: false,
        },
      ],
      sel,
    );
    const text = rangeReport(content, s.list(), {
      build: 'abc1234',
      viewport: '1280×720 @1x',
      device: 'test',
      biome: 'karoo-autumn',
      layout: 'fri',
    });
    expect(text).toContain('Tarantal Madness Skietbaan report');
    expect(text).toContain('Build abc1234');
    expect(text).toContain('Karoo Farm — Autumn · Friday light');
    expect(text).toContain('Unranked');
    expect(text).toContain('Dubbelloop · Near · Paper target');
    expect(text).toContain('Shots 1 · hits 1 · misses 0 · 100.0 %');
    expect(text).toContain('Pellets on target: 1.0 of 8 per shot');
    expect(text).toContain('Centre 3.0 px right, 4.0 px low of the aim');
    expect(text).not.toMatch(/<|\*\*/);
    expect(
      rangeReport(content, [], {
        build: 'x',
        viewport: '',
        device: '',
        biome: 'karoo-autumn',
        layout: 'fri',
      }),
    ).toContain('No shots yet.');
  });
});

describe('range strings', () => {
  it('every language has every key, with the same placeholders', () => {
    const vars = (v: string): string =>
      [...v.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',');
    const tables: Record<string, Record<string, string>> = { en, af, de, nl };
    expect(Object.keys(tables).sort()).toEqual([...LANGUAGES].sort());
    for (const [lang, table] of Object.entries(tables)) {
      expect(Object.keys(table).sort(), lang).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(table)) {
        expect(v.trim(), `${lang} ${k}`).not.toBe('');
        expect(vars(v), `${lang} ${k}`).toBe(vars((en as Record<string, string>)[k] ?? ''));
      }
    }
  });

  it('follow the game language', () => {
    setLanguage('af');
    expect(rt('range.target_paper')).toBe('Papierteiken');
    setLanguage('de');
    expect(rt('range.col_short')).toBe('Zu kurz');
    setLanguage('en');
    expect(rt('range.title')).toBe('Skietbaan');
  });
});

describe('session table texts', () => {
  it('group with % of body width, and the centre vs aim', () => {
    setLanguage('en');
    const s = new RangeStats();
    const sel = { gun: 'windbuks', plane: 'mid' as const, target: 'paper' as const, pellets: 1 };
    for (const [id, x, y] of [
      [1, 10, 0],
      [2, 0, 10],
    ] as const)
      s.ingest(
        [
          {
            type: 'shotFired',
            tick: id,
            shotId: id,
            weapon: 'windbuks',
            dx: 0,
            sy: 0,
            shellsLeft: 5,
          },
          { type: 'rangeShot', tick: id, shotId: id, plane: 'mid', target: 'paper', x: 0, y: 0 },
          { type: 'paperHit', tick: id, shotId: id, paperId: 1, x, y, aimX: 0, aimY: 0 },
          {
            type: 'rangeOutcome',
            tick: id,
            shotId: id,
            hits: [{ plane: 'mid', target: 'paper', id: 1, pellets: 1 }],
            short: false,
          },
        ],
        sel,
      );
    const cell = s.cell(sel);
    // Centre (5, 5): 5 px right, 5 px low. Mean radius √50, spread √200; body at mid 110 px.
    expect(centreText(cell)).toBe('5.0 px right, 5.0 px low');
    const mr = Math.sqrt(50);
    const es = Math.sqrt(200);
    const pct = (v: number): string => ((v / 110) * 100).toFixed(1);
    expect(groupText(content, cell)).toBe(
      `${mr.toFixed(1)} px (${pct(mr)} %) · ${es.toFixed(1)} px (${pct(es)} %)`,
    );
    expect(groupText(content, s.cell({ ...sel, target: 'stand' }))).toBeNull();
    expect(centreText(s.cell({ ...sel, target: 'stand' }))).toBeNull();
  });

  it('every range string key is used by the range code', () => {
    const dir = import.meta.dirname;
    const src = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    // Keys built from ids (`range.dist_${plane}`) count through their prefix.
    const prefixes = [...src.matchAll(/`(range\.[a-z_]+)\$\{/g)].map((m) => m[1] ?? '');
    const unused = Object.keys(en).filter(
      (k) => !src.includes(`'${k}'`) && !prefixes.some((p) => p !== '' && k.startsWith(p)),
    );
    expect(unused).toEqual([]);
  });
});

describe('24 Oct update: the mixed course choice', () => {
  it('All picks Mixed and Mixed picks All; leaving one leaves the other', () => {
    const c = defaultChoice(content);
    expect(pickPlane(c, 'all')).toMatchObject({ plane: 'all', target: 'mixed' });
    expect(pickTarget(c, 'mixed')).toMatchObject({ plane: 'all', target: 'mixed' });
    const mixed = pickTarget(c, 'mixed');
    expect(pickPlane(mixed, 'far')).toMatchObject({ plane: 'far', target: 'paper' });
    expect(pickTarget(mixed, 'plate')).toMatchObject({ plane: 'near', target: 'plate' });
    expect(rangeMode(content, mixed, 0).range).toMatchObject({ plane: 'all', target: 'mixed' });
  });
});

describe('24 Oct update: short in the report', () => {
  it('a cell with shots that fell short says so in its lines (bar, Copy report)', () => {
    setLanguage('en');
    const s = new RangeStats();
    const sel = { gun: 'kettie', plane: 'ver' as const, target: 'paper' as const, pellets: 1 };
    for (const id of [1, 2])
      s.ingest(
        [
          {
            type: 'shotFired',
            tick: id,
            shotId: id,
            weapon: 'kettie',
            dx: 0,
            sy: 0,
            shellsLeft: 0,
          },
          { type: 'rangeShot', tick: id, shotId: id, plane: 'ver', target: 'paper', x: 0, y: 0 },
          { type: 'rangeOutcome', tick: id, shotId: id, hits: [], short: true },
        ],
        sel,
      );
    const text = rangeReport(content, s.list(), {
      build: 'abc1234',
      viewport: '1280×720 @1x',
      device: 'test',
      biome: 'karoo-autumn',
      layout: 'fri',
    });
    expect(text).toContain('Kettie · Ver · Paper target');
    expect(text).toContain('Shots 2 · hits 0 · misses 2 · 0.0 %');
    expect(text).toContain('Fell short: 2 of 2 misses');
  });
});

describe('review fix: Shuffle seeds', () => {
  it('every Shuffle of a fixed base seed is a new, repeatable seed and a new layout', () => {
    const seeds = [0, 1, 2, 3, 4, 5].map((n) => shuffleSeed(42, n));
    expect(seeds[0]).toBe(42);
    expect(new Set(seeds).size).toBe(seeds.length);
    expect(shuffleSeed(42, 3)).toBe(seeds[3]);
    const layout = (seed: number): string =>
      JSON.stringify(
        createSim({
          seed,
          content,
          mode: { id: 'range', biome: 'karoo-autumn', range: { plane: 'all', target: 'mixed' } },
          inputKind: 'pointer',
          rangeProgram: createRangeProgram,
        }).snapshot().range?.papers,
      );
    const layouts = new Set(seeds.map(layout));
    expect(layouts.size).toBeGreaterThan(3);
  });
});
