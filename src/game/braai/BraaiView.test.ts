// v1.11 (D-068, perf lessons 32–33): the braai's animation is a pure function of its clock, applied
// on change only: ≤ 40 Phaser calls a frame (≈ 0.3 ms at 4× throttle) in every frame, at 60 fps and
// in the perf smoke's ~330 ms frames, through the idle poses and the dance; none when the clock
// is held. "Reduce motion" stills the sparks and skips the dance; "reduce flashes" steadies the glow.
import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../tools/testContent';
import { animState, applyAnim, captionText, type AnimSprite, type AnimState } from './braaiAnim';
import { tellStory } from './story';
import { NO_FACTS } from './storyFacts';

const tuning = loadFeel().braai;
let calls = 0;
const stub = (): AnimSprite => {
  const s: AnimSprite = {
    setFrame: () => (calls++, s),
    setOrigin: () => (calls++, s),
    setAlpha: () => (calls++, s),
    setVisible: () => (calls++, s),
    setFlipX: () => (calls++, s),
    setY: () => (calls++, s),
  };
  return s;
};
const targets = {
  flame: stub(),
  spark: stub(),
  glow: stub(),
  oupa: stub(),
  poker: stub(),
  hat: stub(),
  oupaY: 1000,
  scale: 1.3,
  glowPulse: tuning.fire.glowPulse,
};

/** Runs the clock from 0 to `ms` in steps of `dt`; returns the most calls any frame made. */
function run(dt: number, ms: number, danceFrom: number | null, held = false): number {
  let last: AnimState | null = null;
  let worst = 0;
  for (let t = 0; t <= ms; t += dt) {
    const st = animState(held ? 5000 : t, tuning, {
      reducedMotion: false,
      reduceFlashes: false,
      danceFrom,
    });
    calls = 0;
    const n = applyAnim(last, st, targets);
    expect(n).toBe(calls);
    if (last !== null) worst = Math.max(worst, calls);
    last = st;
  }
  return worst;
}

describe('braai view (D-068)', () => {
  it('≤ 40 calls a frame at 60 fps and at 4× throttle, the dance included', () => {
    for (const dt of [16.7, 333, 1000 / 30])
      expect(run(dt, 60_000, 3000), `dt ${dt}`).toBeLessThanOrEqual(10);
  });

  it('a held clock makes no calls', () => {
    expect(run(16.7, 2000, null, true)).toBe(0);
  });

  it('is a function of the clock: the same ms, the same picture', () => {
    const o = { reducedMotion: false, reduceFlashes: false, danceFrom: 1000 };
    for (const ms of [0, 999, 1000, 1234, 4000, 20_000])
      expect(animState(ms, tuning, o)).toEqual(animState(ms, tuning, o));
  });

  it('dances for danceMs from danceFrom, mirroring every other step; then sits again', () => {
    const o = { reducedMotion: false, reduceFlashes: false, danceFrom: 1000 };
    const poses = new Set<string>();
    let flips = 0;
    for (let ms = 1000; ms < 1000 + tuning.danceMs; ms += 20) {
      const st = animState(ms, tuning, o);
      poses.add(st.pose);
      if (st.flip) flips++;
    }
    expect([...poses].sort()).toEqual(['dance_a', 'dance_b']);
    expect(flips).toBeGreaterThan(0);
    expect(animState(1000 + tuning.danceMs, tuning, o).pose.startsWith('sit_')).toBe(true);
    expect(animState(999, tuning, o).pose.startsWith('sit_')).toBe(true);
  });

  it('idles: a sip and a poke in turn between rests', () => {
    const o = { reducedMotion: false, reduceFlashes: false, danceFrom: null };
    const seen = new Set<string>();
    for (let ms = 0; ms < 30_000; ms += 50) seen.add(animState(ms, tuning, o).pose);
    expect([...seen].sort()).toEqual(['sit_idle', 'sit_poke', 'sit_sip']);
  });

  it('reduce motion: still sparks, no dance; reduce flashes: a steady glow', () => {
    const still = { reducedMotion: true, reduceFlashes: true, danceFrom: 0 };
    for (let ms = 0; ms < 10_000; ms += 37) {
      const st = animState(ms, tuning, still);
      expect(st.spark).toBe(0);
      expect(st.glow).toBe(5);
      expect(st.pose.startsWith('sit_')).toBe(true);
    }
    // The flames still flicker (the fire is the scene's life, not a flash).
    const flames = new Set<number>();
    for (let ms = 0; ms < 2000; ms += 37) flames.add(animState(ms, tuning, still).flame);
    expect(flames.size).toBe(4);
  });

  it('captions fill the numbers in the text language', () => {
    const story = tellStory(
      {
        result: { score: 2500, bagged: 14, shots: 20, hitShots: 14, wholeFlocks: 0, rank: 'x' },
        facts: NO_FACTS,
        newBest: false,
        rankUp: null,
        bestBefore: null,
        harvestCrop: null,
        topRank: 'bosveld_legend',
        bottomRank: 'stadsjapie',
        rankBefore: null,
      },
      tuning,
    );
    const open = story[0];
    if (open === undefined) throw new Error('no story');
    expect(captionText(open, 'en')).toBe('14 birds in the pickup. Not bad at all!');
    expect(captionText(open, 'af')).toBe('14 voëls in die bakkie. Glad nie sleg nie!');
  });
});
