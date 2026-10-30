// e2e/dev-only content tweaks from URL parameters (main.ts allows them only in dev/test builds
// and with ?e2e=1). They change the content, so the hunt's contentHash changes too: such hunts
// are never official.
import type { ContentBundle } from '../content/schemas';

/**
 * ?crate=<id>: every crate holds this power-up or crate weapon, and the first crate drops in the
 * first seconds of the hunt (so tests and hand checks can try one without waiting).
 */
export function withTestCrate(b: ContentBundle, item: string): ContentBundle {
  const weapon = b.weapons.weapons.some((w) => w.id === item && w.kind === 'crate');
  const powerup = b.powerups.powerups.some((p) => p.id === item);
  if (!weapon && !powerup) return b;
  const crates = b.powerups.crates;
  return {
    ...b,
    powerups: {
      ...b.powerups,
      crates: {
        ...crates,
        modes: ['classic', 'daily'],
        windows: crates.windows.map((w, i) => (i === 0 ? ([0.02, 0.04] as [number, number]) : w)),
        table: [{ id: item, weight: 1, type: weapon ? 'weapon' : 'powerup' }],
      },
    },
  };
}

/** ?quotaMul=0.1: every Season Run quota × this (0 = every hunt passes). */
export function withQuotaMul(b: ContentBundle, mul: number): ContentBundle {
  return {
    ...b,
    run: {
      ...b.run,
      seasons: b.run.seasons.map((s) => ({
        ...s,
        quotas: s.quotas.map((q) => Math.round(q * mul)),
      })),
    },
  };
}

/**
 * ?doppies=1: a Season Run starts with this many Doppies and hunts pay none (base, over-quota,
 * interest and boss pay all 0), so the Padstal shows offers the player can't afford (e2e).
 */
export function withDoppies(b: ContentBundle, n: number): ContentBundle {
  return {
    ...b,
    run: {
      ...b.run,
      doppies: {
        ...b.run.doppies,
        start: n,
        perHunt: 0,
        overQuotaCap: 0,
        interestCap: 0,
        bossHuntBonus: 0,
      },
    },
  };
}

/**
 * v1.2x admin page (D-034): `event` takes place in every hunt of every biome that has it — at least
 * once, early (first 5–30 % of the hunt), in every mode and without its omen.
 */
export function withForcedEvent(b: ContentBundle, event: string): ContentBundle {
  return {
    ...b,
    biomes: b.biomes.map((biome) => ({
      ...biome,
      events: biome.events.map((e) => {
        if (e.id !== event) return e;
        // Drop the mode and omen filters; every other field stays as it is.
        const forced = {
          ...e,
          perHunt: [Math.max(1, e.perHunt[0]), Math.max(1, e.perHunt[1])] as [number, number],
          window: [0.05, 0.3] as [number, number],
        };
        delete forced.modes;
        delete forced.omenOnly;
        return forced;
      }),
    })),
  };
}

/**
 * 1.9.3 (D-056, review M14) ?makalaniPreview=juggle|pop (art previews only): `juggle` makes a nut
 * in the air easy to hit (× 6 its radius instead of × 2.2) and never pops it, so the screenshot spec
 * reaches a chain of 3 in a few shots; `pop` makes every gun a pop weapon, so any hit bursts the nut.
 */
export function withMakalaniPreview(b: ContentBundle, mode: string): ContentBundle {
  const m = b.birds.makalani;
  // Review M16: with the bigger air radius most of a shotgun's pellets land on the nut, and 3+
  // pellets pop it: the juggle preview never pops (and no gun is a pop weapon).
  if (mode === 'juggle')
    return {
      ...b,
      birds: { ...b.birds, makalani: { ...m, airHitMul: 6, popPellets: 999, popWeapons: [] } },
    };
  if (mode === 'pop')
    return {
      ...b,
      birds: {
        ...b.birds,
        makalani: { ...m, popWeapons: b.weapons.weapons.map((w) => w.id) },
      },
    };
  return b;
}

/** 1.9.3 (D-056) ?palms=0 (art previews' "before"): every layout without its makalani palms. */
export function withNoPalms(b: ContentBundle): ContentBundle {
  return {
    ...b,
    biomes: b.biomes.map((x) => ({
      ...x,
      layouts: x.layouts.map((l) => {
        const out = { ...l };
        delete out.palms;
        return out;
      }),
    })),
  };
}

/**
 * v1.7 ?birds=0 (art previews of the meerkats): a hunt with no flocks, pop-ups, fly-over spawns,
 * world events, Stampede surge or crates — only the director's opening fly-over crosses the far
 * sky — so the colonies are the only thing on the veld. The colonies' own behaviour is unchanged (their stream draws the same numbers).
 */
export function withNoBirds(b: ContentBundle): ContentBundle {
  return {
    ...b,
    powerups: { ...b.powerups, crates: { ...b.powerups.crates, perHunt: 0, windows: [] } },
    biomes: b.biomes.map((x) => ({
      ...x,
      events: [],
      pacing: {
        ...x.pacing,
        keyframes: x.pacing.keyframes.map((k) => ({
          ...k,
          flocks: {},
          flyoversPerMin: 0,
          popupsPerMin: 0,
        })),
        stampede: { ...x.pacing.stampede, flyoversPerMin: 0, popupsPerMin: 0 },
      },
    })),
  };
}

/**
 * D-049 (screenshot "before" shots): ?planeScale=v17 puts back the plane scales, aim assist and
 * hit sizes of v1.7 (near 1, mid 0.5, far 0.22, Ver 0.1, no minimum hit radius). Atlases are
 * drawn at their packed scale × the ratio, so birds show at the old sizes.
 */
export const PLANE_SCALE_PRESETS = {
  v17: {
    near: { scale: 1, aimAssistPx: 8, minHitRadiusPx: 0 },
    mid: { scale: 0.5, aimAssistPx: 14, minHitRadiusPx: 0 },
    far: { scale: 0.22, aimAssistPx: 18, minHitRadiusPx: 0 },
    ver: { scale: 0.1, aimAssistPx: 6, minHitRadiusPx: 0 },
  },
} as const;
export type PlaneScalePreset = keyof typeof PLANE_SCALE_PRESETS;

export const isPlaneScalePreset = (s: string | null): s is PlaneScalePreset =>
  s !== null && Object.hasOwn(PLANE_SCALE_PRESETS, s);

export function withPlaneScales(b: ContentBundle, preset: PlaneScalePreset): ContentBundle {
  const p = PLANE_SCALE_PRESETS[preset];
  const planes = b.scoring.planes;
  return {
    ...b,
    scoring: {
      ...b.scoring,
      planes: {
        near: { ...planes.near, ...p.near },
        mid: { ...planes.mid, ...p.mid },
        far: { ...planes.far, ...p.far },
        ver: { ...planes.ver, ...p.ver },
      },
    },
  };
}

/**
 * e2e/dev only (D-048, `?spook=early`): the special days' owls come early, three of them (in the
 * first 40 % of the hunt) and the bats from the start, so a spec meets them within seconds.
 */
export function withEarlySpook(b: ContentBundle): ContentBundle {
  return {
    ...b,
    feesdae: {
      ...b.feesdae,
      specials: b.feesdae.specials.map((f) => ({
        ...f,
        twist: {
          ...f.twist,
          owls: {
            ...f.twist.owls,
            perHunt: [2, 2] as [number, number],
            window: [0.15, 0.3] as [number, number],
          },
          bats: { ...f.twist.bats, window: [0.02, 0.5] as [number, number] },
        },
      })),
    },
  };
}

/**
 * v1.8b (D-062) ?baboonRaid=<action> (e2e and art previews only): every map's troop is there, the
 * first raid comes after 2 s and then one every ~10 s, one raider at a time, only at spots of that
 * action (any spot when the map has none, or for `any`), its act lasts 4× as long and a hit raider
 * runs off slowly, so a test or a screenshot meets a raid in progress quickly.
 */
export function withBaboonRaid(b: ContentBundle, action: string): ContentBundle {
  const bb = b.birds.baboons;
  const act = { ...bb.raids.actSeconds };
  for (const k of Object.keys(act) as (keyof typeof act)[]) act[k] *= 4;
  return {
    ...b,
    birds: {
      ...b.birds,
      baboons: {
        ...bb,
        raids: {
          ...bb.raids,
          perMinute: 6,
          firstAfterSeconds: [2, 2],
          pairChance: 0,
          actSeconds: act,
          // A hit raider runs off slowly enough for a test's second shot.
          runPxPerSec: 200,
        },
      },
    },
    biomes: b.biomes.map((x) => {
      const m = x.baboons;
      if (m === undefined) return x;
      const spots = m.spots.filter((s) => s.action === action);
      return {
        ...x,
        baboons: {
          ...m,
          troops: m.troops.map((t) => ({ ...t, chance: 1 })),
          spots: spots.length > 0 ? spots : m.spots,
        },
      };
    }),
  };
}

/**
 * v1.8b (D-062, review round 2) ?baboons=0 (e2e only): no baboon troop on any map, for the specs
 * that shoot at other things or count the score or Oupa's lines (a stray pellet on a ridge mother
 * would cost 15; a raid adds barks and pops).
 */
export function withNoBaboons(b: ContentBundle): ContentBundle {
  const strip = <T extends { baboons?: unknown }>(x: T): T => {
    const out = { ...x };
    delete out.baboons;
    return out;
  };
  return {
    ...b,
    biomes: b.biomes.map((x) => ({
      ...strip(x),
      layouts: x.layouts.map(strip),
      bonusMaps: x.bonusMaps.map(strip),
    })),
  };
}

/**
 * v1.8c (D-063) e2e/dev only: the Harvest's previews. `duckSeconds`: a worker struck by a pellet
 * stays down this long (?harvestDuck=600: a screenshot of the duck under a held frame); `rush`:
 * the rush's peak rate from the start (?harvestRush=1: a full field within seconds).
 */
export function withHarvestPreview(
  b: ContentBundle,
  opts: { readonly duckSeconds?: number; readonly rush?: boolean },
): ContentBundle {
  const h = b.modes.modes.harvest;
  const peak = h.rush.keyframes.at(-1)?.warthogsPerMin ?? 20;
  return {
    ...b,
    modes: {
      ...b.modes,
      modes: {
        ...b.modes.modes,
        harvest: {
          ...h,
          workers:
            opts.duckSeconds === undefined
              ? h.workers
              : { ...h.workers, duckSeconds: opts.duckSeconds },
          rush:
            opts.rush === true
              ? {
                  ...h.rush,
                  keyframes: h.rush.keyframes.map((k) => ({ ...k, warthogsPerMin: peak * 2 })),
                }
              : h.rush,
        },
      },
    },
  };
}
