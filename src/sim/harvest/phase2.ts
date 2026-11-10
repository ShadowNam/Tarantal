// v1.18 (D-081, GDD §12.2) Die Oes, Phase 2 — "Defend the field": the bonus round after the rush.
// The fence is whole all round and the workers have gone to the farmhouse; a fixed wave list of
// animals comes at the field from every side: warthogs run up behind the back fence and JUMP it,
// piglets squeeze UNDER it, baboons CLIMB OVER the posts (both ends of the panorama and up out of
// the veld behind it, on the mid plane), and warthogs and piglets come round the near plane's
// ends. Each that reaches the field eats until it is stopped — bagged, or driven out (a warthog's
// or baboon's first hit, a shot landing near a piglet). Pure and deterministic: ticks, its own
// stream `harvestPhase2` (seeded jitter of the list's times and where each crosses), stable order.
import type { BaboonTuning, HarvestSetup, RaidSpot } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { BonusId, SimEvent } from '../events';
import type { RandomStream } from '../rng';
import type { Phase2AnimalView, Phase2Kind, Phase2Phase, PlaneId } from '../types';
import type { HitExtra } from '../weapons/hitTest';

type Phase2Setup = HarvestSetup['phase2'];
type Wave = Phase2Setup['waves'][number];

/** What Phase 2 needs from the Harvest and the hunt. */
export interface Phase2Host {
  readonly tick: () => number;
  emit(e: SimEvent): void;
  awardBonus(bonus: BonusId, base: number): number;
  basePoints(plane: PlaneId): number;
  penalty(points: number): void;
}

/** One plane's geometry for Phase 2 (layer px). */
export interface Phase2Plane {
  readonly layerId: string;
  readonly plane: 'mid' | 'near';
  readonly width: number;
  readonly scale: number;
  readonly minHitRadius: number;
  /** Where they eat: dig spots (warthogs, piglets) and the mielies (baboons). */
  readonly digSpots: readonly { readonly x: number; readonly y: number }[];
  readonly mielies: readonly { readonly x: number; readonly y: number }[];
}

export interface Phase2Geometry {
  /** The fence's ground line on the mid layer, and its posts' height (plane scale 1). */
  readonly fenceY: number;
  readonly postPx: number;
  readonly mid: Phase2Plane;
  readonly near: Phase2Plane | null;
}

interface Animal {
  readonly id: number;
  readonly kind: Phase2Kind;
  readonly from: Wave['from'];
  readonly p: Phase2Plane;
  /** Its size: the plane's scale (× pigletScale for a piglet). */
  readonly scale: number;
  readonly spawnTick: number;
  phase: Phase2Phase;
  /** Ticks in this phase. */
  t: number;
  /** This phase's length (crossing legs) in ticks. */
  dur: number;
  x: number;
  y: number;
  facing: 1 | -1;
  /** The crossing's start and end (cross), the leg's goal (approach, go, flee). */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  readonly crossX: number;
  readonly eatX: number;
  readonly eatY: number;
  hits: number;
  stopped: boolean;
  cooldown: number;
}

export interface Phase2Result {
  readonly reason: 'clear' | 'time' | 'eaten';
  readonly total: number;
  readonly stopped: number;
  readonly bagged: number;
  readonly cropAtStart: number;
  readonly crop: number;
  readonly cropBonus: number;
  readonly perfectBonus: number;
  readonly clearBonus: number;
}

/** The list's arrival ticks after Phase 2 starts (jittered by ±jitterSeconds, never < 0),
 *  and where each mid arrival crosses the fence (u), drawn in list order; sorted by arrival
 *  (review: the jitter can swap entries closer than 2 × jitterSeconds; ties keep list order). */
export function waveSchedule(
  P: Phase2Setup,
  rng: RandomStream,
): { readonly at: number; readonly crossU: number; readonly wave: Wave }[] {
  return P.waves
    .map((wave, index) => {
      const j = rng.range(-P.jitterSeconds, P.jitterSeconds);
      const r = P.crossU[wave.from];
      const u = rng.range(r[0], r[1]);
      return { at: Math.max(0, secondsToTicks(Math.max(0, wave.at + j))), crossU: u, wave, index };
    })
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map(({ at, crossU, wave }) => ({ at, crossU, wave }));
}

/** The Phase 2 end bonuses for the crop left (whole percent), the crop at the start, and
 *  whether all were stopped before the clock ran out. */
export function phase2Bonuses(
  P: Phase2Setup,
  cropAtStart: number,
  crop: number,
  allStopped: boolean,
  reason: Phase2Result['reason'],
): { readonly cropBonus: number; readonly perfectBonus: number; readonly clearBonus: number } {
  const left = Math.floor(Math.max(0, crop));
  return {
    cropBonus: left * P.cropBonusPerPercent,
    perfectBonus: reason !== 'eaten' && crop >= cropAtStart ? P.perfectBonus : 0,
    clearBonus: allStopped && reason === 'clear' ? P.clearBonus : 0,
  };
}

/** Points-per-arc helper: the jump's height at f (0..1): a parabola peaking at f = 0.5. */
export function jumpLift(f: number, height: number): number {
  return 4 * f * (1 - f) * height;
}

export interface Phase2System {
  /** Starts the clock at this tick (after the banner). Returns its end tick. */
  start(cropAtStart: number): number;
  step(): void;
  /** What is eating the crop now, as the drain per tick (percent). */
  drainPerTick(): number;
  readonly total: number;
  left(): number;
  ticksLeft(): number;
  /** All stopped (every one of the list was bagged or driven out). */
  cleared(): boolean;
  timeUp(): boolean;
  /** Ends it: the rest run off (not counted). */
  finish(reason: Phase2Result['reason'], crop: number): Phase2Result;
  result(): Phase2Result | null;
  extras(add: (layerId: string, e: HitExtra) => void): void;
  owns(id: number): boolean;
  plane(id: number): PlaneId | null;
  /** A shot's hits on Phase 2's animals (`hitTarget`: it hit a target elsewhere). */
  shot(
    shotId: number,
    hits: readonly number[],
    hitTarget: boolean,
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
  ): void;
  /** Every shot: a piglet within pigletScarePx of where it landed runs back out. */
  landed(aimOn: (layerId: string) => { readonly x: number; readonly y: number }): void;
  view(): readonly Phase2AnimalView[];
}

export function createPhase2(
  H: HarvestSetup,
  bb: BaboonTuning,
  geo: Phase2Geometry,
  rng: RandomStream,
  host: Phase2Host,
  nextId: () => number,
): Phase2System {
  const P = H.phase2;
  const W = H.warthogs;
  const seconds = secondsToTicks(P.seconds);
  const schedule = waveSchedule(P, rng);
  const total = schedule.length;
  const animals: Animal[] = [];
  let startTick = -1;
  let endTick = -1;
  let next = 0;
  let stopped = 0;
  let bagged = 0;
  let cropAtStart = 100;
  let done: Phase2Result | null = null;
  const jumpTicks = secondsToTicks(P.jump.seconds);
  const squeezeTicks = secondsToTicks(P.squeezeSeconds);
  const upTicks = secondsToTicks(P.climb.upSeconds);
  const dropTicks = secondsToTicks(P.climb.dropSeconds);
  const tumbleTicks = secondsToTicks(W.tumbleSeconds);
  const pigletCooldown = secondsToTicks(H.workers.cooldownSeconds);

  const fadeTicks = secondsToTicks(P.backFadeSeconds);
  /** Review: coming up out of the veld behind the fence it fades in (the view draws it so): no
   *  hit shapes until it is all there. */
  const fadingIn = (a: Animal): boolean =>
    a.from === 'back' && a.phase === 'approach' && a.t < fadeTicks;

  const speed = (a: Animal, mul = 1): number => (P.speeds[a.kind] * a.p.scale * mul) / 60;

  function nearestOf(
    list: readonly { readonly x: number; readonly y: number }[],
    x: number,
  ): { x: number; y: number } {
    let best = list[0] ?? { x, y: geo.fenceY + P.landPx };
    for (const s of list) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
    return { x: best.x, y: best.y };
  }

  function spawn(at: { readonly crossU: number; readonly wave: Wave }): void {
    const w = at.wave;
    const p = w.plane === 'near' && geo.near !== null ? geo.near : geo.mid;
    const k = p.scale;
    const off = P.entryPx * k;
    const onMid = p === geo.mid;
    const crossX = at.crossU * p.width;
    const spots = w.kind === 'baboon' && p.mielies.length > 0 ? p.mielies : p.digSpots;
    const goal = nearestOf(spots, onMid ? crossX : w.from === 'left' ? 0 : p.width);
    const eatX = goal.x + rng.range(-P.eatJitterPx, P.eatJitterPx) * k;
    const behind = geo.fenceY - P.behindPx * k;
    const sx = w.from === 'left' ? -off : w.from === 'right' ? p.width + off : crossX;
    const sy = !onMid ? goal.y : w.from === 'back' ? geo.fenceY - P.backStartPx * k : behind;
    const a: Animal = {
      id: nextId(),
      kind: w.kind,
      from: w.from,
      p,
      scale: w.kind === 'piglet' ? k * W.pigletScale : k,
      spawnTick: host.tick(),
      phase: onMid ? 'approach' : 'go',
      t: 0,
      dur: 0,
      x: sx,
      y: sy,
      facing: 1,
      ax: sx,
      ay: sy,
      bx: onMid ? crossX : eatX,
      by: onMid ? behind : goal.y,
      crossX,
      eatX,
      eatY: goal.y,
      hits: 0,
      stopped: false,
      cooldown: 0,
    };
    a.facing = a.bx >= a.x ? 1 : -1;
    animals.push(a);
    host.emit({
      type: 'phase2Entered',
      tick: host.tick(),
      animalId: a.id,
      kind: a.kind,
      from: w.from,
      plane: p.plane,
      x: a.x,
    });
  }

  function moveTo(a: Animal, v: number): boolean {
    const dx = a.bx - a.x;
    const dy = a.by - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= v) {
      a.x = a.bx;
      a.y = a.by;
      return true;
    }
    a.x += (dx / d) * v;
    a.y += (dy / d) * v;
    return false;
  }

  function setPhase(a: Animal, ph: Phase2Phase, dur = 0): void {
    a.phase = ph;
    a.t = 0;
    a.dur = dur;
  }

  /** Starts the crossing at the fence: a jump, a squeeze or a climb. */
  function startCross(a: Animal): void {
    const k = a.p.scale;
    const dir: 1 | -1 = a.eatX >= a.x ? 1 : -1;
    a.facing = dir;
    a.ax = a.x;
    a.ay = a.y;
    const land = geo.fenceY + P.landPx * k;
    if (a.kind === 'warthog') {
      a.bx = a.x + dir * P.jump.lengthPx * k;
      a.by = land;
      setPhase(a, 'jump', jumpTicks);
    } else if (a.kind === 'piglet') {
      a.bx = a.x + dir * P.squeezePx * k;
      a.by = land;
      setPhase(a, 'squeeze', squeezeTicks);
    } else {
      a.bx = a.x;
      a.by = geo.fenceY - geo.postPx * k;
      setPhase(a, 'climb', upTicks);
    }
  }

  function flee(a: Animal): void {
    if (a.phase === 'tumble' || a.phase === 'flee' || a.phase === 'gone') return;
    if (!a.stopped) {
      a.stopped = true;
      stopped++;
    }
    const off = P.entryPx * a.p.scale;
    a.bx = a.x < a.p.width / 2 ? -off : a.p.width + off;
    // Off the fence (mid-air or on top) it drops to the ground line it was making for.
    if (a.phase === 'jump' || a.phase === 'climb' || a.phase === 'drop')
      a.y = geo.fenceY + P.knockDownPx;
    a.by = a.y;
    a.facing = a.bx >= a.x ? 1 : -1;
    setPhase(a, 'flee');
  }

  function stepAnimal(a: Animal): void {
    a.t++;
    if (a.cooldown > 0) a.cooldown--;
    switch (a.phase) {
      case 'approach':
        if (moveTo(a, speed(a))) startCross(a);
        return;
      case 'jump':
      case 'squeeze':
      case 'drop': {
        const f = Math.min(1, a.t / Math.max(1, a.dur));
        a.x = a.ax + (a.bx - a.ax) * f;
        a.y = a.ay + (a.by - a.ay) * f;
        if (a.phase === 'jump') a.y -= jumpLift(f, P.jump.heightPx * a.p.scale);
        if (f >= 1) {
          a.bx = a.eatX;
          a.by = a.eatY;
          a.facing = a.bx >= a.x ? 1 : -1;
          setPhase(a, 'go');
        }
        return;
      }
      case 'climb': {
        const f = Math.min(1, a.t / Math.max(1, a.dur));
        a.y = a.ay + (a.by - a.ay) * f;
        if (f >= 1) {
          // Over the top: the drop down inside.
          a.ax = a.x;
          a.ay = a.y;
          a.bx = a.x + a.facing * P.climb.dropPx * a.p.scale;
          a.by = geo.fenceY + P.landPx * a.p.scale;
          setPhase(a, 'drop', dropTicks);
        }
        return;
      }
      case 'go':
        if (moveTo(a, speed(a))) setPhase(a, 'eat');
        return;
      case 'eat':
        return;
      case 'flee':
        if (moveTo(a, speed(a, P.fleeMul))) setPhase(a, 'gone');
        return;
      case 'tumble':
        if (a.t >= tumbleTicks) setPhase(a, 'gone');
        return;
      case 'gone':
        return;
    }
  }

  function start(crop: number): number {
    startTick = host.tick();
    endTick = startTick + seconds;
    cropAtStart = crop;
    host.emit({ type: 'phase2Started', tick: startTick, total, endTick });
    return endTick;
  }

  function step(): void {
    if (startTick < 0 || done !== null) {
      for (const a of animals) if (a.phase !== 'gone') stepAnimal(a);
      prune();
      return;
    }
    const since = host.tick() - startTick;
    while (next < schedule.length && (schedule[next]?.at ?? Infinity) <= since) {
      const s = schedule[next];
      next++;
      if (s !== undefined) spawn(s);
    }
    for (const a of animals) if (a.phase !== 'gone') stepAnimal(a);
    prune();
  }

  function prune(): void {
    if (!animals.some((a) => a.phase === 'gone')) return;
    const keep = animals.filter((a) => a.phase !== 'gone');
    animals.length = 0;
    animals.push(...keep);
  }

  function drainPerTick(): number {
    let d = 0;
    for (const a of animals) if (a.phase === 'eat') d += P.drainPerSecond[a.kind];
    return d / 60;
  }

  function finish(reason: Phase2Result['reason'], crop: number): Phase2Result {
    if (done !== null) return done;
    // The rest run off (they don't count as stopped).
    for (const a of animals) {
      if (a.phase === 'tumble' || a.phase === 'flee' || a.phase === 'gone') continue;
      // Marked first, so flee() doesn't count it as stopped.
      a.stopped = true;
      flee(a);
    }
    const all = stopped === total;
    const b = phase2Bonuses(P, cropAtStart, crop, all, reason);
    done = { reason, total, stopped, bagged, cropAtStart, crop, ...b };
    host.emit({ type: 'phase2Ended', tick: host.tick(), ...done });
    return done;
  }

  type Box = { readonly body: Ell; readonly head: Ell };
  type Ell = { readonly rx: number; readonly ry: number; readonly ox: number; readonly oy: number };
  function boxOf(a: Animal): Box {
    if (a.kind === 'baboon')
      return a.phase === 'climb' || a.phase === 'drop'
        ? bb.hitboxes.stand
        : a.phase === 'eat'
          ? bb.hitboxes.sit
          : bb.hitboxes.walk;
    return a.phase === 'eat' && a.kind === 'warthog' ? W.hitboxes.dig : W.hitboxes.trot;
  }
  function shapesOf(a: Animal) {
    const box = boxOf(a);
    // Baboon boxes are at a sitting male's height (bb.heightPx), the hogs' at an adult's.
    const k = a.scale;
    const floor = a.kind === 'piglet' ? 0 : a.p.minHitRadius;
    return [box.body, box.head].map((sh, i) => ({
      x: a.x + sh.ox * k * a.facing,
      y: a.y + sh.oy * k,
      shape: {
        type: 'ellipse' as const,
        rx: Math.max(sh.rx * k, i === 0 ? floor : 0),
        ry: Math.max(sh.ry * k, i === 0 ? floor : 0),
      },
    }));
  }

  const hittable = (a: Animal): boolean =>
    a.phase !== 'tumble' && a.phase !== 'gone' && !fadingIn(a);

  function extras(add: (layerId: string, e: HitExtra) => void): void {
    // Targets first (warthogs, baboons), then the piglets (bystanders), front to back in order.
    for (const pass of [0, 1])
      for (const a of animals) {
        if (!hittable(a) || (a.kind === 'piglet') !== (pass === 1)) continue;
        for (const sh of shapesOf(a)) add(a.p.layerId, { kind: 'harvest', harvestId: a.id, ...sh });
      }
  }

  const find = (id: number): Animal | undefined => animals.find((a) => a.id === id);

  function aimedAt(a: Animal, at: { readonly x: number; readonly y: number }): boolean {
    for (const sh of shapesOf(a)) {
      const dx = (at.x - sh.x) / Math.max(1e-6, sh.shape.rx);
      const dy = (at.y - sh.y) / Math.max(1e-6, sh.shape.ry);
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }

  function shot(
    shotId: number,
    hits: readonly number[],
    hitTarget: boolean,
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
  ): void {
    const tick = host.tick();
    const hitAnimal = hits.some((id) => {
      const a = find(id);
      return a !== undefined && a.kind !== 'piglet' && hittable(a);
    });
    for (const id of hits) {
      const a = find(id);
      if (a === undefined || !hittable(a)) continue;
      if (a.kind === 'piglet') {
        const aimed = !hitTarget && !hitAnimal && aimedAt(a, aimOn(a.p.layerId));
        let points = 0;
        if (aimed && a.cooldown === 0) {
          points = -W.pigletPenalty;
          a.cooldown = pigletCooldown;
          host.penalty(points);
        }
        host.emit({
          type: 'harvestBystanderHit',
          tick,
          shotId,
          who: 'piglet',
          id: a.id,
          aimed,
          plane: a.p.plane,
          x: a.x,
          y: a.y,
          points,
        });
        flee(a);
        continue;
      }
      a.hits++;
      const toBag = a.kind === 'warthog' ? W.hitsToBag : bb.hit.hitsToBag;
      const left = Math.max(0, toBag - a.hits);
      if (a.kind === 'warthog')
        host.emit({
          type: 'warthogHit',
          tick,
          shotId,
          warthogId: a.id,
          hitsLeft: left,
          plane: a.p.plane,
          x: a.x,
          y: a.y,
        });
      else
        host.emit({
          type: 'baboonHit',
          tick,
          shotId,
          baboonId: a.id,
          role: 'raider',
          hitsLeft: left,
          plane: a.p.plane,
          x: a.x,
          y: a.y,
          points: 0,
        });
      if (left > 0) {
        flee(a);
        continue;
      }
      if (!a.stopped) {
        a.stopped = true;
        stopped++;
      }
      bagged++;
      // Bagged off the fence: it falls to the ground line.
      if (a.phase === 'jump' || a.phase === 'climb' || a.phase === 'drop')
        a.y = geo.fenceY + P.knockDownPx;
      setPhase(a, 'tumble');
      const base = host.basePoints(a.p.plane);
      if (a.kind === 'warthog') {
        const points = host.awardBonus('warthog', Math.round(base * W.pointsMul));
        host.emit({
          type: 'warthogBagged',
          tick,
          shotId,
          warthogId: a.id,
          plane: a.p.plane,
          x: a.x,
          y: a.y,
          points,
        });
      } else {
        const points = host.awardBonus('baboon', Math.round(base * bb.hit.pointsMul));
        host.emit({
          type: 'baboonBagged',
          tick,
          shotId,
          baboonId: a.id,
          raidId: 0,
          action: 'mielie',
          plane: a.p.plane,
          x: a.x,
          y: a.y,
          stopped: true,
          points,
        });
      }
    }
  }

  function landed(aimOn: (layerId: string) => { readonly x: number; readonly y: number }): void {
    for (const a of animals) {
      if (a.kind !== 'piglet' || !hittable(a) || a.phase === 'flee') continue;
      const at = aimOn(a.p.layerId);
      const r = P.pigletScarePx * a.p.scale;
      const dx = at.x - a.x;
      const dy = at.y - a.y;
      if (dx * dx + dy * dy <= r * r) {
        flee(a);
        host.emit({ type: 'phase2Scared', tick: host.tick(), animalId: a.id, x: a.x, y: a.y });
      }
    }
  }

  function view(): Phase2AnimalView[] {
    return animals.map((a) => ({
      id: a.id,
      kind: a.kind,
      layerId: a.p.layerId,
      plane: a.p.plane,
      scale: a.scale,
      x: a.x,
      y: a.y,
      facing: a.facing,
      t: a.t,
      dur: a.dur,
      phase: a.phase,
      from: a.from,
      hits: a.hits,
    }));
  }

  return {
    start,
    step,
    drainPerTick,
    total,
    left: () => total - stopped,
    ticksLeft: () => (startTick < 0 ? seconds : Math.max(0, endTick - host.tick())),
    cleared: () => stopped === total,
    timeUp: () => startTick >= 0 && host.tick() >= endTick,
    finish,
    result: () => done,
    extras,
    owns: (id) => find(id) !== undefined,
    plane: (id) => find(id)?.p.plane ?? null,
    shot,
    landed,
    view,
  };
}

/** The mid plane's mielie spots for the baboons: the map's raid spots on the gap's layer. */
export function mielieSpots(
  spots: readonly RaidSpot[],
  layerId: string,
  width: number,
): { x: number; y: number }[] {
  return spots
    .filter((s) => s.layer === layerId && s.u !== undefined)
    .map((s) => ({ x: (s.u ?? 0) * width + s.ox, y: s.y }));
}
