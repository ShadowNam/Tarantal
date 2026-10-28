// 1.9.3 (D-056): content checks for the makalani palms, on every map a biome can play (each
// weekday layout, and each layout with each bonus map, which may move the palms back). A palm
// group stands on an open plane with a ground line (`palmY`), has art for that plane, stays inside
// its layer, never stands over a prop, a secret part, a meerkat colony or another palm group on
// its own layer, and its hanging nuts (their hit circles, with the touch assist) never hang in
// front of the bird bands or secret parts of a plane behind (modelled on fenceChecks.ts).
import { resolveMap } from '../sim/maps';
import { hitRadius } from '../sim/planes';
import { coreWidth } from '../sim/world';
import type { Biome, ContentBundle, Creature } from './schemas';

type Hitbox = Extract<Creature, { hitbox: unknown }>['hitbox'];
type Shape =
  | { type: 'rect'; ox: number; oy: number; w: number; h: number }
  | { type: 'ellipse'; ox: number; oy: number; rx: number; ry: number };

const halfW = (s: Shape): number => (s.type === 'rect' ? s.w / 2 : s.rx);
const halfH = (s: Shape): number => (s.type === 'rect' ? s.h / 2 : s.ry);
const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] < b[1] && b[0] < a[1];

function extent(h: Hitbox): { top: number; bottom: number } {
  const tops = [h.body.oy - h.body.ry];
  const bottoms = [h.body.oy + h.body.ry];
  if (h.head !== undefined) {
    tops.push(h.head.oy - h.head.r);
    bottoms.push(h.head.oy + h.head.r);
  }
  return { top: Math.min(...tops), bottom: Math.max(...bottoms) };
}

/** The lowest slot of a full cluster below its anchor, in nut diameters (makalani.ts SLOTS). */
const CLUSTER_DEPTH = 2.02;
const CLUSTER_HALF_W = 1.46;

export function palmIssues(bundle: ContentBundle, base: Biome): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const { planes } = bundle.scoring;
  const m = bundle.birds.makalani;
  const inBiome = new Set([
    ...base.spawnTable.map((e) => e.creature),
    ...base.events.flatMap((e) => (e.creature === undefined ? [] : [e.creature])),
  ]);
  const targets = bundle.birds.creatures.filter(
    (c): c is Extract<Creature, { kind: 'target' | 'boss' | 'nonTarget' }> =>
      c.kind !== 'helper' && inBiome.has(c.id),
  );
  for (const layout of base.layouts) {
    if (layout.palms === undefined) continue;
    const maps: { name: string; bonus?: string }[] = [{ name: `layout "${layout.id}"` }];
    for (const b of base.bonusMaps)
      maps.push({ name: `layout "${layout.id}" + bonus map "${b.id}"`, bonus: b.id });
    for (const map of maps) {
      const r = resolveMap(base, layout.id, map.bonus);
      const spans: { plane: string; span: [number, number]; i: number }[] = [];
      r.palms.forEach((palm, i) => {
        const key = (msg: string): void => {
          const once = `${String(i)} ${map.bonus ?? ''} ${msg}`;
          if (!seen.has(once)) out.push(`${map.name}: palm group ${String(i)} ${msg}`);
          seen.add(once);
        };
        const kind = m.palms[palm.kind];
        if (!kind.planes.includes(palm.plane)) {
          key(`(${palm.kind}) has no art on the ${palm.plane} plane`);
          return;
        }
        const layer = r.biome.layers.find((l) => l.plane === palm.plane);
        if (layer === undefined) {
          key(`stands on the ${palm.plane} plane, which this map doesn't open`);
          return;
        }
        const footY = r.biome.palmY?.[palm.plane];
        if (footY === undefined) {
          key(`stands on the ${palm.plane} plane, which has no palmY in the biome`);
          return;
        }
        if (palm.water === true && r.biome.waterY?.[palm.plane] === undefined)
          key(`stands by water on the ${palm.plane} plane, which has no waterY in the biome`);
        const p = planes[palm.plane];
        const s = p.scale;
        const w = coreWidth(layer.scrollFactor);
        const x = palm.u * w;
        const span: [number, number] = [x - kind.halfW * s, x + kind.halfW * s];
        if (span[0] < 0 || span[1] > w) key('runs off its layer');
        for (const o of spans)
          if (o.plane === palm.plane && overlaps(o.span, span))
            key(`overlaps palm group ${String(o.i)}`);
        spans.push({ plane: palm.plane, span, i });
        // Its own layer: props (occluders and secret parts) and colonies.
        for (const prop of r.biome.props) {
          if (prop.layer !== layer.id) continue;
          const px = prop.u * w;
          const shapes: Shape[] = [
            ...(prop.occluder === undefined ? [] : [prop.occluder as Shape]),
            ...(prop.secret === undefined
              ? []
              : prop.secret.type === 'multiHit'
                ? prop.secret.parts.map((x2) => x2.shape)
                : [prop.secret.part.shape]),
          ];
          for (const sh of shapes) {
            const sx: [number, number] = [px + sh.ox - halfW(sh), px + sh.ox + halfW(sh)];
            if (overlaps(sx, span)) key(`stands over prop "${prop.id}"`);
          }
        }
        for (const col of r.biome.colonies ?? []) {
          if (col.layer !== layer.id) continue;
          const cx = col.u * w;
          const reach = bundle.birds.meerkats.forageRadiusPx * s;
          const dxs = col.burrows.map((b) => b.dx);
          const cs: [number, number] = [cx + Math.min(...dxs) - reach, cx + Math.max(...dxs) + reach];
          if (overlaps(cs, span)) key(`stands over colony "${col.id}"`);
        }
        // The hanging nuts: never in front of the bird bands or secret parts of a plane behind.
        const nr = m.nutR * s;
        const rr = hitRadius(m.nutR, s, p.minHitRadiusPx) + p.aimAssistPx;
        for (const c of kind.clusters) {
          const t = kind.trunks[c.trunk];
          if (t === undefined) {
            key(`has a cluster on trunk ${String(c.trunk)}, which it doesn't have`);
            continue;
          }
          const cy = footY - t.h * s + c.dy * s;
          const band: [number, number] = [cy - rr, cy + CLUSTER_DEPTH * 2 * nr + rr];
          if (Math.abs(c.dx) * s + CLUSTER_HALF_W * 2 * nr > kind.halfW * s)
            key(`has a cluster outside its drawn width`);
          for (const back of r.biome.layers) {
            if (back.scrollFactor >= layer.scrollFactor) continue;
            const bp = back.plane;
            if (bp !== undefined) {
              const lane = r.biome.lanes[bp];
              const bs = planes[bp].scale;
              for (const tg of targets) {
                if (!tg.planes.includes(bp)) continue;
                const e = extent(tg.hitbox);
                for (const k of ['groundY', 'popupY'] as const) {
                  const l = lane?.[k];
                  if (l === undefined) continue;
                  const birds: [number, number] = [l[0] + e.top * bs, l[1] + e.bottom * bs];
                  if (overlaps(birds, band))
                    key(`hangs nuts in front of the ${bp} plane's birds (y ${String(Math.round(birds[0]))}…${String(Math.round(birds[1]))})`);
                }
              }
            }
            for (const prop of r.biome.props) {
              if (prop.layer !== back.id || prop.secret === undefined) continue;
              const shapes: Shape[] =
                prop.secret.type === 'multiHit'
                  ? prop.secret.parts.map((x2) => x2.shape)
                  : [prop.secret.part.shape];
              for (const sh of shapes) {
                const sy: [number, number] = [prop.y + sh.oy - halfH(sh), prop.y + sh.oy + halfH(sh)];
                if (overlaps(sy, band)) key(`hangs nuts in front of secret "${prop.id}"`);
              }
            }
          }
        }
      });
    }
  }
  return out;
}
