// v1.3x (D-037) the Skietbaan (training ground): the entry of the range's lazy chunk. The setup
// page picks a gun, area, distance and target; Start hands HuntScene a RangeSession (the range
// mode and its spawn program) and the scene runs it through the real sim. Stats live here, in
// memory, for the page's session: the range never reads or writes a save.
import type * as Phaser from 'phaser';
import { biomeOrFirst } from '../../meta/areas';
import type { InputKind, ModeConfig } from '../../sim/types';
import { planeToDx } from '../../sim/camera';
import type { SimEvent } from '../../sim/events';
import { createRangeProgram } from '../../sim/range/program';
import type { PlaneId, SimState } from '../../sim/types';
import type { RangeHookState } from '../GameContext';
import { designSize, renderScale } from '../layout';
import { layoutForDay } from '../../meta/maps';
import { PaperDraw } from './PaperDraw';
import { PlateDraw } from './PlateDraw';
import { RangeFeedback } from './RangeFeedback';
import { loadRangeAssets, playRangeSound } from './rangeSounds';
import { RangeBar, RangeSetupPanel } from './RangePanel';
import type { RangeHost, RangeMenuHost, RangeSession } from './RangeSession';
import {
  defaultChoice,
  isMixed,
  rangeGuns,
  rangeMode,
  shuffleSeed,
  type RangeChoice,
} from './rangeGuns';
import { cellTitle, gunNameById, rangeReport } from './rangeReport';
import { rt } from './rangeI18n';
import { RangeStats, type RangeCell, type RangeSelection } from './rangeStats';
import {
  makeMark,
  markClass,
  markSize,
  MarkStore,
  targetIndices,
  targetKey,
  type MarkClass,
} from './rangeMarks';

/** Rendering only (review fix): a plate rings, a paper blinks at most once per this (ms). */
const FEEDBACK_COOLDOWN_MS = 180;

/** The page's session: stats and the last choice survive scene restarts (not a reload). */
const stats = new RangeStats();
let choice: RangeChoice | null = null;
/** D-040: every target's hit marks for this Skietbaan visit (cleared when it is left). */
const marks = new MarkStore();
/** Range sessions started (a mark remembers its own: only the current one's newest glints). */
let visits = 0;

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
    marks: [],
    papers: [],
    birds: [],
    ...extra,
  };
}

/** Opens the setup page (from the admin list, or back from a range). */
export function openSkietbaan(menu: RangeMenuHost): void {
  const content = menu.content;
  let c = choice ?? defaultChoice(content);
  // A stored choice that is no longer offered falls back to the first biome.
  c = { ...c, biome: biomeOrFirst(c.biome, menu.playableBiomes) };
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
      // Leaving the Skietbaan: the next visit's targets are freshly painted.
      marks.clear();
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
  private readonly base: number;
  private host: RangeHost | null = null;
  private bar: RangeBar | null = null;
  private papers: PaperDraw[] = [];
  private plates = new Map<number, PlateDraw>();
  private marks: RangeFeedback | null = null;
  /** Feedback key (a plate's ding, a paper's blink) → when it last ran (scene ms). */
  private readonly lastFeedback = new Map<string, number>();
  /** Range shots in the air: where each was counted (its miss marker goes there). */
  private readonly aims = new Map<number, { plane: PlaneId; x: number; y: number }>();
  private readonly sel: RangeSelection;
  /** D-040: this session's number, its targets' mark keys, the gun's mark class. */
  private readonly visit = ++visits;
  private readonly keys = new Map<number, string>();
  private readonly markCls: MarkClass;
  /** Pellets so far per shot and target (a mark's pellet index). */
  private readonly pellets = new Map<string, number>();
  /** The view's sim tick: the snapshot's, or where it was when the range was held (e2e). */
  private viewTick = 0;

  constructor(
    private readonly menu: RangeMenuHost,
    private readonly choice: RangeChoice,
    readonly inputKind: InputKind,
    /** A Shuffle: the first session's seed and how many shuffles since (none: a new seed). */
    private readonly shuffled: { readonly base: number; readonly n: number } | null = null,
  ) {
    const gun = rangeGuns(menu.content).find((g) => g.id === choice.gun);
    if (gun === undefined) throw new Error(`no range gun ${choice.gun}`);
    this.mode = rangeMode(menu.content, choice, menu.today());
    this.base = shuffled?.base ?? menu.nextSeed();
    this.seed = shuffleSeed(this.base, shuffled?.n ?? 0);
    this.sel = selection(menu, choice);
    this.markCls = markClass(gun.weapon, gun.pellets);
  }

  /** Screen px per plane px at the strongest sight (the mark bakes' level 0 is sized for it). */
  private maxScreenScale(): number {
    let z = 1;
    for (const s of this.menu.content.weapons.sights) for (const v of s.zoom) z = Math.max(z, v);
    return z * renderScale();
  }

  /** Screen px per plane px on a plane's overlay now (its zoom × the camera's render scale). */
  private screenScale(layer: Phaser.GameObjects.Container | null): number {
    const cam = this.host?.scene.cameras.main.zoom ?? 1;
    // Phaser types parentContainer as always set; a layer outside a plane root has none.
    const root = layer?.parentContainer as Phaser.GameObjects.Container | null | undefined;
    return (root?.scaleX ?? 1) * cam;
  }

  attach(host: RangeHost): void {
    this.host = host;
    void loadRangeAssets(host.scene.textures, host.audio);
    this.marks = new RangeFeedback(
      host.scene,
      (plane) => host.overlay(plane),
      { hit: rt('range.mark_hit'), short: rt('range.mark_short') },
      () => host.reduceFlashes(),
    );
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
              // Every Shuffle is a new layout, even when the seed source is fixed (?seed=N).
              host.replay(
                new Session(this.menu, this.choice, this.inputKind, {
                  base: this.base,
                  n: (this.shuffled?.n ?? 0) + 1,
                }),
              );
            },
          }
        : {}),
      reset: () => {
        stats.reset();
      },
      ...(this.choice.target === 'paper' || this.choice.target === 'plate' || isMixed(this.choice)
        ? {
            repaint: {
              label: rt(
                this.choice.target === 'paper'
                  ? 'range.new_paper'
                  : this.choice.target === 'plate'
                    ? 'range.repaint'
                    : 'range.fresh_targets',
              ),
              run: () => {
                // On purpose, as shooters do: this setup's targets start clean.
                marks.clear(this.keys.values());
              },
            },
          }
        : {}),
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
    if (this.papers.length + this.plates.size === 0 && papers.length > 0) {
      const index = targetIndices(papers);
      const max = this.maxScreenScale();
      for (const p of papers) {
        const layer = host.overlay(p.plane);
        if (layer === null) continue;
        this.keys.set(p.id, targetKey(this.choice.biome, p.plane, p.kind, index.get(p.id) ?? 0));
        if (p.kind === 'plate') this.plates.set(p.id, new PlateDraw(host.scene, layer, p, max));
        else this.papers.push(new PaperDraw(host.scene, layer, p, max));
      }
    }
    const held = this.menu.hook?.rangeHold === true;
    if (!held) this.viewTick = state.tick;
    this.collectMarks(events, state);
    this.feedback(host, events, state);
    const dt = held ? 0 : host.scene.game.loop.delta;
    for (const p of [...this.plates.values(), ...this.papers]) {
      const key = this.keys.get(p.id) ?? '';
      p.update({
        tick: this.viewTick,
        marks: marks.marks(key),
        epoch: marks.epoch(key),
        visit: this.visit,
        screenScale: this.screenScale(host.overlay(p.plane)),
      });
    }
    for (const p of this.papers) p.tick(dt);
    this.marks?.update(dt);
    const landed = events.length > 0 ? stats.ingest(events, this.sel) : [];
    // The bar's hit counter pulses on a hit.
    if (landed.some((r) => r.hit)) this.bar?.pulse();
    const cell = this.shown();
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
        feedback: {
          ...(this.marks?.shown ?? { hit: 0, miss: 0, short: 0 }),
          lastHit: this.marks?.lastHit ?? null,
          blinks: this.papers.reduce((n, p) => n + p.blinks, 0),
          swings: [...this.plates.values()].reduce((n, p) => n + p.hits, 0),
          pulses: this.bar?.pulses ?? 0,
        },
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
        marks: papers.map((p) => {
          const key = this.keys.get(p.id) ?? '';
          const d = this.plates.get(p.id) ?? this.papers.find((x) => x.id === p.id);
          return {
            key,
            kind: p.kind,
            count: marks.count(key),
            drawn: d === undefined ? 0 : d instanceof PlateDraw ? d.drawn : d.count,
          };
        }),
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

  /**
   * 24 Oct update: what the player sees and hears of each shot, from the sim's range events —
   * plates swing and ring at plateHit; at rangeOutcome a paper blinks and thwacks, a bird gets
   * its hit sound, every target hit gets a HIT marker, and a miss a dust puff or SHORT.
   */
  private feedback(host: RangeHost, events: readonly SimEvent[], state: SimState): void {
    const content = this.menu.content;
    const papers = state.range?.papers ?? [];
    let rung = '';
    for (const e of events) {
      if (e.type === 'rangeShot') {
        this.aims.set(e.shotId, { plane: e.plane, x: e.x, y: e.y });
        // Only the last few shots can still land (a Kettie stone is in the air < 1 s).
        if (this.aims.size > 64) {
          const oldest = this.aims.keys().next();
          if (oldest.done !== true) this.aims.delete(oldest.value);
        }
      } else if (e.type === 'plateHit') {
        // Once per shot and plate (a shotgun puts several pellets on it).
        const plate = this.plates.get(e.paperId);
        const key = `${String(e.shotId)}:${String(e.paperId)}`;
        if (plate === undefined || key === rung) continue;
        rung = key;
        plate.hit(e.x, e.tick);
        // Rapid fire (the Mielie-Masjien): one ding per plate per cooldown, so the long rings
        // don't fill the voice limit and drop the gunshots.
        if (this.cooled(`ding:${String(e.paperId)}`))
          playRangeSound(host.audio, 'ding', this.pan(state, plate.plane, e.x));
      } else if (e.type === 'rangeOutcome') {
        const aim = this.aims.get(e.shotId);
        this.aims.delete(e.shotId);
        if (e.hits.length === 0) {
          if (aim !== undefined) this.marks?.miss(aim.plane, aim.x, aim.y, e.short);
          continue;
        }
        for (const h of e.hits) {
          if (h.target === 'paper' || h.target === 'plate') {
            const p = papers.find((x) => x.id === h.id);
            if (p === undefined) continue;
            this.marks?.hit(h.plane, p.x, p.y, p.r);
            if (h.target === 'plate') continue;
            // One blink (and thwack) per paper per cooldown: rapid fire must not strobe it.
            if (!this.cooled(`paper:${String(h.id)}`)) continue;
            this.papers.find((x) => x.id === h.id)?.blink(host.reduceFlashes());
            playRangeSound(host.audio, 'thwack', this.pan(state, h.plane, p.x));
          } else {
            const b = state.birds.find((x) => x.id === h.id);
            if (b === undefined) continue;
            const sc = content.scoring.planes[b.plane].scale;
            const body = this.body();
            const x = b.x + (body?.ox ?? 0) * sc * b.facing;
            const y = b.y + (body?.oy ?? 0) * sc;
            this.marks?.hit(h.plane, x, y, (body?.rx ?? 40) * sc);
            playRangeSound(host.audio, 'hit', this.pan(state, h.plane, x));
          }
        }
      }
    }
  }

  /** True (and the clock restarts) when `key`'s feedback last ran FEEDBACK_COOLDOWN_MS ago. */
  private cooled(key: string): boolean {
    const now = this.host?.scene.time.now ?? 0;
    const last = this.lastFeedback.get(key);
    if (last !== undefined && now - last < FEEDBACK_COOLDOWN_MS) return false;
    this.lastFeedback.set(key, now);
    return true;
  }

  private body(): { rx: number; ox: number; oy: number } | null {
    const content = this.menu.content;
    const c = content.birds.creatures.find((x) => x.id === content.modes.modes.range.creature);
    return c !== undefined && 'hitbox' in c ? c.hitbox.body : null;
  }

  /** Stereo pan of a plane point (−1 left … 1 right of the screen). */
  private pan(state: SimState, plane: PlaneId, x: number): number {
    const sf = this.menu.content.scoring.planes[plane].scrollFactor;
    return planeToDx(state.cameraX, sf, x) / (designSize().width / 2);
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

  /**
   * D-040: every pellet the sim put on a paper or plate (paperHit/plateHit) leaves a mark at that
   * point, on that target's marks for the visit. Its size comes from the gun and the plane, its
   * shape from the impact (shot id, tick, pellet index).
   */
  private collectMarks(events: readonly SimEvent[], state: SimState): void {
    const papers = state.range?.papers ?? [];
    for (const e of events) {
      if (e.type !== 'paperHit' && e.type !== 'plateHit') continue;
      const p = papers.find((x) => x.id === e.paperId);
      const key = this.keys.get(e.paperId);
      if (p === undefined || key === undefined) continue;
      const pk = `${String(e.shotId)}:${String(e.paperId)}`;
      const pellet = this.pellets.get(pk) ?? 0;
      this.pellets.set(pk, pellet + 1);
      if (this.pellets.size > 256) {
        const oldest = this.pellets.keys().next();
        if (oldest.done !== true) this.pellets.delete(oldest.value);
      }
      const scale = this.menu.content.scoring.planes[p.plane].scale;
      const size = markSize(p.kind, this.markCls, scale, p.r);
      marks.add(
        key,
        makeMark({ shotId: e.shotId, tick: e.tick, pellet, x: e.x, y: e.y }, p, size, this.visit),
      );
    }
  }

  detach(): void {
    this.bar?.destroy();
    this.bar = null;
    for (const p of this.papers) p.destroy();
    this.papers = [];
    for (const p of this.plates.values()) p.destroy();
    this.plates.clear();
    this.marks?.destroy();
    this.marks = null;
    this.aims.clear();
    this.pellets.clear();
    this.keys.clear();
    this.lastFeedback.clear();
    this.host = null;
  }
}
