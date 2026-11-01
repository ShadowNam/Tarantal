import { describe, expect, it } from 'vitest';
import { setAfrikaansNames, translator } from '../i18n/i18n';
import { loadContent, loadDailyMeta } from '../../tools/testContent';
import { createSim } from '../sim/Sim';
import type { SimEvent } from '../sim/events';
import {
  buildHarvestShare,
  buildShareText,
  createShareLogger,
  groupThousands,
  joinShare,
  type ShareInput,
} from './share';

const daily: ShareInput = {
  dailyNumber: 142,
  biome: 'karoo-autumn',
  score: 2840,
  rank: 'bosveldjagter',
  grid: '🟩🟩🟨🟩⬛',
  wholeFlocks: 2,
  url: 'https://shadownam.github.io/Tarantal/?c=eyJ2IjoxfQ',
};
/** Clipboard text with the no-break spaces made visible (⎵). */
const show = (m: Parameters<typeof joinShare>[0]): string => joinShare(m).replaceAll('\u00a0', '⎵');
const classic: ShareInput = {
  ...daily,
  dailyNumber: null,
  score: 12345,
  rank: 'bosveld_legend',
  wholeFlocks: 0,
};

describe('share text (GDD §15)', () => {
  it('en', () => {
    const tr = translator('en');
    expect(show(buildShareText(daily, tr))).toMatchInlineSnapshot(`
      "🐦 Tarantal Madness · Daily #142 · 2⎵840 · Bushveld Hunter · 🟩🟩🟨🟩⬛ · 2× whole flock
      Beat me on this exact hunt: https://shadownam.github.io/Tarantal/?c=eyJ2IjoxfQ"
    `);
    expect(show(buildShareText(classic, tr))).toMatchInlineSnapshot(`
      "🐦 Tarantal Madness · Classic · Karoo · 12⎵345 · Bushveld Legend · 🟩🟩🟨🟩⬛
      Beat me on this exact hunt: https://shadownam.github.io/Tarantal/?c=eyJ2IjoxfQ"
    `);
  });

  it('af', () => {
    const tr = translator('af');
    expect(show(buildShareText(daily, tr))).toMatchInlineSnapshot(`
      "🐦 Tarantal Madness · Daaglikse Jag #142 · 2⎵840 · Bosveldjagter · 🟩🟩🟨🟩⬛ · 2× hele swerm
      Klop my op presies hierdie jag: https://shadownam.github.io/Tarantal/?c=eyJ2IjoxfQ"
    `);
    expect(show(buildShareText(classic, tr))).toMatchInlineSnapshot(`
      "🐦 Tarantal Madness · Klassiek · Karoo · 12⎵345 · Bosveld-legende · 🟩🟩🟨🟩⬛
      Klop my op presies hierdie jag: https://shadownam.github.io/Tarantal/?c=eyJ2IjoxfQ"
    `);
  });

  it('v1.5 (D-041): follows the text language, and the Afrikaans-names toggle', () => {
    const de = buildShareText(daily, translator('de')).text;
    expect(de).toContain('Buschjäger');
    expect(de).toContain('2× ganzer Schwarm');
    setAfrikaansNames(true);
    try {
      const en = buildShareText(daily, translator('en')).text;
      expect(en).toContain('Bosveldjagter');
      expect(en).toContain('2× hele swerm');
      expect(en).toContain('Daily #142');
    } finally {
      setAfrikaansNames(false);
    }
  });

  it('names v1.3 bonus maps by their i18n name (bonusSlug), never their id', () => {
    for (const [lang, bonus, name] of [
      ['en', 'nogVerder', 'Further Still'],
      ['en', 'dieVerste', 'The Furthest'],
      ['de', 'nogVerder', 'Noch weiter'],
      ['af', 'nogVerder', 'Nog Verder'],
    ] as const) {
      const text = buildShareText({ ...classic, layout: 'mon', bonus }, translator(lang)).text;
      expect(text).toContain(name);
      expect(text).not.toContain(bonus);
    }
  });

  it('keeps the link out of the text for navigator.share, and works without one', () => {
    const m = buildShareText(daily, translator('en'));
    expect(m.text).not.toContain('http');
    expect(m.url).toBe(daily.url);
    expect(show(buildShareText({ ...daily, url: '' }, translator('en')))).not.toContain('\n');
  });

  it('v1.11 (D-068): the Daily card puts the braai round its score', () => {
    const tr = translator('en');
    expect(show(buildShareText({ ...daily, braai: true }, tr))).toMatchInlineSnapshot(`
      "🐦 Tarantal Madness · Daily #142 · 🔥 2⎵840 🌌 · Bushveld Hunter · 🟩🟩🟨🟩⬛ · 2× whole flock
      Beat me on this exact hunt: https://shadownam.github.io/Tarantal/?c=eyJ2IjoxfQ"
    `);
    // A special day's card keeps its own frame (the braai is only for the ordinary Daily).
    expect(buildShareText({ ...daily, braai: false }, tr).text).not.toContain('🔥');
  });

  it('groups thousands with a no-break space', () => {
    expect(groupThousands(999)).toBe('999');
    expect(groupThousands(2840)).toBe('2\u00a0840');
    expect(groupThousands(1234567)).toBe('1\u00a0234\u00a0567');
    expect(groupThousands(-1500)).toBe('−1\u00a0500');
  });
});

describe('share grid', () => {
  const cfg = { segments: 5, green: 0.6, yellow: 0.3 };
  const shot = (tick: number, shotId: number): SimEvent => ({
    type: 'shotFired',
    tick,
    shotId,
    weapon: 'dubbelloop',
    dx: 0,
    sy: 0,
    shellsLeft: 1,
  });
  const bag = (tick: number, shotId: number): SimEvent => ({
    type: 'targetBagged',
    tick,
    shotId,
    birdId: shotId * 10 + tick,
    creature: 'tarentaal',
    plane: 'mid',
    behaviour: 'forage',
    flockId: null,
    x: 0,
    y: 0,
  });

  it('colours each fifth of the hunt by its accuracy; a two-bird shot counts once', () => {
    const log = createShareLogger(cfg);
    log.add([{ type: 'huntStarted', tick: 0, durationTicks: 500, stampedeAtTick: null }]);
    // Segment 0: 2/2 → green (one shot bags two). Segment 1: 1/3 → yellow. Segment 2: 0/2 → poor.
    // Segment 3: no shots → poor. Segment 4 (plus bonus time past 500): 1/1 → green.
    log.add([shot(10, 1), bag(10, 1), bag(10, 1), shot(20, 2), bag(20, 2)]);
    log.add([shot(110, 3), bag(111, 3), shot(120, 4), shot(130, 5)]);
    log.add([shot(210, 6), shot(220, 7)]);
    log.add([shot(560, 8), bag(560, 8)]);
    expect(log.grid()).toBe('🟩🟨⬛⬛🟩');
  });

  it('over a real hunt: one square per segment and hits match HuntResult.hitShots', () => {
    const content = loadContent();
    const meta = loadDailyMeta();
    const sim = createSim({ seed: 5, content, mode: { id: 'daily' }, inputKind: 'pointer' });
    const log = createShareLogger(meta.grid);
    let hits = 0;
    const seen = new Set<number>();
    const add = (events: readonly SimEvent[]): void => {
      log.add(events);
      for (const e of events) {
        if (e.type !== 'targetBagged' || seen.has(e.shotId)) continue;
        seen.add(e.shotId);
        hits++;
      }
    };
    add(sim.drainEvents());
    while (!sim.isOver()) {
      // Shoot straight ahead twice a second.
      sim.step(
        sim.tick % 30 === 0
          ? [{ t: 'fire', dx: 0, sy: 600 }]
          : sim.tick % 30 === 15
            ? [{ t: 'reload' }]
            : [],
      );
      add(sim.drainEvents());
    }
    expect(log.grid().match(/\p{Extended_Pictographic}|⬛/gu)?.length).toBe(meta.grid.segments);
    expect(hits).toBe(sim.result().hitShots);
  });
});

describe('the Harvest share card (v1.8c, D-063)', () => {
  it('names the mode, the score and the crop saved, with a plain link', () => {
    const m = buildHarvestShare(
      { score: 1724, crop: 68.8, grid: '🎯🎯', url: 'https://example.test/' },
      translator('en'),
    );
    expect(m.text).toContain('The Harvest');
    expect(m.text).toContain(groupThousands(1724));
    expect(m.text).toContain('crop saved 68 %');
    expect(m.url).toBe('https://example.test/');
    expect(
      buildHarvestShare({ score: 5, crop: 40, grid: '', url: '' }, translator('af')).text,
    ).toContain('Die Oes');
  });
});
