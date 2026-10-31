// v1.9 (D-066): the soundscape's forecast of the penalty creatures' world events matches what the
// real sim emits, on several areas, maps, modes and seeds (a Season Run hunt with Kwêvoël se Seën
// too: its extra events come from the charms stream). If the sim's schedule changes, this fails.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createSim } from '../../sim/Sim';
import type { ModeConfig } from '../../sim/types';
import { forecastWarnings, WarningQuiet } from './warningForecast';

const content = loadContent();
const WARNED = new Set(['hadeda', 'visarend', 'kwevoel']);
const eventCreature = (biome: string, event: string): string | undefined =>
  content.biomes.find((b) => b.id === biome)?.events.find((e) => e.id === event)?.creature;

function emitted(seed: number, mode: ModeConfig): { tick: number; event: string }[] {
  const sim = createSim({ seed, content, mode, inputKind: 'pointer' });
  const out: { tick: number; event: string }[] = [];
  const biome = mode.biome ?? 'karoo-autumn';
  while (!sim.isOver()) {
    sim.step([]);
    for (const e of sim.drainEvents())
      if (e.type === 'worldEvent') {
        const c = eventCreature(biome, e.event);
        if (c !== undefined && WARNED.has(c)) out.push({ tick: e.tick, event: e.event });
      }
  }
  return out;
}

const cases: [string, number, ModeConfig][] = [
  ['Okavango Classic', 3, { id: 'classic', biome: 'okavango-spring', weapon: 'dubbelloop' }],
  [
    'Okavango Daily at dusk (sat)',
    11,
    { id: 'daily', biome: 'okavango-spring', weapon: 'dubbelloop', layout: 'sat' },
  ],
  [
    'Kalahari Classic at midday (tue)',
    7,
    { id: 'classic', biome: 'kalahari-summer', weapon: 'dubbelloop', layout: 'tue' },
  ],
  ['Bushveld Daily (omen)', 21, { id: 'daily', biome: 'bushveld-winter', weapon: 'dubbelloop' }],
  [
    'Karoo Season hunt with Kwêvoël se Seën',
    5,
    {
      id: 'seasonHunt',
      biome: 'karoo-autumn',
      weapon: 'dubbelloop',
      season: {
        kind: 'plain',
        boss: null,
        charms: ['kwevoel_se_seen'],
        consumables: [null, null],
        rental: null,
        runShellBonus: 0,
      },
    },
  ],
];

describe('forecastWarnings (D-066)', () => {
  it.each(cases)('%s: every emitted penalty-creature event was forecast', (_, seed, mode) => {
    const got = emitted(seed, mode);
    const want = forecastWarnings(content, seed, mode, WARNED);
    expect(got.length).toBeGreaterThan(0);
    for (const e of got)
      expect(
        want.some((f) => f.tick === e.tick && f.event === e.event),
        JSON.stringify(e),
      ).toBe(true);
  });

  it('the Skietbaan forecasts nothing', () => {
    expect(forecastWarnings(content, 1, { id: 'range' }, WARNED)).toEqual([]);
  });
});

describe('WarningQuiet (D-066)', () => {
  it('is quiet from beforeTicks before an event until afterTicks after its creature left', () => {
    const q = new WarningQuiet(['hadeda'], 300, 120);
    q.reset([{ tick: 1000, event: 'hadeda', creature: 'hadeda' }]);
    expect(q.quiet('hadeda', 699)).toBe(false);
    expect(q.quiet('hadeda', 700)).toBe(true);
    // The flyover crosses the screen until tick 1600.
    for (let t = 1000; t <= 1600; t += 20) q.observe(t, [{ creature: 'hadeda' }]);
    expect(q.quiet('hadeda', 1600)).toBe(true);
    expect(q.quiet('hadeda', 1720)).toBe(true);
    expect(q.quiet('hadeda', 1721)).toBe(false);
    // Another creature isn't affected.
    expect(q.quiet('visarend', 1000)).toBe(false);
  });

  it('an event the forecast missed still quiets its creature from its arrival', () => {
    const q = new WarningQuiet(['kwevoel'], 300, 120);
    q.reset([]);
    q.arrived('kwevoel', 500);
    expect(q.quiet('kwevoel', 600)).toBe(true);
    expect(q.quiet('kwevoel', 621)).toBe(false);
  });
});
