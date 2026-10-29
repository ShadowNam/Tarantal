// Seeded randomness for the sim (Tech §3.2): sfc32 generators seeded via splitmix32, one per
// named stream, so drawing more numbers in one system never shifts another system's sequence.

/** One step of splitmix32: returns [nextState, output]. Used only for seeding. */
export function splitmix32(state: number): readonly [number, number] {
  const next = (state + 0x9e3779b9) | 0;
  let t = next ^ (next >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  t = t ^ (t >>> 15);
  return [next, t >>> 0];
}

/** FNV-1a 32-bit hash of a string (stream names, event hashes). */
export function fnv1a32(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stream names in use. Add a name here when a new system needs randomness. */
export type StreamName =
  | 'spawns'
  | 'events'
  | 'pellets'
  | 'birds'
  | 'flocks'
  | 'flockNoise'
  | 'charms'
  | 'shop'
  | 'bot'
  // M4: secret rewards (burst flocks), crates (times + contents), the omen (wind + dust devils),
  // the kwêvoël perch and the boss.
  | 'secrets'
  | 'crates'
  | 'omen'
  | 'perch'
  | 'boss'
  // M6: the Stormvoël rule's lightning.
  | 'lightning'
  // M8: biome twists (which flocks run instead of flying), hopping birds' routes.
  | 'twist'
  | 'hop'
  // M8: the Kalahari storm's lightning and the Stormvoël's own flashes outside its boss hunt.
  | 'storm'
  // v1.3: a raised sight's sway (phase and pace, drawn at each raise).
  | 'sway'
  // v1.3x (D-037): the Skietbaan's spawn program (fly-over bob, flock placement).
  | 'range'
  // v1.7 (D-044): the desert maps' meerkat colonies (families, behaviour, timings).
  | 'meerkats'
  // D-048: the special day's twist (Halloween: bat and owl times, lanes and swerves; lanterns).
  | 'feesdag'
  // v1.8 (D-050): tin cans (a kick's sideways jitter).
  | 'cans'
  // 1.9.3 (D-056): makalani nuts (cluster sizes, colours, a kick's jitter).
  | 'nuts'
  // v1.7d (D-059): Namibië's ostriches (eggs, activities, swaps, runs).
  | 'ostriches';

/** A stream's members are closures, so they are safe to pass around detached. */
export interface RandomStream {
  /** Uniform u32. */
  readonly u32: () => number;
  /** Uniform float in [0, 1). */
  readonly next: () => number;
  /** Uniform float in [min, max). */
  readonly range: (min: number, max: number) => number;
  /** Uniform integer in [min, max] (inclusive). */
  readonly int: (min: number, max: number) => number;
  /** True with probability p. */
  readonly chance: (p: number) => boolean;
  /** Index chosen with probability proportional to weights; -1 if all weights are 0. */
  readonly weightedIndex: (weights: readonly number[]) => number;
}

const TWO_POW_32 = 4294967296;

/** sfc32 by Chris Doty-Humphrey, seeded with four splitmix32 outputs. */
export function createStream(seed: number): RandomStream {
  let s = seed >>> 0;
  let out: number;
  [s, out] = splitmix32(s);
  let a = out;
  [s, out] = splitmix32(s);
  let b = out;
  [s, out] = splitmix32(s);
  let c = out;
  [, out] = splitmix32(s);
  let d = out;

  const u32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Warm up so nearby seeds diverge immediately.
  for (let i = 0; i < 12; i++) u32();

  const next = (): number => u32() / TWO_POW_32;
  return {
    u32,
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    weightedIndex: (weights) => {
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) return -1;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i] ?? 0;
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
  };
}

export interface Rng {
  readonly seed: number;
  /** The stream for one system. The same name always returns the same stream object. */
  stream(name: StreamName): RandomStream;
}

export function createRng(seed: number): Rng {
  const root = seed >>> 0;
  const streams = new Map<StreamName, RandomStream>();
  return {
    seed: root,
    stream(name) {
      let s = streams.get(name);
      if (s === undefined) {
        s = createStream((root ^ fnv1a32(name)) >>> 0);
        streams.set(name, s);
      }
      return s;
    },
  };
}
