// v1.8b (D-062, Tech §3.12d) The baboons as a sim system the hunt plugs in: the troops and raids
// (baboons.ts), their hit shapes, what a shot does to them, their events and their snapshot. It
// lives in its own chunk so the first download doesn't carry it: the game loads it before a hunt
// on a map with a troop (HuntScene), and tools and tests register it up front (register.ts). The
// sim talks to it through BaboonHost only. Pure and deterministic like the rest of src/sim.
import type { Biome, ContentBundle } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { BonusId, SimEvent } from '../events';
import type { RandomStream } from '../rng';
import type { BaboonsView, PlaneId } from '../types';
import type { HitExtra } from '../weapons/hitTest';
import {
  bagRaider,
  createBaboons,
  findMember,
  findRaider,
  fleeRaider,
  memberPresent,
  raiderStance,
  ridgeStance,
  roleScale,
  scareTroop,
  stepBaboons,
  type BaboonCtx,
  type BaboonsState,
} from './baboons';
import { spotBlockers } from './spotClear';

/** What the hunt gives the baboons. */
export interface BaboonHost {
  readonly tick: () => number;
  emit(e: SimEvent): void;
  /** An event bonus (× Frenzy × Stampede); returns what it paid. */
  awardBonus(bonus: BonusId, base: number): number;
  /** A guineafowl's base points on a plane on this map (pointsMul, planePointsMul). */
  basePoints(plane: PlaneId): number;
  /** Points off (a penalty, negative) counted in the hunt's stats. */
  penalty(points: number): void;
  /** Threatens the live flocks on `plane` within `radiusU` of the panorama of layer x `x`
   *  (scroll factor of the plane); returns their ids. */
  threatenNear(plane: PlaneId, x: number, radiusU: number): number[];
  /** The Skietbaan scores nothing. */
  readonly ranged: boolean;
}

export interface BaboonSystem {
  /** Adds the hit shapes of the troops (on their ridges) and the raiders. */
  extras(add: (layerId: string, e: HitExtra) => void): void;
  /** The plane a baboon is on (null: not one of them). */
  plane(id: number): PlaneId | null;
  /** A shot's baboon hits; `loud`: the Langloop's shot (every troop runs). */
  shot(shotId: number, hits: readonly number[], loud: boolean): void;
  step(): void;
  view(): BaboonsView;
}

export type BaboonSystemFactory = (
  biome: Biome,
  content: ContentBundle,
  planeScale: Readonly<Record<PlaneId, number>>,
  rng: RandomStream,
  host: BaboonHost,
) => BaboonSystem | null;

/** The map's baboons (null: no troop on this hunt). */
export const createBaboonSystem: BaboonSystemFactory = (biome, content, planeScale, rng, host) => {
  const bb = content.birds.baboons;
  const planes = content.scoring.planes;
  const ctx: BaboonCtx = { tuning: bb, rng };
  let nextId = 1;
  const s: BaboonsState | null = createBaboons(
    biome,
    planeScale,
    ctx,
    () => nextId++,
    (sp) => spotBlockers(biome, sp, content.birds, planes).length === 0,
  );
  if (s === null) return null;
  const state = s;
  const cooldownTicks = secondsToTicks(bb.hit.cooldownSeconds);

  function extras(add: (layerId: string, e: HitExtra) => void): void {
    for (const t of state.troops)
      for (const m of t.members) {
        if (!memberPresent(m)) continue;
        const box = bb.hitboxes[ridgeStance(m.pose)];
        const k = t.scale * roleScale(m.role, bb);
        for (const sh of [box.body, box.head])
          add(t.layerId, {
            kind: 'baboon',
            baboonId: m.id,
            x: m.x + sh.ox * k * m.facing,
            y: m.y + sh.oy * k,
            shape: { type: 'ellipse', rx: sh.rx * k, ry: sh.ry * k },
          });
      }
    // The raiders are targets: their body radii get the plane's floor (D-049).
    const raid = state.raid;
    if (raid === null) return;
    const k = raid.spot.scale;
    const floor = planes[raid.spot.plane].minHitRadiusPx;
    for (const r of raid.raiders) {
      if (r.done) continue;
      const stance = raiderStance(r, raid.spot.action);
      if (stance === null) continue;
      const box = bb.hitboxes[stance];
      for (const sh of [box.body, box.head]) {
        const min = sh === box.body ? floor : 0;
        add(raid.spot.layerId, {
          kind: 'baboon',
          baboonId: r.id,
          x: r.x + sh.ox * k * r.facing,
          y: r.y + sh.oy * k,
          shape: { type: 'ellipse', rx: Math.max(sh.rx * k, min), ry: Math.max(sh.ry * k, min) },
        });
      }
    }
  }

  function plane(id: number): PlaneId | null {
    const raid = state.raid;
    if (raid !== null && findRaider(state, id) !== null) return raid.spot.plane;
    return findMember(state, id)?.troop.plane ?? null;
  }

  /**
   * A raider: one hit per shot; hitsToBag bag it (points × Frenzy × Stampede, the stop bonus if
   * its raid wasn't done), anything less sends it running; either way its troop runs over the
   * ridge. A ridge member: a mother costs the penalty (with a cooldown), and the troop runs.
   */
  function shot(shotId: number, hits: readonly number[], loud: boolean): void {
    const tick = host.tick();
    const scared = new Set<string>();
    for (const id of hits) {
      const raid = state.raid;
      const r = findRaider(state, id);
      if (raid !== null && r !== null) {
        if (r.phase === 'tumble' || r.done) continue;
        r.hits++;
        const left = Math.max(0, bb.hit.hitsToBag - r.hits);
        const sp = raid.spot;
        host.emit({
          type: 'baboonHit',
          tick,
          shotId,
          baboonId: r.id,
          role: 'raider',
          hitsLeft: left,
          plane: sp.plane,
          x: r.x,
          y: r.y,
          points: 0,
        });
        scared.add(raid.troopId);
        if (left > 0) {
          fleeRaider(r, sp, bb);
          continue;
        }
        const stopped = !raid.completed;
        bagRaider(state, r, bb);
        let points = host.awardBonus(
          'baboon',
          Math.round(host.basePoints(sp.plane) * bb.hit.pointsMul),
        );
        if (stopped) points += host.awardBonus('raidStopped', bb.hit.stopBonus);
        host.emit({
          type: 'baboonBagged',
          tick,
          shotId,
          baboonId: r.id,
          raidId: raid.id,
          action: sp.action,
          plane: sp.plane,
          x: r.x,
          y: r.y,
          stopped,
          points,
        });
        // The other raider of a pair runs for it.
        for (const o of raid.raiders) if (o !== r) fleeRaider(o, sp, bb);
        continue;
      }
      const found = findMember(state, id);
      if (found === null || !memberPresent(found.member)) continue;
      const { troop, member } = found;
      const points =
        member.role === 'mother' && troop.cooldown === 0 && !host.ranged ? -bb.hit.penalty : 0;
      if (points < 0) {
        host.penalty(points);
        troop.cooldown = cooldownTicks;
      }
      host.emit({
        type: 'baboonHit',
        tick,
        shotId,
        baboonId: member.id,
        role: member.role,
        hitsLeft: 0,
        plane: troop.plane,
        x: member.x,
        y: member.y,
        points,
      });
      scared.add(troop.id);
    }
    for (const troop of state.troops) {
      const hit = scared.has(troop.id);
      if (!hit && !loud) continue;
      const wasFled = troop.fled;
      scareTroop(state, troop, ctx);
      if (wasFled) continue;
      host.emit({
        type: 'troopFled',
        tick,
        troopId: troop.id,
        cause: hit ? 'hit' : 'loud',
        plane: troop.plane,
        x: troop.cx,
        y: troop.seats[0]?.y ?? 0,
      });
    }
  }

  function step(): void {
    const tick = host.tick();
    for (const note of stepBaboons(state, ctx)) {
      if (note.kind === 'gone') continue;
      const sp = note.raid.spot;
      if (note.kind === 'warn')
        host.emit({
          type: 'baboonRaidWarned',
          tick,
          raidId: note.raid.id,
          troopId: note.troop.id,
          baboonId: note.lookout.id,
          spotId: sp.id,
          action: sp.action,
          raiders: note.raid.memberIds.length,
        });
      else if (note.kind === 'start')
        host.emit({
          type: 'baboonRaidStarted',
          tick,
          raidId: note.raid.id,
          spotId: sp.id,
          action: sp.action,
          plane: sp.plane,
          x: sp.x,
          y: sp.y,
        });
      else {
        // A throw or a chase threatens the flocks near the spot.
        const flockIds =
          sp.action === 'throw' || sp.action === 'chase'
            ? host.threatenNear(sp.plane, note.raider.x, bb.raids.alertRadiusU)
            : [];
        host.emit({
          type: 'baboonRaidDone',
          tick,
          raidId: note.raid.id,
          spotId: sp.id,
          action: sp.action,
          plane: sp.plane,
          x: note.raider.x,
          y: sp.y,
          flockIds,
        });
      }
    }
  }

  function view(): BaboonsView {
    const raid = state.raid;
    return {
      troops: state.troops.map((t) => ({
        id: t.id,
        layerId: t.layerId,
        plane: t.plane,
        scale: t.scale,
        fled: t.fled,
        rock: t.rock,
        members: t.members
          .filter((m) => !m.gone)
          .map((m) => ({
            id: m.id,
            role: m.role,
            x: m.x,
            y: m.y,
            facing: m.facing,
            pose: m.pose,
            t: m.t,
            dur: m.dur,
          })),
      })),
      raiders:
        raid === null
          ? []
          : raid.raiders
              .filter((r) => !r.done)
              .map((r) => ({
                id: r.id,
                raidId: raid.id,
                layerId: raid.spot.layerId,
                plane: raid.spot.plane,
                scale: raid.spot.scale,
                action: raid.spot.action,
                x: r.x,
                y: r.y,
                facing: r.facing,
                phase: r.phase,
                t: r.t,
                dur: r.dur,
                hits: r.hits,
              })),
      raid:
        raid === null
          ? null
          : {
              id: raid.id,
              troopId: raid.troopId,
              spotId: raid.spot.id,
              action: raid.spot.action,
              phase: raid.phase,
              completed: raid.completed,
            },
    };
  }

  return { extras, plane, shot, step, view };
};
