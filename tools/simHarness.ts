// Test harness for sim behaviour tests (karoo, charms, season): a quiet copy of the real content
// (nothing spawns on its own; a spread-free gun) plus helpers to step, aim and shoot. Tests turn
// on only what they check.
import { loadContent } from './testContent';
import type { Biome, ContentBundle } from '../src/content/schemas';
import { planeToDx } from '../src/sim/camera';
import type { SimEvent } from '../src/sim/events';
import { createSim, type Sim } from '../src/sim/Sim';
import type { BirdView, Command, ModeConfig, SecretView } from '../src/sim/types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../src/sim/world';

export const base = loadContent();

export type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
export type Content = Mutable<ContentBundle>;

/** The real content with everything that spawns on its own switched off. */
export function quiet(): Content {
  const c = structuredClone(base) as Content;
  const biome = karooOf(c);
  for (const k of biome.pacing.keyframes) {
    k.flocks = {};
    k.flyoversPerMin = 0;
    k.popupsPerMin = 0;
  }
  biome.pacing.stampede.flyoversPerMin = 0;
  biome.pacing.stampede.popupsPerMin = 0;
  biome.events = [];
  c.powerups.crates.perHunt = 0;
  c.powerups.crates.windows = [];
  for (const w of c.weapons.weapons) w.spreadPx = 0;
  return c;
}

export function karooOf(c: Content): Mutable<Biome> {
  const b = c.biomes[0];
  if (b === undefined) throw new Error('no biome');
  return b;
}

export function newSim(c: Content, mode: ModeConfig = { id: 'classic' }, seed = 3): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

export function run(sim: Sim, ticks: number, commands: readonly Command[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks && !sim.isOver(); i++) {
    sim.step(i === 0 ? commands : []);
    out.push(...sim.drainEvents());
  }
  return out;
}

export function ofType<T extends SimEvent['type']>(
  events: readonly SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

export function scrollFactorOf(c: Content, layerId: string): number {
  const l = karooOf(c).layers.find((x) => x.id === layerId);
  if (l === undefined) throw new Error(`no layer ${layerId}`);
  return l.scrollFactor;
}

/** Camera centred on a layer point, and a shot at it. */
export function aimAt(sf: number, x: number, y: number): Command[] {
  const cx = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (x - 960) / sf + 960));
  const q = Math.round(cx * 2) / 2;
  return [
    { t: 'cameraTarget', cx: q },
    { t: 'fire', dx: planeToDx(q, sf, x), sy: y },
  ];
}

export function secretOf(sim: Sim, propId: string): SecretView {
  const s = sim.snapshot().secrets.find((x) => x.propId === propId);
  if (s === undefined) throw new Error(`no secret ${propId}`);
  return s;
}

/** Fires at a secret part (as the current snapshot shows it) and returns that tick's events. */
export function shootPart(sim: Sim, c: Content, propId: string, partId: string): SimEvent[] {
  const s = secretOf(sim, propId);
  const part = s.parts.find((p) => p.id === partId);
  if (part === undefined) throw new Error(`no part ${partId}`);
  return run(sim, 1, aimAt(scrollFactorOf(c, s.layerId), part.x, part.y));
}

export function shootBird(sim: Sim, c: Content, bird: BirdView): SimEvent[] {
  const plane = c.scoring.planes[bird.plane];
  const creature = c.birds.creatures.find((x) => x.id === bird.creature);
  const body = creature !== undefined && 'hitbox' in creature ? creature.hitbox.body : null;
  const bx = bird.x + (body?.ox ?? 0) * plane.scale * bird.facing;
  const by = bird.y + (body?.oy ?? 0) * plane.scale;
  return run(sim, 1, aimAt(plane.scrollFactor, bx, by));
}

/** birdSpawned events for one creature (quiet content still starts with one fly-over group). */
export function spawnsOf(
  events: readonly SimEvent[],
  creature: string,
): Extract<SimEvent, { type: 'birdSpawned' }>[] {
  return ofType(events, 'birdSpawned').filter((e) => e.creature === creature);
}

/** Steps until a bird of `creature` is hittable and in reach of the camera. */
export function waitForBird(sim: Sim, c: Content, creature: string, maxTicks = 3600): BirdView {
  for (let i = 0; i < maxTicks && !sim.isOver(); i++) {
    const b = sim.snapshot().birds.find((x) => x.creature === creature && x.hittable);
    if (b !== undefined) {
      const sf = c.scoring.planes[b.plane].scrollFactor;
      const cx = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (b.x - 960) / sf + 960));
      if (Math.abs(planeToDx(cx, sf, b.x)) < 600) return b;
    }
    run(sim, 1);
  }
  throw new Error(`${creature} never came in reach`);
}

/** Waits out the gun's fire cooldown. */
export const settle = (sim: Sim): SimEvent[] => run(sim, 12);

/** A mid flock is on the plane before the test starts. */
export function withMidFlock(c: Content): Content {
  for (const k of karooOf(c).pacing.keyframes) k.flocks = { mid: 1 };
  return c;
}

export function eventEntry(id: Biome['events'][number]['id']): Biome['events'][number] {
  const e = karooOf(base as Content).events.find((x) => x.id === id);
  if (e === undefined) throw new Error(`no event ${id}`);
  return structuredClone(e);
}

/** Schedules exactly one of a biome event right at the start. */
export function onlyEvent(c: Content, id: Biome['events'][number]['id']): Content {
  const e = eventEntry(id) as Mutable<Biome['events'][number]>;
  e.perHunt = [1, 1];
  e.window = [0.01, 0.01];
  karooOf(c).events = [e];
  return c;
}
