// v1.10 (D-067, GDD §11.3e): one hunt's Reënbui — its phases on sim ticks, the alate columns, the
// feeding flocks and the extra flocks that run in. Owns no flock: the Sim passes them in and does
// the spawning; everything random comes from the event's own stream.
import type { Reenbui } from '../../content/schemas';
import { planeCentreX } from '../camera';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import { centroid, type Flock } from '../flocks/Flock';
import type { RandomStream } from '../rng';
import type { ReenbuiView } from '../types';
import {
  arrivalFor,
  feedColumn,
  placeColumns,
  reenbuiPhaseAt,
  type AlateColumn,
  type ColumnPlaneGeo,
  type ReenbuiPhase,
  type ReenbuiPlan,
} from './reenbui';

export interface ReenbuiDeps {
  readonly tick: () => number;
  readonly cameraX: () => number;
  readonly flocks: () => readonly Flock[];
  /** Where a flock will be on the ground (steering.ts landingX, read only). */
  readonly landingX: (f: Flock) => number;
  /** Whether a flushed flock's birds are all coming down (steering.ts comingDown). */
  readonly comingDown: (f: Flock) => boolean;
  /** Planes where columns can rise on this map. */
  readonly planes: readonly ColumnPlaneGeo[];
  /** Spawns a flock of `size` at plane x, running in direction `dir`; false when there is no
   *  room (maxFlocks, maxBirdsOnScreen). */
  readonly spawnFlock: (
    plane: AlateColumn['plane'],
    x: number,
    size: number,
    dir: 1 | -1,
  ) => boolean;
  readonly emit: (e: SimEvent) => void;
}

export interface ReenbuiSystem {
  readonly plan: ReenbuiPlan;
  /** Call once per tick, before the flocks move. */
  step(): void;
  /** The phase now (null before and after). */
  phase(): ReenbuiPhase | null;
  /** The bag multiplier now (scoreMul in the swarm, else 1). */
  scoreMul(): number;
  /** A flock's shot alert radius factor now. */
  alertMul(f: Flock): number;
  /** Counts a bag (for the swarm's tally and the Notaboek). */
  bagged(): void;
  view(): ReenbuiView;
}

export function createReenbuiSystem(
  cfg: Reenbui,
  plan: ReenbuiPlan,
  rng: RandomStream,
  deps: ReenbuiDeps,
): ReenbuiSystem {
  let columns: AlateColumn[] = [];
  let extras = 0;
  let nextExtraAt = plan.swarmAt;
  let bags = 0;
  const everyTicks = Math.max(1, secondsToTicks(cfg.extraFlocks.everySeconds));
  const geoOf = (plane: AlateColumn['plane']): ColumnPlaneGeo | undefined =>
    deps.planes.find((g) => g.plane === plane);

  /** The rain eases: feeders forage on where they are now (their new home). */
  const clearFeeding = (): void => {
    for (const f of deps.flocks()) {
      if (f.feedX === undefined) continue;
      if (f.state === 'forage' && f.members.length > 0) f.homeX = centroid(f).x;
      stopFeeding(f);
    }
  };

  /**
   * Where the first column rises (review of #110). First choice: a flock in view (spreadPx round
   * the view's centre) that forages, settles or is coming down to land — the column at where it
   * is (or lands), the one nearest the view's centre. Else: the flock whose landing point
   * (where it is on the ground, or where its flight sets it down) is the shortest walk from the
   * view — the column at that point held inside the view, if it is within feeding reach, so it
   * comes down and feeds on screen. Sim data only (the sim camera and content, never a device
   * viewport); flocks in id order, ties keep the first. Draws nothing.
   */
  const anchorFlock = (): { plane: AlateColumn['plane']; x: number } | null => {
    let inView: { plane: AlateColumn['plane']; x: number } | null = null;
    let inViewD = Infinity;
    let landing: { plane: AlateColumn['plane']; x: number } | null = null;
    let landingWalk = Infinity;
    for (const f of deps.flocks()) {
      if (f.members.length === 0) continue;
      const geo = deps.planes.find((g) => g.plane === f.plane);
      if (geo === undefined) continue;
      const centre = planeCentreX(deps.cameraX(), geo.scrollFactor);
      const spread = cfg.columns.spreadPx * geo.ratio;
      const down = f.state === 'flush' ? deps.comingDown(f) : true;
      const at = f.state === 'flush' ? deps.landingX(f) : centroid(f).x;
      const settled = f.state === 'forage' || f.state === 'settle' || (f.state === 'flush' && down);
      const d = Math.abs(at - centre);
      if (settled && d <= spread && d < inViewD) {
        inViewD = d;
        inView = { plane: geo.plane, x: at };
      }
      const x = Math.min(centre + spread, Math.max(centre - spread, at));
      const walk = Math.abs(at - x);
      if (walk <= cfg.feeding.reachPx * geo.ratio && walk < landingWalk) {
        landingWalk = walk;
        landing = { plane: geo.plane, x };
      }
    }
    return inView ?? landing;
  };

  /** Each forage/settle/alert flock in reach of a column feeds there; the others don't. */
  const assignFeeding = (): void => {
    for (const f of deps.flocks()) {
      if (
        f.members.length === 0 ||
        (f.state !== 'forage' && f.state !== 'settle' && f.state !== 'alert')
      ) {
        stopFeeding(f);
        continue;
      }
      const reach = cfg.feeding.reachPx * f.ratio;
      const at = feedColumn(columns, f.plane, centroid(f).x, reach);
      if (at === null) {
        stopFeeding(f);
        continue;
      }
      if (f.feedX !== at.x) {
        f.feedX = at.x;
        f.feedSpreadPx = cfg.feeding.spreadPx;
        f.feedHurryPx = cfg.feeding.hurryBeyondPx;
        f.feedHurryMul = cfg.feeding.hurrySpeedMul;
        // Head for the column now rather than at the next goal draw.
        f.goalTicks = 0;
      }
    }
  };

  const extraFlock = (): void => {
    if (extras >= cfg.extraFlocks.max || columns.length === 0) return;
    const col = columns[extras % columns.length];
    const geo = col === undefined ? undefined : geoOf(col.plane);
    if (col === undefined || geo === undefined) return;
    const size = rng.int(cfg.extraFlocks.size[0], cfg.extraFlocks.size[1]);
    const from = arrivalFor(col, geo, deps.cameraX(), cfg.extraFlocks.fromPx);
    if (deps.spawnFlock(col.plane, from.x, size, from.dir)) extras++;
  };

  return {
    plan,
    step() {
      const tick = deps.tick();
      if (tick === plan.buildupAt)
        deps.emit({
          type: 'reenbuiBuildup',
          tick,
          dropsTick: plan.dropsAt,
          swarmTick: plan.swarmAt,
          easingTick: plan.easingAt,
          endTick: plan.endAt,
          withStorm: plan.withStorm,
        });
      if (tick === plan.dropsAt && !plan.withStorm) deps.emit({ type: 'reenbuiRain', tick });
      if (tick === plan.swarmAt) {
        columns = placeColumns(cfg, deps.planes, deps.cameraX(), rng, anchorFlock());
        deps.emit({
          type: 'alatesSwarm',
          tick,
          mult: cfg.scoreMul,
          columns: columns.map((c) => ({ ...c })),
        });
      }
      if (tick === plan.easingAt) {
        clearFeeding();
        deps.emit({ type: 'rainEased', tick, bagged: bags });
      }
      if (tick === plan.endAt) {
        columns = [];
        deps.emit({ type: 'reenbuiDone', tick });
      }
      if (reenbuiPhaseAt(plan, tick) !== 'swarm') return;
      assignFeeding();
      if (tick >= nextExtraAt) {
        nextExtraAt = tick + everyTicks;
        extraFlock();
      }
    },
    phase() {
      return reenbuiPhaseAt(plan, deps.tick());
    },
    scoreMul() {
      return reenbuiPhaseAt(plan, deps.tick()) === 'swarm' ? cfg.scoreMul : 1;
    },
    alertMul(f) {
      const ph = reenbuiPhaseAt(plan, deps.tick());
      if (ph === 'buildup' && !plan.withStorm) return cfg.buildupAlertRadiusMul;
      if (ph === 'swarm' && f.feedX !== undefined) return cfg.feeding.alertRadiusMul;
      return 1;
    },
    bagged() {
      if (reenbuiPhaseAt(plan, deps.tick()) === 'swarm') bags++;
    },
    view() {
      return {
        phase: reenbuiPhaseAt(plan, deps.tick()),
        buildupTick: plan.buildupAt,
        dropsTick: plan.dropsAt,
        swarmTick: plan.swarmAt,
        easingTick: plan.easingAt,
        endTick: plan.endAt,
        withStorm: plan.withStorm,
        columns,
        bagged: bags,
        mult: cfg.scoreMul,
      };
    },
  };
}

function stopFeeding(f: Flock): void {
  if (f.feedX === undefined) return;
  delete f.feedX;
  delete f.feedSpreadPx;
  delete f.feedHurryPx;
  delete f.feedHurryMul;
}
