// v1.3x (D-037) the Skietbaan (training ground): the entry of the range's lazy chunk. The setup
// page picks a gun, area, distance and target; Start hands HuntScene a RangeSession (the range
// mode and its spawn program) and the scene runs it through the real sim. Stats live here, in
// memory, for the page's session: the range never reads or writes a save.
import type { InputKind, ModeConfig } from '../../sim/types';
import { planeToDx } from '../../sim/camera';
import type { SimEvent } from '../../sim/events';
import { createRangeProgram } from '../../sim/range/program';
import type { PlaneId, RangeTarget, SimState } from '../../sim/types';
import type { RangeHookState } from '../GameContext';
import { designSize } from '../layout';
import { layoutForDay } from '../../meta/maps';
import { PaperDraw } from './PaperDraw';
import { RangeBar, RangeSetupPanel } from './RangePanel';
import type { RangeHost, RangeMenuHost, RangeSession } from './RangeSession';
import { defaultChoice, isMixed, rangeGuns, rangeMode, type RangeChoice } from './rangeGuns';
import { cellTitle, gunNameById, rangeReport } from './rangeReport';
import { rt } from './rangeI18n';
import { RangeStats, type Impact, type RangeCell, type RangeSelection } from './rangeStats';

/** The page's session: stats and the last choice survive scene restarts (not a reload). */
const stats = new RangeStats();
let choice: RangeChoice | null = null;

function where(menu: RangeMenuHost, c: RangeChoice): Parameters<typeof rangeReport>[2] {
  return {
    build: __BUILD_SHA__,
    viewport: `${String(window.innerWidth)}×${String(window.innerHeight)} @${String(
      Math.round(window.devicePixelRatio * 100) / 100,
    )}x`,
    device: navigator.userAgent,
    biome: c.biome,
    layout: layoutForDay(menu.today()),
  };
}

function selection(menu: RangeMenuHost, c: RangeChoice): RangeSelection {
  const gun = rangeGuns(menu.content).find((g) => g.id === c.gun);
  return { gun: c.gun, plane: c.plane, target: c.target, pellets: gun?.pellets ?? 1 };
}

function hookState(
  c: RangeChoice,
  view: 'setup' | 'range',
  extra: Partial<RangeHookState> = {},
): RangeHookState {
  return {
    view,
    gun: c.gun,
    biome: c.biome,
    plane: c.plane,
    target: c.target,
    stats: null,
    cells: [],
    drawnImpacts: 0,
    papers: [],
    birds: [],
    ...extra,
  };
}

/** Opens the setup page (from the admin list, or back from a range). */
export function openSkietbaan(menu: RangeMenuHost): void {
  const content = menu.content;
  let c = choice ?? defaultChoice(content);
  if (!menu.playableBiomes.includes(c.biome))
    c = { ...c, biome: menu.playableBiomes[0] ?? c.biome };
  choice = c;
  const hook = menu.hook;
  if (hook) {
    hook.scene = 'skietbaan';
    hook.range = hookState(c, 'setup');
  }
  const panel = new RangeSetupPanel(content, {
    choice: c,
    biomes: menu.playableBiomes,
    layout: layoutForDay(menu.today()),
    cells: () => stats.list(),
    change: (next) => {
      choice = next;
      if (hook) hook.range = hookState(next, 'setup');
    },
    start: (pointerType) => {
      const now = choice ?? c;
      panel.destroy();
      menu.play(new Session(menu, now, pointerType === 'mouse' ? 'pointer' : 'touch'));
    },
    back: () => {
      panel.destroy();
      menu.back();
    },
    reset: () => {
      stats.reset();
    },
    report: () => rangeReport(content, stats.list(), where(menu, choice ?? c)),
  });
}

class Session implements RangeSession {
  readonly mode: ModeConfig;
  readonly rangeProgram = createRangeProgram;
  readonly seed: number;
  private host: RangeHost | null = null;
  private bar: RangeBar | null = null;
  private papers: PaperDraw[] = [];
  private readonly sel: RangeSelection;

  constructor(
    private readonly menu: RangeMenuHost,
    private readonly choice: RangeChoice,
    readonly inputKind: InputKind,
  ) {
    const gun = rangeGuns(menu.content).find((g) => g.id === choice.gun);
    if (gun === undefined) throw new Error(`no range gun ${choice.gun}`);
    this.mode = rangeMode(menu.content, choice, menu.today());
    this.seed = menu.nextSeed();
    this.sel = selection(menu, choice);
  }

  attach(host: RangeHost): void {
    this.host = host;
    stats.newSession();
    const content = this.menu.content;
    this.bar = new RangeBar(content, {
      title: this.title(),
      setup: () => {
        host.exit();
      },
      ...(isMixed(this.choice)
        ? {
            shuffle: () => {
              host.replay(new Session(this.menu, this.choice, this.inputKind));
            },
          }
        : {}),
      reset: () => {
        stats.reset();
      },
      report: () => rangeReport(content, stats.list(), where(this.menu, this.choice)),
    });
    if (this.menu.hook) {
      this.menu.hook.scene = 'range';
      this.menu.hook.range = hookState(this.choice, 'range');
    }
  }

  frame(events: readonly SimEvent[], state: SimState): void {
    const host = this.host;
    if (host === null) return;
    const content = this.menu.content;
    // The paper faces are drawn once their layer exists (the first frame after the views).
    const papers = state.range?.papers ?? [];
    if (this.papers.length === 0 && papers.length > 0) {
      for (const p of papers) {
        const layer = host.overlay(p.plane);
        if (layer !== null) this.papers.push(new PaperDraw(host.scene, layer, p));
      }
    }
    if (events.length > 0) stats.ingest(events, this.sel);
    const cell = this.shown();
    for (const p of this.papers) p.update(this.impactsOf(p.plane, p.kind));
    this.bar?.update(cell, this.fixedCell() === null);
    const hook = this.menu.hook;
    if (hook) {
      const scoring = content.scoring.planes;
      const creature = content.birds.creatures.find(
        (x) => x.id === content.modes.modes.range.creature,
      );
      const body = creature !== undefined && 'hitbox' in creature ? creature.hitbox.body : null;
      const half = designSize().width / 2;
      hook.range = hookState(this.choice, 'range', {
        seed: this.seed,
        stats:
          cell === null || cell.shots === 0
            ? null
            : {
                shots: cell.shots,
                hits: cell.hits,
                misses: cell.shots - cell.hits,
                short: cell.short,
                pelletsOn: cell.pelletsOn,
                impacts: cell.impacts.length,
              },
        cells: stats
          .list()
          .filter((c) => c.gun === this.sel.gun)
          .map((c) => ({
            plane: c.plane,
            target: c.target,
            shots: c.shots,
            hits: c.hits,
            short: c.short,
          })),
        drawnImpacts: this.papers.reduce((n, p) => n + p.count, 0),
        papers: papers.map((p) => ({
          x: half + planeToDx(state.cameraX, scoring[p.plane].scrollFactor, p.x),
          y: p.y,
          r: p.r,
          plane: p.plane,
          kind: p.kind,
        })),
        birds: state.birds.map((b) => {
          const sc = scoring[b.plane].scale;
          return {
            x:
              half +
              planeToDx(
                state.cameraX,
                scoring[b.plane].scrollFactor,
                b.x + (body?.ox ?? 0) * sc * b.facing,
              ),
            y: b.y + (body?.oy ?? 0) * sc,
            plane: b.plane,
          };
        }),
      });
    }
  }

  /** The single course's cell (null on the mixed course: its cells come with the shots). */
  private fixedCell(): RangeCell | null {
    const { plane, target } = this.sel;
    if (plane === 'all' || target === 'mixed') return null;
    return stats.cell({ ...this.sel, plane, target });
  }

  /** The cell the bar shows: the one the newest shot was counted for, else the course's. */
  private shown(): RangeCell | null {
    return stats.last?.cell ?? this.fixedCell();
  }

  private title(): string {
    const cell = this.fixedCell();
    if (cell !== null) return cellTitle(this.menu.content, cell);
    return `${gunNameById(this.menu.content, this.sel.gun)} · ${rt('range.mixed_course')}`;
  }

  /** The impacts drawn on a paper: its plane and kind's cell for this gun. */
  private impactsOf(plane: PlaneId, kind: RangeTarget): readonly Impact[] {
    return stats.cell({ ...this.sel, plane, target: kind }).impacts;
  }

  detach(): void {
    this.bar?.destroy();
    this.bar = null;
    for (const p of this.papers) p.destroy();
    this.papers = [];
    this.host = null;
  }
}
