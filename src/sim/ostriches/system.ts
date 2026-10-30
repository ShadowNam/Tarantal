// v1.7d (D-059, Tech §3.12b) Namibië's ostriches as a sim system the hunt plugs in (v1.8b, D-062:
// moved out of Sim.ts into the lazy sim-systems chunk with the baboons, so the first download
// doesn't carry them; the same code, the same events in the same order). The game loads the
// chunk before a hunt on a map with ostriches; tools and tests register it up front.
import type { Biome, ContentBundle } from '../../content/schemas';
import { tapToPlane } from '../camera';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import type { RandomStream } from '../rng';
import type { OstrichFamilyView } from '../types';
import type { HitExtra } from '../weapons/hitTest';
import {
  createFamily,
  nestShape,
  scareFamily,
  shapesOf,
  stepFamily,
  type OstrichCtx,
  type OstrichFamilyState,
} from './ostriches';

/** What the hunt gives the ostriches. */
export interface OstrichHost {
  readonly tick: () => number;
  emit(e: SimEvent): void;
  /** Points off (a penalty, negative) counted in the hunt's stats. */
  penalty(points: number): void;
}

export interface OstrichSystem {
  /** The pairs' 'ostrichesSpawned' events (tick 0). */
  spawned(): void;
  /** The birds' hit shapes (in front of their nest), then the nests'. */
  extras(add: (layerId: string, e: HitExtra) => void): void;
  /** A shot's ostrich and nest hits, and which pairs run. */
  shot(
    shotId: number,
    hits: readonly number[],
    impacts: readonly { dx: number; sy: number }[],
    cx: number,
    heard: boolean,
    loud: boolean,
  ): void;
  step(): void;
  view(): OstrichFamilyView[];
}

export type OstrichSystemFactory = (
  biome: Biome,
  content: ContentBundle,
  rng: RandomStream,
  host: OstrichHost,
) => OstrichSystem;

export const createOstrichSystem: OstrichSystemFactory = (biome, content, rng, host) => {
  const os = content.birds.ostriches;
  const ctx: OstrichCtx = { tuning: os, rng };
  const cooldownTicks = secondsToTicks(os.hit.cooldownSeconds);
  let nextOstrichId = 1;
  const families: OstrichFamilyState[] = [];
  for (const def of biome.ostriches ?? []) {
    const layer = biome.layers.find((l) => l.id === def.layer);
    const plane = layer?.plane;
    if (layer === undefined || plane === undefined) continue;
    families.push(
      createFamily(
        def,
        { id: layer.id, scrollFactor: layer.scrollFactor, plane },
        content.scoring.planes[plane].scale,
        os,
        rng,
        () => nextOstrichId++,
      ),
    );
  }

  function spawned(): void {
    for (const f of families)
      host.emit({
        type: 'ostrichesSpawned',
        tick: 0,
        familyId: f.id,
        plane: f.plane,
        x: f.nest?.x ?? (f.left + f.right) / 2,
        y: f.ground,
        nest: f.nest !== null,
        eggs: f.nest?.eggs ?? 0,
      });
  }

  function extras(add: (layerId: string, e: HitExtra) => void): void {
    for (const f of families) {
      for (const b of f.birds)
        for (const sh of shapesOf(b.pose, os))
          add(f.layerId, {
            kind: 'ostrich',
            ostrichId: b.id,
            x: b.x + sh.ox * f.scale * b.facing,
            y: f.ground + sh.oy * f.scale,
            shape: { type: 'ellipse', rx: sh.rx * f.scale, ry: sh.ry * f.scale },
          });
      const n = nestShape(f, os);
      if (n !== null && f.nest !== null)
        add(f.layerId, {
          kind: 'ostrich',
          ostrichId: f.nest.id,
          x: n.x,
          y: n.y,
          shape: { type: 'ellipse', rx: n.rx, ry: n.ry },
        });
    }
  }

  /** A shot's ostrich and nest hits (points off, cooldown), then which pairs run: the hit one,
   *  every one for a loud gun, any with an impact within scare.radiusPx of a bird or the nest
   *  on its plane. A silenced shot only scares the pair it hit. */
  function shot(
    shotId: number,
    hits: readonly number[],
    impacts: readonly { dx: number; sy: number }[],
    cx: number,
    heard: boolean,
    loud: boolean,
  ): void {
    if (families.length === 0) return;
    const ran = new Set<OstrichFamilyState>();
    for (const id of hits) {
      const f = families.find((x) => x.nest?.id === id || x.birds.some((b) => b.id === id));
      if (f === undefined || ran.has(f)) continue;
      const nestX = f.nest !== null && f.nest.id === id ? f.nest.x : null;
      const nest = nestX !== null;
      const bird = nest
        ? (f.birds.find((b) => b.sitter) ?? f.birds[0])
        : f.birds.find((b) => b.id === id);
      if (bird === undefined) continue;
      const points = f.cooldown > 0 ? 0 : -os.hit.penalty;
      if (points < 0) {
        host.penalty(points);
        f.cooldown = cooldownTicks;
      }
      host.emit({
        type: 'ostrichHit',
        tick: host.tick(),
        shotId,
        familyId: f.id,
        ostrichId: bird.id,
        nest,
        plane: f.plane,
        x: nestX ?? bird.x,
        y: f.ground,
        points,
      });
      scareFamily(f, nestX ?? bird.x, ctx, bird);
      ran.add(f);
      host.emit({
        type: 'ostrichesRan',
        tick: host.tick(),
        familyId: f.id,
        cause: 'hit',
        plane: f.plane,
        x: bird.x,
        y: f.ground,
      });
    }
    if (!heard) return;
    for (const f of families) {
      if (ran.has(f)) continue;
      let from: number | null = null;
      if (loud) from = tapToPlane(cx, f.scrollFactor, 0, f.ground).x;
      else {
        const r = os.scare.radiusPx * f.scale;
        const xs = [...f.birds.map((b) => b.x), ...(f.nest === null ? [] : [f.nest.x])];
        for (const imp of impacts) {
          const p = tapToPlane(cx, f.scrollFactor, imp.dx, imp.sy);
          const dy = Math.max(
            0,
            Math.abs(p.y - (f.ground - (os.heightPx * f.scale) / 2)) - (os.heightPx * f.scale) / 2,
          );
          if (xs.some((x) => (x - p.x) * (x - p.x) + dy * dy <= r * r)) {
            from = p.x;
            break;
          }
        }
      }
      if (from === null) continue;
      scareFamily(f, from, ctx, null);
      host.emit({
        type: 'ostrichesRan',
        tick: host.tick(),
        familyId: f.id,
        cause: loud ? 'loud' : 'shot',
        plane: f.plane,
        x: from,
        y: f.ground,
      });
    }
  }

  function step(): void {
    for (const f of families)
      for (const note of stepFamily(f, ctx)) {
        if (note.kind === 'back') continue;
        host.emit({
          type: 'ostrichCall',
          tick: host.tick(),
          familyId: f.id,
          ostrichId: note.bird.id,
          call: note.kind,
          plane: f.plane,
          x: note.bird.x,
          y: f.ground,
        });
      }
  }

  function ostrichView(f: OstrichFamilyState): OstrichFamilyView {
    return {
      id: f.id,
      layerId: f.layerId,
      plane: f.plane,
      scale: f.scale,
      ground: f.ground,
      nest: f.nest === null ? null : { id: f.nest.id, x: f.nest.x, eggs: f.nest.eggs },
      birds: f.birds.map((b) => ({
        id: b.id,
        male: b.male,
        x: b.x,
        facing: b.facing,
        pose: b.pose,
        t: b.t,
        look: b.look,
        sitter: b.sitter,
      })),
    };
  }

  return {
    spawned,
    extras,
    shot,
    step,
    view: () => families.map(ostrichView),
  };
};
