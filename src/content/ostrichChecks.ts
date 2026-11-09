// v1.7d (D-059): content checks for the ostrich pairs, on every map a biome can play (the plain
// biome, each weekday layout, and each layout with each bonus map). A pair stands on a near or
// mid plane layer, inside the layer, clear of the meerkat colonies and of the secret parts on its
// own layer, and standing tall it never covers the bands where birds or secret parts behind it
// can be (a pellet stopped on an ostrich before it reached them) — v1.17b (D-080): the
// true-size pair does cover them, so its pellets pass through instead (hitTest.ts).
import { resolveMap } from '../sim/maps';
import { coreWidth } from '../sim/world';
import { behindIssues } from './colonyChecks';
import type { Biome, ContentBundle } from './schemas';

const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] < b[1] && b[0] < a[1];

/** Clear space (layer px) a pair keeps from a colony or secret part on its own layer. */
const CLEAR_PX = 40;

/** v1.17b (D-080): what a true-size pair stands in front of (the bands behind it), per map. */
export function ostrichBehind(bundle: ContentBundle, base: Biome): string[] {
  const T = bundle.birds.ostriches;
  const out: string[] = [];
  for (const f of base.ostriches ?? []) {
    const layer = base.layers.find((l) => l.id === f.layer);
    const plane = layer?.plane;
    if (layer === undefined || (plane !== 'near' && plane !== 'mid')) continue;
    const scale = bundle.scoring.planes[plane].scale;
    const band: [number, number] = [f.y - T.heightPx * T.sizeMul * scale, f.y];
    out.push(...behindIssues(bundle, base, base, layer.scrollFactor, band));
  }
  return out;
}

export function ostrichIssues(bundle: ContentBundle, base: Biome): string[] {
  const out: string[] = [];
  const T = bundle.birds.ostriches;
  const mk = bundle.birds.meerkats;
  const { planes } = bundle.scoring;
  // v1.17b (D-080): the birds and the nest at their true size (sizeMul).
  const halfW =
    Math.max(
      T.hitboxes.stand.body.rx + Math.abs(T.hitboxes.stand.body.ox),
      T.hitboxes.stand.neck.rx + Math.abs(T.hitboxes.stand.neck.ox),
      T.hitboxes.sit.body.rx + Math.abs(T.hitboxes.sit.body.ox),
      T.hitboxes.nest.rx,
    ) * T.sizeMul;
  const maps: { name: string; layout?: string; bonus?: string }[] = [{ name: 'the plain biome' }];
  for (const l of base.layouts) {
    maps.push({ name: `layout "${l.id}"`, layout: l.id });
    for (const b of base.bonusMaps)
      maps.push({ name: `layout "${l.id}" + bonus map "${b.id}"`, layout: l.id, bonus: b.id });
  }
  const seen = new Set<string>();
  for (const map of maps) {
    const m = resolveMap(base, map.layout, map.bonus).biome;
    const ids = new Set<string>();
    const spans: { layer: string; span: [number, number]; id: string }[] = [];
    for (const f of m.ostriches ?? []) {
      const key = (msg: string): void => {
        const once = `ostrich pair "${f.id}" ${msg}`;
        if (!seen.has(once)) out.push(`${map.name}: ${once}`);
        seen.add(once);
      };
      if (ids.has(f.id)) key('is listed twice');
      ids.add(f.id);
      const layer = m.layers.find((l) => l.id === f.layer);
      if (layer === undefined) {
        key(`is on unknown layer "${f.layer}"`);
        continue;
      }
      const plane = layer.plane;
      if (plane !== 'near' && plane !== 'mid') {
        key(`is on layer "${f.layer}", which is not the near or mid plane`);
        continue;
      }
      const scale = planes[plane].scale;
      const w = coreWidth(layer.scrollFactor);
      const cx = f.u * w;
      const reach = (f.rangePx + halfW) * scale;
      const span: [number, number] = [cx - reach, cx + reach];
      if (cx - f.rangePx * scale < 0 || cx + f.rangePx * scale > w)
        key(`runs off its layer (${Math.round(span[0])}…${Math.round(span[1])} of ${w} px)`);
      const band: [number, number] = [f.y - T.heightPx * T.sizeMul * scale, f.y];
      if (band[1] > 1080) key('stands below the screen');
      for (const o of spans)
        if (o.layer === f.layer && overlaps(o.span, span)) key(`overlaps pair "${o.id}"`);
      spans.push({ layer: f.layer, span, id: f.id });
      // Meerkat colonies on its own layer (and their foraging reach).
      for (const c of m.colonies ?? []) {
        if (c.layer !== f.layer) continue;
        const xs = c.burrows.map((b) => c.u * w + b.dx);
        const r = mk.forageRadiusPx * scale + CLEAR_PX;
        if (overlaps([Math.min(...xs) - r, Math.max(...xs) + r], span))
          key(`overlaps meerkat colony "${c.id}"`);
      }
      // Secret parts on its own layer.
      for (const p of m.props) {
        if (p.layer !== f.layer || p.secret === undefined) continue;
        const shapes =
          p.secret.type === 'multiHit' ? p.secret.parts.map((x) => x.shape) : [p.secret.part.shape];
        for (const s of shapes) {
          const hw = s.type === 'rect' ? s.w / 2 : s.rx;
          const hh = s.type === 'rect' ? s.h / 2 : s.ry;
          const px = p.u * w + s.ox;
          if (
            overlaps([px - hw - CLEAR_PX, px + hw + CLEAR_PX], span) &&
            overlaps([p.y + s.oy - hh, p.y + s.oy + hh], band)
          )
            key(`overlaps secret "${p.id}"`);
        }
      }
      // v1.17b (D-080): no "behind" check any more: a pellet passes through an ostrich and its
      // nest (hitTest.ts, like a cameo), so the birds and parts behind a true-size pair (553 px
      // tall on the mid plane, in front of the far and Ver bands wherever it stands) still take
      // it. ostrichBehind() below keeps the check for the record (ostrichChecks.test.ts).
    }
  }
  return out;
}
