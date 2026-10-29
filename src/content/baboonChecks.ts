// v1.8b (D-062): content checks for the baboon troops, on every map a biome can play (the plain
// biome, each weekday layout, and each layout with each bonus map). A troop sits on a layer of the
// map with its seats inside the layer and its lookout on one of them; raid spot ids are unique and
// each names a prop or a u. Layouts move props, colonies and ostrich pairs, so a hunt leaves out
// the spots that are blocked on its map (src/sim/baboons/spotClear.ts); every map must keep at
// least MIN_CLEAR_SPOTS clear ones, and on the plain biome every spot must be clear.
import { resolveMap } from '../sim/maps';
import { spotBlockers } from '../sim/baboons/spotClear';
import { coreWidth } from '../sim/world';
import type { Biome, ContentBundle } from './schemas';

export const MIN_CLEAR_SPOTS = 2;

export function baboonIssues(bundle: ContentBundle, base: Biome): string[] {
  const out: string[] = [];
  const maps: { name: string; layout?: string; bonus?: string }[] = [{ name: 'the plain biome' }];
  for (const l of base.layouts) {
    maps.push({ name: `layout "${l.id}"`, layout: l.id });
    for (const b of base.bonusMaps)
      maps.push({ name: `layout "${l.id}" + bonus map "${b.id}"`, layout: l.id, bonus: b.id });
  }
  const seen = new Set<string>();
  for (const map of maps) {
    const m = resolveMap(base, map.layout, map.bonus).biome;
    const bm = m.baboons;
    if (bm === undefined) continue;
    const key = (msg: string): void => {
      if (!seen.has(msg)) out.push(`${map.name}: ${msg}`);
      seen.add(msg);
    };
    for (const t of bm.troops) {
      const layer = m.layers.find((l) => l.id === t.layer);
      if (layer === undefined) {
        key(`troop "${t.id}" is on unknown layer "${t.layer}"`);
        continue;
      }
      if (t.lookout >= t.seats.length) key(`troop "${t.id}"'s lookout seat is not one of its seats`);
      const w = coreWidth(layer.scrollFactor);
      for (const s of t.seats) {
        const x = t.u * w + s.dx;
        if (x < 0 || x > w || s.y < 0 || s.y > 1080) key(`troop "${t.id}" has a seat off its layer`);
      }
    }
    const ids = new Set<string>();
    let clear = 0;
    for (const s of bm.spots) {
      if (ids.has(s.id)) key(`raid spot "${s.id}" is listed twice`);
      ids.add(s.id);
      if ((s.prop === undefined) === (s.u === undefined))
        key(`raid spot "${s.id}" needs a prop or a u (one)`);
      const why = spotBlockers(m, s, bundle.birds, bundle.scoring.planes);
      if (why.length === 0) clear++;
      else if (map.layout === undefined)
        for (const w of why) key(`raid spot "${s.id}" ${w}`);
    }
    if (clear < MIN_CLEAR_SPOTS)
      key(`only ${clear} raid spot(s) are clear (at least ${MIN_CLEAR_SPOTS})`);
  }
  return out;
}
