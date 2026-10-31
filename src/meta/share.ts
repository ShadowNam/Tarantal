// Share card (GDD §15): a Wordle-style text line built on the device, no server —
//   🐦 Tarantal Madness · Daily #142 · 2 840 · Bosveldjagter · 🟩🟩🟨🟩⬛ · 2× hele swerm
// plus a challenge link that opens the same hunt. The emoji grid cuts the hunt into
// `grid.segments` equal parts, each coloured by its accuracy (shots that bagged a target / shots;
// the same rule as HuntResult.hitShots). Built from the sim's event stream (CLAUDE.md rule 4). Pure.
import type { DailyMeta } from '../content/schemas';
import { fill, type Translator } from '../i18n/i18n';
import type { SimEvent } from '../sim/events';
import { bonusSlug } from './bonusMaps';

export const GRID_GOOD = '🟩';
export const GRID_OK = '🟨';
export const GRID_POOR = '⬛';

type GridConfig = DailyMeta['grid'];

/** Shots and hitting shots per segment of the hunt, from the event stream. */
export interface ShareLogger {
  add(events: readonly SimEvent[]): void;
  /** The emoji grid so far (one square per segment). */
  grid(): string;
}

export function createShareLogger(cfg: GridConfig): ShareLogger {
  const shots = new Array<number>(cfg.segments).fill(0);
  const hits = new Array<number>(cfg.segments).fill(0);
  const segmentOfShot = new Map<number, number>();
  const counted = new Set<number>();
  // The planned length: bonus time adds to the last segment instead of moving the cuts.
  let duration = 0;
  const segment = (tick: number): number =>
    duration <= 0 ? 0 : Math.min(cfg.segments - 1, Math.floor((tick * cfg.segments) / duration));
  return {
    add(events) {
      for (const e of events) {
        if (e.type === 'huntStarted') duration = e.durationTicks;
        else if (e.type === 'shotFired') {
          const s = segment(e.tick);
          segmentOfShot.set(e.shotId, s);
          shots[s] = (shots[s] ?? 0) + 1;
        } else if (e.type === 'targetBagged' && !counted.has(e.shotId)) {
          const s = segmentOfShot.get(e.shotId);
          if (s === undefined) continue;
          counted.add(e.shotId);
          hits[s] = (hits[s] ?? 0) + 1;
        }
      }
    },
    grid() {
      return shots
        .map((n, i) => {
          const acc = n === 0 ? 0 : (hits[i] ?? 0) / n;
          return acc >= cfg.green && n > 0
            ? GRID_GOOD
            : acc >= cfg.yellow && n > 0
              ? GRID_OK
              : GRID_POOR;
        })
        .join('');
    },
  };
}

/** D-048: a special day's share card: its title ("Spookjag 2026") and frame id. */
export interface ShareSpecial {
  readonly title: string;
  readonly frame: string;
}

/** The emoji frame of each special's card (left, right): Halloween's moon, bats and a pumpkin;
 *  D-064 Christmas's tinsel, a present, Oupa in his Santa hat and the sun; D-065 New Year's. */
export const SHARE_FRAMES: Readonly<Record<string, readonly [string, string]>> = {
  halloween: ['🎃🦇', '🦇🌕'],
  christmas: ['✨🎁', '🎅☀️'],
  // D-065: New Year's streamers, a party hat and a small firework.
  newyear: ['🎊🥳', '🎆🎊'],
};

export interface ShareInput {
  /** Daily number (#n) for a daily hunt; null for Classic. */
  readonly dailyNumber: number | null;
  readonly biome: string;
  /** v1.2: the map (weekday layout, bonus map); null/absent = the plain biome. */
  readonly layout?: string | null;
  readonly bonus?: string | null;
  /** D-048: the special day's card (null/absent = an ordinary card). */
  readonly feesdag?: ShareSpecial | null;
  readonly score: number;
  /** scoring.json rank id. */
  readonly rank: string;
  readonly grid: string;
  readonly wholeFlocks: number;
  /** Challenge link to the same hunt (empty = none). */
  readonly url: string;
}

/** 2840 → "2 840" (no-break space, so a chat app never splits the number). */
export function groupThousands(n: number): string {
  const sign = n < 0 ? '−' : '';
  return sign + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/** What a share sends: navigator.share gets both; a clipboard copy gets joinShare(). */
export interface ShareMessage {
  readonly text: string;
  readonly url: string;
}

/** One string for the clipboard: the text, then the link. */
export function joinShare(m: ShareMessage): string {
  return m.url === '' ? m.text : `${m.text} ${m.url}`;
}

/** The share message in one language. */
export function buildShareText(input: ShareInput, tr: Translator): ShareMessage {
  const biomeKey = input.biome.replace(/-/g, '_');
  const parts = [
    `🐦 ${tr.text('app.title')}`,
    input.dailyNumber === null
      ? fill(tr.text('share.classic'), { biome: tr.or(`share.biome.${biomeKey}`, input.biome) })
      : fill(tr.text('share.daily'), { n: input.dailyNumber }),
    mapLabel(input, tr),
    groupThousands(input.score),
    tr.or(`share.rank.${input.rank}`, tr.or(`rank.${input.rank}`, input.rank)),
    input.grid,
  ];
  if (input.wholeFlocks > 0)
    parts.push(fill(tr.text('share.whole_flocks'), { n: input.wholeFlocks }));
  const special = input.feesdag ?? null;
  if (special !== null) parts.splice(1, 0, special.title);
  const frame = special === null ? undefined : SHARE_FRAMES[special.frame];
  const plain = parts.filter((p) => p !== '').join(' · ');
  const line = frame === undefined ? plain : `${frame[0]} ${plain} ${frame[1]}`;
  return {
    text: input.url === '' ? line : `${line}\n${tr.text('share.beat_me')}`,
    url: input.url,
  };
}

/** v1.8c (D-063): the Harvest's share card — its name, the score, the crop saved, the bag grid
 *  and a link to the game (no challenge link: the Harvest has none). */
export function buildHarvestShare(
  input: {
    readonly score: number;
    readonly crop: number;
    readonly grid: string;
    readonly url: string;
  },
  tr: Translator,
): ShareMessage {
  const line = [
    `🐦 ${tr.text('app.title')}`,
    `🌽 ${tr.text('share.harvest')}`,
    groupThousands(input.score),
    fill(tr.text('share.harvest_crop'), { pct: String(Math.max(0, Math.floor(input.crop))) }),
    input.grid,
  ]
    .filter((p) => p !== '')
    .join(' · ');
  return { text: line, url: input.url };
}

/** "Monday" or "Monday · Verder" (v1.2: the share card names the map); '' = the plain biome. */
function mapLabel(input: ShareInput, tr: Translator): string {
  const layout = input.layout ?? null;
  if (layout === null) return '';
  const day = tr.or(`map.day.${layout}`, layout);
  const bonus = input.bonus ?? null;
  return bonus === null
    ? fill(tr.text('share.map'), { day })
    : fill(tr.text('share.map_bonus'), { day, bonus: tr.or(`map.${bonusSlug(bonus)}`, bonus) });
}
