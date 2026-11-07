// v1.8b (D-062): sim systems that live in a lazy chunk (lazySystemsRegister.ts), so the first
// download doesn't carry them: the baboon troops and (moved there with them) Namibië's ostriches
// and the secrets' tell animals.
// A hunt on a map that has them takes them from SimConfig.systems, else from here, and refuses to
// start without them (a hunt that silently left them out would replay differently). The game
// loads the chunk before such a hunt; tools and tests register it up front. Only the factories
// are kept here: no hunt state.
import type { Biome } from '../content/schemas';
import type { BaboonSystemFactory } from './baboons/system';
import type { BrakkieSystemFactory } from './brakkie/system';
import type { HarvestSystemFactory } from './harvest/system';
import type { OstrichSystemFactory } from './ostriches/system';
import type { TellSystemFactory } from './tells/system';

export interface LazySystems {
  readonly baboons: BaboonSystemFactory;
  readonly ostriches: OstrichSystemFactory;
  readonly tells: TellSystemFactory;
  /** v1.8c (D-063): the Harvest's warthogs, workers and crop meter. */
  readonly harvest: HarvestSystemFactory;
  /** v1.12 (D-069): Brakkie, the farm dog. */
  readonly brakkie: BrakkieSystemFactory;
}

let registered: LazySystems | null = null;

export function registerLazySystems(systems: LazySystems): void {
  registered = systems;
}

export function registeredLazySystems(): LazySystems | null {
  return registered;
}

/** True when a hunt on this biome (any of its layouts or bonus maps) may need them. */
export function needsLazySystems(biome: Biome): boolean {
  return (
    biome.baboons !== undefined ||
    biome.harvest !== undefined ||
    biome.ostriches !== undefined ||
    biome.props.some((p) => p.secret?.tell !== undefined) ||
    biome.layouts.some((l) => l.baboons !== undefined || l.ostriches !== undefined) ||
    biome.bonusMaps.some((b) => b.baboons !== undefined || b.ostriches !== undefined)
  );
}
