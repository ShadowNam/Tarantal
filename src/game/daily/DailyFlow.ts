// Daily Hunt, challenge links and the share card in the game (GDD §12, §15; Tech §12, §14).
// No Phaser: the hunt scene asks for a plan (seed + mode + labels), tells the flow when the hunt
// starts (claims the day's official attempt) and ends (records it, builds the tally extras and
// the share message), and the tally's [Share] calls share(). The clock is read through `today()`
// (Date.now() in main.ts, or the e2e ?today= day) — never in the sim.
import type { ContentBundle, DailyMeta } from '../../content/schemas';
import { fill, getLanguage, t, tOr, translator } from '../../i18n/i18n';
import {
  challengeFor,
  challengeHunt,
  challengeUrl,
  compareToChallenge,
  type Challenge,
} from '../../meta/challenge';
import {
  dailyMode,
  dailySetup,
  finishAttempt,
  freezeReady,
  liveStreak,
  officialEntry,
  playedToday,
  startAttempt,
  type DailySetup,
} from '../../meta/daily';
import { layoutForDay } from '../../meta/maps';
import type { SaveStore } from '../../meta/save';
import { buildShareText, groupThousands, type ShareMessage } from '../../meta/share';
import type { PlatformAdapter } from '../../platform/PlatformAdapter';
import type { ShareOutcome } from '../../platform/share';
import type { HuntResult, ModeConfig } from '../../sim/types';

export type PlainKind = 'classic' | 'daily';

/** One hunt's setup and what the screens say about it. */
export interface HuntPlan {
  readonly seed: number;
  readonly mode: ModeConfig;
  /** Set for a daily hunt (also a challenge to today's daily). */
  readonly daily: { readonly setup: DailySetup; readonly official: boolean } | null;
  readonly challenge: Challenge | null;
  /** Line under the HUD score (null = none). */
  readonly hudTag: string | null;
}

/** What the tally adds for this hunt. */
export interface TallyExtras {
  readonly tag: string | null;
  readonly compare: string | null;
  /** Shown before the save news, most exciting first. */
  readonly news: readonly string[];
  /** Null = no [Share] (FTUE, practice). */
  readonly share: ShareMessage | null;
  /** Analytics fields for share_click. */
  readonly shareInfo: { readonly mode: string; readonly official: boolean } | null;
}

export interface DailyFlowDeps {
  readonly content: ContentBundle;
  readonly contentHash: string;
  readonly meta: DailyMeta;
  readonly save: SaveStore;
  readonly platform: Pick<PlatformAdapter, 'analytics' | 'share' | 'shareUrl'>;
  /** UTC day number now. */
  readonly today: () => number;
  /** Biomes this build can draw (the daily rotation and challenge links use only these). */
  readonly playableBiomes: readonly string[];
  /** Page URL without query, the base of share links. */
  readonly shareBase: () => string;
  /**
   * M10 capture mode, and (v1.0.1, D-028) `?e2e` on a public build: hunts are unranked (slow-mo
   * would inflate a score; a test link has a fresh save every time). No Daily is official (no
   * attempt, streak or best is recorded) and no tally offers a share or a link.
   */
  readonly unranked?: boolean;
}

interface Started {
  readonly official: boolean;
  readonly frozen: readonly string[];
  readonly cosmetics: readonly string[];
}

export class DailyFlow {
  private started: Started | null = null;

  constructor(private readonly deps: DailyFlowDeps) {}

  /** Today's daily setup (seed, biome, number). */
  todaySetup(): DailySetup {
    const d = this.deps;
    return dailySetup(d.today(), {
      meta: d.meta,
      contentHash: d.contentHash,
      playable: d.playableBiomes,
      fallbackBiome: d.content.modes.modes.daily.biome,
    });
  }

  /** The streak as it stands today (0 once it can't be saved) and this week's freeze. */
  streakToday(): { readonly streak: number; readonly freezeReady: boolean } {
    const s = this.deps.save.data.daily;
    const day = this.deps.today();
    return { streak: liveStreak(s, day), freezeReady: freezeReady(s, day) };
  }

  /** Every hunt on this page is unranked (capture mode, `?e2e` on a public build). */
  get unranked(): boolean {
    return this.deps.unranked === true;
  }

  /** Today's official attempt has started already (the title labels Daily as practice). */
  playedToday(): boolean {
    return playedToday(this.deps.save.data.daily, this.deps.today());
  }

  /**
   * The hunt to play. `weapon`: the Skiet-Skuur gun if it differs from the mode default (Classic
   * and Daily); a challenge brings its own. `extra`: e2e/dev overrides (huntSeconds, omen).
   */
  plan(
    kind: PlainKind,
    challenge: Challenge | null,
    weapon: string | undefined,
    extra: Partial<Pick<ModeConfig, 'huntSeconds' | 'omen' | 'bonus'>>,
    seedForClassic: () => number,
  ): HuntPlan {
    if (challenge !== null) {
      const hunt = challengeHunt(challenge);
      const setup = challenge.mode === 'daily' ? this.todaySetup() : null;
      // A challenge to today's daily is the daily itself (official if not played yet).
      const today =
        setup !== null &&
        setup.seed === challenge.seed &&
        setup.biome === challenge.biome &&
        setup.layout === challenge.l &&
        challenge.b === undefined
          ? setup
          : null;
      const official = today !== null && !this.playedToday() && this.deps.unranked !== true;
      return {
        seed: hunt.seed,
        mode: { ...hunt.mode, ...withoutBonus(extra) },
        daily: today === null ? null : { setup: today, official },
        challenge,
        hudTag: official
          ? fill(t('hud.tag_daily'), { n: today.number })
          : fill(t('hud.tag_challenge'), { score: groupThousands(challenge.score) }),
      };
    }
    if (kind === 'daily') {
      const setup = this.todaySetup();
      const official = !this.playedToday() && this.deps.unranked !== true;
      return {
        seed: setup.seed,
        mode: { ...dailyMode(setup, weapon), ...withoutBonus(extra) },
        daily: { setup, official },
        challenge: null,
        hudTag: fill(t(official ? 'hud.tag_daily' : 'hud.tag_practice'), { n: setup.number }),
      };
    }
    // v1.2 (D-033): Classic plays today's UTC weekday layout.
    return {
      seed: seedForClassic(),
      mode: {
        id: 'classic',
        layout: layoutForDay(this.deps.today()),
        ...(weapon === undefined ? {} : { weapon }),
        ...extra,
      },
      daily: null,
      challenge: null,
      hudTag: extra.bonus === undefined ? null : tOr(`hud.tag_${extra.bonus}`, extra.bonus),
    };
  }

  /** The hunt started: claim today's official attempt (Tech §12 first-attempt rule). */
  start(plan: HuntPlan): void {
    this.started = null;
    const daily = plan.daily;
    if (daily === null) return;
    let started: Started = { official: false, frozen: [], cosmetics: [] };
    if (daily.official) {
      const r = startAttempt(this.deps.save.data.daily, daily.setup.day, this.deps.meta);
      started = { official: r.official, frozen: r.frozen, cosmetics: r.cosmetics };
      this.deps.save.update((d) => ({ ...d, daily: r.save }));
    }
    this.started = started;
    this.deps.platform.analytics('daily_play', {
      day: daily.setup.key,
      number: daily.setup.number,
      official: started.official,
      biome: daily.setup.biome,
      challenge: plan.challenge !== null,
    });
  }

  /**
   * Practice daily hunts don't move the Classic rank (first-attempt rule); neither does a daily
   * challenge to another day (an editable link, replayable without limit).
   */
  ranked(plan: HuntPlan): boolean {
    if (plan.daily === null) return plan.mode.id !== 'daily';
    return this.started?.official === true;
  }

  /** The hunt ended: record the official result and build the tally extras + share message. */
  finish(plan: HuntPlan, result: HuntResult, grid: string): TallyExtras {
    const daily = plan.daily;
    const official = daily !== null && this.started?.official === true;
    const news: string[] = [];
    let tag: string | null = null;

    if (official) {
      const r = finishAttempt(this.deps.save.data.daily, daily.setup.day, {
        score: result.score,
        rank: result.rank,
        wholeFlocks: result.wholeFlocks,
        grid,
      });
      this.deps.save.update((d) => ({ ...d, daily: r.save }));
      const newBest = r.newBest;
      tag = fill(t('tally.tag_daily'), { n: daily.setup.number });
      const s = this.deps.save.data.daily;
      const frozen = (this.started?.frozen.length ?? 0) > 0;
      news.push(
        fill(t('tally.streak'), { n: s.streak }) + (frozen ? ` · ${t('tally.freeze_used')}` : ''),
      );
      for (const c of this.started?.cosmetics ?? [])
        news.push(fill(t('tally.cosmetic'), { item: tOr(`cosmetic.${c}`, c) }));
      if (newBest) news.push(t('tally.daily_best'));
    } else if (daily !== null) {
      tag = fill(t('tally.tag_practice'), { n: daily.setup.number });
      const entry = officialEntry(this.deps.save.data.daily, daily.setup.day);
      news.push(
        entry?.score == null
          ? t('tally.practice')
          : fill(t('tally.practice_score'), { score: groupThousands(entry.score) }),
      );
    } else if (plan.challenge !== null) {
      tag = t('tally.tag_challenge');
    }

    let compare: string | null = null;
    const c = plan.challenge;
    if (c !== null) {
      const key = {
        win: 'tally.vs_win',
        tie: 'tally.vs_tie',
        lose: 'tally.vs_lose',
      } as const;
      compare = fill(t(key[compareToChallenge(result.score, c)]), {
        you: groupThousands(result.score),
        them: c.by ?? t('tally.them'),
        score: groupThousands(c.score),
      });
    }

    // Share: Classic hunts and the official daily. Practice (and an old day's daily) has none.
    const shareable = this.deps.unranked !== true && (result.mode === 'classic' || official);
    const dailyNumber = official ? daily.setup.number : null;
    // Building the share line must never stop the tally from opening (the result is saved).
    let share: ShareMessage | null = null;
    if (shareable) {
      try {
        share = buildShareText(
          {
            dailyNumber,
            biome: result.biome,
            layout: result.layout,
            bonus: result.bonus,
            score: result.score,
            rank: result.rank,
            grid,
            wholeFlocks: result.wholeFlocks,
            url: this.deps.platform.shareUrl(
              challengeUrl(
                this.deps.shareBase(),
                challengeFor(
                  {
                    seed: result.seed,
                    mode: result.mode === 'daily' ? 'daily' : 'classic',
                    biome: result.biome,
                    weapon: result.weapon,
                    score: result.score,
                    dailyNumber,
                    layout: result.layout,
                    bonus: result.bonus,
                  },
                  this.deps.contentHash,
                ),
              ),
            ),
          },
          translator(getLanguage()),
        );
      } catch {
        share = null;
      }
    }
    return {
      tag,
      compare,
      news,
      share,
      shareInfo: share === null ? null : { mode: result.mode, official },
    };
  }

  /** [Share] on the tally. Must run inside the tap's event handler (browser user activation). */
  async share(extras: TallyExtras): Promise<ShareOutcome> {
    if (extras.share === null || extras.shareInfo === null) return 'failed';
    const outcome = await this.deps.platform.share(extras.share);
    this.deps.platform.analytics('share_click', { ...extras.shareInfo, method: outcome });
    return outcome;
  }
}

/** A bonus map is played only on today's Classic map (never a Daily or a challenge's own). */
function withoutBonus(
  extra: Partial<Pick<ModeConfig, 'huntSeconds' | 'omen' | 'bonus'>>,
): Partial<Pick<ModeConfig, 'huntSeconds' | 'omen'>> {
  return {
    ...(extra.huntSeconds === undefined ? {} : { huntSeconds: extra.huntSeconds }),
    ...(extra.omen === undefined ? {} : { omen: extra.omen }),
  };
}
