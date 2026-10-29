// v1.7 (D-044): content checks for the meerkat colonies, on every map a biome can play (the plain
// biome, each weekday layout, and each layout with each bonus map). A colony sits on a near or
// mid plane layer, inside the layer, clear of the other colony and of the props and secret parts
// on its own layer, and its meerkats (standing tall) never overlap the bands where birds or
// secret parts behind it can be (a pellet stops on a meerkat before it reaches them).
import { resolveMap } from '../sim/maps';
import { coreWidth } from '../sim/world';
import type { Biome, ContentBundle, Creature } from './schemas';

type Hitbox = Extract<Creature, { hitbox: unknown }>['hitbox'];

/** Top and bottom of a hitbox from its sim position (scale 1). */
function extent(h: Hitbox): { top: number; bottom: number } {
  const tops = [h.body.oy - h.body.ry];
  const bottoms = [h.body.oy + h.body.ry];
  if (h.head !== undefined) {
    tops.push(h.head.oy - h.head.r);
    bottoms.push(h.head.oy + h.head.r);
  }
  return { top: Math.min(...tops), bottom: Math.max(...bottoms) };
}

const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] < b[1] && b[0] < a[1];

/** Clear space (layer px) a colony keeps from a prop or secret part on its own layer. */
const CLEAR_PX = 40;

export function colonyIssues(bundle: ContentBundle, base: Biome): string[] {
  const out: string[] = [];
  const mk = bundle.birds.meerkats;
  const { planes } = bundle.scoring;
  const meerkatTop = Math.min(
    extent(mk.hitboxes.tall).top,
    extent(mk.hitboxes.low).top,
    extent(mk.hitboxes.peek).top,
  );
  const maps: { name: string; layout?: string; bonus?: string }[] = [{ name: 'the plain biome' }];
  for (const l of base.layouts) {
    maps.push({ name: `layout "${l.id}"`, layout: l.id });
    for (const b of base.bonusMaps)
      maps.push({ name: `layout "${l.id}" + bonus map "${b.id}"`, layout: l.id, bonus: b.id });
  }
  const anyColonies =
    (base.colonies ?? []).length > 0 || base.layouts.some((l) => (l.colonies ?? []).length > 0);
  const seen = new Set<string>();
  for (const map of maps) {
    const m = resolveMap(base, map.layout, map.bonus).biome;
    const colonies = m.colonies ?? [];
    if (anyColonies && map.layout !== undefined && colonies.length === 0)
      out.push(`${map.name} has no meerkat colony (every map of a colony biome has 1–2)`);
    const ids = new Set<string>();
    const spans: { layer: string; span: [number, number]; id: string }[] = [];
    for (const c of colonies) {
      const key = (msg: string): void => {
        const text = `${map.name}: colony "${c.id}" ${msg}`;
        // The same colony fails the same way on many maps: say it once per biome.
        const once = `colony "${c.id}" ${msg}`;
        if (!seen.has(once)) out.push(text);
        seen.add(once);
      };
      if (ids.has(c.id)) key('is listed twice');
      ids.add(c.id);
      const layer = m.layers.find((l) => l.id === c.layer);
      if (layer === undefined) {
        key(`is on unknown layer "${c.layer}"`);
        continue;
      }
      const plane = layer.plane;
      if (plane !== 'near' && plane !== 'mid') {
        key(`is on layer "${c.layer}", which is not the near or mid plane`);
        continue;
      }
      const scale = planes[plane].scale;
      const w = coreWidth(layer.scrollFactor);
      const xs = c.burrows.map((b) => c.u * w + b.dx);
      const dxs = c.burrows.map((b) => b.dx);
      if (dxs.some((d, i) => i > 0 && d <= (dxs[i - 1] ?? d)))
        key('has burrows out of order (dx must increase west to east)');
      const reach = mk.forageRadiusPx * scale;
      const span: [number, number] = [Math.min(...xs) - reach, Math.max(...xs) + reach];
      if (span[0] < 0 || span[1] > w) key(`runs off its layer (${Math.round(span[0])}…${Math.round(span[1])} of ${w} px)`);
      for (const o of spans)
        if (o.layer === c.layer && overlaps(o.span, span)) key(`overlaps colony "${o.id}"`);
      spans.push({ layer: c.layer, span, id: c.id });
      // Standing meerkats, from the mounds' ground line up. The sentinel stands on the highest
      // mound, and a peeking head rises from a hole on its mound, so the band starts that much
      // higher (review of v1.7).
      const highest = Math.max(...c.burrows.map((b) => b.mound));
      const band: [number, number] = [c.y - highest + meerkatTop * scale, c.y];
      if (band[1] > 1080) key('sits below the screen');
      // Its own layer: props and secret parts it would cover (or that would cover it).
      for (const p of m.props) {
        if (p.layer !== c.layer) continue;
        const px = p.u * w;
        const shapes = [
          ...(p.occluder === undefined ? [] : [p.occluder]),
          ...(p.secret === undefined
            ? []
            : p.secret.type === 'multiHit'
              ? p.secret.parts.map((x) => x.shape)
              : [p.secret.part.shape]),
        ];
        for (const s of shapes) {
          const hw = s.type === 'rect' ? s.w / 2 : s.rx;
          const hh = s.type === 'rect' ? s.h / 2 : s.ry;
          const sx: [number, number] = [px + s.ox - hw - CLEAR_PX, px + s.ox + hw + CLEAR_PX];
          const sy: [number, number] = [p.y + s.oy - hh, p.y + s.oy + hh];
          if (overlaps(sx, span) && overlaps(sy, band)) key(`overlaps prop "${p.id}"`);
        }
      }
      // Behind it: the bird bands of the planes further back, and secret parts on those layers.
      for (const msg of behindIssues(bundle, base, m, layer.scrollFactor, band)) key(msg);
    }
  }
  return out;
}

/** The creatures a biome can show: its spawn table, its events and its season's boss. */
function biomeTargets(
  bundle: ContentBundle,
  base: Biome,
): Extract<Creature, { kind: 'target' | 'boss' | 'nonTarget' }>[] {
  const inBiome = new Set([
    ...base.spawnTable.map((e) => e.creature),
    ...base.events.flatMap((e) => (e.creature === undefined ? [] : [e.creature])),
    ...bundle.run.seasons.filter((x) => x.biome === base.id).map((x) => x.boss),
  ]);
  return bundle.birds.creatures.filter(
    (c): c is Extract<Creature, { kind: 'target' | 'boss' | 'nonTarget' }> =>
      c.kind !== 'helper' && inBiome.has(c.id),
  );
}

/** Which lanes a creature uses: walkers the ground, flyers the sky, pop-ups the grass line. */
function lanesOf(c: Creature): ('groundY' | 'skyY' | 'popupY')[] {
  const b = c.behaviours;
  const out: ('groundY' | 'skyY' | 'popupY')[] = [];
  if (b.includes('flock') || b.includes('hop') || (b.includes('boss') && !b.includes('lightningOnly')))
    out.push('groundY');
  if (b.some((x) => x === 'flock' || x === 'flyover' || x === 'flyoverEvent' || x === 'boss'))
    out.push('skyY');
  if (b.includes('popup')) out.push('popupY');
  return out;
}

/**
 * v1.7d (D-059, shared with the ostriches): what a ground animal standing in the y band `band`
 * on a layer with scroll factor `factor` would hide behind it — the bird bands of the planes
 * further back and the secret parts on those layers.
 */
export function behindIssues(
  bundle: ContentBundle,
  base: Biome,
  m: Biome,
  factor: number,
  band: readonly [number, number],
): string[] {
  const out: string[] = [];
  const { planes } = bundle.scoring;
  const targets = biomeTargets(bundle, base);
  for (const back of m.layers) {
    if (back.scrollFactor >= factor) continue;
    const bp = back.plane;
    if (bp !== undefined) {
      const lane = m.lanes[bp];
      const s = planes[bp].scale;
      for (const t of targets) {
        if (!t.planes.includes(bp)) continue;
        const e = extent(t.hitbox);
        for (const r of lanesOf(t).map((k) => lane?.[k])) {
          if (r === undefined) continue;
          const birds: [number, number] = [r[0] + e.top * s, r[1] + e.bottom * s];
          if (overlaps(birds, band))
            out.push(`stands in front of the ${bp} plane's birds (y ${Math.round(birds[0])}…${Math.round(birds[1])})`);
        }
      }
    }
    for (const p of m.props) {
      if (p.layer !== back.id || p.secret === undefined) continue;
      const shapes =
        p.secret.type === 'multiHit' ? p.secret.parts.map((x) => x.shape) : [p.secret.part.shape];
      for (const s of shapes) {
        const hh = s.type === 'rect' ? s.h / 2 : s.ry;
        // A rotor's parts swing round its hub: allow its full reach.
        const rot = p.secret.type === 'multiHit' ? p.secret.rotor : undefined;
        const reachY = rot === undefined ? 0 : Math.abs(s.oy) + hh;
        const cy = p.y + (rot?.oy ?? 0) + (rot === undefined ? s.oy : 0);
        if (overlaps([cy - hh - reachY, cy + hh + reachY], band))
          out.push(`stands in front of secret "${p.id}"`);
      }
    }
  }
  return out;
}
