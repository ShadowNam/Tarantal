// v1.8b (D-062, review round 2): no baboon on a far ridge may sit in the line of fire of anything a
// player shoots at in front of it. A pellet aimed at a near or mid prop that isn't a hit shape in
// the sim (its view-only fruit: the Okavango's sausages), or that misses a secret's part or tell by
// a little, flies on to the ridge, and a mother there costs 15 (any other member costs nothing). For
// every map a biome can play (the plain biome, each layout, each layout with each bonus map), the
// seats mothers can take (the highest ones after the lookout's) with a sitting mother's box are
// checked against every fruit (the fruit spots), every
// secret part (a rotor's whole ring) and every tell on a near or mid layer, over the camera sweep: the
// ridge scrolls slower than the planes in front, so a ridge x lines up with a prop x somewhere in
// the sweep whenever their screen boxes can meet. Screen y doesn't scroll, so the boxes must also
// meet in y. Returns the clashes (empty: clear).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Biome, ContentBundle } from '../../src/content/schemas';
import { resolveMap } from '../../src/sim/maps';
import { CAMERA_RANGE, coreWidth } from '../../src/sim/world';

interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

interface Target extends Box {
  readonly what: string;
  readonly scroll: number;
}

interface FruitSpot {
  readonly on: string;
  readonly prop?: boolean;
  readonly x: number;
  readonly y: number;
  readonly fw: number;
  readonly fh: number;
  readonly ax: number;
  readonly ay: number;
}

/** The fruit spots (src/game/view/fruit/spots: where each view-only fruit hangs). */
export function loadArtData(root: string): { fruit: (biome: string) => readonly FruitSpot[] } {
  return {
    fruit: (biome) =>
      JSON.parse(
        readFileSync(
          join(root, 'src', 'game', 'view', 'fruit', 'spots', `fruit-${biome}.json`),
          'utf8',
        ),
      ) as FruitSpot[],
  };
}

/** A sitting mother's box round her feet at plane scale k (body and head, her baby inside). */
function motherBox(content: ContentBundle, k: number): { halfW: number; height: number } {
  const b = content.birds.baboons;
  const sit = b.hitboxes.sit;
  const m = k * b.motherScale;
  let halfW = 0;
  let height = 0;
  for (const e of [sit.body, sit.head]) {
    halfW = Math.max(halfW, e.rx + Math.abs(e.ox));
    height = Math.max(height, e.ry - e.oy);
  }
  return { halfW: halfW * m, height: height * m };
}

/** The seats mothers can take: the highest ones after the lookout's (they choose first and never
 *  walk, src/sim/baboons/baboons.ts createTroop). */
export function motherSeats(
  seats: readonly { dx: number; y: number }[],
  lookout: number,
  mothers: number,
): { dx: number; y: number }[] {
  return seats
    .filter((_, i) => i !== lookout)
    .sort((a, b) => a.y - b.y)
    .slice(0, mothers);
}

function targetsOf(
  m: Biome,
  content: ContentBundle,
  art: ReturnType<typeof loadArtData>,
): Target[] {
  const out: Target[] = [];
  const layers = new Map(m.layers.map((l) => [l.id, l]));
  const front = (id: string) => {
    const l = layers.get(id);
    return l?.plane === 'near' || l?.plane === 'mid' ? l : undefined;
  };
  for (const p of m.props) {
    const l = front(p.layer);
    const sec = p.secret;
    // A "don't shoot it" prop (the weaver nests) is no target: a player aims away from it.
    if (l === undefined || sec === undefined || sec.reward.penalty !== undefined) continue;
    const x = p.u * coreWidth(l.scrollFactor);
    // A secret's parts (rotor parts sweep a ring: its box).
    for (const part of sec.type === 'multiHit' ? sec.parts : [sec.part]) {
      const sh = part.shape;
      const hw = sh.type === 'rect' ? sh.w / 2 : sh.rx;
      const hh = sh.type === 'rect' ? sh.h / 2 : sh.ry;
      const rotor = sec.type === 'multiHit' ? sec.rotor : undefined;
      const ring = rotor !== undefined;
      const r = ring ? Math.hypot(sh.ox, sh.oy) + Math.max(hw, hh) : 0;
      const cx = rotor?.ox ?? sh.ox;
      const cy = rotor?.oy ?? sh.oy;
      out.push({
        what: `secret "${p.id}" part "${part.id}"`,
        scroll: l.scrollFactor,
        x0: x + cx - (ring ? r : hw),
        x1: x + cx + (ring ? r : hw),
        y0: p.y + cy - (ring ? r : hh),
        y1: p.y + cy + (ring ? r : hh),
      });
    }
    // Its tell animal.
    const tell = sec.tell;
    const sp = content.birds.tells.species.find((t) => t.id === tell?.species);
    if (tell !== undefined && sp !== undefined) {
      const k = sp.scale ?? 1;
      const tx = x + tell.ox + sp.hit.ox * k * (tell.facing ?? 1);
      const ty = p.y + tell.oy + sp.hit.oy * k;
      out.push({
        what: `secret "${p.id}"'s tell`,
        scroll: l.scrollFactor,
        x0: tx - sp.hit.rx * k,
        x1: tx + sp.hit.rx * k,
        y0: ty - sp.hit.ry * k,
        y1: ty + sp.hit.ry * k,
      });
    }
  }
  // The view-only fruit (a pellet that meets one flies on): on a prop or on a layer's own art.
  for (const f of art.fruit(m.id)) {
    const fx = f.x + f.ax;
    const fy = f.y + f.ay;
    const box = (l: { scrollFactor: number }, x: number, y: number, what: string): Target => ({
      what,
      scroll: l.scrollFactor,
      x0: x + fx - f.fw,
      x1: x + fx + f.fw,
      y0: y + fy - f.fh,
      y1: y + fy + f.fh,
    });
    if (f.prop === true) {
      for (const p of m.props) {
        const l = front(p.layer);
        if (p.asset !== f.on || l === undefined) continue;
        out.push(box(l, p.u * coreWidth(l.scrollFactor), p.y, `fruit on prop "${p.id}"`));
      }
    } else {
      const l = front(f.on);
      if (l !== undefined) out.push(box(l, 0, 0, `fruit on layer "${f.on}"`));
    }
  }
  return out;
}

/** True when a ridge box (scroll fr) and a target box can meet on screen somewhere in the sweep. */
function meet(r: Box, fr: number, t: Target): boolean {
  if (r.y1 <= t.y0 || t.y1 <= r.y0) return false;
  // The ridge box moves right against the target by (ft − fr) × (cx − 960), cx − 960 ∈ [0, R].
  const k = t.scroll - fr;
  const lo = t.x0 - r.x1;
  const hi = t.x1 - r.x0;
  return hi >= 0 && lo <= k * CAMERA_RANGE;
}

/** Clashes of a biome's troop seats with the targets in front, on every map it can play. */
export function lineOfFireIssues(
  content: ContentBundle,
  base: Biome,
  art: ReturnType<typeof loadArtData>,
  /** Test a troop at another u (the placement search). */
  uOverride?: number,
): string[] {
  const out = new Set<string>();
  const maps: { name: string; layout?: string; bonus?: string }[] = [{ name: 'plain' }];
  for (const l of base.layouts) {
    maps.push({ name: l.id, layout: l.id });
    for (const b of base.bonusMaps)
      maps.push({ name: `${l.id}+${b.id}`, layout: l.id, bonus: b.id });
  }
  for (const map of maps) {
    const m = resolveMap(base, map.layout, map.bonus).biome;
    const targets = targetsOf(m, content, art);
    for (const t of m.baboons?.troops ?? []) {
      // A troop that never comes on this map (chance 0) sits nowhere.
      if (t.chance === 0) continue;
      const layer = m.layers.find((l) => l.id === t.layer);
      if (layer === undefined) continue;
      const k = content.scoring.planes[t.plane].scale;
      const { halfW, height } = motherBox(content, k);
      const cx = (uOverride ?? t.u) * coreWidth(layer.scrollFactor);
      for (const s of motherSeats(t.seats, t.lookout, content.birds.baboons.troop.mothers[1])) {
        const r = { x0: cx + s.dx - halfW, x1: cx + s.dx + halfW, y0: s.y - height, y1: s.y };
        for (const tg of targets)
          if (meet(r, layer.scrollFactor, tg))
            out.add(
              `${map.name}: troop "${t.id}"'s mother seat ${s.dx} is in the line of fire of ${tg.what}`,
            );
      }
    }
  }
  return [...out];
}
