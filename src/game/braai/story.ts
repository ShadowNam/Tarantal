// v1.11 (D-068): Oupa's story at the braai — two to four voiced phrases picked from the hunt's
// result, the facts counted from its events (storyFacts.ts) and what it changed in the save. Pure
// and deterministic: the same input always tells the same story. An opener for the bag, the hunt's
// best moments in a fixed priority, then a closer. Each line is a voiced phrase (`say`, numbers
// never spoken) and its caption (`caption`, the numbers filled in from `vars`).
import type { Feel } from '../../content/schemas';
import type { HuntResult } from '../../sim/types';
import type { StoryFacts } from './storyFacts';

export const STORY_OPENERS = ['open_none', 'open_some', 'open_many', 'open_harvest'] as const;
/** The middle lines, highest priority first. */
export const STORY_MOMENTS = [
  'new_best',
  'rank_up',
  'ver',
  'far',
  'whole_flock',
  'blikkies',
  'swarm',
  'meerkat',
  'nest',
  'near_record',
] as const;
export const STORY_CLOSERS = [
  'close_perfect',
  'close_rank_up',
  'close_feesdag',
  'close_try',
  'close_good',
] as const;

export type StoryLineId =
  (typeof STORY_OPENERS)[number] | (typeof STORY_MOMENTS)[number] | (typeof STORY_CLOSERS)[number];

/** Every phrase Oupa can say at the braai (one voice clip per language each). */
export const STORY_LINE_IDS: readonly StoryLineId[] = [
  ...STORY_OPENERS,
  ...STORY_MOMENTS,
  ...STORY_CLOSERS,
];

/** The voiced phrase's key (its text has no numbers) and the caption's key. */
export const sayKey = (id: StoryLineId): string => `braai.say.${id}`;
export const captionKey = (id: StoryLineId): string => `braai.${id}`;

/** What a caption fills in: counts, a score, a rank id, points short of the best, crop %. */
export interface StoryVars {
  readonly n?: number;
  readonly score?: number;
  readonly rank?: string;
  readonly gap?: number;
  readonly crop?: number;
}

export interface StoryLine {
  readonly id: StoryLineId;
  readonly say: string;
  readonly caption: string;
  readonly vars: StoryVars;
}

export type StoryResult = Pick<
  HuntResult,
  'score' | 'bagged' | 'shots' | 'hitShots' | 'wholeFlocks' | 'rank' | 'cans' | 'feesdag'
>;

export interface StoryInput {
  readonly result: StoryResult;
  readonly facts: StoryFacts;
  /** A new best that beat an earlier one (a first hunt on a map isn't a "new best" story). */
  readonly newBest: boolean;
  /** The rank reached for the first time (rank id), or null. */
  readonly rankUp: string | null;
  /** The save's best rank before this hunt (null: no scored hunt yet). A first scored hunt
   *  always "reaches" a rank: that is no rank up for the story or the dance. */
  readonly rankBefore: string | null;
  /** The best before this hunt (null: none), for the near miss. */
  readonly bestBefore: number | null;
  /** The Harvest's crop saved (whole %), or null for every other mode. */
  readonly harvestCrop: number | null;
  /** The top rank's id (scoring.json's last rank). */
  readonly topRank: string;
  /** The lowest rank's id (scoring.json's first). */
  readonly bottomRank: string;
}

export type BraaiTuning = Feel['braai'];

/** The top rank, or every shot bagged with at least `perfect.minBagged` birds. */
export function isPerfectHunt(
  r: Pick<HuntResult, 'rank' | 'shots' | 'hitShots' | 'bagged'>,
  topRank: string,
  tuning: Pick<BraaiTuning, 'perfect'>,
): boolean {
  if (r.rank === topRank) return true;
  return r.shots > 0 && r.hitShots === r.shots && r.bagged >= tuning.perfect.minBagged;
}

/** A perfect hunt or a rank up earns Oupa's vastrap. */
export function earnsDance(i: StoryInput, tuning: Pick<BraaiTuning, 'perfect'>): boolean {
  return storyRankUp(i) !== null || isPerfectHunt(i.result, i.topRank, tuning);
}

/** The rank the story celebrates: a real climb (an earlier rank, never the bottom one), else null. */
export function storyRankUp(i: StoryInput): string | null {
  const up = i.rankUp;
  if (up === null || i.rankBefore === null || up === i.rankBefore || up === i.bottomRank)
    return null;
  return up;
}

const line = (id: StoryLineId, vars: StoryVars = {}): StoryLine => ({
  id,
  say: sayKey(id),
  caption: captionKey(id),
  vars,
});

function opener(i: StoryInput, t: BraaiTuning): StoryLine {
  if (i.harvestCrop !== null) return line('open_harvest', { crop: i.harvestCrop });
  const n = i.result.bagged;
  if (n <= 0) return line('open_none');
  return line(n >= t.story.manyBirds ? 'open_many' : 'open_some', { n });
}

/** Every middle line this hunt earned, highest priority first. */
export function storyMoments(i: StoryInput, t: BraaiTuning): StoryLine[] {
  const r = i.result;
  const f = i.facts;
  const out: StoryLine[] = [];
  if (i.newBest) out.push(line('new_best', { score: r.score }));
  const up = storyRankUp(i);
  if (up !== null) out.push(line('rank_up', { rank: up }));
  if (f.verBagged > 0) out.push(line('ver', { n: f.verBagged }));
  else if (f.farBagged > 0) out.push(line('far', { n: f.farBagged }));
  if (r.wholeFlocks > 0) out.push(line('whole_flock', { n: r.wholeFlocks }));
  const chain = r.cans?.bestChain ?? 0;
  if (chain >= 3) out.push(line('blikkies', { n: chain }));
  if (f.swarmBagged >= 3) out.push(line('swarm', { n: f.swarmBagged }));
  if (f.meerkatScolds > 0) out.push(line('meerkat'));
  if (f.nestScolds > 0) out.push(line('nest'));
  const best = i.bestBefore;
  if (
    !i.newBest &&
    i.harvestCrop === null &&
    best !== null &&
    best > 0 &&
    r.score < best &&
    r.score >= best * t.story.nearRecordFrac
  )
    out.push(line('near_record', { gap: best - r.score }));
  return out;
}

function closer(i: StoryInput, t: BraaiTuning): StoryLine {
  if (isPerfectHunt(i.result, i.topRank, t)) return line('close_perfect');
  if (storyRankUp(i) !== null) return line('close_rank_up');
  if (i.result.feesdag !== undefined) return line('close_feesdag');
  const r = i.result;
  if (i.harvestCrop === null && (r.bagged <= 0 || r.rank === i.bottomRank))
    return line('close_try');
  return line('close_good');
}

/** The story: an opener, at most `story.maxLines − 2` best moments, a closer. */
export function tellStory(i: StoryInput, t: BraaiTuning): StoryLine[] {
  const room = Math.max(0, t.story.maxLines - 2);
  return [opener(i, t), ...storyMoments(i, t).slice(0, room), closer(i, t)];
}
