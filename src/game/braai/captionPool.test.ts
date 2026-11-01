// v1.11 (D-068, perf lessons 32–33, CI review): Oupa's story bubbles are rendered when the braai
// is built, never in its per-frame update: over a whole story in the perf smoke's regime (~330 ms
// frames) and at 60 fps, no frame renders a caption, and at most one line is told a frame.
import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../tools/testContent';
import { captionText } from './braaiAnim';
import { CaptionPool } from './captionPool';
import { tellStory } from './story';
import { NO_FACTS } from './storyFacts';

const tuning = loadFeel().braai;
const story = tellStory(
  {
    result: { score: 9000, bagged: 30, shots: 30, hitShots: 30, wholeFlocks: 2, rank: 'x' },
    facts: { ...NO_FACTS, verBagged: 1, farthest: 'ver' },
    newBest: true,
    rankUp: null,
    rankBefore: 'plaaswerker',
    bestBefore: 8000,
    harvestCrop: null,
    topRank: 'bosveld_legend',
    bottomRank: 'stadsjapie',
  },
  tuning,
);

describe('caption pool', () => {
  it.each([333, 16.7])('frames of %d ms: no caption is rendered in the loop', (dt) => {
    let renders = 0;
    const pool = new CaptionPool((text) => {
      renders++;
      return { text };
    });
    const captions = story.map((l) => captionText(l));
    pool.prepare(captions);
    // The skip's closer is one of them: nothing new to render for it either.
    pool.prepare([captions.at(-1) ?? '']);
    const atBuild = renders;
    expect(atBuild).toBe(new Set(captions).size);
    // The story's schedule on the braai clock, as BraaiView tells it.
    const from = 1300;
    let shown = 0;
    for (let ms = 0; ms < 30_000; ms += dt) {
      let told = 0;
      const due = from + shown * (tuning.story.lineMs + tuning.story.gapMs);
      const line = story[shown];
      if (ms >= due && line !== undefined) {
        shown++;
        told++;
        expect(pool.take(captionText(line)).text).toBe(captionText(line));
      }
      expect(told).toBeLessThanOrEqual(1);
    }
    expect(shown).toBe(story.length);
    expect(renders, 'no render inside the frame loop').toBe(atBuild);
    expect(pool.made).toBe(atBuild);
  });
});
