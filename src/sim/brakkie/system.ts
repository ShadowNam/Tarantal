// v1.12 (D-069, GDD §11.3f, Tech §3.12f) Brakkie, Oupa's Jack Russell, as a sim system the hunt
// plugs in. He roams the near plane (and goes onto the mid plane to fetch a bird bagged there),
// barks at a flock now and then (one threat), flushes a hidden flock now and then, and when a shot
// hits him he yelps and bolts to the bakkie: −25 only for a shot aimed at him (D-062/D-063's rule)
// with the weaver nest's cooldown. Never a target, never hurt, never removed.
// v1.17 (D-079, GDD §11.3f) the companion: every bird he delivers pays "Bring!" (+15, × Frenzy ×
// Stampede), every 3rd in a row "Goeie hond!" (+30); the flush is a point ("Staan!": he freezes
// at a hidden flock of 5, springs in after point.seconds); "Mooi punt!" (+20) for 3+ of its birds
// bagged in the flush; Oupa's whistle (a recorded command) springs the point, calls him to heel,
// or sends him back to work; short reactions (a proud hop, a sympathetic head tilt), no points.
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
  /** v1.17 (D-079): a flock of `size` could burst up now — the same caps flush() checks (D-080). */
  canFlush(size: number): boolean;
  /** v1.17 (D-079): an event bonus (× Frenzy × Stampede); the points paid. */
  bonus(id: 'bring' | 'bringStreak' | 'goodPoint', base: number): number;
  /** v1.20 (D-085) the Jag card: the guineafowl of brakkie.json jag.creatures foraging on the
   *  ground (its flock foraging, the bird walking) on the near or mid plane within `maxDx` screen
   *  px of the view's centre, the one nearest screen dx `fromDx` (first by bird order on a tie). */
  jagTarget(
    fromDx: number,
    maxDx: Readonly<Record<DogPlane, number>>,
  ): { readonly birdId: number; readonly plane: DogPlane; readonly x: number } | null;
  /** Where bird `birdId` is now (layer x) while it is still on the ground, else null. */
  jagBird(birdId: number): { readonly plane: DogPlane; readonly x: number } | null;
  /** Catches it: a bag of that bird (its normal score × Frenzy × Stampede), the rest of its
   *  flock flushes. What it paid, or null (it is gone or off the ground). */
  jagCatch(birdId: number): {
    readonly creature: string;
    readonly y: number;
    readonly points: number;
    readonly flockId: number | null;
  } | null;
  /** The card is over before its time (he made maxCatches, was hit, or a wide gun came out). */
  jagEnded(): void;
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
  /** A bird bagged on `plane` at layer x (of flock `flockId`): he may fetch it. */
  bagged(plane: PlaneId, x: number, flockId?: number | null): void;
  /** v1.17 (D-079): every shot's aim point on a layer (the Bring streak breaks for one aimed
   *  close by while he carries a bird), and whether it missed everything. */
  aimed(
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
    miss: boolean,
  ): void;
  /** v1.17 (D-079): something to be proud of (a Whole Flock, Twee Vlieë, Frenzy ×3, a Ver bag). */
  cheer(): void;
  /** v1.17 (D-079): Oupa's whistle. */
  whistle(): void;
  step(): void;
  view(): BrakkieView;
  /** Where he stands on the near plane and the room he keeps (layer px), else null (away,
   *  crossing, on the mid plane): the director keeps pop-ups clear of him. */
  nearSpot(): { readonly x: number; readonly halfPx: number } | null;
  /** v1.20 (D-085): he can take the Jag card now (not bolted from a hit, no wide gun out). */
  canJag(): boolean;
  /** v1.20 (D-085): the Jag card starts (or starts over): up to `maxCatches`. */
  jag(maxCatches: number): void;
  /** v1.20 (D-085): the card's time ran out. */
  jagStop(): void;
  /** v1.20 (D-085): the card's clock holds now (he carries a catch home or is at the bakkie). */
  jagHeld(): boolean;
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
const STANDING: ReadonlySet<DogPhase> = new Set<DogPhase>([
  'rest',
  'trot',
  'bark',
  'toDig',
  'dig',
  'point',
  'toHeel',
  'heel',
  'react',
]);

/** The poses drawn standing (the rest are lying low; v1.17: the point has its own box). */
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
  /** v1.16 (D-078): set when he first looks at it, free to go (its wait runs from then: a bird
   *  queued behind others waits for its turn). */
  giveUpTick: number | null;
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
  /** v1.16 (D-078): the birds he means to fetch, in the order they fell (the first is next). */
  readonly queue: Fetch[];
  /** Bolted from a hit: he fetches nothing until he is back. */
  shy: boolean;
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
  /** v1.17 (D-079): the point's flock spot on the mid plane (layer x), while on point/springing. */
  pointX: number | null;
  /** The flock he pointed and its birds bagged so far (Mooi punt), until goodUntil. */
  pointFlock: number | null;
  pointBags: number;
  goodUntil: number;
  streak: number;
  bestStreak: number;
  points: number;
  goodPoints: number;
  /** Shots in a row that missed everything (the head tilt). */
  misses: number;
  react: 'proud' | 'tilt' | null;
  nextReact: number;
  reactions: number;
  nextWhistle: number;
  whistles: number;
  /** v1.20 (D-085) the Jag card: running, its catches and cap, the bird he is after, when he
   *  next looks for one, every catch this hunt, and a pounce begun while the card ran. */
  jagOn: boolean;
  jagCatches: number;
  jagMax: number;
  jagBird: number | null;
  nextLook: number;
  catches: number;
  pounceLive: boolean;
  queuedTick: number | null;
  fetchTick: number | null;
  catchPoints: number;
  /** The bird he carries is a catch (not a fetch). */
  caught: boolean;
  /** The bird he is running out for (back to the queue if he must give the run up). */
  fetching: Fetch | null;
  /** v1.20 review: the caught bird's flock still to be threatened (its id, the catch's layer x on
   *  the mid plane, the next threat's tick and how many are left). */
  alarm: { flockId: number; x: number; next: number; left: number } | null;
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
  /** v1.17: set while the whistle sends him (v1.20, D-085: tryFetch skips the bird's delay). */
  let sent = false;
  const cooldownTicks = ticks(B.hit.cooldownSeconds);
  const J = B.jag;
  const lookTicks = Math.max(1, ticks(J.lookSeconds));
  const pounceTicks = Math.max(1, ticks(J.pounceSeconds));
  /** The card's reach by plane (screen px from the view's centre): the near plane in view. */
  const reach = { near: J.nearMaxDxPx, mid: J.maxDxPx } as const;
  /** A plane's px against the near plane's (his speeds, rooms and roaming px are near-plane px). */
  const k = (plane: DogPlane): number => geo.planeScale[plane] / geo.planeScale.near;
  /** v1.17b (D-080): his body's size on a plane (hit box px are near-plane px at sizeMul 1). */
  const size = (plane: DogPlane): number => k(plane) * B.sizeMul;
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
    queue: [],
    shy: false,
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
    pointX: null,
    pointFlock: null,
    pointBags: 0,
    goodUntil: 0,
    streak: 0,
    bestStreak: 0,
    points: 0,
    goodPoints: 0,
    misses: 0,
    react: null,
    nextReact: 0,
    reactions: 0,
    nextWhistle: 0,
    whistles: 0,
    jagOn: false,
    jagCatches: 0,
    jagMax: 0,
    jagBird: null,
    nextLook: 0,
    catches: 0,
    pounceLive: false,
    queuedTick: null,
    fetchTick: null,
    catchPoints: 0,
    caught: false,
    fetching: null,
    alarm: null,
  };
  dog.nextBark = dog.dur + rangeTicks(B.bark.everySeconds);
  dog.nextFlush = rangeTicks(B.flush.firstSeconds);
  /** Test builds only (?brakkiePreview=fetch): when he fetches a bird placed beside him. */
  let demoTick = B.demoFetchSeconds === undefined ? null : ticks(B.demoFetchSeconds);
  /** Test builds only (?brakkiePreview=bag): when a bird joins his queue beside him. */
  let demoBag = B.demoBagSeconds === undefined ? null : ticks(B.demoBagSeconds);
  /** Test builds only (?brakkiePreview=react): when he does a proud hop. */
  let demoProud = B.demoProudSeconds === undefined ? null : ticks(B.demoProudSeconds);

  const present = (): boolean => dog.phase !== 'away';
  const hittable = (): boolean => present() && dog.phase !== 'cross';
  const idle = (): boolean => dog.phase === 'rest' || dog.phase === 'trot';

  /** His hit shapes (layer coords) for where he is and how he stands. */
  function shapes(): {
    x: number;
    y: number;
    shape: { type: 'ellipse'; rx: number; ry: number };
  }[] {
    const box =
      dog.pose === 'point'
        ? B.hitboxes.point
        : LOW_POSES.has(dog.pose)
          ? B.hitboxes.low
          : B.hitboxes.stand;
    const s = size(dog.plane);
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
    // The point's flock spot lives only while he is on point.
    if (phase !== 'point') dog.pointX = null;
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

  /** v1.20 review: a run on the near plane (a fetch, a carry home) is clear when its way is
   *  (pathClear) and no live mid-plane bird is over it on screen (within clear.pathPx across, in
   *  view): shots at a bird low on the mid ground rain pellets on whatever runs under it. */
  function runClear(x: number): boolean {
    if (!pathClear(x)) return false;
    if (dog.plane !== 'near') return true;
    const step = B.clear.pathStepPx;
    const dir = x > dog.x ? 1 : -1;
    const midCentre = planeCentreX(host.cameraX(), geo.layers.mid.scrollFactor);
    for (let p = dog.x + dir * step; dir * (x - p) > 0; p += dir * step) {
      const dx = dxOf('near', p);
      if (Math.abs(dx) > B.roam.scamperHalfPx + B.clear.pathPx) continue;
      if (host.busyNear('mid', midCentre + dx, B.clear.pathPx)) return false;
    }
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
      const facing: 1 | -1 = x > dog.x ? 1 : x < dog.x ? -1 : dog.facing;
      if (!host.busyNear(dog.plane, x, B.clear.aimPx * s) && pathClear(x) && !underGun(x, facing))
        return x;
    }
    return null;
  }

  /** v1.13 polish: his head at layer x facing that way is in the gun's barrel on screen (either
   *  hand's stripe; the near plane only: on the mid plane he is above the gun). */
  function underGun(x: number, facing: 1 | -1): boolean {
    if (dog.plane !== 'near') return false;
    const hd = Math.abs(dxOf('near', x) + B.hitboxes.stand.head.ox * B.sizeMul * facing);
    return hd >= B.roam.gunStripePx[0] && hd <= B.roam.gunStripePx[1];
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
    // v1.16 (D-078): one draw always (a fixed order in the stream): he runs about now and then.
    const run = rng.chance(B.roam.runChance);
    const far = run || Math.abs(x - dog.x) > B.speeds.runBeyondPx * k(dog.plane);
    moveTo('trot', far ? 'run' : 'trot', x, far ? B.speeds.runPx : B.speeds.trotPx);
    return true;
  }

  /** Back to the bakkie on his plane, then away for `away` ticks. */
  function goHome(phase: 'carry' | 'bolt', pxPerSecond: number): void {
    const pref = geo.homeSide;
    const other: 1 | -1 = pref < 0 ? 1 : -1;
    // v1.20 review: a carry takes the end whose run is clear of the mid birds over it too.
    const clear = phase === 'carry' ? runClear : (x: number): boolean => pathClear(x);
    side = clear(homeX(dog.plane, pref)) || !clear(homeX(dog.plane, other)) ? pref : other;
    moveTo(phase, phase === 'carry' ? 'carry' : 'run', homeX(dog.plane), pxPerSecond);
  }

  function arrive(): void {
    dog.plane = 'near';
    dog.x = homeX('near');
    dog.carrying = false;
    dog.shy = false;
    // In by the end he went home by; if no clear way in from there, by the other end.
    let spot = pickSpot();
    if (spot === null) {
      side = side < 0 ? 1 : -1;
      dog.x = homeX('near');
      spot = pickSpot();
    }
    host.emit({ type: 'brakkieArrived', tick: host.tick(), x: dog.x });
    if (spot !== null) {
      // Intentionally unscaled: he always comes in on the near plane (scale 1), so this is the
      // same threshold as roam()'s there.
      const far = Math.abs(spot - dog.x) > B.speeds.runBeyondPx;
      moveTo('trot', far ? 'run' : 'trot', spot, far ? B.speeds.runPx : B.speeds.trotPx);
    } else {
      // Nowhere clear in view: in to the view's edge on his side and look round.
      const sf = geo.layers.near.scrollFactor;
      // D-080: far enough out that his true-size head (facing in) stays outside the gun's stripe.
      const out = Math.max(
        B.roam.viewHalfPx,
        B.roam.gunStripePx[1] + B.hitboxes.stand.head.ox * B.sizeMul + B.roam.stripeMarginPx,
      );
      const edge = planeCentreX(host.cameraX(), sf) + side * out;
      moveTo('trot', 'run', edge, B.speeds.runPx);
    }
  }

  /** Home with the bird in his mouth: along the near plane, or from the mid plane back across to
   *  the near plane first (not hittable while crossing; lesson 21: never through the mid flocks). */
  function carryHome(): void {
    if (dog.plane === 'near') {
      goHome('carry', carrySpeed());
      return;
    }
    toNear(true);
  }

  /** v1.20 (D-085): a catch of the Jag card's goes home at his sprint (he is keen to get back
   *  out); a fetched bird at his run. */
  function carrySpeed(): number {
    return dog.caught ? J.sprintPx : B.speeds.runPx;
  }

  /** Back across from the mid plane to the near plane under where he is on screen. */
  function toNear(carrying: boolean): void {
    const toX = planeCentreX(host.cameraX(), geo.layers.near.scrollFactor) + dxOf(dog.plane, dog.x);
    dog.cross = { from: dog.plane, fromX: dog.x, to: 'near', toX };
    setPhase('cross', carrying ? 'carry' : 'run', ticks(B.fetch.crossSeconds));
    if (carrying) dog.facing = side;
    else if (toX !== dog.x) dog.facing = toX > dog.x ? 1 : -1;
  }

  // --- v1.20 (D-085) the Jag card -----------------------------------------------------------

  function canJag(): boolean {
    return !dog.shy && dog.phase !== 'yelp' && dog.phase !== 'bolt' && !host.wideGun();
  }

  function jag(maxCatches: number): void {
    const tick = host.tick();
    dog.jagOn = true;
    dog.jagCatches = 0;
    dog.jagMax = maxCatches;
    dog.nextLook = tick;
    // Off his heel, a bark or a reaction at once: he looks round for a bird.
    if (
      present() &&
      dog.plane === 'near' &&
      (dog.phase === 'heel' ||
        dog.phase === 'toHeel' ||
        dog.phase === 'react' ||
        dog.phase === 'bark')
    ) {
      dog.react = null;
      dog.barkFlock = null;
      setPhase('rest', 'sniff', lookTicks);
    }
    host.emit({ type: 'brakkieJagStarted', tick, maxCatches });
  }

  /** The card is over: `host` true when the sim must end its power-up (not its own timer). */
  function endJag(why: 'time' | 'max' | 'hit' | 'gun'): void {
    if (!dog.jagOn) return;
    dog.jagOn = false;
    host.emit({ type: 'brakkieJagEnded', tick: host.tick(), catches: dog.jagCatches, why });
    if (why !== 'time') host.jagEnded();
    if (why === 'gun') dog.pounceLive = false;
    // Mid-chase he gives it up (a pounce already in the air still lands).
    if (dog.phase === 'hunt') giveUpHunt();
  }

  function jagStop(): void {
    endJag('time');
  }

  /** The card's clock counts his hunting time only: looking round (idle on the near plane),
   *  crossing out for a bird, the chase and the pounce. It holds while he carries, is at the
   *  bakkie, or fetches a shot bird (he hunts again once that is done). */
  function jagHeld(): boolean {
    if (!dog.jagOn) return false;
    if (dog.carrying) return true;
    if (dog.phase === 'hunt' || dog.phase === 'pounce') return false;
    if (dog.phase === 'cross') return dog.jagBird === null;
    return !idle();
  }

  /** Off after a foraging guineafowl (from idle on the near plane, every lookSeconds). */
  function tryJag(tick: number): void {
    if (!dog.jagOn || !idle() || dog.plane !== 'near' || dog.carrying || tick < dog.nextLook)
      return;
    dog.nextLook = tick + lookTicks;
    const t = host.jagTarget(dxOf('near', dog.x), reach);
    if (t === null) return;
    dog.jagBird = t.birdId;
    dog.barkFlock = null;
    if (t.plane === 'near') {
      moveTo('hunt', 'run', t.x, J.sprintPx);
      return;
    }
    dog.cross = { from: 'near', fromX: dog.x, to: t.plane, toX: t.x };
    setPhase('cross', 'run', ticks(B.fetch.crossSeconds));
    const fromDx = dxOf('near', dog.x);
    const toDx = dxOf(t.plane, t.x);
    if (toDx !== fromDx) dog.facing = toDx > fromDx ? 1 : -1;
  }

  /** The bird got away (took off, or was shot): back to the near plane, or a look round. */
  function giveUpHunt(): void {
    dog.jagBird = null;
    if (dog.plane === 'mid') toNear(false);
    else setPhase('rest', 'sniff', lookTicks);
  }

  function huntStep(tick: number): void {
    const b = dog.jagBird === null ? null : host.jagBird(dog.jagBird);
    if (b === null || b.plane !== dog.plane || !dog.jagOn) {
      giveUpHunt();
      return;
    }
    const d = b.x - dog.x;
    if (d !== 0) dog.facing = d > 0 ? 1 : -1;
    if (Math.abs(d) <= J.pouncePx * k(dog.plane)) {
      // The pounce: a crouch and a leap that lands where the bird is now.
      dog.goal = b.x;
      dog.speed = Math.abs(d) / pounceTicks;
      dog.pounceLive = true;
      setPhase('pounce', 'pounce', pounceTicks);
      host.emit({
        type: 'brakkiePounced',
        tick,
        birdId: dog.jagBird ?? -1,
        plane: dog.plane,
        x: dog.x,
      });
      return;
    }
    dog.x += Math.sign(d) * Math.min(Math.abs(d), perTick(J.sprintPx, dog.plane));
  }

  /** The caught bird's flock: one threat every alarmEverySeconds until alarmThreats are heard. */
  function alarmStep(tick: number): void {
    const a = dog.alarm;
    if (a === null || tick < a.next) return;
    host.threaten(a.flockId, a.x);
    a.left--;
    a.next = tick + ticks(J.alarmEverySeconds);
    if (a.left <= 0) dog.alarm = null;
  }

  function pounceStep(tick: number): void {
    const d = dog.goal - dog.x;
    dog.x += Math.sign(d) * Math.min(Math.abs(d), dog.speed);
    if (dog.t < dog.dur) return;
    const id = dog.jagBird;
    dog.jagBird = null;
    const b = id === null ? null : host.jagBird(id);
    const inReach =
      b !== null && b.plane === dog.plane && Math.abs(b.x - dog.x) <= J.reachPx * k(dog.plane);
    const caught = dog.pounceLive && inReach && id !== null ? host.jagCatch(id) : null;
    dog.pounceLive = false;
    if (caught === null || id === null) {
      giveUpHunt();
      return;
    }
    dog.jagCatches++;
    dog.catches++;
    dog.catchPoints += caught.points;
    dog.carrying = true;
    dog.caught = true;
    host.emit({
      type: 'brakkieCaught',
      tick,
      birdId: id,
      creature: caught.creature,
      plane: dog.plane,
      x: dog.x,
      y: caught.y,
      catches: dog.jagCatches,
      points: caught.points,
    });
    if (caught.flockId !== null) {
      // The flock threatened from the catch (its layer x on the mid plane, as the bark's).
      const midX =
        dog.plane === 'mid'
          ? dog.x
          : planeCentreX(host.cameraX(), geo.layers.mid.scrollFactor) + dxOf(dog.plane, dog.x);
      dog.alarm = { flockId: caught.flockId, x: midX, next: tick, left: J.alarmThreats };
      alarmStep(tick);
    }
    if (dog.jagCatches >= dog.jagMax) endJag('max');
    carryHome();
  }

  function startFetch(f: Fetch): void {
    dog.fetchTick = host.tick();
    dog.fetching = f;
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

  /** Birds whose spot stayed busy too long are left. */
  function dropStale(tick: number): void {
    for (let i = dog.queue.length - 1; i >= 0; i--) {
      const g = dog.queue[i]?.giveUpTick ?? null;
      if (g !== null && g < tick) dog.queue.splice(i, 1);
    }
  }

  /** The next bird in the queue: go once its spot is clear (checked every checkTicks). A bird
   *  whose spot stays busy is passed over for the next one that is clear. */
  function tryFetch(tick: number): void {
    dropStale(tick);
    if (dog.queue.length === 0 || !idle() || tick < dog.fetchCheck) return;
    dog.fetchCheck = tick + checkTicks;
    // v1.20 (D-085): he goes fetch.delaySeconds after the bag, shooting or not (v1.17's lull rule
    // is gone); sent with the whistle ("Soek!") he goes at once.
    for (let i = 0; i < dog.queue.length; i++) {
      const f = dog.queue[i];
      if (f === undefined || (!sent && tick < f.readyTick)) continue;
      f.giveUpTick ??= tick + ticks(B.fetch.waitSeconds);
      if (host.busyNear(f.plane, f.x, B.fetch.clearPx * k(f.plane))) continue;
      // v1.20 review: on his own plane the way there must be clear too (a run past a live flock
      // is a run through the line of fire): a blocked way is passed over like a busy spot.
      if (f.plane === dog.plane && !runClear(f.x)) continue;
      dog.queue.splice(i, 1);
      startFetch(f);
      return;
    }
  }

  function tryBark(tick: number): void {
    if (tick < dog.nextBark) return;
    if (
      !idle() ||
      dog.plane !== 'near' ||
      dog.queue.length > 0 ||
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
    if (!idle() || dog.plane !== 'near' || dog.queue.length > 0 || host.gunUp(holdTicks)) {
      dog.nextFlush = tick + ticks(B.flush.retrySeconds);
      return;
    }
    dog.nextFlush = tick + rangeTicks(B.flush.everySeconds);
    if (!rng.chance(B.flush.chance)) return;
    // v1.17 (D-079): only at a flock that can be there (room under the flock and bird caps, D-080).
    if (!host.canFlush(B.point.size)) return;
    // He points from where he is if that's near the view's centre, else from a clear spot that is.
    const near = Math.abs(dxOf(dog.plane, dog.x)) <= B.flush.maxDxPx;
    const x = near ? dog.x : pickSpot();
    if (x === null || Math.abs(dxOf(dog.plane, x)) > B.flush.maxDxPx) return;
    if (x === dog.x) startPoint(tick);
    else moveTo('toDig', 'run', x, B.speeds.runPx);
  }

  /** v1.17 (D-079): "Staan!" — he freezes on point at the hidden flock in front of him (towards
   *  the view's centre, the flock's spot on the mid ground ahead of his nose). */
  function startPoint(tick: number): void {
    const dx = dxOf(dog.plane, dog.x);
    if (dx !== 0) dog.facing = dx > 0 ? -1 : 1;
    const midCentre = planeCentreX(host.cameraX(), geo.layers.mid.scrollFactor);
    const ahead = B.point.aheadPx * dog.facing;
    dog.pointX = midCentre + dx + ahead;
    setPhase('point', 'point', ticks(B.point.seconds));
    host.emit({
      type: 'brakkiePointed',
      tick,
      x: dog.x,
      markerX: dog.pointX,
      markerY: geo.groundY.mid,
    });
  }

  function burst(tick: number, whistled: boolean): void {
    const midX =
      dog.pointX ??
      planeCentreX(host.cameraX(), geo.layers.mid.scrollFactor) + dxOf(dog.plane, dog.x);
    dog.pointX = null;
    const flockId = host.flush(midX, B.point.size);
    if (flockId !== null) {
      dog.flushes++;
      dog.pointFlock = flockId;
      dog.pointBags = 0;
      dog.goodUntil = tick + ticks(B.point.goodPoint.withinSeconds);
    }
    host.emit({
      type: 'brakkieFlushed',
      tick,
      flockId,
      x: dog.x,
      pointed: true,
      ...(whistled ? { whistled: true as const } : {}),
    });
  }

  /** Into the spring: a short bound towards the flock, then it bursts up. */
  function spring(): void {
    setPhase('spring', 'run', ticks(B.point.springSeconds));
  }

  /** v1.17 (D-079): a reaction (only from idle, at most one per react.minGapSeconds). */
  function tryReact(kind: 'proud' | 'tilt'): boolean {
    const tick = host.tick();
    if (!present() || !idle() || dog.plane !== 'near' || tick < dog.nextReact) return false;
    dog.react = kind;
    dog.reactions++;
    dog.nextReact = tick + ticks(B.react.minGapSeconds);
    setPhase('react', kind, ticks(B.react.seconds));
    host.emit({ type: 'brakkieReacted', tick, kind });
    return true;
  }

  /** The heel spot: the view's bakkie side on the near plane (inside his band, off the gun). */
  function heelX(): number {
    const sf = geo.layers.near.scrollFactor;
    return planeCentreX(host.cameraX(), sf) + geo.homeSide * B.whistle.heelDxPx;
  }

  /** A bird in his queue is down (v1.20, D-085: the whistle sends him for it at once). */
  function birdWaiting(): boolean {
    return dog.queue.length > 0;
  }

  /** What the whistle would do now (null: nothing). */
  function whistleAction(): 'spring' | 'heel' | 'seek' | null {
    if (!present() || dog.plane !== 'near') return null;
    switch (dog.phase) {
      case 'point':
        return 'spring';
      case 'rest':
      case 'trot':
      case 'bark':
      case 'react':
      case 'toDig':
        // A bird is waiting: "Soek!" sends him for it now (a gundog sent on the whistle).
        return birdWaiting() ? 'seek' : 'heel';
      case 'toHeel':
      case 'heel':
        return 'seek';
      default:
        return null;
    }
  }

  function whistle(): void {
    const tick = host.tick();
    if (tick < dog.nextWhistle) return;
    const action = whistleAction();
    if (action === null) return;
    dog.nextWhistle = tick + ticks(B.whistle.cooldownSeconds);
    dog.whistles++;
    host.emit({ type: 'brakkieWhistled', tick, action });
    if (action === 'spring') {
      burst(tick, true);
      spring();
      return;
    }
    dog.barkFlock = null;
    dog.react = null;
    if (action === 'heel') {
      dog.pointX = null;
      const x = heelX();
      if (Math.abs(x - dog.x) < 1) setPhase('heel', 'sit', ticks(B.whistle.heelSeconds));
      else moveTo('toHeel', 'trot', x, B.speeds.runPx);
      return;
    }
    // "Soek!": a waiting bird first (sent: no lull needed), else back to work at once.
    if (birdWaiting()) {
      rest();
      sent = true;
      dog.fetchCheck = tick;
      tryFetch(tick);
      sent = false;
      if (dog.phase === 'rest') dog.t = Math.max(0, dog.dur - checkTicks);
      return;
    }
    if (!roam()) rest();
  }

  /** v1.17 (D-079): a delivery — "Bring!" and the streak. */
  function delivered(tick: number): void {
    dog.fetches++;
    dog.streak++;
    dog.bestStreak = Math.max(dog.bestStreak, dog.streak);
    let points = host.bonus('bring', B.bring.points);
    if (dog.streak % B.bring.streakEvery === 0)
      points += host.bonus('bringStreak', B.bring.streakPoints);
    dog.points += points;
    host.emit({ type: 'brakkieFetched', tick, streak: dog.streak, points });
  }

  function breakStreak(why: 'hit' | 'aim'): void {
    if (dog.streak === 0) return;
    host.emit({ type: 'brakkieStreakBroken', tick: host.tick(), streak: dog.streak, why });
    dog.streak = 0;
  }

  function step(): void {
    const tick = host.tick();
    if (dog.cooldown > 0) dog.cooldown--;
    dog.t++;
    // Test builds only: the screenshot spec's fetch, a bird placed beside him (no bag needed).
    if (demoProud !== null && tick >= demoProud && tryReact('proud')) demoProud = null;
    // Test builds only: a bag beside him, towards the view's centre, through the real queue.
    if (
      demoBag !== null &&
      tick >= demoBag &&
      dog.phase === 'rest' &&
      dog.plane === 'near' &&
      !dog.carrying &&
      Math.abs(dxOf('near', dog.x)) <= B.roam.viewHalfPx
    ) {
      demoBag = null;
      const toCentre = dxOf('near', dog.x) > 0 ? -1 : 1;
      bagged('near', dog.x + 260 * k('near') * toCentre);
    }
    if (demoTick !== null && tick >= demoTick && idle() && dog.plane === 'near' && !dog.carrying) {
      demoTick = null;
      const x = dog.x + 260 * k('near') * dog.facing;
      startFetch({ plane: 'near', x, readyTick: tick, giveUpTick: tick });
      // The screenshot's fetch is never given up (it isn't from the queue).
      dog.fetching = null;
      return;
    }
    alarmStep(tick);
    // v1.20 review: a wide-spread gun ends the Jag card whatever he is doing.
    if (dog.jagOn && host.wideGun()) endJag('gun');
    // v1.20 review: out of the line of fire while he runs out or carries on the near plane: a run
    // out that meets something being aimed at (a pop-up, a flock walking in) is given up (the bird
    // goes back to the queue) and he scampers off; a carry home takes the clear end.
    if (
      dog.plane === 'near' &&
      (dog.phase === 'fetch' || dog.phase === 'carry') &&
      tick >= dog.nextCheck
    ) {
      dog.nextCheck = tick + checkTicks;
      if (dog.phase === 'fetch' && dog.fetching !== null) {
        const busy = host.busyAt('near', dog.x, B.clear.aimPx * k('near'));
        if (busy !== null || !runClear(dog.goal)) {
          if (dog.fetching !== null) dog.queue.unshift(dog.fetching);
          dog.fetching = null;
          const wide = B.roam.scamperHalfPx;
          const away: 1 | -1 = busy !== null && busy > dog.x ? -1 : 1;
          const x = pickSpot(away, wide) ?? pickSpot(0, wide);
          if (x !== null) moveTo('trot', 'run', x, B.speeds.runPx);
          else rest();
          return;
        }
      } else if (dog.phase === 'carry' && !runClear(dog.goal)) goHome('carry', carrySpeed());
    }
    if (dog.plane === 'near' && STANDING.has(dog.phase)) {
      // A wide-spread gun came out: off to the bakkie (no yelp, nothing hit him).
      if (host.wideGun()) {
        endJag('gun');
        dog.queue.length = 0;
        dog.fetching = null;
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
          (Math.abs(dxOf(dog.plane, dog.x)) > B.roam.viewHalfPx + B.roam.driftPx ||
            underGun(dog.x, dog.facing)) &&
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
      case 'toDig':
      case 'toHeel': {
        const d = dog.goal - dog.x;
        if (Math.abs(d) > dog.speed) {
          dog.x += Math.sign(d) * dog.speed;
          break;
        }
        dog.x = dog.goal;
        if (dog.phase === 'trot') rest();
        else if (dog.phase === 'fetch') {
          dog.fetching = null;
          setPhase('pickup', 'sniff', ticks(B.fetch.pickupSeconds));
        } else if (dog.phase === 'toDig') startPoint(tick);
        else if (dog.phase === 'toHeel') setPhase('heel', 'sit', ticks(B.whistle.heelSeconds));
        else {
          if (dog.phase === 'carry') delivered(tick);
          // More birds waiting: he drops this one and is straight back out for the next.
          dropStale(tick);
          const away =
            dog.phase !== 'carry'
              ? B.hit.awaySeconds
              : dog.queue.length > 0 || dog.jagOn
                ? B.fetch.backSeconds
                : B.fetch.awaySeconds;
          dog.plane = 'near';
          dog.x = homeX('near');
          dog.carrying = false;
          dog.caught = false;
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
        if (dog.carrying) goHome('carry', carrySpeed());
        // v1.20 (D-085): across for the Jag card's bird, or back from the mid plane without one.
        else if (dog.jagBird !== null && c.to === 'mid') setPhase('hunt', 'run', 0);
        else if (c.to === 'near') setPhase('rest', 'sniff', lookTicks);
        else {
          dog.fetching = null;
          setPhase('pickup', 'sniff', ticks(B.fetch.pickupSeconds));
        }
        return;
      }
      case 'pickup':
        if (dog.t < dog.dur) return;
        dog.carrying = true;
        host.emit({ type: 'brakkiePickedUp', tick, plane: dog.plane });
        carryHome();
        return;
      case 'hunt':
        huntStep(tick);
        return;
      case 'pounce':
        pounceStep(tick);
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
      case 'point':
        if (dog.t < dog.dur) return;
        burst(tick, false);
        spring();
        return;
      case 'spring':
        if (dog.t < dog.dur) return;
        setPhase('rest', 'bark', ticks(B.bark.barkSeconds));
        return;
      case 'heel':
        if (dog.t < dog.dur) return;
        if (!roam()) rest();
        return;
      case 'react':
        if (dog.t < dog.dur) return;
        dog.react = null;
        rest();
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
    // v1.20 (D-085): the Jag card first; no bark or point while it runs.
    tryJag(tick);
    if (!idle()) return;
    tryFetch(tick);
    if (!idle() || dog.jagOn) return;
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
    breakStreak('hit');
    // v1.20 (D-085): any hit ends the Jag card (aimed at him: −25 as ever).
    dog.jagBird = null;
    dog.pounceLive = false;
    endJag('hit');
    if (dog.phase === 'yelp' || dog.phase === 'bolt') return;
    // On point: the flock was there all the same — it bursts up as he yelps.
    if (dog.phase === 'point') burst(tick, false);
    dog.pointX = null;
    dog.react = null;
    dog.queue.length = 0;
    dog.fetching = null;
    dog.shy = true;
    dog.carrying = false;
    dog.caught = false;
    dog.barkFlock = null;
    setPhase('yelp', 'yelp', ticks(B.hit.yelpSeconds));
  }

  /** v1.16 (D-078): a bird down in reach joins his queue (whatever he is doing, unless he bolted
   *  from a hit or a wide-spread gun is out); he fetches them one at a time. */
  function bagged(plane: PlaneId, x: number, flockId: number | null = null): void {
    // v1.17 (D-079): "Mooi punt!" — 3+ birds of the flock he pointed, bagged in its flush.
    if (flockId !== null && flockId === dog.pointFlock && host.tick() <= dog.goodUntil) {
      dog.pointBags++;
      if (dog.pointBags === B.point.goodPoint.bags) {
        dog.goodPoints++;
        dog.points += host.bonus('goodPoint', B.point.goodPoint.points);
        dog.pointFlock = null;
      }
    }
    if (plane !== 'near' && plane !== 'mid') return;
    if (!B.fetch.planes.includes(plane) || dog.shy || host.wideGun()) return;
    if (dog.phase === 'yelp' || dog.phase === 'bolt') return;
    if (dog.queue.length >= B.fetch.queueMax) return;
    if (Math.abs(dxOf(plane, x)) > B.fetch.maxDxPx) return;
    // v1.17 (D-079): the ready rule — no chance roll: every bird in reach joins the queue (the
    // same for every Daily player).
    const ready = host.tick() + ticks(B.fetch.delaySeconds);
    dog.queue.push({ plane, x, readyTick: ready, giveUpTick: null });
    dog.queuedTick = host.tick();
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
      scale: size(dog.plane),
      sizeMul: B.sizeMul,
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
              fromScale: size(c.from),
              to: c.to,
              toLayerId: geo.layers[c.to].id,
              toX: c.toX,
              toY: geo.groundY[c.to],
              toScale: size(c.to),
              p: dog.dur > 0 ? Math.min(1, dog.t / dog.dur) : 1,
            },
      hits: dog.hits,
      queued: dog.queue.length,
      fetches: dog.fetches,
      barks: dog.barks,
      flushes: dog.flushes,
      point:
        dog.pointX === null
          ? null
          : {
              layerId: geo.layers.mid.id,
              x: dog.pointX,
              y: geo.groundY.mid,
              scale: k('mid'),
            },
      streak: dog.streak,
      bestStreak: dog.bestStreak,
      whistle: host.tick() < dog.nextWhistle ? null : whistleAction(),
      react: dog.react,
      points: dog.points,
      goodPoints: dog.goodPoints,
      reactions: dog.reactions,
      whistles: dog.whistles,
      jag: dog.jagOn ? { catches: dog.jagCatches, maxCatches: dog.jagMax } : null,
      catches: dog.catches,
      queuedTick: dog.queuedTick,
      fetchTick: dog.fetchTick,
      catchPoints: dog.catchPoints,
      jagBird: dog.jagBird,
    };
  }

  function aimed(
    aimOn: (layerId: string) => { readonly x: number; readonly y: number },
    miss: boolean,
  ): void {
    if (miss) {
      dog.misses++;
      if (dog.misses >= B.react.tiltMisses && tryReact('tilt')) dog.misses = 0;
    } else dog.misses = 0;
    if (!dog.carrying || !present()) return;
    const a = aimOn(geo.layers[dog.plane].id);
    const s = size(dog.plane);
    const box = B.hitboxes.stand.body;
    const dx = a.x - (dog.x + box.ox * s * dog.facing);
    const dy = a.y - (geo.groundY[dog.plane] + box.oy * s);
    const r = B.clear.aimPx * k(dog.plane);
    if (dx * dx + dy * dy <= r * r) breakStreak('aim');
  }

  function cheer(): void {
    tryReact('proud');
  }

  const spot = { x: 0, halfPx: B.clear.aimPx };
  function nearSpot(): { readonly x: number; readonly halfPx: number } | null {
    if (!hittable() || dog.plane !== 'near') return null;
    spot.x = dog.x;
    return spot;
  }

  return {
    extras,
    shot,
    bagged,
    aimed,
    cheer,
    whistle,
    step,
    view,
    nearSpot,
    canJag,
    jag,
    jagStop,
    jagHeld,
  };
};
