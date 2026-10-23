// The Season Run as the game drives it: the pure run engine (src/sim/run) plus the save. Every
// step that changes the run writes it through the SaveStore (Tech §11: at run start and after
// every Padstal step), so a closed tab resumes where the player was. A finished run leaves the
// save and stays here for the summary screen.
import type { ContentBundle, Notaboek } from '../../content/schemas';
import { finishRunStats, playerPool, validRun } from '../../meta/run';
import type { SaveStore } from '../../meta/save';
import type { PlatformAdapter } from '../../platform/PlatformAdapter';
import type { RunAds, SaveData } from '../../meta/saveSchema';
import {
  bonusDoppies,
  buy,
  createRun,
  huntInfo,
  huntSetup,
  leavePadstal,
  openPadstal,
  reorderCharms,
  reroll,
  runOver,
  sell,
  settleHunt,
  type HuntInfo,
  type RunState,
  type ShopResult,
} from '../../sim/run/run';
import type { HuntResult, ModeConfig } from '../../sim/types';

export class RunFlow {
  private finished: RunState | null = null;
  /** M9: the run as it was before the hunt that ended it, for "Oupa se tweede kans". */
  private retryFrom: { run: RunState; runStats: SaveData['runStats'] } | null = null;

  constructor(
    private readonly content: ContentBundle,
    private readonly notaboek: Notaboek,
    private readonly save: SaveStore,
    private readonly platform: PlatformAdapter,
  ) {}

  /** The run in progress (validated against the content), or null. */
  get current(): RunState | null {
    return validRun(this.save.data.run, this.content);
  }

  /** The run on screen: in progress, or the one that just ended (summary). */
  get shown(): RunState | null {
    return this.current ?? this.finished;
  }

  start(seed: number, weapon: string): RunState {
    const run = createRun(this.content, {
      seed,
      weapon,
      pool: playerPool(this.save.data, this.content, this.notaboek),
    });
    this.finished = null;
    this.retryFrom = null;
    this.save.update((d) => ({
      ...d,
      run,
      runStats: { ...d.runStats, started: d.runStats.started + 1 },
      runAds: { seed: run.seed, retries: 0, doubled: [] },
    }));
    this.platform.analytics('run_start', { weapon, pool: run.pool.length });
    return run;
  }

  /**
   * v1.2x admin page (D-034): the run in progress jumps to `huntIndex` (its hunt next), with a
   * crate gun rented for it. Admin pages keep their own save, so no player run is changed.
   */
  jumpTo(huntIndex: number, rental: string | null): RunState {
    const run: RunState = { ...this.need(), huntIndex, phase: 'hunt', padstal: null, rental };
    this.write(run);
    return run;
  }

  info(run: RunState = this.need()): HuntInfo {
    return huntInfo(this.content, run.huntIndex);
  }

  /** Seed and mode for the current hunt; `huntSeconds` only from dev/e2e builds. */
  setup(huntSeconds: number | undefined): { seed: number; mode: ModeConfig; info: HuntInfo } {
    const s = huntSetup(this.content, this.need());
    return {
      ...s,
      mode: huntSeconds === undefined ? s.mode : { ...s.mode, huntSeconds },
    };
  }

  afterHunt(result: HuntResult): RunState {
    const before = this.need();
    const statsBefore = this.save.data.runStats;
    const run = settleHunt(this.content, before, result);
    this.retryFrom = run.phase === 'defeat' ? { run: before, runStats: statsBefore } : null;
    if (runOver(run)) {
      this.finished = run;
      this.save.update((d) => ({ ...d, run: null, runStats: finishRunStats(d.runStats, run) }));
      const last = run.history.at(-1);
      this.platform.analytics('run_end', {
        result: run.phase,
        hunt: (last?.huntIndex ?? 0) + 1,
        score: last?.score ?? 0,
        charms: run.charms.join(','),
      });
    } else this.write(run);
    return run;
  }

  openPadstal(): RunState {
    return this.write(openPadstal(this.content, this.need()));
  }

  buy(offer: number): ShopResult {
    const before = this.need().padstal?.offers[offer];
    const r = this.apply(buy(this.content, this.need(), offer));
    if (r.ok && before !== undefined)
      this.platform.analytics('padstal_buy', {
        kind: before.kind,
        id: before.id,
        price: before.price,
      });
    return r;
  }

  sell(slot: number): ShopResult {
    return this.apply(sell(this.content, this.need(), slot));
  }

  reroll(): ShopResult {
    return this.apply(reroll(this.content, this.need()));
  }

  reorder(order: readonly number[]): ShopResult {
    return this.apply(reorderCharms(this.need(), order));
  }

  leavePadstal(): RunState {
    return this.write(leavePadstal(this.need()));
  }

  /** Mid-hunt reorder from the pause screen: the next hunts keep the new order too. */
  keepOrder(charms: readonly string[]): void {
    const run = this.current;
    if (run === null || run.charms.length !== charms.length) return;
    if (!charms.every((c) => run.charms.includes(c))) return;
    this.write({ ...run, charms: [...charms] });
  }

  /** M9: rewarded ads used by this run (fresh for another seed). */
  private ads(seed: number): RunAds {
    const a = this.save.data.runAds;
    return a.seed === seed ? a : { seed, retries: 0, doubled: [] };
  }

  /**
   * "Oupa se tweede kans" (GDD §19): the hunt that just lost the run can be played again,
   * `run.json rewardedRetryPerRun` times per run, in this session (a closed tab keeps the loss).
   */
  canRetry(): boolean {
    const from = this.retryFrom;
    if (from === null || this.finished === null) return false;
    return this.ads(from.run.seed).retries < this.content.run.rewardedRetryPerRun;
  }

  /** After a granted rewarded ad: back to the lost hunt's card (same seed, same run). */
  retry(): RunState | null {
    const from = this.retryFrom;
    if (from === null || !this.canRetry()) return null;
    const ads = this.ads(from.run.seed);
    this.retryFrom = null;
    this.finished = null;
    this.save.update((d) => ({
      ...d,
      run: from.run,
      runStats: from.runStats,
      runAds: { ...ads, retries: ads.retries + 1 },
    }));
    this.platform.analytics('rewarded', { kind: 'retry', hunt: from.run.huntIndex + 1 });
    return from.run;
  }

  /** "Double Doppies" can be offered: the run tally of a hunt that paid, not yet doubled. */
  canDouble(): boolean {
    const run = this.current;
    if (run?.phase !== 'tally') return false;
    if ((run.history.at(-1)?.doppies?.total ?? 0) <= 0) return false;
    return !this.ads(run.seed).doubled.includes(run.huntIndex);
  }

  /** After a granted rewarded ad: the hunt's Doppies once more (once per hunt). */
  doubleDoppies(): RunState | null {
    if (!this.canDouble()) return null;
    const run = this.need();
    const ads = this.ads(run.seed);
    const next = bonusDoppies(run);
    this.save.update((d) => ({
      ...d,
      run: next,
      runAds: { ...ads, doubled: [...ads.doubled, run.huntIndex] },
    }));
    this.platform.analytics('rewarded', { kind: 'doppies', hunt: run.huntIndex + 1 });
    return next;
  }

  /** Give up the run (title → New run). */
  abandon(): void {
    this.finished = null;
    this.retryFrom = null;
    this.save.update((d) => ({ ...d, run: null }));
  }

  private apply(r: ShopResult): ShopResult {
    if (r.ok) this.write(r.run);
    return r;
  }

  private write(run: RunState): RunState {
    this.save.update((d) => ({ ...d, run: { ...run } }));
    return run;
  }

  private need(): RunState {
    const run = this.current;
    if (run === null) throw new Error('no Season Run in progress');
    return run;
  }
}
