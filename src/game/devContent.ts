// e2e/dev-only content tweaks from URL parameters (main.ts allows them only in dev/test builds
// and with ?e2e=1). They change the content, so the hunt's contentHash changes too: such hunts
// are never official.
import {
  REENBUI_PHASES,
  type CameoKind,
  type ContentBundle,
  type ReenbuiPhase,
} from '../content/schemas';
import { CAMEO_PREVIEW_SPOT } from '../content/cameoPreview';

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
      specials: b.feesdae.specials.map((f) =>
        f.twist.rule !== 'spookjag'
          ? f
          : {
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
            },
      ),
    },
  };
}

/**
 * e2e/dev only (D-064, `?presents=near`): Christmas's presents stand only at each map's tinsel tree
 * (or the Karoo's windpomp), two of them, either side of it — a spec or a screenshot finds them
 * all in one view. The rule and its scoring are as on the day.
 */
export function withNearPresents(b: ContentBundle): ContentBundle {
  const at = new Set(['windpomp', 'weaver_camelthorn', 'baobab', 'sausage_tree', 'camelthorn_old']);
  return {
    ...b,
    feesdae: {
      ...b.feesdae,
      specials: b.feesdae.specials.map((f) =>
        f.twist.rule !== 'kersfees'
          ? f
          : {
              ...f,
              twist: {
                ...f.twist,
                presents: {
                  ...f.twist.presents,
                  count: [2, 2] as [number, number],
                  spots: f.twist.presents.spots.filter((p) => at.has(p.prop)),
                },
              },
            },
      ),
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

/** v1.16 (D-078): the ridge moments `?baboonPeek=` brings on quickly (lesson 10). */
export const BABOON_PEEKS = ['peek', 'sentinel', 'long'] as const;
export type BaboonPeek = (typeof BABOON_PEEKS)[number];

/**
 * v1.16 (D-078) ?baboonPeek=<mode> (e2e and art previews only): every map's troop is there, no
 * raids, and the members come up within a second or two: `peek` one at a time looking over the
 * edge for 30 s; `sentinel` one male sitting up on top for 30 s (the others' peeks last 6 s);
 * `long` up to three at once peeking 10–14 s (the mother test's shots).
 */
export function withBaboonPeek(b: ContentBundle, mode: BaboonPeek): ContentBundle {
  const bb = b.birds.baboons;
  const t = bb.troop;
  const troop =
    mode === 'peek'
      ? { activities: { peek: 1, sentinel: 0 }, peekSeconds: [30, 30], maxVisible: 1 }
      : mode === 'sentinel'
        ? {
            activities: { peek: 0, sentinel: 1 },
            // The others' looks last long enough to be seen (and shot) on a slow software-GL
            // machine, where a frame can span many ticks.
            peekSeconds: [6, 6],
            sentinelSeconds: [30, 30],
            maxVisible: 1,
          }
        : { peekSeconds: [10, 14], maxVisible: 3 };
  return {
    ...b,
    birds: {
      ...b.birds,
      baboons: {
        ...bb,
        troop: { ...t, hideSeconds: [0.5, 2], ...troop } as typeof t,
        raids: { ...bb.raids, perMinute: 0, firstAfterSeconds: [9999, 9999] },
      },
    },
    biomes: b.biomes.map((x) =>
      x.baboons === undefined
        ? x
        : {
            ...x,
            baboons: { ...x.baboons, troops: x.baboons.troops.map((tr) => ({ ...tr, chance: 1 })) },
          },
    ),
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
 * v1.18 (D-081): `phase2`, `phase2Seconds` (below).
 */
export function withHarvestPreview(
  b: ContentBundle,
  opts: {
    readonly duckSeconds?: number;
    readonly rush?: boolean;
    /** v1.18 (D-081): ?harvestPhase2=1 — the hunt starts with Phase 2's banner; with
     *  ?harvestPhase2Seconds=<s> its clock is that long (e2e: the clock ends it quickly). */
    readonly phase2?: boolean;
    readonly phase2Seconds?: number;
    /** v1.18 (D-081): ?harvestShots=1 — the screenshot spec's moments last: the first raid comes
     *  at once and its raiders take 12 s down the koppie and dash in slowly (a pan can follow);
     *  yearlings with a piglet come through
     *  the small hole every few seconds and squeeze through slowly; the hole stays open. */
    readonly shots?: boolean;
  },
): ContentBundle {
  const h = b.modes.modes.harvest;
  const peak = h.rush.keyframes.at(-1)?.warthogsPerMin ?? 20;
  const biomes =
    opts.shots === true
      ? b.biomes.map((x) => {
          const bb = x.baboons;
          if (x.id !== h.biome || bb?.descent === undefined) return x;
          return {
            ...x,
            baboons: {
              ...bb,
              firstAfterSeconds: [0.5, 0.5] as [number, number],
              // 12 s down: slow enough to pan to, early enough that the dash lands
              // inside the 30 s rush (huntSeconds).
              descent: { ...bb.descent, climbSeconds: 12, dashMul: 0.35 },
            },
          };
        })
      : b.biomes;
  return {
    ...b,
    biomes,
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
          phase2: {
            ...h.phase2,
            ...(opts.phase2 === true ? { direct: true } : {}),
            ...(opts.phase2Seconds === undefined ? {} : { seconds: opts.phase2Seconds }),
          },
          hole:
            opts.shots === true
              ? { ...h.hole, youngPerMin: 30, pigletChance: 1, squeezeMul: 0.08, patchAt: 0.98 }
              : h.hole,
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

/**
 * v1.10 (D-067, lesson 17) e2e only: no Reënbui on any map — `?reenbui=0`, for the specs that pin
 * a seed (tests/e2e/helpers.ts boot() adds it unless a spec names `reenbui=`).
 */
export function withNoReenbui(b: ContentBundle): ContentBundle {
  return { ...b, reenbui: { ...b.reenbui, areas: [] } };
}

/**
 * v1.10 (D-067) e2e/dev only: `?reenbui=1` — a Reënbui in every hunt that may have one, on every
 * map, its build-up `startSeconds` in (on the hunt's length); `?reenbuiPhase=<phase>` also holds
 * that phase (600 s) after half-second earlier phases, for tests and screenshots (lesson 11);
 * `?reenbuiPhase=after`: every phase half a second, so the clearing sky comes 4 s in.
 */
export function withReenbuiPreview(
  b: ContentBundle,
  hold: ReenbuiPhase | 'after' | null,
  startSeconds = 2,
): ContentBundle {
  const r = b.reenbui;
  const hunt = b.modes.modes.classic.huntSeconds;
  const at = Math.min(1, startSeconds / hunt);
  let phaseSeconds = r.phaseSeconds;
  if (hold === 'after') phaseSeconds = { buildup: 0.5, drops: 0.5, swarm: 0.5, easing: 0.5 };
  else if (hold !== null) {
    const i = REENBUI_PHASES.indexOf(hold);
    phaseSeconds = { ...phaseSeconds };
    REENBUI_PHASES.forEach((p, j) => {
      if (j < i) phaseSeconds = { ...phaseSeconds, [p]: 0.5 };
      if (j === i) phaseSeconds = { ...phaseSeconds, [p]: 600 };
    });
  }
  return {
    ...b,
    reenbui: {
      ...r,
      areas: b.biomes.map((x) => ({ biome: x.id, chance: 1 })),
      window: [at, at],
      phaseSeconds,
    },
  };
}

/**
 * v1.10 (D-067): the content a test-hook build plays for the URL's Reënbui flags — `reenbui=1` or
 * `reenbuiPhase=` the preview, `reenbui=0` none, anything else (no flag, `reenbui=content`) the
 * bundle as it is: `?e2e` alone never changes the content or its hash (review of #110).
 */
export function withReenbuiParams(b: ContentBundle, params: URLSearchParams): ContentBundle {
  const flag = params.get('reenbui');
  const phase = params.get('reenbuiPhase');
  const hold =
    phase === 'after'
      ? 'after'
      : (REENBUI_PHASES as readonly (string | null)[]).includes(phase)
        ? (phase as ReenbuiPhase)
        : null;
  if (flag === '1' || hold !== null) return withReenbuiPreview(b, hold);
  if (flag === '0') return withNoReenbui(b);
  return b;
}

/**
 * v1.12 (D-069, lesson 17) e2e only: no Brakkie on any map — `?brakkie=0`, for the specs that pin
 * a seed (tests/e2e/helpers.ts boot() adds it unless a spec names `brakkie=`).
 */
export function withNoBrakkie(b: ContentBundle): ContentBundle {
  return { ...b, brakkie: { ...b.brakkie, areas: [] } };
}

/** v1.12 (D-069): the moments `?brakkiePreview=` brings on quickly (lesson 11). */
export const BRAKKIE_PREVIEWS = [
  'fetch',
  'bark',
  'flush',
  'point',
  'react',
  'bag',
  'jag',
  'jagView',
] as const;
export type BrakkiePreview = (typeof BRAKKIE_PREVIEWS)[number];

/**
 * v1.12 (D-069) e2e/dev only: `?brakkie=1` — Brakkie on every map he comes to, out of the bakkie
 * half a second in, fetching every bag in view and back from the bakkie in 2 s; with
 * `?brakkiePreview=bark` he barks at a mid flock every 3–4 s, `flush` digs a flock out 4 s in and
 * every 8–10 s, `fetch` fetches a bird placed beside him 3 s in (no bag needed: the screenshot
 * spec on software GL, lesson 11) (the e2e and screenshot moments); a comma list combines them.
 */
export function withBrakkiePreview(
  b: ContentBundle,
  previews: readonly BrakkiePreview[],
): ContentBundle {
  const on = (p: BrakkiePreview): boolean => previews.includes(p);
  const d = b.brakkie;
  return {
    ...b,
    brakkie: {
      ...d,
      enterSeconds: [0.5, 0.5],
      fetch: { ...d.fetch, awaySeconds: [2, 2.5] },
      hit: { ...d.hit, awaySeconds: [3, 3.5] },
      ...(on('fetch') ? { demoFetchSeconds: 3 } : {}),
      bark: on('bark')
        ? { ...d.bark, everySeconds: [3, 4], maxDxPx: 1300, retrySeconds: 0.5 }
        : d.bark,
      flush:
        on('flush') || on('point')
          ? { ...d.flush, firstSeconds: [4, 4], everySeconds: [8, 10], chance: 1 }
          : d.flush,
      // v1.17 (D-079): `point` holds the point 8 s (the screenshot's marker, lesson 10); `react`
      // makes a reaction last 6 s, lets one come every second, and has him do a proud hop 4 s in.
      ...(on('point') ? { point: { ...d.point, seconds: 8 } } : {}),
      ...(on('react')
        ? { react: { ...d.react, seconds: 6, minGapSeconds: 1 }, demoProudSeconds: 4 }
        : {}),
      // v1.20 (D-085): `bag` — 3 s in a bird joins his queue beside him (the fetch-sooner e2e);
      // `jag` — the Jag card reaches every foraging guineafowl on the panorama and he looks
      // for one every few ticks (the card's e2e and screenshots, lesson 11).
      ...(on('bag') ? { demoBagSeconds: 3 } : {}),
      ...(on('jag') ? { jag: { ...d.jag, maxDxPx: 4000, lookSeconds: 0.1 } } : {}),
      // `jagView` (the screenshots): only birds on screen, so the chase and the pounce are in view.
      ...(on('jagView')
        ? { jag: { ...d.jag, maxDxPx: 650, nearMaxDxPx: 650, lookSeconds: 0.1 } }
        : {}),
    },
  };
}

/**
 * v1.17 (D-079) e2e/dev only: `?wind=strong` — every map with wind blows at full strength one
 * way for a minute with a long gust every second or so (the screenshot's strong wind and the
 * wind-HUD e2e: no waiting for a gust).
 */
export function withWindParams(b: ContentBundle, params: URLSearchParams): ContentBundle {
  if (params.get('wind') !== 'strong') return b;
  return {
    ...b,
    biomes: b.biomes.map((x) =>
      x.omen.wind === undefined
        ? x
        : {
            ...x,
            omen: {
              ...x.omen,
              wind: {
                ...x.omen.wind,
                strength: [0.95, 0.95],
                directionChangeSeconds: [120, 120],
                gusts: { everySeconds: [0.5, 0.5], seconds: [6, 6], add: 0.3, riseShare: 0.3 },
              },
            },
          },
    ),
  };
}

/**
 * v1.12 (D-069): the content a test-hook build plays for the URL's Brakkie flags — `brakkie=1` or
 * `brakkiePreview=` the preview, `brakkie=0` none, anything else (no flag, `brakkie=content`) the
 * bundle as it is: `?e2e` alone never changes the content or its hash (lesson 37).
 */
export function withBrakkieParams(b: ContentBundle, params: URLSearchParams): ContentBundle {
  const flag = params.get('brakkie');
  // One preview or a comma list (`bark,fetch`: the perf spec's bark and fetch in one hunt).
  const previews = (params.get('brakkiePreview') ?? '')
    .split(',')
    .filter((p): p is BrakkiePreview => (BRAKKIE_PREVIEWS as readonly string[]).includes(p));
  // v1.13 polish, art previews only: `?brakkieGunStripe=0` — his rest spots as before the fix
  // (his head may rest in the gun's barrel on screen), the screenshot spec's "before".
  const noStripe = (x: ContentBundle): ContentBundle =>
    params.get('brakkieGunStripe') === '0'
      ? { ...x, brakkie: { ...x.brakkie, roam: { ...x.brakkie.roam, gunStripePx: [0, 0] } } }
      : x;
  if (flag === '0') return withNoBrakkie(b);
  if (flag === '1' || previews.length > 0) return noStripe(withBrakkiePreview(b, previews));
  return noStripe(b);
}

/**
 * v1.13 (D-075, lesson 17) e2e only: no cameos on any map — `?cameos=0`, for the specs that pin a
 * seed (tests/e2e/helpers.ts boot() adds it unless a spec names `cameos=`).
 */
export function withNoCameos(b: ContentBundle): ContentBundle {
  return { ...b, cameos: { ...b.cameos, areas: [] } };
}

const CAMEO_KINDS: readonly CameoKind[] = [
  'warthogs',
  'dungBeetle',
  'tortoise',
  'ostrich',
  'springbok',
  'gemsbok',
  'elephants',
];

/**
 * v1.13 (D-075) e2e/dev only: `?cameos=1` — each area's cameos come 2–3 s in and again every
 * 6–8 s (up to 4 visits); `?cameoPreview=all|<kind>,<kind>…` — those kinds (where the map has them)
 * out in view 0.5 s in, walking slowly towards the centre (the elephants trumpet then), and with
 * `?cameoReact=<s>` they react that many seconds in (the screenshot spec's reactions, lesson 11).
 */
export function withCameoPreview(
  b: ContentBundle,
  kinds: readonly CameoKind[] | null,
  reactSeconds: number | null,
): ContentBundle {
  const c = b.cameos;
  const soon = (k: (typeof c.kinds)['warthogs']): typeof k => ({
    ...k,
    schedule: { firstSeconds: [2, 3], everySeconds: [6, 8], maxVisits: 4 },
  });
  return {
    ...b,
    cameos: {
      ...c,
      kinds: {
        warthogs: soon(c.kinds.warthogs),
        dungBeetle: soon(c.kinds.dungBeetle),
        tortoise: soon(c.kinds.tortoise),
        ostrich: soon(c.kinds.ostrich),
        springbok: soon(c.kinds.springbok),
        gemsbok: soon(c.kinds.gemsbok),
        elephants: { herd: { ...c.kinds.elephants.herd, chance: 1, cooldownSeconds: 4 } },
      },
      ...(kinds === null
        ? {}
        : {
            preview: {
              atSeconds: 0.5,
              kinds: [...kinds],
              ...CAMEO_PREVIEW_SPOT,
              ...(reactSeconds === null ? {} : { reactSeconds }),
            },
          }),
    },
  };
}

/**
 * v1.13 (D-075): the content a test-hook build plays for the URL's cameo flags — `cameos=1` or
 * `cameoPreview=` the preview, `cameos=0` none, anything else (no flag, `cameos=content`) the
 * bundle as it is: `?e2e` alone never changes the content or its hash (lesson 37).
 */
export function withCameoParams(b: ContentBundle, params: URLSearchParams): ContentBundle {
  const flag = params.get('cameos');
  const p = params.get('cameoPreview');
  const kinds =
    p === null
      ? null
      : p === 'all'
        ? CAMEO_KINDS
        : CAMEO_KINDS.filter((k) => p.split(',').includes(k));
  const react = Number(params.get('cameoReact') ?? NaN);
  if (flag === '0') return withNoCameos(b);
  if (flag === '1' || (kinds !== null && kinds.length > 0))
    return withCameoPreview(
      b,
      kinds !== null && kinds.length > 0 ? kinds : null,
      Number.isFinite(react) && react > 0 ? react : null,
    );
  return b;
}

/**
 * v1.12 (polish b) art previews only: `?agamaBefore=1` — the Bushveld agama on its old seat (its
 * tail off the koppie's edge), the screenshot spec's "before".
 */
export function withAgamaBefore(b: ContentBundle): ContentBundle {
  return {
    ...b,
    biomes: b.biomes.map((x) =>
      x.id !== 'bushveld-winter'
        ? x
        : {
            ...x,
            props: x.props.map((p) =>
              p.id === 'dassie_koppie' && p.secret !== undefined
                ? {
                    ...p,
                    secret: {
                      ...p.secret,
                      tell: { species: 'rock_agama', ox: 96, oy: -30, facing: -1 as const },
                    },
                  }
                : p,
            ),
          },
    ),
  };
}

/** v1.22.1 (D-086): the size editor's fixed seed (the same hunt on every open). */
export const SIZE_PREVIEW_SEED = 7;

/**
 * v1.22.1 (D-086) the size editor (`?admin=1&sizes=<area>`, the web admin page): every sized animal
 * out in view at once — the cameos (all kinds the map has, near the centre), Brakkie out of the
 * bakkie, the ridge's baboons peeking (up to three) and a raider coming in, the Harvest's rush and
 * its piglets — and no Reënbui. The hunt is then held still (SIZE_HOLD_TICK).
 */
export function withSizePreview(b: ContentBundle): ContentBundle {
  const shown = withBrakkiePreview(withCameoPreview(b, CAMEO_KINDS, null), []);
  const baboons = withBaboonRaid(withBaboonPeek(shown, 'long'), 'any');
  return withNoReenbui(withHarvestPreview(baboons, { rush: true, shots: true }));
}
