// Public sim types (Tech §3.1). The Phaser layer, tools and replays depend on these shapes.
import type { ContentBundle } from '../content/schemas';

export type PlaneId = 'near' | 'mid' | 'far';
/** Front-to-back order used by shot resolution. */
export const PLANES: readonly PlaneId[] = ['near', 'mid', 'far'];

export type ModeId = 'classic' | 'daily' | 'seasonHunt';
export type InputKind = 'pointer' | 'touch';

/** Behaviour of a bird at the moment it is bagged (scoring.json behaviourAdd). */
export type BagBehaviour = 'forage' | 'alert' | 'run' | 'flying';

export interface ModeConfig {
  readonly id: ModeId;
  /** Overrides modes.json (Classic/Daily). Required for seasonHunt. */
  readonly biome?: string;
  /** Overrides modes.json (Classic/Daily). Required for seasonHunt. */
  readonly weapon?: string;
  /** Overrides modes.json / run.json hunt length. */
  readonly huntSeconds?: number;
  /** Enables the Stampede outside scoring.json stampede.modes (Stampede-Kenner charm). */
  readonly stampede?: boolean;
  /** Omen hunt (Season Run). Omen effects arrive in M4; recorded now so replays stay stable. */
  readonly omen?: boolean;
}

export interface SimConfig {
  /** u32 seed. */
  readonly seed: number;
  /** Validated, frozen content. */
  readonly content: ContentBundle;
  readonly mode: ModeConfig;
  /** Fixed per hunt; selects aim-assist radii; recorded in the replay. */
  readonly inputKind: InputKind;
}

export type Command =
  /** dx = design px from the SCREEN CENTRE, sy = design px from the top. */
  | { readonly t: 'fire'; readonly dx: number; readonly sy: number }
  | { readonly t: 'fireHoldStart'; readonly dx: number; readonly sy: number }
  | { readonly t: 'fireHoldMove'; readonly dx: number; readonly sy: number }
  | { readonly t: 'fireHoldEnd' }
  | { readonly t: 'reload' }
  /** Camera centre in reference units, quantised to 0.5. */
  | { readonly t: 'cameraTarget'; readonly cx: number }
  | { readonly t: 'gadget' }
  | { readonly t: 'consumable'; readonly slot: number };

export type CommandType = Command['t'];

export type BirdMotion = 'flyover' | 'popup';
export type BirdPhase = 'fly' | 'rise' | 'stare' | 'duck';

export interface BirdView {
  readonly id: number;
  readonly creature: string;
  readonly kind: 'target' | 'boss' | 'nonTarget';
  readonly plane: PlaneId;
  /** Plane coordinates: x across the plane's core width, y design px from the top. */
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly motion: BirdMotion;
  readonly phase: BirdPhase;
  readonly behaviour: BagBehaviour;
  readonly hittable: boolean;
  /** Pop-ups: the grass line (design px) they rise from, so the renderer can hide what is below
   *  it. Null for fly-overs. Render-only: not part of any event or outcome. */
  readonly ground: number | null;
}

export interface WeaponView {
  readonly id: string;
  /** Shells in the belt; -1 = unlimited. */
  readonly shells: number;
  readonly magazine: number;
  readonly reloading: boolean;
  /** 0..1 progress of the current reload step (one shell for per-shell reloads). */
  readonly reloadProgress: number;
  readonly cooldownTicks: number;
}

export interface SimState {
  readonly tick: number;
  readonly durationTicks: number;
  readonly ticksLeft: number;
  readonly cameraX: number;
  readonly score: number;
  readonly streak: number;
  readonly frenzyMul: number;
  readonly stampedeActive: boolean;
  readonly weapon: WeaponView;
  /** Sorted by id; higher ids are in front within a plane (renderer draws in this order). */
  readonly birds: readonly BirdView[];
  readonly over: boolean;
}

export interface HuntResult {
  readonly seed: number;
  readonly mode: ModeId;
  readonly biome: string;
  readonly weapon: string;
  readonly score: number;
  readonly ticks: number;
  readonly shots: number;
  /** Shots that bagged at least one target. */
  readonly hitShots: number;
  readonly accuracy: number;
  readonly bagged: number;
  readonly baggedByPlane: Readonly<Record<PlaneId, number>>;
  readonly wingShots: number;
  readonly penalties: number;
  readonly emptyClicks: number;
  readonly bestStreak: number;
  readonly twoFlies: number;
  /** scoring.json rank id. */
  readonly rank: string;
}
