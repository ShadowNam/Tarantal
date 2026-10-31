// v1.11 (D-068): Oupa's braai story is picked from the result alone, the same every time.
import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../tools/testContent';
import af from '../../i18n/braai/af.json';
import de from '../../i18n/braai/de.json';
import en from '../../i18n/braai/en.json';
import nl from '../../i18n/braai/nl.json';
import {
  STORY_LINE_IDS,
  captionKey,
  earnsDance,
  isPerfectHunt,
  sayKey,
  tellStory,
  type StoryInput,
  type StoryResult,
} from './story';
import { NO_FACTS, StoryFactsLog } from './storyFacts';

const tuning = loadFeel().braai;

const result = (over: Partial<StoryResult> = {}): StoryResult => ({
  score: 1800,
  bagged: 9,
  shots: 20,
  hitShots: 9,
  wholeFlocks: 0,
  rank: 'plaaswerker',
  ...over,
});

const input = (over: Partial<StoryInput> = {}): StoryInput => ({
  result: result(),
  facts: NO_FACTS,
  newBest: false,
  rankUp: null,
  rankBefore: 'plaaswerker',
  bestBefore: null,
  harvestCrop: null,
  topRank: 'bosveld_legend',
  bottomRank: 'stadsjapie',
  ...over,
});

const ids = (i: StoryInput): string[] => tellStory(i, tuning).map((l) => l.id);

describe('the braai story (D-068)', () => {
  it.each<[string, StoryInput, string[]]>([
    [
      'an empty hunt',
      input({ result: result({ score: 0, bagged: 0, shots: 0, hitShots: 0, rank: 'stadsjapie' }) }),
      ['open_none', 'close_try'],
    ],
    ['an average hunt', input(), ['open_some', 'close_good']],
    [
      'a perfect hunt (no miss, enough birds)',
      input({ result: result({ bagged: 16, shots: 12, hitShots: 12, wholeFlocks: 2 }) }),
      ['open_many', 'whole_flock', 'close_perfect'],
    ],
    [
      'the top rank with a new best and a Ver bag',
      input({
        result: result({ score: 9000, bagged: 30, rank: 'bosveld_legend', wholeFlocks: 1 }),
        newBest: true,
        facts: { ...NO_FACTS, verBagged: 2, farBagged: 4, farthest: 'ver' },
      }),
      ['open_many', 'new_best', 'ver', 'close_perfect'],
    ],
    [
      'a rank up (not a perfect hunt) earns the dance with its own closer',
      input({ rankUp: 'bosveldjagter', facts: { ...NO_FACTS, farBagged: 1, farthest: 'far' } }),
      ['open_some', 'rank_up', 'far', 'close_rank_up'],
    ],
    [
      "a new player's first scored hunt with 0 birds: no rank up, no dance (review B)",
      input({
        result: result({ score: 0, bagged: 0, shots: 4, hitShots: 0, rank: 'stadsjapie' }),
        rankUp: 'stadsjapie',
        rankBefore: null,
      }),
      ['open_none', 'close_try'],
    ],
    [
      'a first scored hunt that reaches a higher rank is still no rank up',
      input({ rankUp: 'bosveldjagter', rankBefore: null }),
      ['open_some', 'close_good'],
    ],
    [
      'a Harvest hunt',
      input({ harvestCrop: 84, result: result({ bagged: 3 }), bestBefore: 1900 }),
      ['open_harvest', 'close_good'],
    ],
    [
      'a Feesdae Daily',
      input({
        result: result({
          feesdag: { id: 'newyear', bats: 0, owls: 0, lanterns: 0, lanternsTotal: 0 },
        }),
      }),
      ['open_some', 'close_feesdag'],
    ],
    [
      'scolds, a can chain and the swarm (the first two moments only)',
      input({
        result: result({
          cans: { total: 6, knocks: 5, airHits: 3, bestChain: 4, weg: 0, points: 300 },
        }),
        facts: { ...NO_FACTS, meerkatScolds: 1, nestScolds: 1, swarmBagged: 5 },
      }),
      ['open_some', 'blikkies', 'swarm', 'close_good'],
    ],
    [
      'a near miss on the record',
      input({ result: result({ score: 1850 }), bestBefore: 2000 }),
      ['open_some', 'near_record', 'close_good'],
    ],
    ['no near miss far below the record', input({ bestBefore: 4000 }), ['open_some', 'close_good']],
  ])('%s', (_, i, want) => {
    expect(ids(i)).toEqual(want);
    // Deterministic: the same input, the same lines.
    expect(tellStory(structuredClone(i), tuning)).toEqual(tellStory(i, tuning));
    const n = tellStory(i, tuning).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(tuning.story.maxLines);
  });

  it('fills the numbers only into the captions', () => {
    const story = tellStory(input({ result: result({ bagged: 14 }) }), tuning);
    expect(story[0]).toEqual({
      id: 'open_some',
      say: 'braai.say.open_some',
      caption: 'braai.open_some',
      vars: { n: 14 },
    });
  });

  it('the perfect-hunt rule', () => {
    const top = 'bosveld_legend';
    const p = { perfect: { minBagged: 10 } };
    expect(isPerfectHunt({ rank: top, shots: 30, hitShots: 3, bagged: 3 }, top, p)).toBe(true);
    expect(isPerfectHunt({ rank: 'x', shots: 10, hitShots: 10, bagged: 10 }, top, p)).toBe(true);
    expect(isPerfectHunt({ rank: 'x', shots: 10, hitShots: 10, bagged: 9 }, top, p)).toBe(false);
    expect(isPerfectHunt({ rank: 'x', shots: 11, hitShots: 10, bagged: 12 }, top, p)).toBe(false);
    expect(isPerfectHunt({ rank: 'x', shots: 0, hitShots: 0, bagged: 0 }, top, p)).toBe(false);
    expect(earnsDance(input({ rankUp: 'x' }), p)).toBe(true);
    // Review B: no earlier rank, or the bottom rank, is never a rank up.
    expect(earnsDance(input({ rankUp: 'x', rankBefore: null }), p)).toBe(false);
    expect(earnsDance(input({ rankUp: 'stadsjapie', rankBefore: 'stadsjapie' }), p)).toBe(false);
    expect(
      earnsDance(
        input({
          rankUp: 'stadsjapie',
          rankBefore: null,
          result: result({ score: 0, bagged: 0, shots: 0, hitShots: 0, rank: 'stadsjapie' }),
        }),
        p,
      ),
    ).toBe(false);
    expect(earnsDance(input(), p)).toBe(false);
  });

  it('every phrase has a caption and a number-free voiced line in every language', () => {
    for (const table of [en, af, de, nl] as Record<string, string>[])
      for (const id of STORY_LINE_IDS) {
        expect(table[captionKey(id)], captionKey(id)).toBeTruthy();
        const say = table[sayKey(id)];
        expect(say, sayKey(id)).toBeTruthy();
        expect(say).not.toMatch(/[{}0-9]/);
      }
    // 19 phrases: the voiced clip count per language (57 clips in en/af/de).
    expect(STORY_LINE_IDS.length).toBe(19);
  });
});

describe('story facts from the event stream', () => {
  it('counts Ver and far bags, scolds and the swarm', () => {
    const log = new StoryFactsLog();
    const bag = (plane: 'near' | 'mid' | 'far' | 'ver') =>
      ({
        type: 'targetBagged',
        tick: 1,
        shotId: 1,
        birdId: 1,
        creature: 'tarentaal',
        plane,
        behaviour: 'forage',
        flockId: null,
        x: 0,
        y: 0,
      }) as const;
    log.add([bag('mid'), bag('far'), bag('ver'), bag('near')]);
    log.add([
      { type: 'rainEased', tick: 9, bagged: 4 },
      {
        type: 'meerkatScold',
        tick: 3,
        colonyId: 'c',
        meerkatId: 1,
        plane: 'mid',
        x: 0,
        y: 0,
        points: -50,
      },
      { type: 'secretPenalty', tick: 4, propId: 'camelthorn', partId: 'nest', points: -100 },
    ]);
    expect(log.facts()).toEqual({
      verBagged: 1,
      farBagged: 1,
      farthest: 'ver',
      meerkatScolds: 1,
      nestScolds: 1,
      swarmBagged: 4,
    });
    expect(new StoryFactsLog().facts()).toEqual(NO_FACTS);
  });
});
