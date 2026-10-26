// D-049 (perspective): runs the balance cells the plane-scale change is checked against, and
// prints before/after tables for docs/balance/perspective.md.
//   npx tsx tools/perspective-sweep.ts --tag before|after --group classic|long|namibie|touch
//          [--seeds 500] [--workers 3] [--only <cell id,…>]
//   npx tsx tools/perspective-sweep.ts --table [--before before] [--after after]
// Each cell is one `tools/balance-sim.ts --json` run; results merge into tmp/perspective/<tag>.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Cell {
  readonly id: string;
  readonly group: 'classic' | 'long' | 'namibie' | 'touch';
  readonly label: string;
  readonly args: readonly string[];
  /** The gate this cell is held to. */
  readonly gate: 'm3' | 'cap' | 'none';
}

const classic = (id: string, label: string, weapon: string, sight?: string): Cell => ({
  id: `classic.${id}`,
  group: 'classic',
  label: `Classic · ${label}`,
  args: ['--weapon', weapon, ...(sight === undefined ? [] : ['--sight', sight])],
  gate: 'm3',
});

const longRange = (
  biome: string,
  layout: string,
  bonus: string | null,
  weapon: string,
  sight: string | null,
  label: string,
  group: Cell['group'],
): Cell => ({
  id: `${biome}.${layout}${bonus === null ? '' : `+${bonus}`}.${weapon}${sight === null ? '' : `/${sight}`}`,
  group,
  label,
  args: [
    '--biome',
    biome,
    '--layout',
    layout,
    ...(bonus === null ? [] : ['--bonus', bonus]),
    '--weapon',
    weapon,
    ...(sight === null ? [] : ['--sight', sight]),
    '--bots',
    'competent',
  ],
  gate: 'cap',
});

export const CELLS: readonly Cell[] = [
  classic('dubbelloop', 'Dubbelloop', 'dubbelloop'),
  classic('pomp', 'Pomp', 'pomp'),
  classic('windbuks', 'Windbuks', 'windbuks'),
  classic('kettie', 'Kettie', 'kettie'),
  classic('22iron', '.22 iron', 'twee_twee', 'iron'),
  classic('22peep', '.22 peep', 'twee_twee', 'peep'),
  classic('22scope', '.22 scope', 'twee_twee', 'scope_small'),
  classic('langloop', 'Langloop', 'langloop'),
  {
    id: 'touch.dubbelloop',
    group: 'touch',
    label: 'Classic · Dubbelloop · touch',
    args: ['--weapon', 'dubbelloop', '--input', 'touch'],
    gate: 'm3',
  },
  {
    id: 'touch.22scope',
    group: 'touch',
    label: 'Classic · .22 scope · touch',
    args: ['--weapon', 'twee_twee', '--sight', 'scope_small', '--input', 'touch'],
    gate: 'm3',
  },
  ...(
    [
      ['mon', 'verder', 'dubbelloop', null, 'Karoo Verder (Mon) · Dubbelloop'],
      ['sat', 'verder', 'dubbelloop', null, 'Karoo Verder (Sat) · Dubbelloop'],
      ['sat', 'verder', 'pomp', null, 'Karoo Verder (Sat) · Pomp'],
      ['mon', 'nogVerder', 'dubbelloop', null, 'Karoo Nog Verder (Mon) · Dubbelloop'],
      ['mon', 'nogVerder', 'twee_twee', 'iron', 'Karoo Nog Verder (Mon) · .22 iron'],
      ['mon', 'nogVerder', 'twee_twee', 'scope_small', 'Karoo Nog Verder (Mon) · .22 scope'],
      ['mon', 'nogVerder', 'langloop', null, 'Karoo Nog Verder (Mon) · Langloop'],
      ['mon', 'dieVerste', 'twee_twee', 'scope_small', 'Karoo Die Verste (Mon) · .22 scope'],
      ['mon', 'dieVerste', 'langloop', null, 'Karoo Die Verste (Mon) · Langloop'],
    ] as const
  ).map(([l, b, w, s, label]) => longRange('karoo-autumn', l, b, w, s, label, 'long')),
  ...(
    [
      ['tue', 'twee_twee', 'scope_small', 'Namibië Tuesday · .22 scope'],
      ['thu', 'twee_twee', 'scope_small', 'Namibië Thursday · .22 scope'],
      ['sat', 'twee_twee', 'scope_small', 'Namibië Saturday · .22 scope'],
      ['sun', 'twee_twee', 'scope_small', 'Namibië Sunday · .22 scope'],
      ['sat', 'langloop', null, 'Namibië Saturday · Langloop'],
    ] as const
  ).map(([l, w, s, label]) => longRange('namibie', l, null, w, s, label, 'namibie')),
];

interface Summary {
  readonly bot: string;
  readonly mean: number;
  readonly accuracy: number;
  readonly verPerHunt: number;
}
interface Result {
  readonly summaries: readonly Summary[];
  readonly gates: readonly { name: string; pass: boolean; detail: string }[];
}

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const dir = join(import.meta.dirname, '..', 'tmp', 'perspective');
const fileOf = (tag: string): string => join(dir, `${tag}.json`);
const load = (tag: string): Record<string, Result> =>
  existsSync(fileOf(tag))
    ? (JSON.parse(readFileSync(fileOf(tag), 'utf8')) as Record<string, Result>)
    : {};

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

function cellRows(c: Cell, b: Result | undefined, a: Result | undefined): string[] {
  const bots = (a ?? b)?.summaries.map((s) => s.bot) ?? [];
  return bots.map((bot) => {
    const sb = b?.summaries.find((s) => s.bot === bot);
    const sa = a?.summaries.find((s) => s.bot === bot);
    const ch = sb !== undefined && sa !== undefined ? (sa.mean / sb.mean - 1) * 100 : NaN;
    const acc = (s?: Summary): string =>
      s === undefined ? '—' : `${Math.round(s.accuracy * 100)} %`;
    const gate =
      c.gate === 'cap'
        ? sa === undefined
          ? '—'
          : sa.mean <= 4500
            ? 'PASS (≤ 4 500)'
            : 'over 4 500'
        : bot === 'competent'
          ? (a?.gates.map((g) => (g.pass ? 'PASS' : 'FAIL')).join(' / ') ?? '—')
          : '';
    return `| ${c.label} | ${bot} | ${sb === undefined ? '—' : fmt(sb.mean)} | ${sa === undefined ? '—' : fmt(sa.mean)} | ${Number.isNaN(ch) ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(1)} %`} | ${acc(sb)} → ${acc(sa)} | ${gate} |`;
  });
}

if (process.argv.includes('--table')) {
  const before = load(arg('before', 'before'));
  const after = load(arg('after', 'after'));
  console.log('| Cell | Bot | Before | After | Change | Accuracy | Gates (after) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const c of CELLS) {
    if (before[c.id] === undefined && after[c.id] === undefined) continue;
    for (const r of cellRows(c, before[c.id], after[c.id])) console.log(r);
  }
} else {
  const tag = arg('tag');
  const group = arg('group');
  const only = arg('only')
    .split(',')
    .filter((s) => s !== '');
  if (tag === '') throw new Error('--tag before|after');
  const seeds = arg('seeds', '500');
  const workers = arg('workers', '3');
  mkdirSync(dir, { recursive: true });
  for (const c of CELLS) {
    if (only.length > 0 ? !only.includes(c.id) : c.group !== group) continue;
    const t0 = Date.now();
    const out = execFileSync(
      'npx',
      [
        'tsx',
        'tools/balance-sim.ts',
        '--seeds',
        seeds,
        '--workers',
        workers,
        ...c.args,
        '--json',
        ...process.argv.slice(2).filter((s, i, all) => s === '--set' || all[i - 1] === '--set'),
      ],
      { encoding: 'utf8', maxBuffer: 1 << 26 },
    );
    const json = out.slice(out.indexOf('{'));
    const r = JSON.parse(json) as Result;
    const all = load(tag);
    all[c.id] = { summaries: r.summaries, gates: r.gates };
    writeFileSync(fileOf(tag), JSON.stringify(all, null, 1));
    const comp = r.summaries.find((s) => s.bot === 'competent');
    console.log(
      `${c.id}: competent ${comp === undefined ? '—' : fmt(comp.mean)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
    );
  }
}
