// v1.3x (D-037) Skietbaan setup: the guns offered, reach, the mode a choice becomes, the report
// and the range's own string tables.
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
  rangeGuns,
  rangeMode,
  reaches,
  RANGE_PLANES,
} from './rangeGuns';
import { rt } from './rangeI18n';
import { rangeReport } from './rangeReport';
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
      'voorlaaier',
      'mielie_masjien',
    ]);
  });

  it('only rifles reach Ver; every gun reaches near, middle and far', () => {
    for (const g of rangeGuns(content)) {
      for (const p of RANGE_PLANES)
        expect(reaches(g, p), `${g.id} ${p}`).toBe(p !== 'ver' || g.weapon === 'twee_twee');
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
        { type: 'rangeShot', tick: 1, shotId: 1, plane: 'near', x: 0, y: 0 },
        { type: 'paperHit', tick: 1, shotId: 1, paperId: 1, x: 3, y: 4 },
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
    expect(rt('range.out_of_reach')).toBe('außer Reichweite');
    setLanguage('en');
    expect(rt('range.title')).toBe('Skietbaan');
  });
});
