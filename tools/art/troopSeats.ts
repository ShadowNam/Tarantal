// v1.16 (D-078): spreads each troop's seats along its far ridge (the owner: "they need to hide
// better between the mountains and peek out"): instead of a row on one crest, ten seats over
// ±SPAN ridge px of the troop's middle, one per stretch, each on the flattest bit of skyline in
// its stretch (a peeking bust's cut lies along the edge there), the lookout on the highest. A
// stretch that puts a mother in the line of fire of something in front (troopLineOfFire.ts), or
// the Harvest's troop over far-veld art behind (troopBackdrop.ts), is left out and the search runs again.
// A troop with its own rock keeps its seats on the rock. Prints the seats (the biome files hold
// them):   npx tsx tools/art/troopSeats.ts [biome]
import type { Biome } from '../../src/content/schemas';
import { coreWidth } from '../../src/sim/world';
import { loadContent } from '../testContent';
import { ridgeLine, seatY } from './ridgeLine';
import { troopBackdropIssues } from './troopBackdrop';
import { lineOfFireIssues, loadArtData } from './troopLineOfFire';

/** Half the spread (ridge px), the seats, and how far into the art a seat's feet sit. */
export const SPAN = 520;
const SEATS = 10;
const SINK = 2;
/** Seats keep this far inside the layer's core width. */
const EDGE_PX = 40;

/** Px either side of a clashing seat left out on the next try (a backdrop clash instead lifts
 *  the lowest a seat may sit). */
const AVOID_PX = 30;

export function spreadSeats(
  biome: string,
  layer: string,
  cx: number,
  avoid: readonly (readonly [number, number])[] = [],
  maxY = Infinity,
  span = SPAN,
  /** The layer's core width: seats stay on it (content's baboonChecks). */
  width = Infinity,
): { seats: { dx: number; y: number }[]; lookout: number } {
  const line = ridgeLine(biome, layer);
  const seats: { dx: number; y: number }[] = [];
  const bin = (2 * span) / SEATS;
  for (let i = 0; i < SEATS; i++) {
    let best: { dx: number; y: number; slope: number } | null = null;
    for (let dx = -span + i * bin + 8; dx <= -span + (i + 1) * bin - 8; dx += 2) {
      const y = seatY(line, cx + dx);
      const l = line.at(cx + dx - 10);
      const r = line.at(cx + dx + 10);
      if (y === null || l === null || r === null) continue;
      if (cx + dx < EDGE_PX || cx + dx > width - EDGE_PX) continue;
      if (avoid.some(([a, b]) => dx >= a && dx <= b) || y + SINK > maxY) continue;
      // The art's top within ±6 px sideways must be within 2 px of the feet (baboonArt.test.ts).
      let near = false;
      for (let d = -6; d <= 6 && !near; d++) {
        const top = line.at(cx + dx + d);
        near = top !== null && Math.abs(top - y) <= 2;
      }
      if (!near) continue;
      const slope = Math.abs(l - r);
      if (best === null || slope < best.slope) best = { dx, y: y + SINK, slope };
    }
    if (best !== null) seats.push({ dx: best.dx, y: best.y });
  }
  let lookout = 0;
  for (let i = 1; i < seats.length; i++)
    if ((seats[i]?.y ?? 0) < (seats[lookout]?.y ?? 0)) lookout = i;
  return { seats, lookout };
}

/** The seats with every clash searched away (null: none found in `tries`). */
export function searchSeats(
  biome: Biome,
  tries = 40,
): { seats: { dx: number; y: number }[]; lookout: number } | null {
  const content = loadContent();
  const art = loadArtData(process.cwd());
  const t = biome.baboons?.troops[0];
  const layer = biome.layers.find((l) => l.id === t?.layer);
  if (t === undefined || layer === undefined || t.rock !== undefined) return null;
  const cx = t.u * coreWidth(layer.scrollFactor);
  // The widest spread that is clear (a ridge crowded with secrets in front gets a narrower one).
  for (const span of [SPAN, 420, 320, 240]) {
    const found = searchAt(biome, t, cx, coreWidth(layer.scrollFactor), span, tries, content, art);
    if (found !== null) return found;
  }
  return null;
}

function searchAt(
  biome: Biome,
  t: NonNullable<Biome['baboons']>['troops'][number],
  cx: number,
  width: number,
  span: number,
  tries: number,
  content: ReturnType<typeof loadContent>,
  art: ReturnType<typeof loadArtData>,
): { seats: { dx: number; y: number }[]; lookout: number } | null {
  const avoid: [number, number][] = [];
  let maxY = Infinity;
  for (let i = 0; i < tries; i++) {
    const out = spreadSeats(biome.id, t.layer, cx, avoid, maxY, span, width);
    const trial: Biome = {
      ...biome,
      baboons: { ...biome.baboons, spots: biome.baboons?.spots ?? [], troops: [{ ...t, ...out }] },
    };
    const fire = lineOfFireIssues(content, trial, art);
    // Checked on the Harvest's map, as troopBackdrop.test.ts does.
    const back =
      biome.id === content.modes.modes.harvest.biome ? troopBackdropIssues(content, trial) : [];
    if (fire.length === 0 && back.length === 0 && out.seats.length >= 8) return out;
    for (const f of fire) {
      const m = / seat (-?\d+) /.exec(f);
      if (m?.[1] !== undefined) avoid.push([Number(m[1]) - AVOID_PX, Number(m[1]) + AVOID_PX]);
    }
    if (back.length > 0) {
      const low = Math.max(...out.seats.map((x) => x.y));
      maxY = low - 8;
    }
  }
  return null;
}

if (process.argv[1]?.endsWith('troopSeats.ts')) {
  const only = process.argv[2];
  const content = loadContent();
  for (const b of content.biomes) {
    if (only !== undefined && only !== b.id) continue;
    if (b.baboons === undefined || b.baboons.troops[0]?.rock !== undefined) continue;
    console.log(b.id, b.baboons.troops[0]?.id, JSON.stringify(searchSeats(b)));
  }
}
