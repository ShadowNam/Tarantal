// v1.12 (D-069, GDD §11.3f, Tech §3.12f) Brakkie, Oupa's Jack Russell, as a sim system the hunt
// plugs in. He roams the near plane (and goes onto the mid plane to fetch a bird bagged there),
// barks at a flock now and then (one threat), flushes a hidden flock now and then, and when a shot
// hits him he yelps and bolts to the bakkie: −25 only for a shot aimed at him (D-062/D-063's rule)
// with the weaver nest's cooldown. Never a target, never hurt, never removed.
// Pure and deterministic: his own stream `dog` for every draw, ticks, plain arithmetic. It lives in
// the lazy sim-systems chunk with the baboons; the sim talks to it through BrakkieHost only.
import type { ContentBundle } from '../../content/schemas';
import { planeCentreX, planeToDx } from '../camera';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import type { RandomStream } from '../rng';
import type { BrakkieView, DogPhase, DogPlane, DogPose, PlaneId } from '../types';
import { pointInOccluder, type HitExtra } from '../weapons/hitTest';
import { coreWidth } from '../world';

/** What the hunt gives Brakkie. */
export interface BrakkieHost {
  readonly tick: () => number;
  emit(e: SimEvent): void;
  /** Points off (a penalty, negative) counted in the hunt's stats. */
  penalty(points: number): void;
  readonly cameraX: () => number;
  /** The gun is up: a sight or fire held, or a shot within `holdTicks` ticks. */
  gunUp(holdTicks: number): boolean;
  /** A gun with a wide pellet spread (a crate gun like the Voorlaaier) is in hand: he keeps to the
   *  bakkie while it is out. */
  wideGun(): boolean;
  /** Something a player aims at on the plane's layer within `px` of layer x `x`: a live bird on
   *  that plane, a crate, a secret's part, a meerkat, a tell animal, a tin can, a raider… */
  busyNear(plane: DogPlane, x: number, px: number): boolean;
  /** The same, with where the nearest such thing is (layer x), else null. */
  busyAt(plane: DogPlane, x: number, px: number): number | null;
  /** A mid flock foraging or settled whose centre is within `maxDx` screen px of `dx`: its id and
   *  centre's layer x (the one nearest `dx`), else null. */
  barkTarget(dx: number, maxDx: number): { readonly flockId: number; readonly x: number } | null;
  /** One threat (source 'dog') to the flock, from layer x `fromX` on its plane. */
  threaten(flockId: number, fromX: number): void;
  /** A hidden flock of `size` bursts up flushing at layer x of the mid plane (every draw from
   *  the dog's stream); its id, or null: no room (the map's flock or bird caps). */
  flush(x: number, size: number): number | null;
}

export interface BrakkieSystem {
  /** His hit shapes on his layer (none while away or crossing between planes). */
  extras(add: (layerId: string, e: HitExtra) => void): void;
  /**
   * A shot that hit him. `hitTarget`: the shot hit a target elsewhere (then it wasn't aimed at
   * him). `aimOn`: the shot's aim point (a rifle's before the sway) on a layer.
   */
  shot(
    shotId: number,
    hitTarget: boolean,
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
  ): void;
  /** A bird bagged on `plane` at layer (x, y): he may fetch it. */
  bagged(plane: PlaneId, x: number): void;
  step(): void;
  view(): BrakkieView;
  /** Where he stands on the near plane and the room he keeps (layer px), else null (away,
   *  crossing, on the mid plane): the director keeps pop-ups clear of him. */
  nearSpot(): { readonly x: number; readonly halfPx: number } | null;
}

export interface BrakkieGeometry {
  /** Each plane's layer id and scroll factor (near and mid). */
  readonly layers: Readonly<
    Record<DogPlane, { readonly id: string; readonly scrollFactor: number }>
  >;
  /** Each plane's scale (D-049): his size on the mid plane is mid / near. */
  readonly planeScale: Readonly<Record<DogPlane, number>>;
  /** His feet on each plane (design px from the top). */
  readonly groundY: Readonly<Record<DogPlane, number>>;
  /** The side the bakkie stands (-1 left, 1 right). */
  readonly homeSide: 1 | -1;
  /** The hunt's length (ticks): the flush's schedule stays inside it. */
  readonly durationTicks: number;
}

/** Phases where he stands about (or trots) on his own business: he keeps out of the line of
 *  fire in these. */
const STANDING: ReadonlySet<DogPhase> = new Set<DogPhase>(['rest', 'trot', 'bark', 'toDig', 'dig']);

/** The poses drawn standing (the rest are lying low). */
const LOW_POSES: ReadonlySet<DogPose> = new Set<DogPose>(['lie', 'dig']);

interface Cross {
  readonly from: DogPlane;
  readonly fromX: number;
  readonly to: DogPlane;
  readonly toX: number;
}

interface Fetch {
  readonly plane: DogPlane;
  readonly x: number;
  readonly readyTick: number;
  readonly giveUpTick: number;
}

/** The dog as the system keeps him. */
interface Dog {
  readonly id: number;
  phase: DogPhase;
  pose: DogPose;
  plane: DogPlane;
  x: number;
  facing: 1 | -1;
  /** Ticks into the phase, and its length (moving phases: until he gets there). */
  t: number;
  dur: number;
  /** Where a moving phase goes (layer x) and how fast (px a tick on his plane). */
  goal: number;
  speed: number;
  carrying: boolean;
  cross: Cross | null;
  fetch: Fetch | null;
  /** Penalty cooldown (ticks left). */
  cooldown: number;
  barkFlock: number | null;
  nextBark: number;
  nextFlush: number;
  nextCheck: number;
  fetchCheck: number;
  hits: number;
  fetches: number;
  barks: number;
  flushes: number;
}

/** His id in hit results (one dog). */
export const DOG_ID = 1;

export type BrakkieSystemFactory = (
  content: ContentBundle,
  geo: BrakkieGeometry,
  rng: RandomStream,
  host: BrakkieHost,
) => BrakkieSystem;

export const createBrakkieSystem: BrakkieSystemFactory = (content, geo, rng, host) => {
  const B = content.brakkie;
  const ticks = (s: number): number => secondsToTicks(s);
  const rangeTicks = (r: readonly [number, number]): number => ticks(rng.range(r[0], r[1]));
  const checkTicks = Math.max(1, ticks(B.clear.checkSeconds));
  const holdTicks = ticks(B.clear.holdBackSeconds);
  const cooldownTicks = ticks(B.hit.cooldownSeconds);
  /** His size on a plane (hitbox px are at the near plane's scale). */
  const k = (plane: DogPlane): number => geo.planeScale[plane] / geo.planeScale.near;
  /** px a tick on a plane for a near-plane px/s speed. */
  const perTick = (pxPerSecond: number, plane: DogPlane): number => (pxPerSecond * k(plane)) / 60;
  /** The end of the panorama he goes home by this time (the bakkie's side when its way is clear,
   *  else the other end: a trip home never passes a tin can or anything else aimed at). */
  let side: 1 | -1 = geo.homeSide;
  const homeX = (plane: DogPlane, end: 1 | -1 = side): number => {
    const sf = geo.layers[plane].scrollFactor;
    return end < 0 ? -B.homeOffPx * k(plane) : coreWidth(sf) + B.homeOffPx * k(plane);
  };
  const dxOf = (plane: DogPlane, x: number): number =>
    planeToDx(host.cameraX(), geo.layers[plane].scrollFactor, x);

  const dog: Dog = {
    id: DOG_ID,
    phase: 'away',
    pose: 'sit',
    plane: 'near',
    x: homeX('near'),
    facing: geo.homeSide < 0 ? 1 : -1,
    t: 0,
    dur: rangeTicks(B.enterSeconds),
    goal: homeX('near'),
    speed: 0,
    carrying: false,
    cross: null,
    fetch: null,
    cooldown: 0,
    barkFlock: null,
    nextBark: 0,
    nextFlush: 0,
    nextCheck: 0,
    fetchCheck: 0,
    hits: 0,
    fetches: 0,
    barks: 0,
    flushes: 0,
  };
  dog.nextBark = dog.dur + rangeTicks(B.bark.everySeconds);
  dog.nextFlush = rangeTicks(B.flush.firstSeconds);
  /** Test builds only (?brakkiePreview=fetch): when he fetches a bird placed beside him. */
  let demoTick = B.demoFetchSeconds === undefined ? null : ticks(B.demoFetchSeconds);

  const present = (): boolean => dog.phase !== 'away';
  const hittable = (): boolean => present() && dog.phase !== 'cross';
  const idle = (): boolean => dog.phase === 'rest' || dog.phase === 'trot';

  /** His hit shapes (layer coords) for where he is and how he stands. */
  function shapes(): {
    x: number;
    y: number;
    shape: { type: 'ellipse'; rx: number; ry: number };
  }[] {
    const box = LOW_POSES.has(dog.pose) ? B.hitboxes.low : B.hitboxes.stand;
    const s = k(dog.plane);
    const y = geo.groundY[dog.plane];
    return [
      {
        x: dog.x + box.body.ox * s * dog.facing,
        y: y + box.body.oy * s,
        shape: { type: 'ellipse', rx: box.body.rx * s, ry: box.body.ry * s },
      },
      {
        x: dog.x + box.head.ox * s * dog.facing,
        y: y + box.head.oy * s,
        shape: { type: 'ellipse', rx: box.head.r * s, ry: box.head.r * s },
      },
    ];
  }

  function setPhase(phase: DogPhase, pose: DogPose, dur: number): void {
    dog.phase = phase;
    dog.pose = pose;
    dog.t = 0;
    dog.dur = dur;
  }

  /** Off towards layer x `goal` on his plane. */
  function moveTo(phase: DogPhase, pose: DogPose, goal: number, pxPerSecond: number): void {
    setPhase(phase, pose, 0);
    dog.goal = goal;
    dog.speed = perTick(pxPerSecond, dog.plane);
    if (goal !== dog.x) dog.facing = goal > dog.x ? 1 : -1;
  }

  /** The way from where he stands to x is clear too (lesson 21: a tin can on its post or a crate
   *  he would run past is in the line of fire as much as one he stands by). Checked every
   *  clear.pathStepPx within clear.pathPx; where he stands now is not checked (he is leaving it). */
  function pathClear(x: number, from = dog.x, plane: DogPlane = dog.plane): boolean {
    const s = k(plane);
    const step = B.clear.pathStepPx * s;
    const dir = x > from ? 1 : -1;
    for (let p = from + dir * step; dir * (x - p) > 0; p += dir * step)
      if (host.busyNear(plane, p, B.clear.pathPx * s)) return false;
    return true;
  }

  /** A clear spot in view on his plane (null: none of the tries was clear); `away`: only on that
   *  side of where he stands (scampering away from something, never past it). */
  function pickSpot(away: 1 | -1 | 0 = 0, halfPx = B.roam.viewHalfPx): number | null {
    const sf = geo.layers[dog.plane].scrollFactor;
    const s = k(dog.plane);
    const centre = planeCentreX(host.cameraX(), sf);
    const half = halfPx * s;
    const lo = Math.max(centre - half, B.clear.aimPx * s);
    const hi = Math.min(centre + half, coreWidth(sf) - B.clear.aimPx * s);
    if (hi <= lo) return null;
    const inView = dog.x >= lo && dog.x <= hi;
    for (let i = 0; i < B.roam.tries; i++) {
      let x: number;
      if (inView) {
        const dir = away !== 0 ? away : rng.chance(0.5) ? 1 : -1;
        x = dog.x + dir * rng.range(B.roam.stepPx[0], B.roam.stepPx[1]) * s;
        if (away === 0 && (x < lo || x > hi)) x = dog.x - (x - dog.x);
        if (x < lo || x > hi) continue;
      } else {
        x = rng.range(lo, hi);
      }
      if (!host.busyNear(dog.plane, x, B.clear.aimPx * s) && pathClear(x)) return x;
    }
    return null;
  }

  function rest(): void {
    const w = B.roam.restWeights;
    const i = rng.weightedIndex([w.sniff, w.sit, w.lie]);
    const pose: DogPose = i === 1 ? 'sit' : i === 2 ? 'lie' : 'sniff';
    setPhase('rest', pose, rangeTicks(B.roam.restSeconds));
  }

  /** Off to a new spot (a trot; a run when it's far). */
  function roam(): boolean {
    const x = pickSpot();
    if (x === null) return false;
    const far = Math.abs(x - dog.x) > 1200 * k(dog.plane);
    moveTo('trot', far ? 'run' : 'trot', x, far ? B.speeds.runPx : B.speeds.trotPx);
    return true;
  }

  /** Back to the bakkie on his plane, then away for `away` ticks. */
  function goHome(phase: 'carry' | 'bolt', pxPerSecond: number): void {
    const pref = geo.homeSide;
    const other: 1 | -1 = pref < 0 ? 1 : -1;
    side = pathClear(homeX(dog.plane, pref)) || !pathClear(homeX(dog.plane, other)) ? pref : other;
    moveTo(phase, phase === 'carry' ? 'carry' : 'run', homeX(dog.plane), pxPerSecond);
  }

  function arrive(): void {
    dog.plane = 'near';
    dog.x = homeX('near');
    dog.carrying = false;
    dog.fetch = null;
    // In by the end he went home by; if no clear way in from there, by the other end.
    let spot = pickSpot();
    if (spot === null) {
      side = side < 0 ? 1 : -1;
      dog.x = homeX('near');
      spot = pickSpot();
    }
    host.emit({ type: 'brakkieArrived', tick: host.tick(), x: dog.x });
    if (spot !== null) {
      const far = Math.abs(spot - dog.x) > 1200;
      moveTo('trot', far ? 'run' : 'trot', spot, far ? B.speeds.runPx : B.speeds.trotPx);
    } else {
      // Nowhere clear in view: in to the view's edge on his side and look round.
      const sf = geo.layers.near.scrollFactor;
      const edge = planeCentreX(host.cameraX(), sf) + side * B.roam.viewHalfPx;
      moveTo('trot', 'run', edge, B.speeds.runPx);
    }
  }

  function startFetch(f: Fetch): void {
    dog.fetch = null;
    host.emit({
      type: 'brakkieFetchStarted',
      tick: host.tick(),
      plane: f.plane,
      x: f.x,
      y: geo.groundY[f.plane],
    });
    if (f.plane === dog.plane) {
      moveTo('fetch', 'run', f.x, B.speeds.runPx);
      return;
    }
    dog.cross = { from: dog.plane, fromX: dog.x, to: f.plane, toX: f.x };
    setPhase('cross', 'run', ticks(B.fetch.crossSeconds));
    const fromDx = dxOf(dog.plane, dog.x);
    const toDx = dxOf(f.plane, f.x);
    if (toDx !== fromDx) dog.facing = toDx > fromDx ? 1 : -1;
  }

  /** A pending fetch: go once the spot is clear (checked every checkTicks), else give up. */
  function tryFetch(tick: number): void {
    const f = dog.fetch;
    if (f === null || tick < f.readyTick || !idle()) return;
    if (tick > f.giveUpTick) {
      dog.fetch = null;
      return;
    }
    if (tick < dog.fetchCheck) return;
    dog.fetchCheck = tick + checkTicks;
    if (host.busyNear(f.plane, f.x, B.fetch.clearPx * k(f.plane))) return;
    startFetch(f);
  }

  function tryBark(tick: number): void {
    if (tick < dog.nextBark) return;
    if (
      !idle() ||
      dog.plane !== 'near' ||
      dog.fetch !== null ||
      Math.abs(dxOf(dog.plane, dog.x)) > B.roam.viewHalfPx + B.roam.driftPx
    ) {
      dog.nextBark = tick + ticks(B.bark.retrySeconds);
      return;
    }
    const target = host.barkTarget(dxOf(dog.plane, dog.x), B.bark.maxDxPx);
    if (target === null) {
      dog.nextBark = tick + ticks(B.bark.retrySeconds);
      return;
    }
    dog.nextBark = tick + rangeTicks(B.bark.everySeconds);
    dog.barkFlock = target.flockId;
    const flockDx = planeToDx(host.cameraX(), geo.layers.mid.scrollFactor, target.x);
    const dx = dxOf(dog.plane, dog.x);
    if (flockDx !== dx) dog.facing = flockDx > dx ? 1 : -1;
    setPhase('bark', 'bark', ticks(B.bark.barkSeconds));
    dog.barks++;
    host.emit({
      type: 'brakkieBarked',
      tick,
      flockId: target.flockId,
      plane: dog.plane,
      x: dog.x,
    });
  }

  function tryFlush(tick: number): void {
    if (tick < dog.nextFlush) return;
    // Never in the hunt's last stretch: the flock must have time to come down.
    if (tick + ticks(B.flush.retrySeconds) >= geo.durationTicks) {
      dog.nextFlush = geo.durationTicks;
      return;
    }
    if (!idle() || dog.plane !== 'near' || dog.fetch !== null || host.gunUp(holdTicks)) {
      dog.nextFlush = tick + ticks(B.flush.retrySeconds);
      return;
    }
    dog.nextFlush = tick + rangeTicks(B.flush.everySeconds);
    if (!rng.chance(B.flush.chance)) return;
    // He digs where he is if that's near the view's centre, else at a clear spot that is.
    const near = Math.abs(dxOf(dog.plane, dog.x)) <= B.flush.maxDxPx;
    const x = near ? dog.x : pickSpot();
    if (x === null || Math.abs(dxOf(dog.plane, x)) > B.flush.maxDxPx) return;
    if (x === dog.x) setPhase('dig', 'dig', ticks(B.flush.digSeconds));
    else moveTo('toDig', 'run', x, B.speeds.runPx);
  }

  function burst(tick: number): void {
    const midX = planeCentreX(host.cameraX(), geo.layers.mid.scrollFactor) + dxOf(dog.plane, dog.x);
    const size = rng.int(B.flush.size[0], B.flush.size[1]);
    const flockId = host.flush(midX, size);
    if (flockId !== null) dog.flushes++;
    host.emit({ type: 'brakkieFlushed', tick, flockId, x: dog.x });
  }

  function step(): void {
    const tick = host.tick();
    if (dog.cooldown > 0) dog.cooldown--;
    dog.t++;
    // Test builds only: the screenshot spec's fetch, a bird placed beside him (no bag needed).
    if (demoTick !== null && tick >= demoTick && idle() && dog.plane === 'near' && !dog.carrying) {
      demoTick = null;
      const x = dog.x + 260 * k('near') * dog.facing;
      startFetch({ plane: 'near', x, readyTick: tick, giveUpTick: tick });
      return;
    }
    if (dog.plane === 'near' && STANDING.has(dog.phase)) {
      // A wide-spread gun came out: off to the bakkie (no yelp, nothing hit him).
      if (host.wideGun()) {
        dog.fetch = null;
        dog.barkFlock = null;
        goHome('bolt', B.speeds.runPx);
        return;
      }
      // Out of the line of fire: a pop-up or anything a player aims at came up near him — he
      // scampers off to a clear spot (lesson 21).
      if (tick >= dog.nextCheck) {
        dog.nextCheck = tick + checkTicks;
        const busy = host.busyAt(dog.plane, dog.x, B.clear.aimPx * k(dog.plane));
        if (busy !== null) {
          const wide = B.roam.scamperHalfPx;
          const x = pickSpot(busy > dog.x ? -1 : 1, wide) ?? pickSpot(0, wide);
          if (x !== null) {
            dog.barkFlock = null;
            moveTo('trot', 'run', x, B.speeds.runPx);
            return;
          }
        }
        // The view panned and left him outside his band (the screen's corners hold the HUD on
        // every device): he gets up and comes back into it.
        if (
          dog.phase === 'rest' &&
          Math.abs(dxOf(dog.plane, dog.x)) > B.roam.viewHalfPx + B.roam.driftPx &&
          roam()
        )
          return;
      }
    }
    switch (dog.phase) {
      case 'away':
        // He waits at the bakkie while a wide-spread gun is out.
        if (host.wideGun()) dog.t = Math.min(dog.t, dog.dur - 1);
        if (dog.t >= dog.dur) arrive();
        return;
      case 'trot':
      case 'fetch':
      case 'carry':
      case 'bolt':
      case 'toDig': {
        const d = dog.goal - dog.x;
        if (Math.abs(d) > dog.speed) {
          dog.x += Math.sign(d) * dog.speed;
          break;
        }
        dog.x = dog.goal;
        if (dog.phase === 'trot') rest();
        else if (dog.phase === 'fetch') setPhase('pickup', 'sniff', ticks(B.fetch.pickupSeconds));
        else if (dog.phase === 'toDig') setPhase('dig', 'dig', ticks(B.flush.digSeconds));
        else {
          if (dog.phase === 'carry') {
            dog.fetches++;
            host.emit({ type: 'brakkieFetched', tick });
          }
          const away = dog.phase === 'carry' ? B.fetch.awaySeconds : B.hit.awaySeconds;
          dog.plane = 'near';
          dog.x = homeX('near');
          dog.carrying = false;
          dog.fetch = null;
          setPhase('away', 'sit', rangeTicks(away));
          return;
        }
        break;
      }
      case 'cross': {
        if (dog.t < dog.dur || dog.cross === null) return;
        const c = dog.cross;
        dog.cross = null;
        dog.plane = c.to;
        dog.x = c.toX;
        if (dog.carrying) goHome('carry', B.speeds.runPx);
        else setPhase('pickup', 'sniff', ticks(B.fetch.pickupSeconds));
        return;
      }
      case 'pickup':
        if (dog.t < dog.dur) return;
        dog.carrying = true;
        host.emit({ type: 'brakkiePickedUp', tick, plane: dog.plane });
        if (dog.plane === 'near') {
          goHome('carry', B.speeds.runPx);
          return;
        }
        // Out of the flocks' plane at once: back across to the near plane (not hittable while
        // crossing), and home along it (lesson 21: never through the mid flocks).
        {
          const toX =
            planeCentreX(host.cameraX(), geo.layers.near.scrollFactor) + dxOf(dog.plane, dog.x);
          dog.cross = { from: dog.plane, fromX: dog.x, to: 'near', toX };
          setPhase('cross', 'carry', ticks(B.fetch.crossSeconds));
          dog.facing = side;
        }
        return;
      case 'bark':
        if (dog.t === ticks(B.bark.threatAtSeconds) && dog.barkFlock !== null) {
          host.threaten(
            dog.barkFlock,
            planeCentreX(host.cameraX(), geo.layers.mid.scrollFactor) + dxOf(dog.plane, dog.x),
          );
          dog.barkFlock = null;
        }
        if (dog.t >= dog.dur) rest();
        return;
      case 'dig':
        if (dog.t < dog.dur) return;
        burst(tick);
        setPhase('rest', 'bark', ticks(B.bark.barkSeconds));
        return;
      case 'yelp':
        if (dog.t >= dog.dur) goHome('bolt', B.speeds.boltPx);
        return;
      case 'rest':
        if (dog.t >= dog.dur) {
          // While the gun is up he holds still; otherwise off to a new spot.
          if (host.gunUp(holdTicks) || !roam()) dog.t = Math.max(0, dog.dur - checkTicks);
        }
        break;
    }
    if (!idle()) return;
    tryFetch(tick);
    if (!idle()) return;
    tryBark(tick);
    if (!idle()) return;
    tryFlush(tick);
  }

  function extras(add: (layerId: string, e: HitExtra) => void): void {
    if (!hittable()) return;
    const layerId = geo.layers[dog.plane].id;
    for (const sh of shapes()) add(layerId, { kind: 'dog', dogId: dog.id, ...sh });
  }

  function shot(
    shotId: number,
    hitTarget: boolean,
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
  ): void {
    if (!hittable()) return;
    const tick = host.tick();
    const aim = aimOn(geo.layers[dog.plane].id);
    const aimed =
      !hitTarget && shapes().some((sh) => pointInOccluder(aim.x, aim.y, { propId: '', ...sh }));
    let points = 0;
    if (aimed && dog.cooldown === 0) {
      points = -B.hit.penalty;
      dog.cooldown = cooldownTicks;
      host.penalty(points);
    }
    dog.hits++;
    host.emit({
      type: 'brakkieHit',
      tick,
      shotId,
      aimed,
      plane: dog.plane,
      x: dog.x,
      y: geo.groundY[dog.plane],
      points,
    });
    if (dog.phase === 'yelp' || dog.phase === 'bolt') return;
    dog.fetch = null;
    dog.carrying = false;
    dog.barkFlock = null;
    setPhase('yelp', 'yelp', ticks(B.hit.yelpSeconds));
  }

  function bagged(plane: PlaneId, x: number): void {
    if (plane !== 'near' && plane !== 'mid') return;
    if (!B.fetch.planes.includes(plane) || !idle() || dog.fetch !== null || dog.carrying) return;
    if (Math.abs(dxOf(plane, x)) > B.fetch.maxDxPx) return;
    if (!rng.chance(B.fetch.chance)) return;
    const tick = host.tick();
    const ready = tick + ticks(B.fetch.delaySeconds);
    dog.fetch = { plane, x, readyTick: ready, giveUpTick: ready + ticks(B.fetch.waitSeconds) };
    dog.fetchCheck = ready;
  }

  function view(): BrakkieView {
    const c = dog.cross;
    return {
      present: present(),
      phase: dog.phase,
      pose: dog.pose,
      plane: dog.plane,
      layerId: geo.layers[dog.plane].id,
      x: dog.x,
      y: geo.groundY[dog.plane],
      facing: dog.facing,
      scale: k(dog.plane),
      t: dog.t,
      dur: dog.dur,
      carrying: dog.carrying,
      hittable: hittable(),
      cross:
        c === null
          ? null
          : {
              from: c.from,
              fromLayerId: geo.layers[c.from].id,
              fromX: c.fromX,
              fromY: geo.groundY[c.from],
              fromScale: k(c.from),
              to: c.to,
              toLayerId: geo.layers[c.to].id,
              toX: c.toX,
              toY: geo.groundY[c.to],
              toScale: k(c.to),
              p: dog.dur > 0 ? Math.min(1, dog.t / dog.dur) : 1,
            },
      hits: dog.hits,
      fetches: dog.fetches,
      barks: dog.barks,
      flushes: dog.flushes,
    };
  }

  const spot = { x: 0, halfPx: B.clear.aimPx };
  function nearSpot(): { readonly x: number; readonly halfPx: number } | null {
    if (!hittable() || dog.plane !== 'near') return null;
    spot.x = dog.x;
    return spot;
  }

  return { extras, shot, bagged, step, view, nearSpot };
};
