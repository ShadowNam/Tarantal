// When the game asks the portal for an ad (M9, GDD §19, D-007): only between hunts, never during
// one. A commercial break runs when the player leaves a screen for the next hunt (tally [Again],
// the run's hunt card, the title's START …), except before the first hunt of the page (time to
// the first shot, GDD §16). The portal decides whether an ad really shows (Poki and CrazyGames cap
// the rate themselves). Rewarded ads only where the GDD has one: the Season Run's retry and
// double Doppies; the Daily Hunt never offers one. While an ad covers the game, the AudioDirector
// is muted (PlatformAdapter.onAdChange) and the menus ignore input (menu.ts input gate).
import type { PlatformAdapter } from '../../platform/PlatformAdapter';

export type RewardKind = 'retry' | 'doppies';

export interface AdCounts {
  breaks: number;
  rewarded: number;
  granted: number;
}

export class AdBreaks {
  private hunts = 0;
  /** A rewarded ad just ran: the next hunt goes without a commercial break. */
  private skipNext = false;
  readonly counts: AdCounts = { breaks: 0, rewarded: 0, granted: 0 };

  constructor(
    private readonly platform: Pick<
      PlatformAdapter,
      'commercialBreak' | 'rewardedBreak' | 'rewardedAvailable' | 'analytics'
    >,
  ) {}

  /** A hunt started (the first of the page goes without a break before it). */
  huntStarted(): void {
    this.hunts++;
  }

  /** Before the next hunt: a commercial break, unless no hunt was played yet this page. */
  async beforeHunt(): Promise<void> {
    if (this.hunts === 0) return;
    if (this.skipNext) {
      this.skipNext = false;
      return;
    }
    this.counts.breaks++;
    await this.platform.commercialBreak();
  }

  /** A rewarded ad can be offered right now. */
  rewardedAvailable(): boolean {
    return this.platform.rewardedAvailable();
  }

  /** Shows a rewarded ad; true = the reward is granted. */
  async rewarded(kind: RewardKind): Promise<boolean> {
    this.counts.rewarded++;
    const granted = await this.platform.rewardedBreak();
    this.skipNext = true;
    if (granted) this.counts.granted++;
    this.platform.analytics('rewarded_ad', { kind, granted });
    return granted;
  }
}
