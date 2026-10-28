// 1.9.3 (D-056): the makalani and far-fence balance cells, run in this one process (no workers:
// the box runs out of memory with many) and merged into docs/balance/makalani/<tag>.json, then
// printed as the tables of docs/balance/makalani.md.
//   npx tsx tools/makalani-sweep.ts --tag t100 --seeds 100 [--only <cell id,…>]
//   npx tsx tools/makalani-sweep.ts --tag t500 --table
// Cells (Classic, pointer, the day's layout, the Dubbelloop):
//   every Okavango weekday × { competent "before" (no palms: the map as main plays it),
//     competent, nutHappy (shoots every nut and can in view) };
//   Karoo Wednesday × { competent "before" (no far fence), competent, nutHappy } — the far cans;
//   the caps: nutHappy with the .22 (a rifle pops every nut) and the Pomp on Okavango Monday.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { playRows, type HuntRow, type Job } from './balance-sim';
import { loadContent } from './testContent';

interface Cell {
  readonly id: string;
  readonly label: string;
  readonly job: Omit<Job, 'seeds'>;
}

const content = loadContent();

function cells(): Cell[] {
  const out: Cell[] = [];
  const base = { input: 'pointer', mode: 'classic', weapon: 'dubbelloop' } as const;
  const oka = content.biomes.findIndex((b) => b.id === 'okavango-spring');
  content.biomes[oka]?.layouts.forEach((l, li) => {
    const job = { ...base, biome: 'okavango-spring', layout: l.id };
    const name = `Okavango ${l.id} (${String(l.palms?.length ?? 0)} palm groups)`;
    out.push(
      {
        id: `okavango.${l.id}.before`,
        label: `${name} · before`,
        job: {
          ...job,
          bot: 'competent',
          overrides: [`biomes.${String(oka)}.layouts.${String(li)}.palms=[]`],
        },
      },
      {
        id: `okavango.${l.id}.competent`,
        label: `${name} · competent`,
        job: { ...job, bot: 'competent' },
      },
      {
        id: `okavango.${l.id}.nutHappy`,
        label: `${name} · nut-happy`,
        job: { ...job, bot: 'nutHappy' },
      },
    );
  });
  const karoo = content.biomes.findIndex((b) => b.id === 'karoo-autumn');
  const wed = content.biomes[karoo]?.layouts.findIndex((l) => l.farFence !== undefined) ?? -1;
  const day = content.biomes[karoo]?.layouts[wed]?.id ?? 'wed';
  const kjob = { ...base, biome: 'karoo-autumn', layout: day };
  const kname = `Karoo ${day} (near + far fence)`;
  out.push(
    {
      id: `karoo.${day}.before`,
      label: `${kname} · before`,
      job: {
        ...kjob,
        bot: 'competent',
        overrides: [`biomes.${String(karoo)}.layouts.${String(wed)}.farFence.cans=[]`],
      },
    },
    {
      id: `karoo.${day}.competent`,
      label: `${kname} · competent`,
      job: { ...kjob, bot: 'competent' },
    },
    {
      id: `karoo.${day}.canHappy`,
      label: `${kname} · can-happy`,
      job: { ...kjob, bot: 'canHappy' },
    },
  );
  for (const [weapon, sight] of [
    ['twee_twee', 'iron'],
    ['pomp', undefined],
  ] as const)
    out.push({
      id: `caps.okavango.mon.${weapon}`,
      label: `Okavango mon · ${weapon}${sight === undefined ? '' : ` ${sight}`} · nut-happy`,
      job: {
        ...base,
        biome: 'okavango-spring',
        layout: 'mon',
        bot: 'nutHappy',
        weapon,
        ...(sight === undefined ? {} : { sight }),
      },
    });
  return out;
}

interface CellResult {
  readonly id: string;
  readonly label: string;
  readonly seeds: number;
  readonly mean: number;
  /** Share of the score the cans and the nuts paid (their points / the scores). */
  readonly canShare: number;
  readonly nutShare: number;
  readonly nutKnocks: number;
  readonly nutAirHits: number;
  readonly nutPops: number;
}

function summarise(c: Cell, rows: readonly HuntRow[]): CellResult {
  const n = Math.max(1, rows.length);
  const sum = (f: (r: HuntRow) => number): number => rows.reduce((t, r) => t + f(r), 0);
  const score = sum((r) => r.score);
  return {
    id: c.id,
    label: c.label,
    seeds: rows.length,
    mean: score / n,
    canShare: score === 0 ? 0 : sum((r) => r.canPoints) / score,
    nutShare: score === 0 ? 0 : sum((r) => r.nutPoints) / score,
    nutKnocks: sum((r) => r.nutKnocks) / n,
    nutAirHits: sum((r) => r.nutAirHits) / n,
    nutPops: sum((r) => r.nutPops) / n,
  };
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tag = arg('tag') ?? 't100';
const dir = join(import.meta.dirname, '..', 'docs', 'balance', 'makalani');
const file = join(dir, `${tag}.json`);
const load = (): Record<string, CellResult> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, CellResult>) : {};

if (process.argv.includes('--table')) {
  const all = load();
  const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;
  const f0 = (x: number): string => Math.round(x).toLocaleString('en-US').replace(/,/g, ' ');
  const lines: string[] = [
    '| map | competent before | competent after | change | cans + nuts share | nut-happy (can-happy on the Karoo) | its cans + nuts share | crack-offs / air hits / pops per hunt |',
    '|---|---|---|---|---|---|---|---|',
  ];
  const keys = [...new Set(cells().map((c) => c.id.split('.').slice(0, 2).join('.')))];
  for (const key of keys) {
    if (key.startsWith('caps')) continue;
    const b = all[`${key}.before`];
    const a = all[`${key}.competent`];
    const h = all[`${key}.nutHappy`] ?? all[`${key}.canHappy`];
    if (b === undefined || a === undefined || h === undefined) continue;
    lines.push(
      `| ${a.label.replace(/ · competent$/, '')} | ${f0(b.mean)} | ${f0(a.mean)} | ${(((a.mean - b.mean) / b.mean) * 100).toFixed(1)} % | ${pct(a.canShare + a.nutShare)} | ${f0(h.mean)} | ${pct(h.canShare + h.nutShare)} | ${h.nutKnocks.toFixed(2)} / ${h.nutAirHits.toFixed(2)} / ${h.nutPops.toFixed(2)} |`,
    );
  }
  lines.push(
    '',
    '| caps: gun cell | mean | cans + nuts share | pops per hunt |',
    '|---|---|---|---|',
  );
  for (const c of cells().filter((x) => x.id.startsWith('caps'))) {
    const r = all[c.id];
    if (r === undefined) continue;
    lines.push(
      `| ${c.label} | ${f0(r.mean)} | ${pct(r.canShare + r.nutShare)} | ${r.nutPops.toFixed(2)} |`,
    );
  }
  console.log(lines.join('\n'));
} else {
  const seeds = Number(arg('seeds') ?? '100');
  const only = arg('only')?.split(',');
  const todo = cells().filter((c) => only === undefined || only.includes(c.id));
  mkdirSync(dir, { recursive: true });
  for (const c of todo) {
    const t0 = Date.now();
    const rows = playRows({ ...c.job, seeds: Array.from({ length: seeds }, (_, i) => i + 1) });
    const r = summarise(c, rows);
    const all = load();
    all[c.id] = r;
    writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
    console.log(
      `${c.id}: mean ${r.mean.toFixed(0)}, cans ${(r.canShare * 100).toFixed(1)} %, nuts ${(r.nutShare * 100).toFixed(1)} %, knocks ${r.nutKnocks.toFixed(2)}, air ${r.nutAirHits.toFixed(2)}, pops ${r.nutPops.toFixed(2)} (${String(Math.round((Date.now() - t0) / 1000))} s)`,
    );
  }
  if (process.argv.includes('--list')) for (const c of cells()) console.log(c.id);
}
