// The Season Run as the game drives it: the pure run engine (src/sim/run) plus the save. Every
// step that changes the run writes it through the SaveStore (Tech §11: at run start and after
// every Padstal step), so a closed tab resumes where the player was. A finished run leaves the
// save and stays here for the summary screen.
import type { ContentBundle, Notaboek } from '../../content/schemas';
import { finishRunStats, playerPool, validRun } from '../../meta/run';
import type { SaveStore } from '../../meta/save';
import type { PlatformAdapter } from '../../platform/PlatformAdapter';
import {
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
    this.save.update((d) => ({
      ...d,
      run,
      runStats: { ...d.runStats, started: d.runStats.started + 1 },
    }));
    this.platform.analytics('run_start', { weapon, pool: run.pool.length });
    for (const w of this.fallbackWarnings()) console.warn(w);
    return run;
  }

  /** Seasons that run on the stand-in biome until M8 (logged when a run starts). */
  fallbackWarnings(): string[] {
    const per = this.content.run.huntPattern.length;
    return this.content.run.seasons.flatMap((s, i) => {
      const info = huntInfo(this.content, i * per);
      return info.biomeFallback
        ? [`Season Run: ${s.id} runs on ${info.biome} until biomes/${s.biome}.json exists (M8)`]
        : [];
    });
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
    const run = settleHunt(this.content, this.need(), result);
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

  /** Give up the run (title → New run). */
  abandon(): void {
    this.finished = null;
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
