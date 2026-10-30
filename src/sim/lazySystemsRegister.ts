// v1.8b (D-062): importing this registers the lazy sim systems (tools, tests, and the game once
// the chunk is in). See lazySystems.ts.
import { createBaboonSystem } from './baboons/system';
import { createHarvestSystem } from './harvest/system';
import { registerLazySystems } from './lazySystems';
import { createOstrichSystem } from './ostriches/system';
import { createTellSystem } from './tells/system';

registerLazySystems({
  baboons: createBaboonSystem,
  ostriches: createOstrichSystem,
  tells: createTellSystem,
  harvest: createHarvestSystem,
});
