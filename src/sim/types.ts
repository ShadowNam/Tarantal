// Public sim types (Tech §3.1). The Phaser layer, tools and replays depend on these shapes.
import type { ContentBundle } from '../content/schemas';

export type PlaneId = 'near' | 'mid' | 'far';
/** Front-to-back order used by shot resolution. */
export const PLANES: readonly PlaneId[] = ['near', 'mid', 'far'];

export type ModeId = 'classic' | 'daily' | 'seasonHunt' | 'ftue';
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
  /** Biome weather (omen) on. Overrides modes.json (Classic off, Daily on — D-021). */
  readonly omen?: boolean;
  /** Season Run hunts only: everything the run changes in this hunt (part of the replay). */
  readonly season?: SeasonHuntConfig;
  /** v1.2 (D-033), Classic and Daily only: the weekday layout ('mon' … 'sun'). Absent = the
   *  biome as it is (every replay and challenge link made before v1.2). */
  readonly layout?: string;
  /** v1.2: a bonus map on top of the layout ('verder'). Needs a layout. */
  readonly bonus?: string;
}

/** GDD §13.1: hunt 1 plain, hunt 2 Omen (weather on), hunt 3 Boss Hunt (boss + Boss Rule). */
export type SeasonHuntKind = 'plain' | 'omen' | 'boss';

/** What a Season Run hunt brings from the run state (Tech §3.9). The Sim derives the rest. */
export interface SeasonHuntConfig {
  readonly kind: SeasonHuntKind;
  /** Boss hunts: the season's boss creature, whose bossRule applies. Null otherwise. */
  readonly boss: string | null;
  /** Equipped charm ids in slot order (left → right). */
  readonly charms: readonly string[];
  /** Consumable slots (power-up ids, null = empty). */
  readonly consumables: readonly (string | null)[];
  /** A crate weapon rented at the Padstal for this hunt, or null. */
  readonly rental: string | null;
  /** Extra shell capacity built up over the run (shellCapacityForRun). */
  readonly runShellBonus: number;
}

/** Touch aim-assist strength chosen in Settings (scoring.json aimAssistLevels). */
export type AimAssistLevel = 'off' | 'low' | 'standard';

export interface SimConfig {
  /** u32 seed. */
  readonly seed: number;
  /** Validated, frozen content. */
  readonly content: ContentBundle;
  readonly mode: ModeConfig;
  /** Fixed per hunt; selects aim-assist radii; recorded in the replay. */
  readonly inputKind: InputKind;
  /** Touch aim-assist level (default 'standard'); recorded in the replay. Mouse is always 0. */
  readonly aimAssist?: AimAssistLevel;
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
  /** Season Run: use a consumable slot; the slot after the last one is the weapon rental. */
  | { readonly t: 'consumable'; readonly slot: number }
  /** Season Run: reorder charms (pause screen). New slot i holds old slot order[i]. */
  | { readonly t: 'charmOrder'; readonly order: readonly number[] };

export type CommandType = Command['t'];

/** perch: the kwêvoël (flies in, sits on a prop, flies off). boss: the Generaal (struts, runs,
 *  flies off). */
export type BirdMotion = 'flyover' | 'popup' | 'flock' | 'perch' | 'boss' | 'hop';
/**
 * fly-over: fly · pop-up: rise/stare/duck · flock member (GDD §6.1): walk (forage), alert,
 * run, launch (crouched for its stagger), flap (steep take-off and flight), glide, land (running
 * on after touching down). Peeking bosses: hidden (behind cover, can't be hit), peek.
 */
export type BirdPhase =
  | 'fly'
  | 'rise'
  | 'stare'
  | 'duck'
  | 'walk'
  | 'alert'
  | 'run'
  | 'launch'
  | 'flap'
  | 'glide'
  | 'land'
  | 'perch'
  // M8 peekFromCover bosses (Ou Grys) and hopping birds (kuifkop): behind cover (not hittable),
  // peeking out, or hopping to the next cover in plain view.
  | 'hidden'
  | 'peek'
  | 'hop';

/** Flock FSM states (GDD §6.1, Tech §3.5). Roost (dusk hunts) arrives with the dusk biomes. */
export type FlockState = 'forage' | 'alert' | 'run' | 'flush' | 'settle';

export interface FlockView {
  readonly id: number;
  readonly plane: PlaneId;
  readonly state: FlockState;
  /** Members at spawn (Whole Flock needs ≥ scoring.wholeFlock.minSize). */
  readonly spawnSize: number;
  /** Members still alive. */
  readonly alive: number;
  /** True while bagging every remaining member still earns the Whole-Flock bonus. */
  readonly eligible: boolean;
}

export interface GadgetView {
  readonly id: string;
  readonly charges: number;
  readonly cooldownTicks: number;
  readonly cooldownTotalTicks: number;
}

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
  /** The flock this bird belongs to, or null (fly-overs, pop-ups). */
  readonly flockId: number | null;
  /** Pop-ups: the grass line (design px) they rise from, so the renderer can hide what is below
   *  it. Null for fly-overs. Render-only: not part of any event or outcome. */
  readonly ground: number | null;
  /** Bosses: still wearing armour (the Generaal's pot). */
  readonly armored: boolean;
}

/** One shootable part of a secret prop, in its layer's coordinates. */
export interface SecretPartView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Already hit (multi-hit secrets mark parts until the window resets). */
  readonly hit: boolean;
}

export interface SecretView {
  readonly propId: string;
  readonly layerId: string;
  readonly parts: readonly SecretPartView[];
  /** Rotor angle in radians (0 for secrets without a rotor). */
  readonly angle: number;
  /** Can be set off now (not spent, not cooling down). */
  readonly ready: boolean;
  /** Paid out for this hunt (once-per-hunt secrets). */
  readonly done: boolean;
  /** Multi-hit: ticks left before the marks reset (0 = no window running). */
  readonly windowTicks: number;
  readonly cooldownTicks: number;
}

export interface CrateView {
  readonly id: number;
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  /** Falling under its parachute, or on the ground. */
  readonly landed: boolean;
}

export interface PowerupView {
  readonly id: string;
  /** Ticks left, or null for shell-counted power-ups. */
  readonly ticksLeft: number | null;
  readonly totalTicks: number | null;
  /** Shells left (Bush Buckshot), or null. */
  readonly shellsLeft: number | null;
}

export interface WindView {
  /** +1 blows left → right. */
  readonly dir: 1 | -1;
  /** 0..1 of the biome's wind effects. */
  readonly strength: number;
}

export interface DustDevilView {
  readonly id: number;
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  /** Contact radius on its plane (plane px). */
  readonly radius: number;
}

export interface WeaponView {
  readonly id: string;
  /** primary, or a temporary crate weapon (Voorlaaier, Mielie-Masjien). */
  readonly kind: 'primary' | 'crate';
  /** Holding fire keeps firing (Mielie-Masjien, Chilli Biltong): send fireHold* commands. */
  readonly holdToFire: boolean;
  /** No shells used (Chilli Biltong, Mielie-Masjien). */
  readonly infinite: boolean;
  /** Crate weapon time left (Mielie-Masjien), or null. */
  readonly ticksLeft: number | null;
  readonly totalTicks: number | null;
  /** Shells in the belt; -1 = unlimited. */
  readonly shells: number;
  readonly magazine: number;
  readonly reloading: boolean;
  /** 0..1 progress of the current reload step (one shell for per-shell reloads). */
  readonly reloadProgress: number;
  /** Reloads one shell per step (Windbuks, Plaas-Pomp). */
  readonly perShellReload: boolean;
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
  /** Live flocks, sorted by id. */
  readonly flocks: readonly FlockView[];
  /** The hunt's gadget (Vuvuzela), or null if the content has none. */
  readonly gadget: GadgetView | null;
  /** Biome secrets in content order. */
  readonly secrets: readonly SecretView[];
  readonly crates: readonly CrateView[];
  readonly powerups: readonly PowerupView[];
  /** Null when the omen is off or the biome has no wind. */
  readonly wind: WindView | null;
  readonly dustDevils: readonly DustDevilView[];
  /** Bushveld low sun (omen hunts): glare band on the left (−1) or right (+1) of the view. */
  readonly glare: {
    readonly side: 1 | -1;
    readonly widthPx: number;
    readonly alpha: number;
  } | null;
  /** Rain falling now (Okavango sun-showers; Kalahari storm). */
  readonly rain: boolean;
  /** A lightning flash is lighting the scene (storm, Die Stormvoël, his boss rule). */
  readonly lightning: boolean;
  /** Kettie stones in the air (render only), in fire order. */
  readonly projectiles: readonly ProjectileView[];
  /** Season Run hunts only. */
  readonly season: SeasonView | null;
  readonly over: boolean;
}

export interface ProjectileView {
  readonly shotId: number;
  /** Aim point: screen dx/sy for the camera centre `cx` it was fired at. */
  readonly dx: number;
  readonly sy: number;
  readonly cx: number;
  /** Ticks since it was fired, and the flight time to the far band. */
  readonly age: number;
  readonly flightTicks: number;
}

export interface SeasonView {
  readonly kind: SeasonHuntKind;
  /** run.json bossRules id in force, or null. */
  readonly bossRule: string | null;
  /** Charm ids in slot order, and the Mult each has built up this hunt (addMultForHunt). */
  readonly charms: readonly string[];
  readonly charmMults: readonly number[];
  /** Consumable slots; null once used or empty. */
  readonly consumables: readonly (string | null)[];
  /** Rented crate weapon not yet used, or null. */
  readonly rental: string | null;
  /** Doppies found this hunt (white tarentaal, charms). */
  readonly doppies: number;
  /** Oupa se Kaart: secrets glow. */
  readonly revealSecrets: boolean;
  /** Stormvoël's rule: the screen is dark … */
  readonly dark: boolean;
  /** … except while lightning flashes. */
  readonly lightning: boolean;
  /** Boeretroos-Fles slow-mo running. */
  readonly slowMo: boolean;
}

export interface HuntResult {
  readonly seed: number;
  readonly mode: ModeId;
  readonly biome: string;
  /** v1.2: the map played (null = the plain biome: Season Run, FTUE, old replays). */
  readonly layout: string | null;
  readonly bonus: string | null;
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
  /** Whole-Flock bonuses earned (GDD §6.4; a badge on the tally). */
  readonly wholeFlocks: number;
  /** Flocks that went to FLUSH. */
  readonly flushes: number;
  readonly gadgetUses: number;
  /** Secrets set off (GDD §8 tally). */
  readonly secrets: number;
  /** Crates opened. */
  readonly crates: number;
  /** scoring.json rank id. */
  readonly rank: string;
  /** Season Run: doppies found in the hunt (white tarentaal drops, addDoppies). */
  readonly doppies: number;
  /** Season Run: shell capacity gained for the rest of the run (Generaal se Pot). */
  readonly shellCapacityForRun: number;
  /** Season Run: consumable slots used, in slot order. */
  readonly consumablesUsed: readonly number[];
  readonly rentalUsed: boolean;
  readonly bossesBagged: number;
}
