// Interim scenery plans per biome (D-031). A biome without a plan keeps its runtime placeholders.
import type { BiomeArtPlan } from '../landscape';
import { KAROO_PLAN } from './karoo';

export const BIOME_PLANS: readonly BiomeArtPlan[] = [KAROO_PLAN];
