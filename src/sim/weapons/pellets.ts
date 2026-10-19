// Shotgun pellet pattern (Tech §3.4): pelletCount offsets uniform by area inside a disc of
// spreadPx (screen design px, the same on every plane), drawn from rng.stream('pellets').
import { cos, sin } from '../detmath';
import type { RandomStream } from '../rng';

export interface Offset {
  readonly ox: number;
  readonly oy: number;
}

export function pelletOffsets(count: number, spreadPx: number, rng: RandomStream): Offset[] {
  if (count === 1 && spreadPx === 0) return [{ ox: 0, oy: 0 }];
  const out: Offset[] = [];
  for (let i = 0; i < count; i++) {
    const r = spreadPx * Math.sqrt(rng.next());
    const a = 2 * Math.PI * rng.next();
    out.push({ ox: r * cos(a), oy: r * sin(a) });
  }
  return out;
}
