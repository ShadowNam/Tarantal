// v1.13 (D-075, GDD §11.3g, Tech §3.12g) the veld cameos as a sim system the hunt plugs in:
// non-target wildlife that walks the mid plane (a warthog family, an ostrich, springbok, gemsbok)
// or comes out of the near grass (a dung beetle, a leopard tortoise), and the Okavango's far
// elephants, who answer a flush near their herd. A pellet on one plays its reaction (they bolt,
// tumble, hide, veer, pronk); a shot aimed at one costs −10 (the aimed-at rule of D-062/D-063/D-069
// plus the benefit of the doubt when a bird was near the aim point) with the weaver nest's
// cooldown. Never a target, never hurt, never removed.
// Pure and deterministic: ONE stream `cameos` for every draw, ticks, plain arithmetic. It lives in
// the lazy sim-systems chunk with the baboons and Brakkie; the sim talks to it through CameoHost.
import type { CameoWalker, ContentBundle } from '../../content/schemas';
import { planeCentreX, planeToDx } from '../camera';
import { secondsToTicks } from '../clock';
import type { CameoKindId, SimEvent } from '../events';
import type { RandomStream } from '../rng';
import type { CameoMemberView, CameoPhase, CameoVisitView, CameosView, PlaneId } from '../types';
import { pointInOccluder, type HitExtra } from '../weapons/hitTest';

type WalkerKind = Exclude<CameoKindId, 'elephants'>;
type CameoPlane = 'near' | 'mid';
type Reaction = CameoWalker['reaction']['kind'];

/** What the hunt gives the cameos. */
export interface CameoHost {
  readonly tick: () => number;
  emit(e: SimEvent): void;
  /** Points off (a penalty, negative) counted in the hunt's stats. */
  penalty(points: number): void;
  readonly cameraX: () => number;
  /** Something a player aims at on the plane's layer within `px` of layer x `x` (a secret's
   *  part, a crate, a tell, a colony, a tin-can fence, Brakkie; not the birds, not the cameos). */
  busyNear(plane: CameoPlane, x: number, px: number): boolean;
  /** A mid flock (with birds, not flushing) whose centre is within `maxDx` screen px of `dx`: its
   *  id and centre's layer x (the nearest), else null. */
  alarmTarget(dx: number, maxDx: number): { readonly flockId: number; readonly x: number } | null;
  /** One threat (source 'cameo') to the flock, from layer x `fromX` on its plane. */
  threaten(flockId: number, fromX: number): void;
}

/** What a shot gives the cameos (built by the hunt for every shot). */
export interface CameoShot {
  readonly shotId: number;
  /** Visits a pellet hit (each once). */
  readonly hitVisits: readonly number[];
  /** The shot hit a target elsewhere (then it wasn't aimed at a cameo). */
  readonly hitTarget: boolean;
  /** A live bird was within hit.guardPx of the aim point on screen. */
  readonly birdNearAim: boolean;
  /** The shot's aim point (a rifle's before the sway) on a layer. */
  aimOn(layerId: string): { readonly x: number; readonly y: number };
  /** Where its pellets landed on a layer. */
  impactsOn(layerId: string): readonly { readonly x: number; readonly y: number }[];
}

export interface CameoSystem {
  /** Their hit shapes on their layers (pass-through: anything behind takes the pellet). */
  extras(add: (layerId: string, e: HitExtra) => void): void;
  shot(s: CameoShot): void;
  /** A flock burst up flushing at layer x on its plane (the elephants may answer). */
  flushed(plane: PlaneId, x: number): void;
  step(): void;
  view(): CameosView;
}

export interface CameoGeometry {
  readonly layers: Readonly<
    Record<CameoPlane, { readonly id: string; readonly scrollFactor: number }>
  >;
  /** Feet on each plane (design px from the top). */
  readonly groundY: Readonly<Record<CameoPlane, number>>;
  /** Each plane's scroll factor (the elephants compare a flock's screen x with their herd's). */
  readonly scrollFactor: Readonly<Record<PlaneId, number>>;
  /** The far elephant herd's layer x and scroll factor (null: no elephants on this map). */
  readonly herd: { readonly x: number; readonly scrollFactor: number } | null;
  /** The cameos that come to this map, in content order. */
  readonly kinds: readonly CameoKindId[];
  /** The hunt's length (ticks): no visit starts in its last stretch. */
  readonly durationTicks: number;
}

export type CameoSystemFactory = (
  content: ContentBundle,
  geo: CameoGeometry,
  rng: RandomStream,
  host: CameoHost,
) => CameoSystem;

interface Member {
  readonly role: 'adult' | 'young';
  x: number;
  readonly dy: number;
  readonly gaitOff: number;
  gaitT: number;
}

interface Visit {
  readonly id: number;
  readonly kind: WalkerKind;
  readonly w: CameoWalker;
  readonly plane: CameoPlane;
  readonly layerId: string;
  readonly preview: boolean;
  phase: CameoPhase;
  reaction: Reaction | null;
  t: number;
  dur: number;
  facing: 1 | -1;
  /** px a tick now. */
  speed: number;
  /** The line the group walks to (layer x): gone when every member is past it. */
  goal: number;
  /** What comes after a reaction that goes on ('walk'), or a flight ('flee'). */
  after: 'walk' | 'flee';
  /** Where the shot that set it off came (layer x; null: none), to flee away from. */
  fromX: number | null;
  /** px walked since the last pause, and the px the next pause may come at. */
  walked: number;
  pauseAt: number;
  /** The springbok's alarm: the tick its flock hears it, the flock, where from. */
  alarmTick: number | null;
  alarmFlock: number | null;
  alarmed: boolean;
  members: Member[];
}

interface Schedule {
  readonly kind: WalkerKind;
  next: number;
  visits: number;
}

/** Ticks a stopped phase lasts for the view (fade, pause, reaction). */
const STOPPED: ReadonlySet<CameoPhase> = new Set<CameoPhase>(['pause', 'react']);

export const createCameoSystem: CameoSystemFactory = (content, geo, rng, host) => {
  const C = content.cameos;
  const ticks = (s: number): number => secondsToTicks(s);
  const rangeTicks = (r: readonly [number, number]): number => ticks(rng.range(r[0], r[1]));
  const cooldownTicks = ticks(C.hit.cooldownSeconds);
  const retryTicks = ticks(C.retrySeconds);
  const herdCfg = C.kinds.elephants.herd;
  const herd = geo.kinds.includes('elephants') ? geo.herd : null;
  const hasElephants = herd !== null;

  const visits: Visit[] = [];
  let nextVisitId = 1;
  let cooldown = 0;
  let visitsSoFar = 0;
  let hits = 0;
  let aimedHits = 0;
  let alarms = 0;
  let trumpets = 0;
  let trumpetTick: number | null = null;
  let trumpetReady = 0;

  const schedules: Schedule[] = [];
  for (const k of geo.kinds) {
    if (k === 'elephants') continue;
    schedules.push({ kind: k, next: rangeTicks(C.kinds[k].schedule.firstSeconds), visits: 0 });
  }
  /** Test builds only (?cameoPreview=): every listed kind out at once, slowly, in view. */
  const preview = C.preview ?? null;
  let previewTick = preview === null ? null : ticks(preview.atSeconds);
  let previewReactTick = preview?.reactSeconds === undefined ? null : ticks(preview.reactSeconds);

  const centre = (plane: CameoPlane): number =>
    planeCentreX(host.cameraX(), geo.layers[plane].scrollFactor);
  const dxOf = (plane: CameoPlane, x: number): number =>
    planeToDx(host.cameraX(), geo.layers[plane].scrollFactor, x);

  /** The way from `from` to `to` keeps clear of anything a player aims at on the plane. */
  function routeClear(plane: CameoPlane, from: number, to: number): boolean {
    const step = C.clear.pathStepPx;
    const dir = to > from ? 1 : -1;
    for (let p = from; dir * (to - p) >= 0; p += dir * step)
      if (host.busyNear(plane, p, C.clear.pathPx)) return false;
    return !host.busyNear(plane, to, C.clear.pathPx);
  }

  /** A new visit of `kind`, or null (no clear route now). */
  function spawn(kind: WalkerKind, asPreview: boolean): Visit | null {
    const w = C.kinds[kind];
    const plane = w.plane;
    const c = centre(plane);
    const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    // The group: each role's count, in content order (the first role leads).
    const roles: ('adult' | 'young')[] = [];
    for (const g of w.group) {
      const n = rng.int(g.count[0], g.count[1]);
      for (let i = 0; i < n; i++) roles.push(g.role);
    }
    const tail = (roles.length - 1) * w.spacingPx;
    let start: number;
    let goal: number;
    if (asPreview) {
      // In view, walking slowly towards the centre (the screenshot spec holds it there).
      start = c - dir * 160;
      goal = c + dir * 4000;
    } else if (w.enter === 'edge') {
      const edge = w.edgeDxPx ?? 1350;
      start = c - dir * edge;
      goal = c + dir * (edge + tail);
    } else {
      const band = w.bandPx ?? 380;
      const dist = w.distancePx ?? [120, 200];
      const at = c + rng.range(-band, band);
      // Towards the centre: a near one never wanders off into the HUD's corners.
      const toward: 1 | -1 = at < c ? 1 : at > c ? -1 : dir;
      start = at;
      goal = at + toward * rng.range(dist[0], dist[1]);
    }
    const facing: 1 | -1 = goal > start ? 1 : -1;
    if (!asPreview && !routeClear(plane, start - facing * tail, goal)) return null;
    const members: Member[] = roles.map((role, i) => ({
      role,
      x: start - facing * i * w.spacingPx,
      dy: i === 0 || w.depthPx === 0 ? 0 : rng.range(-w.depthPx, w.depthPx),
      gaitOff: rng.int(0, 59),
      gaitT: 0,
    }));
    const v: Visit = {
      id: nextVisitId++,
      kind,
      w,
      plane,
      layerId: geo.layers[plane].id,
      preview: asPreview,
      phase: w.enter === 'grass' && !asPreview ? 'fadeIn' : 'walk',
      reaction: null,
      t: 0,
      dur: w.enter === 'grass' && !asPreview ? ticks(w.fadeSeconds ?? 0.6) : 0,
      facing,
      speed: (w.speeds.walkPx * (asPreview ? 0.25 : 1)) / 60,
      goal,
      after: 'walk',
      fromX: null,
      walked: 0,
      pauseAt: w.pause === undefined ? Infinity : rng.range(w.pause.everyPx[0], w.pause.everyPx[1]),
      alarmTick: null,
      alarmFlock: null,
      alarmed: false,
      members,
    };
    visits.push(v);
    visitsSoFar++;
    host.emit({
      type: 'cameoArrived',
      tick: host.tick(),
      visitId: v.id,
      kind,
      plane,
      x: start,
      members: members.length,
    });
    return v;
  }

  function setPhase(v: Visit, phase: CameoPhase, dur: number): void {
    v.phase = phase;
    v.t = 0;
    v.dur = dur;
  }

  /** Off at a run, away from layer x `from` (or on the way it was going), out of the view. */
  function flee(v: Visit, from: number | null): void {
    const lead = v.members[0]?.x ?? 0;
    const dir: 1 | -1 = from === null ? v.facing : lead >= from ? 1 : -1;
    const c = centre(v.plane);
    const edge = v.w.edgeDxPx ?? 1350;
    v.facing = dir;
    v.goal = c + dir * (edge + (v.members.length - 1) * v.w.spacingPx + v.w.spacingPx);
    v.speed = v.w.speeds.fleePx / 60;
    setPhase(v, 'flee', 0);
  }

  /** A pellet (or, for the springbok, a shot close by) set it off. */
  function react(v: Visit, fromX: number | null): void {
    if (v.phase === 'flee' || v.phase === 'fadeOut') return;
    if (v.phase === 'react') return;
    const r = v.w.reaction;
    v.reaction = r.kind;
    if (r.kind === 'bolt' || r.kind === 'pronk') {
      v.after = 'flee';
      // A bolt starts with a startled moment (the alert, the first pronk) on the spot.
      setPhase(v, 'react', ticks(r.seconds));
      v.speed = 0;
      v.fromX = fromX;
      return;
    }
    if (r.kind === 'veer') {
      // The ostrich swerves at a run and kicks up dust, and goes on its way.
      v.after = 'walk';
      setPhase(v, 'react', ticks(r.seconds));
      v.speed = v.w.speeds.fleePx / 60;
      return;
    }
    // tumble, hide: stops, then goes on.
    v.after = 'walk';
    setPhase(v, 'react', ticks(r.seconds));
    v.speed = 0;
  }

  /** The springbok's alarm whistle: they pronk away; the nearest mid flock hears it. */
  function alarm(v: Visit, fromX: number | null): void {
    const a = v.w.alarm;
    if (a === undefined || v.alarmed) return;
    v.alarmed = true;
    alarms++;
    const lead = v.members[0]?.x ?? 0;
    const target = host.alarmTarget(dxOf(v.plane, lead), a.maxDxPx);
    v.alarmFlock = target?.flockId ?? null;
    v.alarmTick = host.tick() + ticks(a.threatAtSeconds);
    host.emit({
      type: 'cameoAlarm',
      tick: host.tick(),
      visitId: v.id,
      flockId: v.alarmFlock,
      x: lead,
    });
    react(v, fromX);
  }

  function leave(v: Visit, i: number): void {
    visits.splice(i, 1);
    host.emit({ type: 'cameoLeft', tick: host.tick(), visitId: v.id, kind: v.kind });
  }

  function stepVisit(v: Visit): boolean {
    v.t++;
    for (const m of v.members) m.gaitT = v.t + m.gaitOff;
    const tick = host.tick();
    if (v.alarmTick !== null && tick >= v.alarmTick) {
      v.alarmTick = null;
      if (v.alarmFlock !== null) host.threaten(v.alarmFlock, v.members[0]?.x ?? 0);
    }
    switch (v.phase) {
      case 'pause':
        if (v.t >= v.dur) {
          setPhase(v, 'walk', 0);
          v.speed = (v.w.speeds.walkPx * (v.preview ? 0.25 : 1)) / 60;
        }
        return true;
      case 'react':
        if (v.speed > 0) move(v);
        if (v.t < v.dur) return true;
        if (v.after === 'flee') flee(v, v.fromX);
        else {
          v.reaction = null;
          setPhase(v, 'walk', 0);
          v.speed = (v.w.speeds.walkPx * (v.preview ? 0.25 : 1)) / 60;
        }
        return true;
      case 'fadeOut':
        return v.t < v.dur;
      case 'fadeIn':
        move(v);
        if (v.t >= v.dur) setPhase(v, 'walk', 0);
        return true;
      case 'walk':
      case 'flee': {
        move(v);
        // Gone once every member is past the goal line.
        const past = v.members.every((m) => v.facing * (m.x - v.goal) >= 0);
        if (past) {
          if (v.w.enter === 'grass' && v.phase === 'walk') {
            setPhase(v, 'fadeOut', ticks(v.w.fadeSeconds ?? 0.6));
            return true;
          }
          return false;
        }
        if (v.phase === 'walk' && v.w.pause !== undefined && v.walked >= v.pauseAt) {
          const p = v.w.pause;
          v.walked = 0;
          v.pauseAt = rng.range(p.everyPx[0], p.everyPx[1]);
          if (rng.chance(p.chance)) setPhase(v, 'pause', rangeTicks(p.seconds));
        }
        return true;
      }
    }
  }

  function move(v: Visit): void {
    const d = v.facing * v.speed;
    for (const m of v.members) m.x += d;
    v.walked += v.speed;
    // A near one walks only to its goal (then fades back into the grass).
    if (v.w.enter === 'grass' && v.phase !== 'flee') {
      const lead = v.members[0];
      if (lead !== undefined && v.facing * (lead.x - v.goal) > 0) {
        const back = lead.x - v.goal;
        for (const m of v.members) m.x -= back;
      }
    }
  }

  function step(): void {
    const tick = host.tick();
    if (cooldown > 0) cooldown--;
    // Test builds only: the preview's visits, then their reactions.
    if (previewTick !== null && tick >= previewTick && preview !== null) {
      previewTick = null;
      for (const k of preview.kinds) if (k !== 'elephants' && geo.kinds.includes(k)) spawn(k, true);
      if (preview.kinds.includes('elephants') && hasElephants) trumpet(tick);
    }
    if (previewReactTick !== null && tick >= previewReactTick) {
      previewReactTick = null;
      for (const v of visits) if (v.preview) react(v, null);
    }
    for (let i = visits.length - 1; i >= 0; i--) {
      const v = visits[i];
      if (v !== undefined && !stepVisit(v)) leave(v, i);
    }
    // Schedules (content order). Never in the hunt's last stretch: a visit must have time.
    for (const s of schedules) {
      if (tick < s.next) continue;
      const sch = C.kinds[s.kind].schedule;
      if (s.visits >= sch.maxVisits || tick + retryTicks * 4 >= geo.durationTicks) {
        s.next = geo.durationTicks;
        continue;
      }
      if (visits.filter((v) => !v.preview).length >= C.maxActive) {
        s.next = tick + retryTicks;
        continue;
      }
      if (spawn(s.kind, false) === null) {
        s.next = tick + retryTicks;
        continue;
      }
      s.visits++;
      s.next = tick + rangeTicks(sch.everySeconds);
    }
  }

  function hittable(v: Visit): boolean {
    if (v.phase === 'fadeIn') return v.t * 2 >= v.dur;
    if (v.phase === 'fadeOut') return v.t * 2 < v.dur;
    return true;
  }

  /** A member's hit shapes on its layer. */
  function shapesOf(v: Visit, m: Member): { x: number; y: number; rx: number; ry: number }[] {
    const boxes =
      m.role === 'young' ? (v.w.hitboxes.young ?? v.w.hitboxes.adult) : v.w.hitboxes.adult;
    const y = geo.groundY[v.plane] + m.dy;
    return boxes.map((h) => ({ x: m.x + h.ox * v.facing, y: y + h.oy, rx: h.rx, ry: h.ry }));
  }

  function extras(add: (layerId: string, e: HitExtra) => void): void {
    for (const v of visits) {
      if (!hittable(v)) continue;
      for (const m of v.members)
        for (const s of shapesOf(v, m))
          add(v.layerId, {
            kind: 'cameo',
            cameoId: v.id,
            x: s.x,
            y: s.y,
            shape: { type: 'ellipse', rx: s.rx, ry: s.ry },
          });
    }
  }

  function shot(s: CameoShot): void {
    const tick = host.tick();
    for (const v of [...visits]) {
      const hit = s.hitVisits.includes(v.id) && hittable(v);
      if (hit) {
        const aim = s.aimOn(v.layerId);
        const onIt =
          !s.hitTarget &&
          v.members.some((m) =>
            shapesOf(v, m).some((sh) =>
              pointInOccluder(aim.x, aim.y, {
                propId: '',
                x: sh.x,
                y: sh.y,
                shape: { type: 'ellipse', rx: sh.rx, ry: sh.ry },
              }),
            ),
          );
        const aimed = onIt && !s.birdNearAim;
        let points = 0;
        if (aimed && cooldown === 0) {
          points = -C.hit.penalty;
          cooldown = cooldownTicks;
          host.penalty(points);
        }
        hits++;
        if (aimed) aimedHits++;
        const lead = v.members[0];
        host.emit({
          type: 'cameoHit',
          tick,
          shotId: s.shotId,
          visitId: v.id,
          kind: v.kind,
          aimed,
          plane: v.plane,
          x: lead?.x ?? 0,
          y: geo.groundY[v.plane],
          points,
        });
        if (v.w.alarm !== undefined) alarm(v, aim.x);
        else react(v, aim.x);
        continue;
      }
      // The springbok hear a shot land close by (their alarm), even when no pellet touched them.
      const a = v.w.alarm;
      if (a === undefined || v.alarmed || !hittable(v)) continue;
      const pts = s.impactsOn(v.layerId);
      const y0 = geo.groundY[v.plane];
      const near = pts.find((p) =>
        v.members.some((m) => {
          const dx = p.x - m.x;
          const dy = p.y - (y0 + m.dy - 40);
          return dx * dx + dy * dy <= a.radiusPx * a.radiusPx;
        }),
      );
      if (near !== undefined) alarm(v, near.x);
    }
  }

  function trumpet(tick: number): void {
    trumpets++;
    trumpetTick = tick;
    trumpetReady = tick + ticks(herdCfg.cooldownSeconds);
    host.emit({ type: 'cameoTrumpeted', tick, x: herd?.x ?? 0 });
  }

  function flushed(plane: PlaneId, x: number): void {
    if (herd === null) return;
    const tick = host.tick();
    if (tick < trumpetReady || trumpets >= herdCfg.maxPerHunt) return;
    const cx = host.cameraX();
    const fdx = planeToDx(cx, geo.scrollFactor[plane], x);
    const hdx = planeToDx(cx, herd.scrollFactor, herd.x);
    if (Math.abs(fdx - hdx) > herdCfg.nearPx) return;
    if (!rng.chance(herdCfg.chance)) return;
    trumpet(tick);
  }

  const flapTicks = ticks(herdCfg.flapSeconds);
  function view(): CameosView {
    return {
      visits: visits.map((v): CameoVisitView => ({
        id: v.id,
        kind: v.kind,
        plane: v.plane,
        layerId: v.layerId,
        phase: v.phase,
        reaction: v.reaction,
        t: v.t,
        dur: STOPPED.has(v.phase) || v.phase === 'fadeIn' || v.phase === 'fadeOut' ? v.dur : 0,
        facing: v.facing,
        alpha:
          v.phase === 'fadeIn'
            ? Math.min(1, v.t / Math.max(1, v.dur))
            : v.phase === 'fadeOut'
              ? Math.max(0, 1 - v.t / Math.max(1, v.dur))
              : 1,
        members: v.members.map((m): CameoMemberView => ({
          role: m.role,
          x: m.x,
          y: geo.groundY[v.plane] + m.dy,
          gaitT: m.gaitT,
        })),
      })),
      trumpetTick,
      flapTicks,
      visitsSoFar,
      hits,
      aimedHits,
      alarms,
      trumpets,
    };
  }

  return { extras, shot, flushed, step, view };
};
