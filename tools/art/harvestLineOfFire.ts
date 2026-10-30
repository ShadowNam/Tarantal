// v1.8c (D-063): no farm worker may stand in the line of fire of anything the player shoots at in
// the Harvest. A shot aimed at an animal in front of (or behind) a worker could put its aim point on
// the worker, and a shot aimed at a worker costs the big penalty. So for every worker's place
// (working and ducking) the boxes of every target the Harvest can put up are checked over the
// whole camera sweep: the warthogs at their dig spots and on their way in and out (through the gap
// or round the panorama's end), the baboon raiders at their spots and on their way, the flocks on
// their feeding spots, the near plane's pop-ups and the fly-over lanes. Layers scroll at their own
// rate, so two boxes on different layers line up somewhere in the sweep whenever their x ranges can
// meet; screen y doesn't scroll, so they must meet in y too. Returns the clashes (empty: clear).
import type { Biome, ContentBundle } from '../../src/content/schemas';
import { CAMERA_RANGE, coreWidth } from '../../src/sim/world';
import { tuningRatio } from '../../src/sim/planes';
import { gapFlockX, workerSide } from '../../src/sim/harvest/system';

export interface LofBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly scroll: number;
  readonly what: string;
}

interface Ellipse {
  readonly rx: number;
  readonly ry: number;
  readonly ox: number;
  readonly oy: number;
}

/** The box round hit ellipses at (x, y) on a layer, scale k, both facings. */
function shapesBox(
  shapes: readonly Ellipse[],
  x: number,
  y: number,
  k: number,
  scroll: number,
  what: string,
): LofBox {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of shapes)
    for (const f of [1, -1]) {
      x0 = Math.min(x0, x + (s.ox * f - s.rx) * k);
      x1 = Math.max(x1, x + (s.ox * f + s.rx) * k);
      y0 = Math.min(y0, y + (s.oy - s.ry) * k);
      y1 = Math.max(y1, y + (s.oy + s.ry) * k);
    }
  return { x0, x1, y0, y1, scroll, what };
}

/** True when two boxes on layers that scroll at their own rate can meet on screen somewhere in
 *  the camera sweep (u = cx − 960 ∈ [0, CAMERA_RANGE]). */
export function canMeet(a: LofBox, b: LofBox): boolean {
  if (a.y1 <= b.y0 || b.y1 <= a.y0) return false;
  // Screen positions: a.x − u·a.scroll, b.x − u·b.scroll. Relative: (b.x − a.x) − u·(b.scroll − a.scroll).
  const d = b.scroll - a.scroll;
  // Overlap when b.x0 − u·d < a.x1 and b.x1 − u·d > a.x0, i.e. u·d ∈ (b.x0 − a.x1, b.x1 − a.x0).
  const lo = b.x0 - a.x1;
  const hi = b.x1 - a.x0;
  const m0 = Math.min(0, d * CAMERA_RANGE);
  const m1 = Math.max(0, d * CAMERA_RANGE);
  return m1 > lo && m0 < hi;
}

/** Every target box the Harvest can put up on its map. */
export function harvestTargets(content: ContentBundle, biome: Biome): LofBox[] {
  const h = biome.harvest;
  if (h === undefined) return [];
  const H = content.modes.modes.harvest;
  const planes = content.scoring.planes;
  const layer = (id: string) => biome.layers.find((l) => l.id === id);
  const out: LofBox[] = [];
  const W = H.warthogs;
  const hog = [
    W.hitboxes.dig.body,
    W.hitboxes.dig.head,
    W.hitboxes.trot.body,
    W.hitboxes.trot.head,
  ];
  const gl = layer(h.gap.layer);
  const gapX = gl === undefined ? 0 : h.gap.u * coreWidth(gl.scrollFactor);
  for (const d of h.digSpots) {
    const l = layer(d.layer);
    if (l === undefined) continue;
    const w = coreWidth(l.scrollFactor);
    const k = planes[d.plane].scale;
    const x = d.u * w;
    out.push(shapesBox(hog, x, d.y, k, l.scrollFactor, `warthog at ${d.layer} u ${String(d.u)}`));
    // The way in and out: through the gap (a gap-side spot on the gap's layer), else the end.
    const viaGap = d.layer === h.gap.layer && x < gapX;
    const fromX = viaGap ? gapX : x < w / 2 ? 0 : w;
    const fromY = viaGap ? h.gap.y - 4 : d.y;
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      out.push(
        shapesBox(
          hog,
          fromX + (x - fromX) * f,
          fromY + (d.y - fromY) * f,
          k,
          l.scrollFactor,
          `warthog on its way to ${d.layer} u ${String(d.u)}`,
        ),
      );
    }
  }
  // Baboon raiders at their spots and on the way (approachPx from the side they come from).
  const bb = content.birds.baboons;
  const ape = [
    bb.hitboxes.walk.body,
    bb.hitboxes.walk.head,
    bb.hitboxes.sit.body,
    bb.hitboxes.sit.head,
    bb.hitboxes.stand.body,
    bb.hitboxes.stand.head,
  ];
  for (const s of biome.baboons?.spots ?? []) {
    const l = layer(s.layer);
    if (l === undefined || s.u === undefined) continue;
    const plane = l.plane ?? 'mid';
    const k = planes[plane].scale;
    const x = s.u * coreWidth(l.scrollFactor) + s.ox;
    for (let i = 0; i <= 10; i++) {
      const px = x + s.from * bb.raids.approachPx * k * (i / 10);
      out.push(shapesBox(ape, px, s.y, k, l.scrollFactor, `raider at ${s.id}`));
    }
  }
  // Flocks on their feeding spots (the lane's ground band), pop-ups and fly-overs.
  const bird = content.birds.creatures.find((c) => c.id === 'tarentaal');
  if (bird?.kind === 'target') {
    const head = bird.hitbox.head;
    const shapes: Ellipse[] = [
      bird.hitbox.body,
      ...(head === undefined ? [] : [{ rx: head.r, ry: head.r, ox: head.ox, oy: head.oy }]),
    ];
    const fd = content.birds.flockDefaults;
    for (const sp of biome.feedingSpots ?? []) {
      const l = biome.layers.find((x) => x.plane === sp.plane);
      const lane = biome.lanes[sp.plane];
      if (l === undefined || lane?.groundY === undefined) continue;
      const k = planes[sp.plane].scale;
      const w = coreWidth(l.scrollFactor);
      // Flock spacing scales by the plane's tuning ratio (D-049), not its drawing scale.
      const ratio = tuningRatio(k, content.scoring.tuningRefScale);
      const spread = (fd.spawnSpreadPx + fd.forageWanderPx) * ratio;
      for (const y of lane.groundY) {
        const a = shapesBox(
          shapes,
          sp.u[0] * w - spread,
          y,
          k,
          l.scrollFactor,
          `flock ${sp.plane}`,
        );
        const b = shapesBox(
          shapes,
          sp.u[1] * w + spread,
          y,
          k,
          l.scrollFactor,
          `flock ${sp.plane}`,
        );
        out.push({ ...a, x1: b.x1 });
      }
    }
    // v1.8c review: the flocks that come in through the gap start round its left post
    // (gapFlockX) within spawnSpreadPx, then run into the rows (away from the workers).
    const gl2 = biome.layers.find((x) => x.id === h.gap.layer);
    const lane = biome.lanes[h.gap.plane];
    if (gl2 !== undefined && lane?.groundY !== undefined) {
      const k = planes[h.gap.plane].scale;
      const ratio = tuningRatio(k, content.scoring.tuningRefScale);
      const x = gapFlockX(h, coreWidth(gl2.scrollFactor), workerSide(h));
      const spread = content.birds.flockDefaults.spawnSpreadPx * ratio;
      for (const y of lane.groundY) {
        const a = shapesBox(shapes, x - spread, y, k, gl2.scrollFactor, 'flock through the gap');
        const b = shapesBox(shapes, x + spread, y, k, gl2.scrollFactor, 'flock through the gap');
        out.push({ ...a, x1: b.x1 });
      }
    }
    for (const plane of ['near', 'mid', 'far'] as const) {
      const l = biome.layers.find((x) => x.plane === plane);
      const lane = biome.lanes[plane];
      if (l === undefined || lane === undefined) continue;
      const k = planes[plane].scale;
      const w = coreWidth(l.scrollFactor);
      const bands = [lane.popupY, lane.skyY].filter((b) => b !== undefined);
      for (const band of bands)
        for (const y of band) {
          const a = shapesBox(shapes, 0, y, k, l.scrollFactor, `${plane} pop-ups/fly-overs`);
          out.push({ ...a, x1: w + a.x1 });
        }
    }
  }
  return out;
}

/** Each worker's place (working and ducking) as a box on the gap's layer. */
export function workerBoxes(content: ContentBundle, biome: Biome): LofBox[] {
  const h = biome.harvest;
  if (h === undefined) return [];
  const K = content.modes.modes.harvest.workers;
  const l = biome.layers.find((x) => x.id === h.gap.layer);
  if (l === undefined) return [];
  const k = content.scoring.planes[h.gap.plane].scale;
  const gapX = h.gap.u * coreWidth(l.scrollFactor);
  const shapes = [
    K.hitboxes.work.body,
    K.hitboxes.work.head,
    K.hitboxes.duck.body,
    K.hitboxes.duck.head,
  ];
  return h.workers.map((w, i) =>
    shapesBox(shapes, gapX + w.dx, w.y, k, l.scrollFactor, `worker ${String(i)}`),
  );
}

/** The clashes between the workers and the Harvest's targets (empty: clear). */
export function harvestLineOfFireIssues(content: ContentBundle, biome: Biome): string[] {
  const out = new Set<string>();
  const targets = harvestTargets(content, biome);
  for (const w of workerBoxes(content, biome))
    for (const t of targets) if (canMeet(w, t)) out.add(`${w.what} ↔ ${t.what}`);
  return [...out];
}
