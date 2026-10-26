// Typed gameplay events (Tech §3.4, CLAUDE.md rule 4). Audio, FX, UI, analytics and replay
// hashing subscribe to these; they never read internal sim fields.
import type { WorldEventId } from '../content/schemas';
import { fnv1a32 } from './rng';
import type { BreakdownStep } from './scoring/pipeline';
import type { BagBehaviour, BirdMotion, FlockState, PlaneId, RangeTarget } from './types';

/** What threatened a flock (GDD §6.2). */
export type ThreatSource =
  | 'shot'
  | 'silentBag'
  | 'event'
  | 'gadget'
  | 'splash'
  // v1.7 (D-044): a meerkat sentinel's alarm bark (the nearest flock listens).
  | 'meerkatAlarm';
/** Why a flock changed state. */
export type FlockCause =
  'threat' | 'window' | 'timeout' | 'landed' | 'settled' | 'gadget' | 'event' | 'stampede';

export type BonusId = 'twoFlies' | 'armor' | 'wholeFlock' | 'secret' | 'secretChain';

export type SimEvent =
  | {
      readonly type: 'huntStarted';
      readonly tick: number;
      readonly durationTicks: number;
      readonly stampedeAtTick: number | null;
    }
  | {
      readonly type: 'shotFired';
      readonly tick: number;
      readonly shotId: number;
      readonly weapon: string;
      readonly dx: number;
      readonly sy: number;
      readonly shellsLeft: number;
      /** v1.3 rifles: fired through the raised sight, or from the hip (released early). Absent
       *  for every other gun (older event streams stay byte-identical). */
      readonly aim?: 'sight' | 'hip';
    }
  /** v1.3 (D-036): a rifle's sight starts to come up at the aim point (unzoomed screen px). */
  | {
      readonly type: 'aimStarted';
      readonly tick: number;
      readonly sight: string;
      readonly zoom: number;
      readonly dx: number;
      readonly sy: number;
    }
  /** The sight is up: a release now fires through it. */
  | { readonly type: 'aimRaised'; readonly tick: number; readonly sight: string }
  /** Breath held (sway settles) or let go (sway grows): audio and the sight picture react. */
  | { readonly type: 'aimBreath'; readonly tick: number; readonly breath: 'held' | 'tired' }
  /** The sight came down: fired, hip shot, cancelled (right-click / slide onto the ammo), or
   *  dropped (the shot could not go off, a reload, or another gun took over). */
  | {
      readonly type: 'aimEnded';
      readonly tick: number;
      readonly reason: 'fired' | 'hip' | 'cancel' | 'blocked' | 'reload' | 'weapon';
    }
  | {
      readonly type: 'zoomChanged';
      readonly tick: number;
      readonly step: number;
      readonly zoom: number;
    }
  | {
      readonly type: 'pelletImpact';
      readonly tick: number;
      readonly shotId: number;
      /** Screen position (dx from centre, sy from top). */
      readonly dx: number;
      readonly sy: number;
      /** What the pellet stopped on: a bird, an occluding prop, or nothing. */
      readonly birdId: number | null;
      readonly propId: string | null;
      /** A secret part (with propId) or a crate the pellet stopped on. */
      readonly partId: string | null;
      readonly crateId: number | null;
      /** Kettie stones only: the camera centre the shot was fired at (dx is relative to it). */
      readonly cx?: number;
      /** v1.3x (D-037): the Skietbaan paper target it hit (absent everywhere else). */
      readonly paperId?: number;
      /** v1.7 (D-044): the meerkat it hit (absent everywhere else). */
      readonly meerkatId?: number;
      /** D-048: the Spookjag bat, owl or lantern it hit (absent everywhere else). */
      readonly spookId?: number;
    }
  /** v1.3x (D-037) Skietbaan only: a shot's aim point on the range's plane (plane px; a rifle's
   *  before the sway), the point its group is measured from. */
  | {
      readonly type: 'rangeShot';
      readonly tick: number;
      readonly shotId: number;
      /** The target the shot is counted for if it hits nothing (24 Oct: the one nearest the aim
       *  point on screen; one plane and kind outside the mixed course). x, y: the aim on its
       *  plane. */
      readonly plane: PlaneId;
      readonly target: RangeTarget;
      readonly x: number;
      readonly y: number;
    }
  | {
      /** 24 Oct update (D-037): a pellet, bullet or stone on a steel plate. */
      readonly type: 'plateHit';
      readonly tick: number;
      readonly shotId: number;
      readonly paperId: number;
      readonly x: number;
      readonly y: number;
      /** The shot's aim point on the same plane (24 Oct: groups are measured from it). */
      readonly aimX: number;
      readonly aimY: number;
    }
  | {
      /** 24 Oct update (D-037): a range shot has landed. `hits`: each target it put a pellet on
       *  (its plane, kind and pellets; `id` = paper/plate id or bird id). None = a miss, counted
       *  for the rangeShot target; `short` when that target is at Ver and the gun can't reach. */
      readonly type: 'rangeOutcome';
      readonly tick: number;
      readonly shotId: number;
      readonly hits: readonly {
        readonly plane: PlaneId;
        readonly target: RangeTarget;
        readonly id: number;
        readonly pellets: number;
      }[];
      readonly short: boolean;
    }
  /** v1.3x (D-037) Skietbaan only: a pellet on a paper target, where it struck (plane px). */
  | {
      readonly type: 'paperHit';
      readonly tick: number;
      readonly shotId: number;
      readonly paperId: number;
      readonly x: number;
      readonly y: number;
      /** The shot's aim point on the same plane (24 Oct: groups are measured from it). */
      readonly aimX: number;
      readonly aimY: number;
    }
  | { readonly type: 'miss'; readonly tick: number; readonly shotId: number }
  /** M8 Okavango: a shot splashed into water (screen point for the camera `cx`). */
  | {
      readonly type: 'splash';
      readonly tick: number;
      readonly dx: number;
      readonly sy: number;
      readonly cx: number;
    }
  /** M8: a "don't shoot it" prop was shot (the Kalahari weaver nest): points off. */
  | {
      readonly type: 'secretPenalty';
      readonly tick: number;
      readonly propId: string;
      readonly partId: string;
      readonly points: number;
    }
  /** M8: rain started or stopped (sun-showers, storm). */
  | { readonly type: 'weatherChanged'; readonly tick: number; readonly rain: boolean }
  | { readonly type: 'emptyClick'; readonly tick: number }
  | {
      readonly type: 'targetHit';
      readonly tick: number;
      readonly shotId: number;
      readonly birdId: number;
      readonly hitsLeft: number;
    }
  | {
      readonly type: 'armorKnocked';
      readonly tick: number;
      readonly shotId: number;
      readonly birdId: number;
      readonly armorLeft: number;
    }
  | {
      readonly type: 'targetBagged';
      readonly tick: number;
      readonly shotId: number;
      readonly birdId: number;
      readonly creature: string;
      readonly plane: PlaneId;
      readonly behaviour: BagBehaviour;
      /** The bird's flock, or null for fly-overs and pop-ups. */
      readonly flockId: number | null;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'scoreAwarded';
      readonly tick: number;
      readonly birdId: number;
      readonly points: number;
      readonly mult: number;
      readonly award: number;
      readonly breakdown: readonly BreakdownStep[];
    }
  | {
      readonly type: 'bonusAwarded';
      readonly tick: number;
      readonly bonus: BonusId;
      readonly base: number;
      readonly award: number;
    }
  | {
      readonly type: 'penaltyApplied';
      readonly tick: number;
      readonly birdId: number;
      readonly creature: string;
      readonly points: number;
    }
  | {
      readonly type: 'comboChanged';
      readonly tick: number;
      readonly streak: number;
      readonly frenzyMul: number;
    }
  | {
      readonly type: 'reloadStarted';
      readonly tick: number;
      readonly perShell: boolean;
      /** v1.6b: started by itself (Oupa Laai). */
      readonly auto?: boolean;
    }
  | { readonly type: 'shellLoaded'; readonly tick: number; readonly shells: number }
  | { readonly type: 'reloadFinished'; readonly tick: number; readonly shells: number }
  | { readonly type: 'reloadInterrupted'; readonly tick: number; readonly shells: number }
  | {
      readonly type: 'birdSpawned';
      readonly tick: number;
      readonly birdId: number;
      readonly creature: string;
      readonly plane: PlaneId;
      readonly motion: BirdMotion;
    }
  | {
      readonly type: 'birdDespawned';
      readonly tick: number;
      readonly birdId: number;
      readonly reason: 'exited' | 'ducked' | 'bagged';
    }
  | {
      readonly type: 'flockSpawned';
      readonly tick: number;
      readonly flockId: number;
      readonly plane: PlaneId;
      readonly size: number;
      readonly state: FlockState;
      /** Plane x of the flock's centre. */
      readonly x: number;
    }
  | {
      readonly type: 'flockThreatened';
      readonly tick: number;
      readonly flockId: number;
      readonly source: ThreatSource;
    }
  | {
      readonly type: 'flockStateChanged';
      readonly tick: number;
      readonly flockId: number;
      readonly from: FlockState;
      readonly to: FlockState;
      readonly cause: FlockCause;
      /** Plane position of the flock's centre (bubbles, stings). */
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
    }
  | {
      /** Every member bagged while eligible (GDD §6.4); a bonusAwarded{wholeFlock} follows. */
      readonly type: 'flockWiped';
      readonly tick: number;
      readonly flockId: number;
      readonly size: number;
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'flockRemoved';
      readonly tick: number;
      readonly flockId: number;
      readonly reason: 'bagged' | 'exited';
    }
  | {
      readonly type: 'gadgetUsed';
      readonly tick: number;
      readonly gadget: string;
      readonly chargesLeft: number;
      /** Flocks it sent to FLUSH. */
      readonly flocks: number;
    }
  | {
      readonly type: 'gadgetDenied';
      readonly tick: number;
      readonly gadget: string;
      readonly reason: 'noCharges' | 'cooldown';
    }
  | { readonly type: 'worldEvent'; readonly tick: number; readonly event: WorldEventId }
  | {
      /** A part of a secret was hit; more parts are still needed (multi-hit). */
      readonly type: 'secretPartHit';
      readonly tick: number;
      readonly propId: string;
      readonly partId: string;
      readonly partsLeft: number;
    }
  | {
      /** A multi-hit secret's window ran out; its marks reset. */
      readonly type: 'secretReset';
      readonly tick: number;
      readonly propId: string;
    }
  | {
      /** A secret paid out (GDD §11.1). Its rewards follow as their own events. */
      readonly type: 'secretTriggered';
      readonly tick: number;
      readonly propId: string;
      readonly partId: string;
    }
  | {
      /** A secret can be set off again (cooldown over). */
      readonly type: 'secretReady';
      readonly tick: number;
      readonly propId: string;
    }
  | {
      readonly type: 'timeAdded';
      readonly tick: number;
      readonly ticks: number;
      readonly durationTicks: number;
      readonly stampedeAtTick: number | null;
    }
  | {
      readonly type: 'crateSpawned';
      readonly tick: number;
      readonly crateId: number;
      readonly plane: PlaneId;
      readonly x: number;
      /** v1.7b (D-046): what it holds (power-up or crate-weapon id), or null. */
      readonly item: string | null;
    }
  | {
      readonly type: 'crateOpened';
      readonly tick: number;
      readonly crateId: number;
      /** Power-up or crate-weapon id. */
      readonly item: string;
      readonly itemType: 'powerup' | 'weapon';
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'crateExpired'; readonly tick: number; readonly crateId: number }
  | {
      readonly type: 'powerupStarted';
      readonly tick: number;
      readonly powerup: string;
      readonly source: 'crate' | 'secret' | 'consumable';
    }
  | { readonly type: 'powerupEnded'; readonly tick: number; readonly powerup: string }
  | {
      /** The active weapon changed (crate weapon picked up, or used up). */
      readonly type: 'weaponChanged';
      readonly tick: number;
      readonly weapon: string;
      readonly kind: 'primary' | 'crate';
    }
  | {
      readonly type: 'windChanged';
      readonly tick: number;
      readonly dir: 1 | -1;
      readonly strength: number;
    }
  | {
      readonly type: 'dustDevilSpawned';
      readonly tick: number;
      readonly dustDevilId: number;
      readonly plane: PlaneId;
      readonly x: number;
    }
  | { readonly type: 'dustDevilEnded'; readonly tick: number; readonly dustDevilId: number }
  | {
      /** A perching creature landed and calls (the kwêvoël's "kwê-kwê!"). */
      readonly type: 'birdCalled';
      readonly tick: number;
      readonly birdId: number;
      readonly creature: string;
    }
  | { readonly type: 'stampedeStarted'; readonly tick: number }
  | {
      /** FTUE script beat (GDD §16): `spook` = Oupa's dog Bles, `flush` = a forced flush.
       *  flockId null = no flock was in view (or a spook was not needed). */
      readonly type: 'tutorialBeat';
      readonly tick: number;
      readonly beat: 'spook' | 'flush';
      readonly flockId: number | null;
    }
  | {
      /** A charm effect fired (not per-bag scoring: that is in scoreAwarded.breakdown). */
      readonly type: 'charmTriggered';
      readonly tick: number;
      readonly charm: string;
      readonly slot: number;
      readonly trigger: string;
    }
  | {
      readonly type: 'charmsReordered';
      readonly tick: number;
      readonly charms: readonly string[];
    }
  | {
      /** Shells put back in the belt by a charm (Konsertina). */
      readonly type: 'shellsAdded';
      readonly tick: number;
      readonly added: number;
      readonly shells: number;
    }
  | {
      readonly type: 'consumableUsed';
      readonly tick: number;
      readonly slot: number;
      readonly item: string;
      readonly itemType: 'powerup' | 'weapon';
    }
  | {
      /** Season Run doppies found in the hunt (white tarentaal, charms). */
      readonly type: 'doppiesFound';
      readonly tick: number;
      readonly amount: number;
      readonly total: number;
      readonly birdId: number | null;
    }
  | { readonly type: 'lightning'; readonly tick: number; readonly ticks: number }
  | {
      readonly type: 'slowMo';
      readonly tick: number;
      readonly ticks: number;
      readonly scale: number;
    }
  /** v1.7 (D-044): a meerkat colony on the map (hunt start). x, y: its centre on its layer. */
  | {
      readonly type: 'colonySpawned';
      readonly tick: number;
      readonly colonyId: string;
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
      readonly family: number;
    }
  /** A meerkat was shot: it tumbles into a hole, never hurt. points: the penalty (negative), or
   *  0 inside the colony's cooldown. */
  | {
      readonly type: 'meerkatHit';
      readonly tick: number;
      readonly shotId: number;
      readonly colonyId: string;
      readonly meerkatId: number;
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
      readonly points: number;
    }
  /** The shot meerkat pops its head out of the hole and scolds (points: its hit's). */
  | {
      readonly type: 'meerkatScold';
      readonly tick: number;
      readonly colonyId: string;
      readonly meerkatId: number;
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
      readonly points: number;
    }
  /** The colony dashed for its holes: a shot nearby, a loud gun, an alarm or a hit. */
  | {
      readonly type: 'meerkatsDived';
      readonly tick: number;
      readonly colonyId: string;
      readonly cause: 'shot' | 'loud' | 'alarm' | 'hit';
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
    }
  /** The sentinel barks: a raptor or the crop sprayer overhead. flockId: the guineafowl flock
   *  that heard it (null: none, or the content turns that off). */
  | {
      readonly type: 'meerkatAlarm';
      readonly tick: number;
      readonly colonyId: string;
      readonly meerkatId: number;
      readonly creature: string;
      readonly flockId: number | null;
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
    }
  /** The Familiefoto: the whole family stands in a row facing the camera (click). A
   *  secretTriggered (propId "familiefoto") and its bonus follow. */
  | {
      readonly type: 'familiefoto';
      readonly tick: number;
      readonly colonyId: string;
      readonly family: number;
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'huntEnded'; readonly tick: number; readonly score: number }
  /** D-048: a special day's hunt starts (its sting, captions and Oupa's opening line). */
  | {
      readonly type: 'feesdagStarted';
      readonly tick: number;
      readonly feesdag: string;
      readonly lanterns: number;
    }
  /** D-048 (Spookjag): a bat or an owl came into the sky at a plane edge (sound cue). */
  | {
      readonly type: 'spookFlew';
      readonly tick: number;
      readonly thing: 'bat' | 'owl';
      readonly id: number;
      readonly plane: PlaneId;
    }
  /** D-048: a bat, owl or pumpkin lantern was shot. Points are flat (bat +, owl −, lantern 0);
   *  `lanternsLit` counts the lanterns still lit after this hit. */
  | {
      readonly type: 'spookHit';
      readonly tick: number;
      readonly shotId: number;
      readonly thing: SpookThingKind;
      readonly id: number;
      readonly plane: PlaneId;
      readonly x: number;
      readonly y: number;
      readonly points: number;
      readonly lanternsLit: number;
    }
  /** D-048: the day's last lantern went dark — "Lanterns out!", paid once. */
  | { readonly type: 'lanternsOut'; readonly tick: number; readonly points: number };

export type SimEventType = SimEvent['type'];

/** D-048: what the Spookjag (Halloween) puts up to shoot. */
export type SpookThingKind = 'bat' | 'owl' | 'lantern';

/**
 * Running hash of an event stream (two FNV-1a lanes → 16 hex chars). Events are plain objects
 * built with a fixed key order, so JSON.stringify is stable across engines.
 */
export interface EventHasher {
  add(events: readonly SimEvent[]): void;
  readonly count: number;
  digest(): string;
}

export function createEventHasher(): EventHasher {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  let count = 0;
  return {
    add(events) {
      for (const e of events) {
        const text = JSON.stringify(e);
        a = fnv1a32(text, a);
        b = fnv1a32(text, b ^ 0x5bd1e995);
        count++;
      }
    },
    get count() {
      return count;
    },
    digest() {
      return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
    },
  };
}

export function hashEvents(events: readonly SimEvent[]): string {
  const h = createEventHasher();
  h.add(events);
  return h.digest();
}
