// v1.8 (D-050): how long a tin-can juggle lasts for a good shot, headless. The apex juggler
// (tools/bots.ts) knocks each can of the day's fence off and shoots it once per arc at the top,
// seeing it `--lag` ticks late, with a Gaussian aim error (`--err`, design px) and the gun's real
// cooldown and reloads; it ignores the birds. Prints how each can's juggle ended: its chain, and
// how many went "Weg!".
//   npx tsx tools/juggle-check.ts [--biome karoo-autumn] [--layout wed] [--bonus dieVerste]
//          [--seeds 50] [--err 10] [--lag 6] [--weapon dubbelloop] [--sight scope_small]
//          [--set path=json …]
import { createSim } from '../src/sim/Sim';
import { apexJuggler } from './bots';
import { withOverrides } from './contentOverrides';
import { withRifle, RIFLE_STYLES } from './rifleBot';
import { loadContent } from './testContent';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sets = process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1] ?? ''] : []));
const content = withOverrides(loadContent(), sets);
const biome = arg('biome', 'karoo-autumn');
const layout = arg('layout', 'wed');
const bonus = opt('bonus');
const sight = opt('sight');
const seeds = Number(arg('seeds', '50'));
const err = Number(arg('err', '10'));
const lag = Number(arg('lag', '6'));
const weapon = arg('weapon', 'dubbelloop');

export interface JuggleStats {
  readonly chains: number[];
  readonly weg: number;
}

export function juggleRun(seed: number): JuggleStats {
  const sim = createSim({
    seed,
    content,
    mode: {
      id: 'classic',
      biome,
      layout,
      weapon,
      omen: false,
      ...(bonus === undefined ? {} : { bonus }),
      ...(sight === undefined ? {} : { sight }),
    },
    inputKind: 'pointer',
  });
  const idle = { next: () => [] };
  const bot = withRifle(
    apexJuggler(idle, seed, content, 'pointer', { lagTicks: lag, sigmaPx: err, seekCans: true }),
    content,
    seed,
    RIFLE_STYLES.patient,
  );
  const chains: number[] = [];
  const lastChain = new Map<number, number>();
  let weg = 0;
  while (!sim.isOver()) {
    const s = sim.snapshot();
    if (s.cans === undefined) break;
    if (s.cans.cans.every((k) => k.state === 'landed' || k.state === 'gone')) break;
    sim.step(bot.next(s));
    for (const e of sim.drainEvents()) {
      if (e.type === 'canKnocked' || e.type === 'canJuggled') lastChain.set(e.canId, e.chain);
      if (e.type === 'canLanded' && e.final) chains.push(lastChain.get(e.canId) ?? 0);
      if (e.type === 'canGone') {
        chains.push(e.chain);
        weg++;
      }
    }
  }
  return { chains, weg };
}

if (process.argv[1]?.endsWith('juggle-check.ts')) {
  const all: number[] = [];
  let weg = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = juggleRun(s);
    all.push(...r.chains);
    weg += r.weg;
  }
  const n = Math.max(1, all.length);
  const share = (p: (c: number) => boolean): string =>
    `${((all.filter(p).length / n) * 100).toFixed(0)} %`;
  const fence = content.biomes.find((b) => b.id === biome)?.layouts.find((l) => l.id === layout)
    ?.fence?.plane;
  console.log(
    `${biome} ${layout}${bonus === undefined ? '' : `+${bonus}`} (${String(fence)} fence) · ${weapon}${sight === undefined ? '' : `/${sight}`} · lag ${String(lag)} · err ${String(err)} px · ${String(all.length)} juggles: ` +
      `chain 0 ${share((c) => c === 0)}, ≥1 ${share((c) => c >= 1)}, ≥2 ${share((c) => c >= 2)}, ≥3 ${share((c) => c >= 3)}, ≥5 ${share((c) => c >= 5)}, ≥8 ${share((c) => c >= 8)}; mean ${(all.reduce((a, b) => a + b, 0) / n).toFixed(2)}; Weg! ${String(weg)} (${((weg / n) * 100).toFixed(0)} %)`,
  );
}
