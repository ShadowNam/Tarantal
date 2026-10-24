// Interim scenery plans per biome (D-031). A biome without a plan keeps its runtime placeholders.
import type { BiomeArtPlan } from '../landscape';
import { BUSHVELD_PLAN } from './bushveld';
import { KALAHARI_PLAN } from './kalahari';
import { KAROO_PLAN } from './karoo';
import { NAMIBIE_PLAN } from './namibie';
import { OKAVANGO_PLAN } from './okavango';

export const BIOME_PLANS: readonly BiomeArtPlan[] = [
  KAROO_PLAN,
  BUSHVELD_PLAN,
  KALAHARI_PLAN,
  OKAVANGO_PLAN,
  NAMIBIE_PLAN,
];
