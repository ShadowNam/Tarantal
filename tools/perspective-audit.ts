// D-049: `npx tsx tools/perspective-audit.ts` — for every biome (and the layouts that open the
// Ver plane), each bird plane's far animals and props: their drawn height (design px), the
// guineafowl standing on that plane, and how far the pair is from real proportions. Before =
// v1.7 (plane scales near 1 / mid 0.5 / far 0.22 / Ver 0.1, animals as drawn); after = content now.
// Prints Markdown for docs/balance/perspective.md.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { FAUNA_HERDS, lookHeight, type FaunaSpecies } from '../src/game/view/faunaHerds';
import type { PlaneId } from '../src/sim/types';
import { PLANE_SCALE_PRESETS } from '../src/game/devContent';
import { opaqueBounds, type Rgba } from './assets/image';
import { birdUnits } from './birdUnits';

export { birdUnits };

/** v1.9.0's far animals as they showed on screen (design px, adults; before D-054). */
const V19_PX: Readonly<Record<string, Partial<Record<FaunaSpecies, number>>>> = {
  'fauna/karoo_springbok_a': { springbok: 36 },
  'fauna/karoo_springbok_b': { springbok: 36 },
  'fauna/karoo_ostrich': { ostrich: 72 },
  'fauna/bushveld_giraffes_a': { giraffe: 174 },
  'fauna/bushveld_giraffes_b': { giraffe: 168 },
  'fauna/bushveld_zebra': { zebra: 45 },
  'fauna/bushveld_wildebeest': { wildebeest: 45 },
  'fauna/bushveld_elephants': { elephant: 72 },
  'fauna/okavango_elephants': { elephant: 72 },
  'fauna/okavango_lechwe': { lechwe: 36 },
  'fauna/okavango_zebra': { zebra: 45 },
  'fauna/okavango_wildebeest': { wildebeest: 45 },
  'fauna/kalahari_springbok': { springbok: 36 },
  'fauna/kalahari_ostrich': { ostrich: 72 },
  'fauna/kalahari_wildebeest': { wildebeest: 45 },
  'fauna/namibie_waterhole': { giraffe: 65, springbok: 19, zebra: 21, gemsbok: 22, ostrich: 35 },
  'fauna/namibie_gemsbok': { gemsbok: 45 },
  'fauna/namibie_ostrich': { ostrich: 72 },
  'fauna/namibie_zebra': { zebra: 45 },
};
import {
  ANIMAL_M,
  ANIMAL_MEASURE,
  birdOversize,
  GUINEAFOWL_M,
  PROP_M,
  pxPerMetre,
  targetPx,
} from './perspective';
import { loadContent } from './testContent';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'art-source');

function read(path: string): Rgba {
  const p = PNG.sync.read(readFileSync(path));
  return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
}

/** A prop sprite's opaque height in design px. */
function propPx(asset: string): number | null {
  const png = join(SRC, 'sprites', `${asset}.png`);
  if (!existsSync(png)) return null;
  const side = JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf8')) as {
    master?: number;
  };
  return (opaqueBounds(read(png))?.h ?? 0) / (side.master ?? 1);
}

const f0 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);
const fx = (n: number): string => `${(Math.round(n * 10) / 10).toFixed(1)}×`;

export function audit(): string {
  const content = loadContent();
  const now = content.scoring.planes;
  const old = PLANE_SCALE_PRESETS.v17;
  const stand = birdUnits('alert');
  const fly = birdUnits('flap');
  const out: string[] = [];
  const birdPx = (plane: PlaneId, after: boolean, units = stand): number =>
    units * (after ? now[plane].scale : old[plane].scale);

  out.push('## The guineafowl on each plane', '');
  out.push(
    `Measured from the delivered (interim) frames: standing (alert) ${f0(stand)} bird units, ` +
      `flying (wings up) ${f0(fly)}; a guineafowl stands ${GUINEAFOWL_M} m.`,
    '',
  );
  out.push(
    '| Plane | Scale before → after | Standing px | Flying px | px per metre (after) | Min hit radius | Touch assist |',
  );
  out.push('|---|---|---|---|---|---|---|');
  for (const p of ['near', 'mid', 'far', 'ver'] as const) {
    out.push(
      `| ${p} | ${old[p].scale} → ${now[p].scale} | ${f0(birdPx(p, false))} → ${f0(birdPx(p, true))} | ${f0(birdPx(p, false, fly))} → ${f0(birdPx(p, true, fly))} | ${f0(pxPerMetre(birdPx(p, true)))} | ${old[p].minHitRadiusPx} → ${now[p].minHitRadiusPx} px | ${old[p].aimAssistPx} → ${now[p].aimAssistPx} px |`,
    );
  }
  out.push('');

  out.push('## Target on-screen heights per species (after)', '');
  out.push(
    'Real proportions at the new plane scales: the height a species should be drawn at so it ' +
      'stands in true proportion to a guineafowl on the same plane (quadrupeds at the shoulder; ' +
      'giraffe and ostrich to the top of the head). The HD redraw of the far animals draws to these.',
    '',
  );
  out.push('| Species | Real (m) | Measured to | mid px | far px | Ver px |');
  out.push('|---|---|---|---|---|---|');
  out.push(
    `| guineafowl | ${GUINEAFOWL_M} | head | ${f0(birdPx('mid', true))} | ${f0(birdPx('far', true))} | ${f0(birdPx('ver', true))} |`,
  );
  for (const k of Object.keys(ANIMAL_M) as FaunaSpecies[]) {
    out.push(
      `| ${k} | ${ANIMAL_M[k]} | ${ANIMAL_MEASURE[k]} | ${f0(targetPx(ANIMAL_M[k], birdPx('mid', true)))} | ${f0(targetPx(ANIMAL_M[k], birdPx('far', true)))} | ${f0(targetPx(ANIMAL_M[k], birdPx('ver', true)))} |`,
    );
  }
  out.push('');

  out.push('## Every biome: what stands on each bird plane', '');
  out.push(
    '"Bird oversize" = (guineafowl ÷ object as drawn) ÷ (guineafowl ÷ object in life): 1.0× is ' +
      'true proportion, 8× means the bird looks eight times too big beside it. Animals are ' +
      'listed once per drawn size; the plane is the layer they stand on (far_veld = far, ver_veld = Ver).',
    '',
  );
  const verMaps = (layouts: readonly { id: string; ver?: boolean | undefined }[]): string => {
    const days = layouts.filter((l) => l.ver === true).map((l) => l.id);
    return days.length > 0
      ? `every layout (${days.join(', ')}) and Nog Verder / Die Verste`
      : 'Nog Verder and Die Verste (bonus maps)';
  };
  for (const biome of content.biomes) {
    out.push(`### ${biome.id}`, '');
    out.push(
      `Layouts: ${biome.layouts.map((l) => l.id).join(', ')} — near, mid and far on all; the Ver plane on ${verMaps(biome.layouts)}. Layouts only move props (u), so one table per biome.`,
      '',
    );
    out.push(
      '| Plane | Object | Real (m) | Drawn px before → after | Bird px before → after | Bird oversize before → after | Target px | Change |',
    );
    out.push('|---|---|---|---|---|---|---|---|');
    for (const f of FAUNA_HERDS[biome.id] ?? []) {
      const plane: PlaneId = f.layer === 'ver_veld' ? 'ver' : 'far';
      const ba = birdPx(plane, true);
      const bb = birdPx(plane, false);
      for (const kind of [...new Set(f.animals.map((a) => a.species))]) {
        const adults = f.animals.filter((a) => a.species === kind && a.variant !== 'y');
        const young =
          f.animals.length - adults.length - f.animals.filter((a) => a.species !== kind).length;
        const m = ANIMAL_M[kind];
        const before = V19_PX[f.key]?.[kind] ?? null;
        const after = lookHeight(kind, 'm', pxPerMetre(ba));
        out.push(
          `| ${plane} | ${kind} ×${adults.length}${young > 0 ? ` + ${young} young` : ''} (${f.key.replace('fauna/', '')}) | ${m} ${ANIMAL_MEASURE[kind]} | ${before === null ? '—' : f0(before)} → ${f0(after)} | ${f0(bb)} → ${f0(ba)} | ${before === null ? '—' : fx(birdOversize(ba, before, m))} → ${fx(birdOversize(ba, after, m))} | ${f0(targetPx(m, ba))} | redrawn at the target (D-054) |`,
        );
      }
    }
    for (const prop of biome.props) {
      const layer = biome.layers.find((l) => l.id === prop.layer);
      const plane = layer?.plane;
      if (plane === undefined) continue;
      const m = PROP_M[prop.asset];
      const px = propPx(prop.asset);
      if (m === undefined || m === null || px === null) continue;
      const bb = birdPx(plane, false);
      const ba = birdPx(plane, true);
      out.push(
        `| ${plane} | ${prop.id} (prop) | ${m} | ${f0(px)} → ${f0(px)} | ${f0(bb)} → ${f0(ba)} | ${fx(birdOversize(bb, px, m))} → ${fx(birdOversize(ba, px, m))} | ${f0(targetPx(m, ba))} | kept (stage-set scale, see below) |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

if (process.argv[1]?.endsWith('perspective-audit.ts')) console.log(audit());
