// v1.8 (D-050): how long a tin-can juggle lasts for a good shot, headless. An aimed bot knocks each
// can of the day's fence off and then shoots it in the air — at the top of each arc (`apex`), or
// whenever the gun is ready (`asap`) — keeping it in the middle of the screen, with the gun's real
// cooldown and reloads and a Gaussian aim error (`--err`, design px). Prints how each can's
// juggle ended: its chain, and how many went "Weg!".
//   npx tsx tools/juggle-check.ts [--biome karoo-autumn] [--layout wed] [--seeds 50] [--err 10]
//          [--when apex|asap] [--weapon dubbelloop] [--set path=json …]
import { planeToDx } from '../src/sim/camera';
import { createSim } from '../src/sim/Sim';
import { createStream } from '../src/sim/rng';
import type { Command, SimState } from '../src/sim/types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../src/sim/world';
import { withOverrides } from './contentOverrides';
import { loadContent } from './testContent';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const sets = process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1] ?? ''] : []));
const content = withOverrides(loadContent(), sets);
const biome = arg('biome', 'karoo-autumn');
const layout = arg('layout', 'wed');
const seeds = Number(arg('seeds', '50'));
const err = Number(arg('err', '10'));
const when = arg('when', 'apex');
const weapon = arg('weapon', 'dubbelloop');
const planes = content.scoring.planes;

export interface JuggleStats {
  readonly chains: number[];
  readonly weg: number;
}

export function juggleRun(seed: number): JuggleStats {
  const sim = createSim({
    seed,
    content,
    mode: { id: 'classic', biome, layout, weapon, omen: false },
    inputKind: 'pointer',
  });
  const rng = createStream(seed * 7919 + 1);
  const gauss = (): number =>
    Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());
  const chains: number[] = [];
  let weg = 0;
  const lastY = new Map<number, number>();
  const step = (cmds: Command[]): void => {
    sim.step(cmds);
    for (const e of sim.drainEvents()) {
      if (e.type === 'canLanded' && e.final) chains.push(lastChain.get(e.canId) ?? 0);
      if (e.type === 'canGone') {
        chains.push(e.chain);
        weg++;
      }
      if (e.type === 'canKnocked' || e.type === 'canJuggled') lastChain.set(e.canId, e.chain);
    }
  };
  const lastChain = new Map<number, number>();
  while (!sim.isOver()) {
    const s: SimState = sim.snapshot();
    const c = s.cans;
    const w = s.weapon;
    if (c === undefined) break;
    const f = planes[c.plane].scrollFactor;
    if (w.shells === 0 && !w.reloading) {
      step([{ t: 'reload' }]);
      continue;
    }
    const ready = w.shells > 0 && !w.reloading && w.cooldownTicks === 0;
    const air = c.cans.find((k) => k.state === 'air' || k.state === 'bounced');
    let target: { x: number; y: number } | null = null;
    if (air !== undefined) {
      const before = lastY.get(air.id);
      const top = before !== undefined && air.y >= before;
      if (when === 'asap' || top) target = { x: air.x, y: air.y };
    } else {
      const rest = c.cans.find((k) => k.state === 'rest');
      if (rest === undefined) break;
      target = { x: rest.x, y: rest.y };
    }
    for (const k of c.cans) lastY.set(k.id, k.y);
    if (target === null || !ready || target.y < 0) {
      step([]);
      continue;
    }
    // Keep it in the middle of the screen (a player pans after it).
    const cx =
      Math.round(Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (target.x - 960) / f + 960)) * 2) /
      2;
    step([
      { t: 'cameraTarget', cx },
      { t: 'fire', dx: planeToDx(cx, f, target.x) + gauss() * err, sy: target.y + gauss() * err },
    ]);
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
  const plane = content.biomes.find((b) => b.id === biome)?.layouts.find((l) => l.id === layout)
    ?.fence?.plane;
  console.log(
    `${biome} ${layout} (${String(plane)} fence) · ${weapon} · ${when} · err ${String(err)} px · ${String(all.length)} juggles: ` +
      `chain 0 ${share((c) => c === 0)}, ≥1 ${share((c) => c >= 1)}, ≥2 ${share((c) => c >= 2)}, ≥3 ${share((c) => c >= 3)}, ≥5 ${share((c) => c >= 5)}, ≥8 ${share((c) => c >= 8)}; mean ${(all.reduce((a, b) => a + b, 0) / n).toFixed(2)}; Weg! ${String(weg)} (${((weg / n) * 100).toFixed(0)} %)`,
  );
}
