// Public sim types (Tech §3.1). The Phaser layer, tools and replays depend on these shapes.
import type { ContentBundle } from '../content/schemas';
import type { ColonyPhase, MeerkatPose } from './meerkats/colony';
import type { OstrichPose } from './ostriches/ostriches';
import type { TellPhase } from './tells/tells';
import type { RangeProgramFactory } from './range/types';

/** v1.3 (D-036): `ver` is the distant band behind the far plane; only rifles reach it. */
export type PlaneId = 'near' | 'mid' | 'far' | 'ver';
/** Front-to-back order used by shot resolution. */
export const PLANES: readonly PlaneId[] = ['near', 'mid', 'far', 'ver'];

/** v1.3x (D-037): `range` is the admin-only Skietbaan (training ground): endless, unscored. */
export type ModeId = 'classic' | 'daily' | 'seasonHunt' | 'ftue' | 'range';

/** Skietbaan targets: paper targets, a standing bird, a fly-over, a small flock. */
/** v1.8 (D-050): `cans` — Blikkies on a short fence (the sim's tin cans, one plane). */
export type RangeTarget = 'paper' | 'plate' | 'stand' | 'flyover' | 'flock' | 'cans';

/** v1.3x (D-037): what the Skietbaan puts up (mode 'range' only). */
export interface RangeConfig {
  /** The distance (plane) the targets stand at; 'all' = the mixed course (24 Oct update). */
  readonly plane: PlaneId | 'all';
  /** The kind of target; 'mixed' (with plane 'all') sets out every kind on every plane. */
  readonly target: RangeTarget | 'mixed';
  /** A crate weapon to shoot instead of the primary (re-armed whenever it is spent). */
  readonly crate?: string;
}
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
  /** v1.3: the sight fitted to a rifle (weapons.json sights; absent = the gun's default). */
  readonly sight?: string;
  /** v1.3x (D-037), mode 'range' only: the Skietbaan's targets. */
  readonly range?: RangeConfig;
  /** D-048, Daily only: the special day (feesdae.json id) this hunt plays; absent = ordinary.
   *  The date is decided outside the sim and arrives here as this id. */
  readonly feesdag?: string;
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
  /** v1.3x (D-037), mode 'range' only: the Skietbaan's spawn program (src/sim/range). Passed in
   *  rather than imported, so its code loads with the admin page's lazy chunk. */
  readonly rangeProgram?: RangeProgramFactory;
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
  | { readonly t: 'charmOrder'; readonly order: readonly number[] }
  /** v1.3 rifles (D-036): press = raise the sight at this point of the UNZOOMED screen (dx from
   *  the centre, sy from the top), move = aim there, release = fire (a hip shot if the sight is
   *  not up yet), cancel = lower it without firing. */
  | { readonly t: 'aimStart'; readonly dx: number; readonly sy: number }
  | { readonly t: 'aimMove'; readonly dx: number; readonly sy: number }
  | { readonly t: 'aimRelease' }
  | { readonly t: 'aimCancel' }
  /** v1.3: the zoom step of the fitted sight (variable scopes; a fixed sight has one step). */
  | { readonly t: 'zoom'; readonly step: number };

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

/** v1.7 (D-044): one meerkat of a desert colony (layer coordinates of its colony). */
export interface MeerkatView {
  readonly id: number;
  readonly pup: boolean;
  /** Feet (or, in a hole, the hole) on the colony's layer. */
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly pose: MeerkatPose;
  /** Head turn: −1 left, 0 at the camera, +1 right. */
  readonly look: -1 | 0 | 1;
  /** Ticks in this pose (animation phase). */
  readonly poseTicks: number;
  readonly hittable: boolean;
}

export interface ColonyView {
  readonly id: string;
  readonly layerId: string;
  readonly plane: PlaneId;
  /** Holes on their mounds (layer px). */
  readonly burrows: readonly { readonly x: number; readonly y: number; readonly mound: number }[];
  readonly ground: number;
  readonly phase: ColonyPhase;
  /** Sorted by id; a pup last. */
  readonly meerkats: readonly MeerkatView[];
}

/** v1.7d (D-059): one ostrich as the view sees it. */
export interface OstrichView {
  readonly id: number;
  readonly male: boolean;
  readonly x: number;
  readonly facing: 1 | -1;
  readonly pose: OstrichPose;
  /** Ticks in the pose (the view's walk cycle and wing flaps run on it). */
  readonly t: number;
  readonly look: -1 | 0 | 1;
  readonly sitter: boolean;
}

/** v1.7e (D-061): a secret's tell animal as the view sees it (feet on its prop's layer). */
export interface TellView {
  readonly id: number;
  readonly propId: string;
  readonly layerId: string;
  readonly species: string;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly phase: TellPhase;
  /** Ticks in this phase. */
  readonly t: number;
  /** Gone because its secret is spent (it never comes back this hunt). */
  readonly left: boolean;
}

/** v1.7d (D-059): an ostrich pair and its nest (Namibië). */
export interface OstrichFamilyView {
  readonly id: string;
  readonly layerId: string;
  readonly plane: PlaneId;
  readonly scale: number;
  readonly ground: number;
  readonly nest: { readonly id: number; readonly x: number; readonly eggs: number } | null;
  /** Sorted by id (the male first). */
  readonly birds: readonly OstrichView[];
}

export interface CrateView {
  readonly id: number;
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  /** Falling under its parachute, or on the ground. */
  readonly landed: boolean;
  /** v1.7b (D-046): the power-up or crate gun inside (shown on the crate), or null. */
  readonly item: string | null;
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
  /** v1.3: the fitted sight of a rifle (hold to zoom, release to fire), else null. */
  readonly sight: string | null;
  /** v1.3: the sight's zoom step (index into its zoom list). */
  readonly zoomStep: number;
}

/** v1.3 (D-036): a raised (or rising) sight. Positions are design px of the unzoomed screen. */
export interface AimView {
  readonly sight: string;
  /** 1.9.2 (D-055) Rooikol: a red dot instead of the sight (the view draws no zoom). */
  readonly redDot: boolean;
  /** Zoom of the fitted sight at its current step (×), reached when progress is 1. */
  readonly zoom: number;
  /** 0..1 while the sight comes up; 1 = up (a release fires through the sight). */
  readonly progress: number;
  /** The aim point the player holds (dx from the centre, sy from the top). */
  readonly dx: number;
  readonly sy: number;
  /** Sway now: the shot goes off at (dx + swayDx, sy + swayDy). */
  readonly swayDx: number;
  readonly swayDy: number;
  /** raising · steady (up, breathing) · held (breath held: settled) · tired (held too long). */
  readonly breath: 'raising' | 'steady' | 'held' | 'tired';
  /** Ticks since the press. */
  readonly heldTicks: number;
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
  /** v1.7 (D-044): the map's meerkat colonies (none outside the desert maps). */
  readonly meerkats: readonly ColonyView[];
  /** v1.7d (D-059): the map's ostrich pairs (none outside Namibië). */
  readonly ostriches: readonly OstrichFamilyView[];
  /** v1.7e (D-061): the secrets' tell animals (none in the Skietbaan). */
  readonly tells: readonly TellView[];
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
  /** v1.4 B: the Namibië mirage is on (the renderer shimmers the pan). */
  readonly mirage: boolean;
  /** A lightning flash is lighting the scene (storm, Die Stormvoël, his boss rule). */
  readonly lightning: boolean;
  /** Kettie stones in the air (render only), in fire order. */
  readonly projectiles: readonly ProjectileView[];
  /** v1.3: the rifle's sight while it is raised or rising, else null. */
  readonly aim: AimView | null;
  /** Season Run hunts only. */
  readonly season: SeasonView | null;
  readonly over: boolean;
  /** v1.3x (D-037): the Skietbaan's paper targets (mode 'range' only). */
  readonly range?: RangeView;
  /** D-048: the special day's twist (absent on ordinary hunts). */
  readonly feesdag?: FeesdagView;
  /** v1.8 (D-050): the day's fence and its tin cans (absent on maps without one). */
  readonly cans?: CansView;
  /** 1.9.3 (D-056): a second fence further back with 1–2 cans (absent on maps without one). */
  readonly farCans?: CansView;
  /** 1.9.3 (D-056): the day's makalani palms and their nuts (absent on maps without palms). */
  readonly nuts?: NutsView;
}

/** v1.8 (D-050): a tin can (plane coordinates, like a bird; r and half as drawn). */
export interface CanView {
  readonly id: number;
  readonly type: 'food' | 'paint' | 'bully' | 'cooldrink';
  readonly x: number;
  readonly y: number;
  /** Radians, clockwise; 0 = upright. */
  readonly angle: number;
  /** Radians per tick (the view blurs a fast spin). */
  readonly spin: number;
  readonly state: 'rest' | 'air' | 'bounced' | 'landed' | 'gone';
  readonly chain: number;
  readonly r: number;
  readonly half: number;
  /** The hit radius (r floored by the plane's minimum; the e2e aims within it). */
  readonly hitR: number;
}

export interface CansView {
  readonly plane: PlaneId;
  readonly kind: 'wood' | 'dropper' | 'kraal';
  readonly groundY: number;
  readonly posts: readonly { readonly x: number; readonly top: number }[];
  readonly cans: readonly CanView[];
  readonly bestChain: number;
}

/** 1.9.3 (D-056): a makalani palm group (plane coordinates: its foot; the clusters' anchors and
 *  the trunk tops their stalks hang from). */
export interface PalmView {
  readonly index: number;
  readonly kind: 'single' | 'pair' | 'trio';
  readonly plane: 'near' | 'mid';
  readonly x: number;
  readonly footY: number;
  readonly flip: boolean;
  /** The water line its reflection mirrors at (null: not by water). */
  readonly waterY: number | null;
  readonly scale: number;
  readonly trunks: readonly {
    readonly footX: number;
    readonly topX: number;
    readonly topY: number;
  }[];
  readonly clusters: readonly {
    readonly x: number;
    readonly y: number;
    readonly fromX: number;
    readonly fromY: number;
  }[];
}

/** 1.9.3 (D-056): a makalani nut (plane coordinates, like a can; `popped` = burst). */
export interface NutView {
  readonly id: number;
  readonly palm: number;
  readonly cluster: number;
  readonly plane: 'near' | 'mid';
  readonly colour: 'brown' | 'orange' | 'green';
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly spin: number;
  readonly state: 'rest' | 'air' | 'bounced' | 'landed' | 'gone' | 'popped';
  readonly chain: number;
  readonly r: number;
  /** The hit radius now (the e2e aims within it). */
  readonly hitR: number;
  /** Where it hung: its stalk's end. */
  readonly hangX: number;
  readonly hangY: number;
}

export interface NutsView {
  readonly palms: readonly PalmView[];
  readonly nuts: readonly NutView[];
  readonly bestChain: number;
}

/** D-048: a Spookjag bat, owl or pumpkin lantern (plane coordinates, like a bird). */
export interface SpookThingView {
  readonly id: number;
  readonly kind: 'bat' | 'owl' | 'lantern';
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  /** Lanterns: shot out. */
  readonly dark: boolean;
  /** Lanterns: on a prop's top ('bare'), a fence post or a rock (render only). */
  readonly base: 'bare' | 'rock' | 'post';
}

export interface FeesdagView {
  /** feesdae.json id. */
  readonly id: string;
  readonly things: readonly SpookThingView[];
  readonly lanternsLit: number;
  readonly lanternsTotal: number;
}

/** A paper target or (24 Oct update) a steel plate: a circle on its plane (plane px; r already
 *  scaled by the plane). */
export interface PaperView {
  readonly id: number;
  readonly kind: 'paper' | 'plate';
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface RangeView {
  readonly papers: readonly PaperView[];
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
  /** v1.8 (D-050): the tin cans' tally (absent on maps without a fence). */
  readonly cans?: {
    readonly total: number;
    readonly knocks: number;
    readonly airHits: number;
    readonly bestChain: number;
    readonly weg: number;
    /** Points the cans paid (after Frenzy and Stampede). */
    readonly points: number;
  };
  /** 1.9.3 (D-056): the makalani nuts' tally (absent on maps without palms). */
  readonly nuts?: {
    readonly total: number;
    readonly knocks: number;
    readonly airHits: number;
    readonly pops: number;
    readonly bestChain: number;
    readonly weg: number;
    /** Points the nuts paid (after Stampede). */
    readonly points: number;
  };
  /** D-048: the special day played, and its tally (absent on ordinary hunts). */
  readonly feesdag?: {
    readonly id: string;
    readonly bats: number;
    readonly owls: number;
    readonly lanterns: number;
    readonly lanternsTotal: number;
  };
  readonly biome: string;
  /** v1.2: the map played (null = the plain biome: Season Run, FTUE, old replays). */
  readonly layout: string | null;
  readonly bonus: string | null;
  readonly weapon: string;
  /** v1.3: the rifle's fitted sight (null = a gun without sights). */
  readonly sight: string | null;
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
