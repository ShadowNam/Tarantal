// Typed gameplay events (Tech §3.4, CLAUDE.md rule 4). Audio, FX, UI, analytics and replay
// hashing subscribe to these; they never read internal sim fields.
import type { WorldEventId } from '../content/schemas';
import { fnv1a32 } from './rng';
import type { BreakdownStep } from './scoring/pipeline';
import type { BagBehaviour, BirdMotion, FlockState, PlaneId } from './types';

/** What threatened a flock (GDD §6.2). */
export type ThreatSource = 'shot' | 'silentBag' | 'event';
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
    }
  | { readonly type: 'miss'; readonly tick: number; readonly shotId: number }
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
  | { readonly type: 'reloadStarted'; readonly tick: number; readonly perShell: boolean }
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
      readonly source: 'crate' | 'secret';
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
  | { readonly type: 'huntEnded'; readonly tick: number; readonly score: number };

export type SimEventType = SimEvent['type'];

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
