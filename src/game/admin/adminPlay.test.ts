import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { DEFAULT_OPTIONS, adminEntries, type AdminEntry } from '../../meta/admin';
import { parseDayKey } from '../../meta/dailyCalendar';
import { createSim } from '../../sim/Sim';
import type { ModeConfig } from '../../sim/types';
import { adminHuntSetup } from './adminPlay';

const content = loadContent();
const entries = adminEntries(
  content,
  content.biomes.map((b) => b.id),
);
const pick = (id: string): AdminEntry => {
  const e = entries.find((x) => x.id === id);
  if (e === undefined) throw new Error(id);
  return e;
};

/** Runs a short hunt with the setup's content and mode; returns the world events seen. */
function run(mode: ModeConfig, c = content): string[] {
  const sim = createSim({
    seed: 7,
    content: c,
    mode: { ...mode, huntSeconds: 20 },
    inputKind: 'pointer',
  });
  const seen: string[] = [];
  while (!sim.isOver()) {
    sim.step(sim.tick % 40 === 0 ? [{ t: 'fire', dx: 0, sy: 700 }] : []);
    for (const e of sim.drainEvents()) if (e.type === 'worldEvent') seen.push(e.event);
  }
  return seen;
}

describe('admin hunt setup (D-034)', () => {
  it('a Classic map entry picks biome and layout; plain plays no layout', () => {
    const fri = adminHuntSetup(pick('classic:karoo-autumn:fri'), DEFAULT_OPTIONS, content);
    expect(fri.mode).toBe('classic');
    expect(fri.classicBiome).toBe('karoo-autumn');
    expect(fri.classicLayout).toBe('fri');
    expect(fri.classicBonus).toBeUndefined();
    expect(
      adminHuntSetup(pick('classic:okavango-spring:plain'), DEFAULT_OPTIONS, content).classicLayout,
    ).toBe('none');
    const verder = adminHuntSetup(pick('classic:kalahari-summer:verder'), DEFAULT_OPTIONS, content);
    expect(verder.classicBonus).toBe('verder');
    expect(verder.classicLayout).toBeUndefined();
    expect(fri.content).toBe(content);
  });

  it('options become overrides: seed, length, omen, gun, the Daily date', () => {
    const o = {
      ...DEFAULT_OPTIONS,
      seed: 42,
      huntSeconds: 15,
      omen: 'on' as const,
      weapon: 'pomp',
      date: '2026-10-23',
    };
    const d = adminHuntSetup(pick('daily'), o, content);
    expect(d.mode).toBe('daily');
    expect(d.seed).toBe(42);
    expect(d.huntSeconds).toBe(15);
    expect(d.omen).toBe(true);
    expect(d.weapon).toBe('pomp');
    expect(d.today).toBe(parseDayKey('2026-10-23'));
    expect(adminHuntSetup(pick('daily'), { ...o, omen: 'off' }, content).omen).toBe(false);
  });

  it('a Season Run entry jumps to its hunt; a crate gun is rented there', () => {
    const s = adminHuntSetup(
      pick('season:lente:2'),
      { ...DEFAULT_OPTIONS, weapon: 'voorlaaier' },
      content,
    );
    expect(s.mode).toBe('seasonHunt');
    expect(s.huntIndex).toBe(content.run.huntPattern.length * 2 + 1);
    expect(s.weapon).toBeUndefined();
    expect(s.runRental).toBe('voorlaaier');
    expect(
      adminHuntSetup(pick('season:lente:2'), { ...DEFAULT_OPTIONS, weapon: 'kettie' }, content)
        .weapon,
    ).toBe('kettie');
  });

  it('the quota multiplier scales every Season Run quota', () => {
    const s = adminHuntSetup(
      pick('season:herfs:1'),
      { ...DEFAULT_OPTIONS, quotaMul: 0.5 },
      content,
    );
    expect(s.content.run.seasons[0]?.quotas[0]).toBe(
      Math.round((content.run.seasons[0]?.quotas[0] ?? 0) * 0.5),
    );
  });

  it('every gun, crate guns included, plays a Classic hunt', () => {
    for (const w of content.weapons.weapons) {
      const s = adminHuntSetup(
        pick('classic:karoo-autumn:fri'),
        { ...DEFAULT_OPTIONS, weapon: w.id },
        content,
      );
      if (w.kind === 'crate') {
        // The first crate holds it, early in the hunt.
        expect(s.weapon).toBeUndefined();
        expect(s.content.powerups.crates.table).toEqual([{ id: w.id, weight: 1, type: 'weapon' }]);
      } else expect(s.weapon).toBe(w.id);
      const mode: ModeConfig = {
        id: 'classic',
        biome: 'karoo-autumn',
        layout: 'fri',
        ...(s.weapon === undefined ? {} : { weapon: s.weapon }),
      };
      expect(() => run(mode, s.content)).not.toThrow();
    }
  });

  it('a forced event takes place in a Classic hunt of every biome that has it', () => {
    for (const b of content.biomes)
      for (const ev of new Set(b.events.map((e) => e.id))) {
        const s = adminHuntSetup(
          pick(`classic:${b.id}:plain`),
          { ...DEFAULT_OPTIONS, event: ev },
          content,
        );
        const seen = run({ id: 'classic', biome: b.id }, s.content);
        expect(seen, `${b.id} ${ev}`).toContain(ev);
      }
  });
});
