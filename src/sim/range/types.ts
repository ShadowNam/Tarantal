// v1.3x (D-037) Skietbaan: the contract between the sim and the range's spawn program. The
// program is pure and deterministic like the rest of the sim; it is handed to createSim
// (SimConfig.rangeProgram) so its code ships in the admin page's lazy chunk, not the first
// download.
import type { Biome, ContentBundle } from '../../content/schemas';
import type { Bird } from '../birds/Bird';
import type { Flock } from '../flocks/Flock';
import type { RandomStream } from '../rng';
import type { PaperView, PlaneId, RangeConfig, RangeTarget } from '../types';

/** What the program sees of the range each tick. Every live bird is the range's. */
export interface RangeWorld {
  readonly tick: number;
  readonly birds: readonly Bird[];
  nextBirdId(): number;
  /** A flock of `size` around plane x (the director's flock builder), or null if none fits. */
  spawnFlockAt(plane: PlaneId, x: number, size: number): Flock | null;
}

/** One tick's changes: birds and flocks to add, bird ids to retire (they left the range). */
export interface RangeStep {
  readonly birds: readonly Bird[];
  readonly flocks: readonly Flock[];
  readonly retire: readonly number[];
}

export interface RangeProgram {
  /** The paper targets and steel plates (fixed for the session). */
  readonly papers: readonly PaperView[];
  /** The kind of target a bird of the range is (null: not one of its birds, or gone). */
  targetOf(birdId: number): RangeTarget | null;
  step(world: RangeWorld): RangeStep;
}

export interface RangeProgramDeps {
  readonly content: ContentBundle;
  /** The range's map (its biome with the range lanes applied). */
  readonly biome: Biome;
  readonly range: RangeConfig;
  /** Camera centre at the start: the spots are placed from it. */
  readonly cameraX: number;
  /** rng.stream('range'). */
  readonly rng: RandomStream;
}

export type RangeProgramFactory = (deps: RangeProgramDeps) => RangeProgram;
