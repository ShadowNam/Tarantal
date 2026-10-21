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
  /** A rewarded ad was really shown: the next hunt goes without a commercial break. */
  private skipNext = false;
  /** The break or rewarded ad in flight (single-flight: a second request joins it). */
  private pending: Promise<unknown> | null = null;
  /** An ad covered the game since the current request began. */
  private sawAd = false;
  readonly counts: AdCounts = { breaks: 0, rewarded: 0, granted: 0 };

  constructor(
    private readonly platform: Pick<
      PlatformAdapter,
      'commercialBreak' | 'rewardedBreak' | 'rewardedAvailable' | 'analytics' | 'onAdChange'
    >,
  ) {
    platform.onAdChange((playing) => {
      if (playing) this.sawAd = true;
    });
  }

  /** A break or rewarded ad is being requested or shown (menus ignore input meanwhile). */
  get busy(): boolean {
    return this.pending !== null;
  }

  private flight<T>(run: () => Promise<T>): Promise<T> {
    const p = run().finally(() => {
      if (this.pending === p) this.pending = null;
    });
    this.pending = p;
    return p;
  }

  /** A hunt started (the first of the page goes without a break before it). */
  huntStarted(): void {
    this.hunts++;
  }

  /** Before the next hunt: a commercial break, unless no hunt was played yet this page. */
  beforeHunt(): Promise<void> {
    // Single-flight: a second tap while the break is requested waits for the same one.
    if (this.pending !== null) return this.pending.then(() => undefined);
    if (this.hunts === 0) return Promise.resolve();
    if (this.skipNext) {
      this.skipNext = false;
      return Promise.resolve();
    }
    this.counts.breaks++;
    return this.flight(() => this.platform.commercialBreak());
  }

  /** A rewarded ad can be offered right now. */
  rewardedAvailable(): boolean {
    return this.platform.rewardedAvailable();
  }

  /** Shows a rewarded ad; true = the reward is granted. */
  rewarded(kind: RewardKind): Promise<boolean> {
    if (this.pending !== null) return Promise.resolve(false);
    this.counts.rewarded++;
    this.sawAd = false;
    return this.flight(async () => {
      const granted = await this.platform.rewardedBreak();
      // Only an ad that really played resets the portal's break timer (no SDK, no fill: no skip).
      if (this.sawAd) this.skipNext = true;
      if (granted) this.counts.granted++;
      this.platform.analytics('rewarded_ad', { kind, granted });
      return granted;
    });
  }
}
