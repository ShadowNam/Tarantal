// v1.8 (D-050): content checks for the Blikkies fences, on every map a biome can play (each weekday
// layout, and each layout with each bonus map, which may move the fence back). A can stands on a
// post of its fence (one per post); the fence's plane has a ground line (`fenceY`) and is open on
// the map; the posts stay inside their layer; and a resting can (its hit capsule, with the touch
// assist) never stands in front of the bird bands or secret parts of a plane behind, nor over a
// prop, secret part or meerkat colony on its own layer (modelled on colonyChecks.ts).
import { resolveMap } from '../sim/maps';
import { hitRadius, tuningRatio } from '../sim/planes';
import { coreWidth } from '../sim/world';
import type { Biome, ContentBundle, Creature } from './schemas';

type Hitbox = Extract<Creature, { hitbox: unknown }>['hitbox'];

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

type Shape = { type: 'rect'; ox: number; oy: number; w: number; h: number } | {
  type: 'ellipse';
  ox: number;
  oy: number;
  rx: number;
  ry: number;
};

const halfW = (s: Shape): number => (s.type === 'rect' ? s.w / 2 : s.rx);
const halfH = (s: Shape): number => (s.type === 'rect' ? s.h / 2 : s.ry);

export function fenceIssues(bundle: ContentBundle, base: Biome): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const { planes, tuningRefScale } = bundle.scoring;
  const inBiome = new Set([
    ...base.spawnTable.map((e) => e.creature),
    ...base.events.flatMap((e) => (e.creature === undefined ? [] : [e.creature])),
  ]);
  const targets = bundle.birds.creatures.filter(
    (c): c is Extract<Creature, { kind: 'target' | 'boss' | 'nonTarget' }> =>
      c.kind !== 'helper' && inBiome.has(c.id),
  );
  const lanesOf = (c: Creature): ('groundY' | 'skyY' | 'popupY')[] => {
    const b = c.behaviours;
    const l: ('groundY' | 'skyY' | 'popupY')[] = [];
    if (b.includes('flock') || b.includes('hop')) l.push('groundY');
    if (b.includes('popup')) l.push('popupY');
    return l;
  };
  for (const layout of base.layouts) {
    if (layout.fence === undefined) continue;
    const maps: { name: string; bonus?: string }[] = [{ name: `layout "${layout.id}"` }];
    for (const b of base.bonusMaps)
      maps.push({ name: `layout "${layout.id}" + bonus map "${b.id}"`, bonus: b.id });
    for (const map of maps) {
      const r = resolveMap(base, layout.id, map.bonus);
      const f = r.fence;
      if (f === null) continue;
      const key = (msg: string): void => {
        const once = `${map.bonus === undefined ? '' : map.bonus + ' '}${msg}`;
        if (!seen.has(once)) out.push(`${map.name}: the fence ${msg}`);
        seen.add(once);
      };
      const posts = new Set<number>();
      for (const c of f.cans) {
        if (f.posts[c.post] === undefined) key(`has a can on post ${String(c.post)}, which it doesn't have`);
        if (posts.has(c.post)) key(`has two cans on post ${String(c.post)}`);
        posts.add(c.post);
      }
      const layer = r.biome.layers.find((l) => l.plane === f.plane);
      if (layer === undefined) {
        key(`stands on the ${f.plane} plane, which this map doesn't open`);
        continue;
      }
      const groundY = r.biome.fenceY?.[f.plane];
      if (groundY === undefined) {
        key(`stands on the ${f.plane} plane, which has no fenceY in the biome`);
        continue;
      }
      const p = planes[f.plane];
      const ratio = tuningRatio(p.scale, tuningRefScale);
      const w = coreWidth(layer.scrollFactor);
      const xs = f.posts.map((post) => f.u * w + post.dx * ratio);
      if (Math.min(...xs) < 0 || Math.max(...xs) > w) key('runs off its layer');
      if (groundY > 1080) key('stands below the screen');
      // The resting cans' hit capsules, grown by the touch assist (a pellet stops on them).
      const grow = p.aimAssistPx;
      for (const c of f.cans) {
        const post = f.posts[c.post];
        if (post === undefined) continue;
        const t = bundle.birds.cans.types[c.type];
        const rr = hitRadius(t.r, p.scale, p.minHitRadiusPx) + grow;
        const drawn = (t.r + t.half) * p.scale;
        const x = f.u * w + post.dx * ratio;
        const cy = groundY - post.h * ratio - drawn;
        const span: [number, number] = [x - rr, x + rr];
        const band: [number, number] = [cy - t.half * p.scale - rr, cy + t.half * p.scale + rr];
        const what = `can on post ${String(c.post)}`;
        // Its own layer: props' secret parts and occluders, and colonies.
        for (const prop of r.biome.props) {
          if (prop.layer !== layer.id) continue;
          const px = prop.u * w;
          const shapes: Shape[] = [
            ...(prop.secret === undefined
              ? []
              : prop.secret.type === 'multiHit'
                ? prop.secret.parts.map((x2) => x2.shape)
                : [prop.secret.part.shape]),
          ];
          for (const s of shapes) {
            const sx: [number, number] = [px + s.ox - halfW(s), px + s.ox + halfW(s)];
            const sy: [number, number] = [prop.y + s.oy - halfH(s), prop.y + s.oy + halfH(s)];
            if (overlaps(sx, span) && overlaps(sy, band)) key(`${what} covers secret "${prop.id}"`);
          }
        }
        for (const col of r.biome.colonies ?? []) {
          if (col.layer !== layer.id) continue;
          const cx = col.u * w;
          const reach = bundle.birds.meerkats.forageRadiusPx * p.scale;
          const dxs = col.burrows.map((b) => b.dx);
          const cs: [number, number] = [cx + Math.min(...dxs) - reach, cx + Math.max(...dxs) + reach];
          if (overlaps(cs, span)) key(`${what} stands over colony "${col.id}"`);
        }
        // Behind it: bird bands and secret parts.
        for (const back of r.biome.layers) {
          if (back.scrollFactor >= layer.scrollFactor) continue;
          const bp = back.plane;
          if (bp !== undefined) {
            const lane = r.biome.lanes[bp];
            const s = planes[bp].scale;
            for (const tg of targets) {
              if (!tg.planes.includes(bp)) continue;
              const e = extent(tg.hitbox);
              for (const k of lanesOf(tg)) {
                const l = lane?.[k];
                if (l === undefined) continue;
                const birds: [number, number] = [l[0] + e.top * s, l[1] + e.bottom * s];
                if (overlaps(birds, band))
                  key(`${what} stands in front of the ${bp} plane's birds (y ${String(Math.round(birds[0]))}…${String(Math.round(birds[1]))})`);
              }
            }
          }
          for (const prop of r.biome.props) {
            if (prop.layer !== back.id || prop.secret === undefined) continue;
            const shapes: Shape[] =
              prop.secret.type === 'multiHit'
                ? prop.secret.parts.map((x2) => x2.shape)
                : [prop.secret.part.shape];
            for (const s of shapes) {
              const rot = prop.secret.type === 'multiHit' ? prop.secret.rotor : undefined;
              const reachY = rot === undefined ? 0 : Math.abs(s.oy) + halfH(s);
              const cy2 = prop.y + (rot?.oy ?? 0) + (rot === undefined ? s.oy : 0);
              if (overlaps([cy2 - halfH(s) - reachY, cy2 + halfH(s) + reachY], band)) {
                // Only where it can be in line: the pan moves layers against each other, so any x.
                key(`${what} stands in front of secret "${prop.id}"`);
              }
            }
          }
        }
      }
    }
  }
  return out;
}
