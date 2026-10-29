// Applying one shot's pellets to birds (GDD §5.1, Tech §3.4). A shot is a hit on a bird when its
// pellets on it ≥ min(pelletsToBag, weapon pellets); pellets never add up across shots. Bosses
// lose armorHits first, then need hitsToBag hits (accumulated across shots).
import type { BirdCreature } from '../birds/Bird';
import { pelletsNeeded } from './hitTest';

export interface Damageable {
  readonly id: number;
  readonly creature: BirdCreature;
  armorLeft: number;
  hitsLeft: number;
}

export type DamageOutcome =
  | { readonly kind: 'armor'; readonly birdId: number; readonly armorLeft: number }
  | { readonly kind: 'hit'; readonly birdId: number; readonly hitsLeft: number }
  | { readonly kind: 'bagged'; readonly birdId: number };

export interface ShotDamage {
  /** In bird order. Birds touched by too few pellets have no outcome. */
  readonly outcomes: readonly DamageOutcome[];
  /** Did any pellet land on any bird? (No → the shot is a Miss.) */
  readonly touched: boolean;
}

export function pelletsToBagOf(creature: BirdCreature): number {
  // v1.7d (D-059): a drifter (a hot-air balloon) counts a hit only with drift.pelletsToHit.
  if (creature.kind === 'nonTarget') return creature.drift?.pelletsToHit ?? 1;
  return creature.pelletsToBag;
}

/** Mutates armorLeft/hitsLeft of the birds that were hit. `birds` must be in stable (id) order. */
export function applyShotDamage(
  birds: readonly Damageable[],
  pelletsOn: ReadonlyMap<number, number>,
  weaponPellets: number,
): ShotDamage {
  const outcomes: DamageOutcome[] = [];
  let touched = false;
  for (const b of birds) {
    const count = pelletsOn.get(b.id);
    if (count === undefined) continue;
    touched = true;
    if (count < pelletsNeeded(pelletsToBagOf(b.creature), weaponPellets)) continue;
    if (b.armorLeft > 0) {
      b.armorLeft--;
      outcomes.push({ kind: 'armor', birdId: b.id, armorLeft: b.armorLeft });
      continue;
    }
    b.hitsLeft--;
    outcomes.push(
      b.hitsLeft > 0
        ? { kind: 'hit', birdId: b.id, hitsLeft: b.hitsLeft }
        : { kind: 'bagged', birdId: b.id },
    );
  }
  return { outcomes, touched };
}
