// v1.8 (D-050): the Blikkies balance cells, run in this one process (no workers: the box runs out
// of memory with many) and merged into docs/balance/blikkies/<tag>.json, then printed as the
// tables of docs/balance/v1.8-blikkies.md.
//   npx tsx tools/blikkies-sweep.ts --tag t100 --seeds 100 [--only <cell id,…>] [--group maps|guns]
//   npx tsx tools/blikkies-sweep.ts --tag t500 --table
// Cells (Classic, pointer, the day's layout, its omen as the mode says):
//   maps: every weekday map with a fence × { competent "before" (the fence's cans removed — the
//         map as main plays it), competent, canHappy } with the Dubbelloop;
//   guns: the caps — every gun with the canHappy bot on a near, a mid and a far fence day, and the
//         .22 scope on Die Verste (the fence on the Ver strip).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { playRows, type HuntRow, type Job } from './balance-sim';
import type { BotKind } from './bots';
import { loadContent } from './testContent';

interface Cell {
  readonly id: string;
  readonly group: 'maps' | 'guns';
  readonly label: string;
  readonly job: Omit<Job, 'seeds'>;
}

const content = loadContent();
const NAMES: Readonly<Record<string, string>> = {
  'karoo-autumn': 'Karoo',
  'bushveld-winter': 'Bushveld',
  'kalahari-summer': 'Kalahari',
  namibie: 'Namibië',
};

function cells(): Cell[] {
  const out: Cell[] = [];
  content.biomes.forEach((b, bi) => {
    b.layouts.forEach((l, li) => {
      const f = l.fence;
      if (f === undefined) return;
      const name = `${NAMES[b.id] ?? b.id} ${l.id} (${f.plane} fence)`;
      const base = {
        input: 'pointer',
        mode: 'classic',
        biome: b.id,
        layout: l.id,
        weapon: 'dubbelloop',
      } as const;
      const mk = (bot: BotKind, tag: string, overrides: string[] = []): Cell => ({
        id: `${b.id}.${l.id}.${tag}`,
        group: 'maps',
        label: `${name} · ${tag}`,
        job: { ...base, bot, overrides },
      });
      out.push(
        mk('competent', 'before', [`biomes.${String(bi)}.layouts.${String(li)}.fence.cans=[]`]),
        mk('competent', 'competent'),
        mk('canHappy', 'canHappy'),
      );
    });
  });
  // The caps: every gun, can-happy, on the Karoo's near (Wed), mid (Tue) and far (Fri) fences.
  const guns: [string, string | undefined][] = [
    ['dubbelloop', undefined],
    ['pomp', undefined],
    ['windbuks', undefined],
    ['kettie', undefined],
    ['twee_twee', 'iron'],
    ['twee_twee', 'scope_small'],
    ['langloop', undefined],
  ];
  for (const day of ['wed', 'tue', 'fri'])
    for (const [weapon, sight] of guns)
      out.push({
        id: `guns.karoo.${day}.${weapon}${sight === undefined ? '' : `/${sight}`}`,
        group: 'guns',
        label: `Karoo ${day} · ${weapon}${sight === undefined ? '' : ` ${sight}`} · canHappy`,
        job: {
          bot: 'canHappy',
          input: 'pointer',
          mode: 'classic',
          biome: 'karoo-autumn',
          layout: day,
          weapon,
          ...(sight === undefined ? {} : { sight }),
        },
      });
  for (const b of ['karoo-autumn', 'bushveld-winter', 'kalahari-summer', 'namibie']) {
    const day = content.biomes.find((x) => x.id === b)?.layouts.find((l) => l.fence)?.id ?? 'mon';
    out.push({
      id: `guns.${b}.${day}+dieVerste.twee_twee/scope_small`,
      group: 'guns',
      label: `${NAMES[b] ?? b} ${day} Die Verste (Ver fence) · .22 scope · canHappy`,
      job: {
        bot: 'canHappy',
        input: 'pointer',
        mode: 'classic',
        biome: b,
        layout: day,
        bonus: 'dieVerste',
        weapon: 'twee_twee',
        sight: 'scope_small',
      },
    });
  }
  return out;
}

interface CellResult {
  readonly id: string;
  readonly label: string;
  readonly seeds: number;
  readonly mean: number;
  readonly canMean: number;
  /** Share of the score the cans paid (sum of can points / sum of scores). */
  readonly canShare: number;
  readonly knocks: number;
  readonly airHits: number;
  readonly weg: number;
  readonly bestChain: number;
  readonly maxChain: number;
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
    canMean: sum((r) => r.canPoints) / n,
    canShare: score === 0 ? 0 : sum((r) => r.canPoints) / score,
    knocks: sum((r) => r.canKnocks) / n,
    airHits: sum((r) => r.canAirHits) / n,
    weg: sum((r) => r.canWeg) / n,
    bestChain: sum((r) => r.canBestChain) / n,
    maxChain: Math.max(0, ...rows.map((r) => r.canBestChain)),
  };
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tag = arg('tag') ?? 't100';
const dir = join(import.meta.dirname, '..', 'docs', 'balance', 'blikkies');
const file = join(dir, `${tag}.json`);
const load = (): Record<string, CellResult> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, CellResult>) : {};

if (process.argv.includes('--table')) {
  const all = load();
  const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;
  const f0 = (x: number): string => Math.round(x).toLocaleString('en-US').replace(/,/g, ' ');
  const maps = cells().filter((c) => c.group === 'maps');
  const lines: string[] = [];
  lines.push(
    '| map | competent before | competent after | change | cans' +
      "'" +
      ' share | can-happy | its cans' +
      "'" +
      ' share | knock-offs / air hits / Weg! per hunt (can-happy) | longest chain (mean / max) |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  const seen = new Set<string>();
  for (const c of maps) {
    const key = c.id.split('.').slice(0, 2).join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    const b = all[`${key}.before`];
    const a = all[`${key}.competent`];
    const h = all[`${key}.canHappy`];
    if (b === undefined || a === undefined || h === undefined) continue;
    lines.push(
      `| ${c.label.replace(/ · before$/, '')} | ${f0(b.mean)} | ${f0(a.mean)} | ${(((a.mean - b.mean) / b.mean) * 100).toFixed(1)} % | ${pct(a.canShare)} | ${f0(h.mean)} | ${pct(h.canShare)} | ${h.knocks.toFixed(2)} / ${h.airHits.toFixed(2)} / ${h.weg.toFixed(2)} | ${h.bestChain.toFixed(2)} / ${String(h.maxChain)} |`,
    );
  }
  lines.push(
    '',
    '| caps: gun cell (can-happy) | mean | cans' + "'" + ' share | under 4 500 |',
    '|---|---|---|---|',
  );
  for (const c of cells().filter((x) => x.group === 'guns')) {
    const r = all[c.id];
    if (r === undefined) continue;
    lines.push(
      `| ${c.label} | ${f0(r.mean)} | ${pct(r.canShare)} | ${r.mean <= 4500 ? 'yes' : '**no**'} |`,
    );
  }
  console.log(lines.join('\n'));
} else {
  const seeds = Number(arg('seeds') ?? '100');
  const only = arg('only')?.split(',');
  const group = arg('group');
  const todo = cells().filter(
    (c) =>
      (only === undefined || only.includes(c.id)) && (group === undefined || c.group === group),
  );
  mkdirSync(dir, { recursive: true });
  for (const c of todo) {
    const t0 = Date.now();
    const rows = playRows({ ...c.job, seeds: Array.from({ length: seeds }, (_, i) => i + 1) });
    const r = summarise(c, rows);
    const all = load();
    all[c.id] = r;
    writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
    console.log(
      `${c.id}: mean ${r.mean.toFixed(0)}, cans ${(r.canShare * 100).toFixed(1)} %, knocks ${r.knocks.toFixed(2)}, air ${r.airHits.toFixed(2)}, chain max ${String(r.maxChain)} (${String(Math.round((Date.now() - t0) / 1000))} s)`,
    );
  }
  if (process.argv.includes('--list')) for (const c of cells()) console.log(c.id);
}
