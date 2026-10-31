// v1.9 (D-066): the soundscape scheduler — deterministic, rates follow the light, ≤ maxVoices and
// ≥ minGapMs by construction (at max rate over thousands of frames), the penalty creatures' quiet
// window, nothing before the first gesture, and bounded work per frame at 20 ticks a frame (the
// perf smoke's regime, lesson 32).
import { describe, expect, it } from 'vitest';
import { loadSoundscape } from '../../../tools/testContent';
import type { Soundscape } from '../../content/schemas';
import {
  resolveSoundscapeLight,
  SoundscapeDirector,
  type CallOutcome,
  type SoundscapeCall,
  type SoundscapeScene,
  type SoundscapeSink,
} from './soundscape';

const sc = loadSoundscape();
const TPS = 60;

const scene = (area: string, light: string, o: Partial<SoundscapeScene> = {}): SoundscapeScene => ({
  area,
  light,
  hazeDb: 0,
  seed: 42,
  title: false,
  startTick: 0,
  ...o,
});

interface Played {
  key: string;
  at: number;
  end: number;
  warns: string | null;
}

/** A sink that plays everything (or answers `outcome`) and records what played. */
function recorder(
  outcome: () => CallOutcome = () => 'played',
  quiet: (c: string, t: number) => boolean = () => false,
): SoundscapeSink & { played: Played[]; offers: number } {
  const s = {
    played: [] as Played[],
    offers: 0,
    play(c: Readonly<SoundscapeCall>): CallOutcome {
      s.offers++;
      const o = outcome();
      if (o === 'played')
        s.played.push({ key: c.key, at: c.at, end: c.at + c.lengthTicks, warns: c.warns });
      return o;
    },
    quiet,
  };
  return s;
}

function run(
  d: SoundscapeDirector,
  sink: SoundscapeSink,
  ticks: number,
  perFrame = 1,
): { maxOffered: number; maxPlays: number } {
  let maxOffered = 0;
  let maxPlays = 0;
  const p = sink as unknown as { offers: number };
  for (let t = perFrame; t <= ticks; t += perFrame) {
    const before = p.offers;
    maxOffered = Math.max(maxOffered, d.step(t, sink));
    maxPlays = Math.max(maxPlays, p.offers - before);
  }
  return { maxOffered, maxPlays };
}

const count = (ps: readonly Played[], key: string): number =>
  ps.filter((p) => p.key === key).length;

/** Every area entry at the schema's maximum rate, all day. */
function maxed(base: Soundscape): Soundscape {
  const areas = Object.fromEntries(
    Object.entries(base.areas).map(([a, l]) => [a, l.map((e) => ({ ...e, perMinute: 20 }))]),
  );
  return { ...base, areas, jitter: 1 };
}

describe('SoundscapeDirector (D-066)', () => {
  it('the same seed, area and light give the same schedule, at any frame rate', () => {
    const a = new SoundscapeDirector(sc, true);
    const b = new SoundscapeDirector(sc, true);
    a.start(scene('okavango-spring', 'dusk'));
    b.start(scene('okavango-spring', 'dusk'));
    const timeline = (d: SoundscapeDirector, perFrame: number): string[] => {
      const out: string[] = [];
      const sink = recorder(() => 'muted');
      for (let t = perFrame; t <= 60 * TPS; t += perFrame) {
        d.step(t, sink);
        for (const e of d.log ?? []) out.push(`${e.key}@${e.tick}:${e.pan}`);
        d.log?.splice(0);
      }
      return out;
    };
    const one = timeline(a, 1);
    const twenty = timeline(b, 20);
    expect(one.length).toBeGreaterThan(5);
    expect(twenty).toEqual(one);
    // Another seed is another schedule.
    const c = new SoundscapeDirector(sc, true);
    c.start(scene('okavango-spring', 'dusk', { seed: 43 }));
    expect(timeline(c, 1)).not.toEqual(one);
  });

  it('rates follow the time of day: reed frogs at dusk, cicadas in the heat', () => {
    const minutes = 30;
    const at = (area: string, light: string): Played[] => {
      const d = new SoundscapeDirector({ ...sc, minGapMs: 0, maxVoices: 4 });
      d.start(scene(area, light));
      const s = recorder();
      run(d, s, minutes * 60 * TPS);
      return s.played;
    };
    const okaDusk = at('okavango-spring', 'dusk');
    const okaNoon = at('okavango-spring', 'midday');
    // 3 a minute × 1.8 at dusk; none at midday.
    expect(count(okaDusk, 'sfx/amb_reed_frog')).toBeGreaterThan(3 * 1.8 * minutes * 0.6);
    expect(count(okaNoon, 'sfx/amb_reed_frog')).toBe(0);
    const kalNoon = at('kalahari-summer', 'midday');
    const kalDusk = at('kalahari-summer', 'dusk');
    expect(count(kalNoon, 'sfx/amb_cicada')).toBeGreaterThan(2.5 * 1.6 * minutes * 0.6);
    expect(count(kalDusk, 'sfx/amb_cicada')).toBe(0);
    // Doves: fewer at midday than at dawn.
    const dawn = at('karoo-autumn', 'dawn_mist');
    const noon = at('karoo-autumn', 'midday');
    expect(count(noon, 'sfx/amb_cape_turtle_dove')).toBeLessThan(
      count(dawn, 'sfx/amb_cape_turtle_dove'),
    );
    // Only the area's own calls.
    const own = new Set(sc.areas['kalahari-summer']?.map((e) => sc.calls[e.call]?.sound));
    for (const p of kalNoon) expect(own.has(p.key)).toBe(true);
  });

  it('the title is calmer than a hunt', () => {
    const n = (title: boolean): number => {
      const d = new SoundscapeDirector({ ...sc, minGapMs: 0, maxVoices: 4 });
      d.start(scene('bushveld-winter', 'dawn_mist', { title }));
      const s = recorder();
      run(d, s, 20 * 60 * TPS);
      return s.played.length;
    };
    expect(n(true)).toBeLessThan(n(false) * 0.7);
  });

  it('at max rate over 5 000 frames of 20 ticks: ≤ maxVoices at once, ≥ minGapMs apart, ≤ 1 play a frame', () => {
    for (const area of Object.keys(sc.areas)) {
      const d = new SoundscapeDirector(maxed(sc));
      d.start(scene(area, 'golden'));
      const s = recorder();
      const { maxOffered, maxPlays } = run(d, s, 5000 * 20, 20);
      expect(s.played.length).toBeGreaterThan(100);
      const gap = (sc.minGapMs * TPS) / 1000;
      for (let i = 1; i < s.played.length; i++)
        expect((s.played[i]?.at ?? 0) - (s.played[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(gap);
      for (const p of s.played) {
        const busy = s.played.filter((q) => q.at <= p.at && q.end > p.at).length;
        expect(busy).toBeLessThanOrEqual(sc.maxVoices);
      }
      // Per frame: one entry per area call at most is offered, and one call reaches the sink.
      expect(maxOffered).toBeLessThanOrEqual(sc.areas[area]?.length ?? 0);
      expect(maxPlays).toBeLessThanOrEqual(1);
    }
  });

  it('a voice still playing is never stolen: a third call waits', () => {
    const d = new SoundscapeDirector({ ...maxed(sc), minGapMs: 0 });
    d.start(scene('karoo-autumn', 'dusty_wind'));
    const s = recorder();
    run(d, s, 3000, 1);
    for (let t = 0; t < 3000; t++) expect(d.voicesAt(t)).toBeLessThanOrEqual(sc.maxVoices);
    expect(d.counts.voices).toBeGreaterThan(0);
  });

  it('penalty creatures: no call that sounds like one inside its quiet window', () => {
    const window = (t: number): boolean => t >= 600 && t <= 2400;
    const d = new SoundscapeDirector(maxed(sc), true);
    d.start(scene('okavango-spring', 'dusk'));
    const s = recorder(
      () => 'played',
      (c, t) => (c === 'visarend' || c === 'hadeda') && window(t),
    );
    run(d, s, 6000, 20);
    const warned = s.played.filter((p) => p.warns !== null);
    expect(warned.length).toBeGreaterThan(0);
    for (const p of warned) expect(window(p.at)).toBe(false);
    expect(d.counts.quiet).toBeGreaterThan(0);
  });

  it('nothing plays before the first gesture (a locked sink), and it uses no voice', () => {
    const d = new SoundscapeDirector(maxed(sc));
    d.start(scene('kalahari-summer', 'midday'));
    let unlocked = false;
    const s = recorder(() => (unlocked ? 'played' : 'locked'));
    run(d, s, 3000);
    expect(s.played).toHaveLength(0);
    expect(d.counts.locked).toBeGreaterThan(0);
    expect(d.voicesAt(3000)).toBe(0);
    unlocked = true;
    for (let t = 3001; t <= 6000; t++) d.step(t, s);
    expect(s.played.length).toBeGreaterThan(0);
  });

  it('a late call (a stalled or held frame) is skipped, not played late', () => {
    const d = new SoundscapeDirector(maxed(sc));
    d.start(scene('bushveld-winter', 'dawn_mist'));
    const s = recorder();
    d.step(20 * 60 * TPS, s);
    expect(d.counts.late).toBeGreaterThan(0);
    expect(s.played.length).toBeLessThanOrEqual(1);
  });

  it('every penalty-creature call in the content is far', () => {
    for (const list of Object.values(sc.areas))
      for (const e of list)
        if (sc.calls[e.call]?.warns !== undefined) expect(e.distance).toBe('far');
  });
});

describe('resolveSoundscapeLight (D-066)', () => {
  it('the layout light, a haze on top, a special day falling back to the map', () => {
    expect(resolveSoundscapeLight(sc, ['dusk'], ['dusk'])).toEqual({ light: 'dusk', hazeDb: 0 });
    expect(resolveSoundscapeLight(sc, ['golden', 'verste_haze'], [])).toEqual({
      light: 'golden',
      hazeDb: sc.hazeDb['verste_haze'],
    });
    expect(resolveSoundscapeLight(sc, ['nuwejaar_skemer'], ['midday']).light).toBe('midday');
    expect(resolveSoundscapeLight(sc, ['spookjag'], []).light).toBe(sc.defaultLight);
  });
});
