// v1.16 (D-078): the animals' sizes next to the helmeted guineafowl, the fixed yardstick (its size
// and hit boxes never change). v1.17b (D-080, the owner: "yes make all animals true size"): every
// animal, not only the small ones. Each animal is compared with the guineafowl standing on its own
// plane: real metres × (that bird's standing px / GUINEAFOWL_M) is the size real proportions give.
// Pure: the drawn sizes come from content values and frame-box constants measured once from the
// delivered (interim) art, so the tests need no PNG decoding. tools/sizes.test.ts holds the fixed
// species to ±15 % and lists the ones left for the owner, each with its reason.
import type { ContentBundle, Feel } from '../src/content/schemas';
import { CAMEO_SIZE_MUL } from '../src/game/cameos/cameoSheet';
import { FAUNA_HERDS, lookHeight, type FaunaSpecies } from '../src/game/view/faunaHerds';
import type { PlaneId } from '../src/sim/types';
import { ANIMAL_M, GUINEAFOWL_M, targetPx } from './perspective';

/**
 * The guineafowl's standing (alert) height in design px at plane scale 1: birdUnits('alert')
 * (tools/birdUnits.ts, docs/balance/perspective.md) — 263 near, 110.5 mid, 39.4 far.
 */
export const GUINEAFOWL_STANDING_PX = 263;

/** The standing guineafowl on a plane (design px). */
export const birdStandingPx = (content: ContentBundle, plane: PlaneId): number =>
  GUINEAFOWL_STANDING_PX * content.scoring.planes[plane].scale;

/**
 * The tells' drawn length at scale 1 (prop px), measured from the rest frame of the delivered 2×
 * sheet (art-source/sprites/tells/sheet.png, frame table src/game/view/tell/tellSheet.ts): the
 * opaque box's long side — bill (or crown) to tail tip for a perched bird, which is its field-guide
 * length; snout to tail tip for the lizards, the mouse and the chameleon; the jacana stands on its
 * long legs, so it is its standing height.
 */
export const TELL_DRAWN_PX: Readonly<Record<string, number>> = {
  fork_tailed_drongo: 48,
  rock_agama: 40,
  striped_skink: 34,
  lilac_breasted_roller: 48,
  flap_necked_chameleon: 42.5,
  rock_kestrel: 50,
  cape_wagtail: 30.5,
  fiscal_shrike: 45,
  striped_mouse: 62.5,
  pied_crow: 61.5,
  malachite_kingfisher: 26,
  red_billed_oxpecker: 27.5,
  african_jacana: 81.5,
};

/** The tells' real sizes (m), in the sense TELL_DRAWN_PX measures them. */
export const TELL_REAL_M: Readonly<Record<string, number>> = {
  fork_tailed_drongo: 0.25,
  // A displaying (nodding) male: up to 0.3 m with its tail.
  rock_agama: 0.3,
  striped_skink: 0.2,
  // 0.36 m with the tail streamers; the art draws a square tail without them.
  lilac_breasted_roller: 0.29,
  flap_necked_chameleon: 0.25,
  rock_kestrel: 0.33,
  cape_wagtail: 0.19,
  fiscal_shrike: 0.22,
  // Head and body ~0.1 m and a tail as long.
  striped_mouse: 0.2,
  pied_crow: 0.47,
  malachite_kingfisher: 0.14,
  red_billed_oxpecker: 0.2,
  african_jacana: 0.25,
};

/**
 * The angry weavers' sprite (fx/weaver_up, fx/weaver_down: 96 × 64, side view in flight) is drawn
 * feel.juice.weavers.sizePx wide on the near plane; the bird, tail tip to bill, fills 76 of its 96
 * px (the raised wing stays inside that).
 */
export const WEAVER_SPRITE_W = 96;
export const WEAVER_BODY_W = 76;
/** A sociable weaver, bill to tail (m). */
export const WEAVER_REAL_M = 0.14;

/** A standing meerkat (stand_c, feet to crown) in the meerkat sheet at scale 1 (design px). */
export const MEERKAT_STAND_PX = 122.5;
/** A meerkat standing up as a sentinel (m). */
export const MEERKAT_REAL_M = 0.3;

/** v1.17b (D-080): a standing mid-plane ostrich (head top above its feet) in the Namibië sheet,
 *  drawn at the mid plane's scale (tools/art/ostrich.ts OSTRICH_H; OSTRICH_ART_SCALE 0.42). */
export const OSTRICH_STAND_MID_PX = 197;
/** The mid plane's scale the ostrich sheet is drawn at (src/game/view/namib/ostrichSheet.ts). */
export const OSTRICH_ART_SCALE = 0.42;

/** v1.17b (D-080): Brakkie's shoulder (the top of his standing body) above his feet, near-plane px
 *  at sizeMul 1 (tools/art/brakkie.ts STAND_BODY: y −78, ry 32). */
export const BRAKKIE_SHOULDER_PX = 110;
/** A Jack Russell at the shoulder (m). */
export const BRAKKIE_REAL_M = 0.3;

/** v1.17b (D-080): real sizes (m) of the true-size targets and non-targets. */
export const REAL_M = {
  /** A sitting adult male chacma, feet to crown. */
  baboonMale: 0.8,
  /** A sitting adult female, feet to crown. */
  baboonFemale: 0.65,
  /** A warthog at the back (an adult sow or boar). */
  warthog: 0.7,
  /** A warthog piglet a few months old, at the back. */
  piglet: 0.3,
  /** A sociable weaver's wingspan. */
  weaverWingspan: 0.22,
  /** An African pygmy falcon's wingspan (34–40 cm). */
  falconWingspan: 0.37,
  /** A rosy-faced lovebird's wingspan (est.: wings ~10 cm each and the body). */
  lovebirdWingspan: 0.24,
} as const;

/**
 * v1.17b (D-080): the colony sheet's flying frames' drawn widths (opaque px of weaver_fly_a,
 * falcon_fly_a and lovebird_fly_a in art-source/sprites/desert/colony.png): the falcon and the
 * lovebird against the weaver the wingspanPx is set for.
 */
export const COLONY_FLY_W = { weaver: 113, falcon: 141, lovebird: 109 } as const;

/**
 * v1.17b (D-080): each cameo's height as drawn in v1.13 (at sizeMul 1; design px on its plane),
 * measured from the art (tools/art/cameosHoofed.ts HOG.k, SB.S, GB.S; the ostrich's standing
 * height; the tortoise's shell top from its rendered walking frame), the measure, the real size
 * and the plane.
 */
export const CAMEO_V113: Readonly<
  Record<
    Exclude<keyof typeof CAMEO_SIZE_MUL, 'dungBeetle'>,
    { px: number; realM: number; measure: string; plane: 'mid' | 'near' }
  >
> = {
  warthogs: { px: 57, realM: 0.7, measure: 'the sow at the back', plane: 'mid' },
  springbok: { px: 60, realM: 0.8, measure: 'shoulder', plane: 'mid' },
  gemsbok: { px: 78, realM: 1.2, measure: 'shoulder', plane: 'mid' },
  ostrich: { px: 200, realM: 2.5, measure: 'head top (standing)', plane: 'mid' },
  tortoise: { px: 50, realM: 0.25, measure: 'shell top', plane: 'near' },
};

export interface SizeRow {
  readonly id: string;
  readonly realM: number;
  readonly measure: string;
  readonly plane: PlaneId;
  /** Drawn on its plane (design px). */
  readonly drawnPx: number;
  /** What real proportions give beside the guineafowl there (design px). */
  readonly targetPx: number;
}

/** drawn / target − 1 (0 = true size next to the guineafowl). */
export const offBy = (r: SizeRow): number => r.drawnPx / r.targetPx - 1;

/** The plane each tell lives on (its secret prop's layer), from the biome files. */
function tellPlanes(content: ContentBundle): Map<string, PlaneId> {
  const out = new Map<string, PlaneId>();
  for (const b of content.biomes) {
    for (const p of b.props) {
      const sp = p.secret?.tell?.species;
      const plane = b.layers.find((l) => l.id === p.layer)?.plane;
      if (sp !== undefined && plane !== undefined) out.set(sp, plane);
    }
  }
  return out;
}

/** Every species fixed to real size in D-078, as drawn now. */
export function sizeTable(content: ContentBundle, feel: Feel): SizeRow[] {
  const row = (
    id: string,
    realM: number,
    measure: string,
    plane: PlaneId,
    drawnPx: number,
  ): SizeRow => ({
    id,
    realM,
    measure,
    plane,
    drawnPx,
    targetPx: targetPx(realM, birdStandingPx(content, plane)),
  });
  const rows: SizeRow[] = [];
  // The weavers' burst is sized on the near plane (and scaled by the nest's plane like the birds).
  rows.push(
    row(
      'sociable_weaver',
      WEAVER_REAL_M,
      'bill to tail',
      'near',
      (feel.juice.weavers.sizePx * WEAVER_BODY_W * content.scoring.planes.near.scale) /
        WEAVER_SPRITE_W,
    ),
  );
  // The tells are drawn in their prop's layer px (1:1, no plane scale) × their species' scale.
  const planes = tellPlanes(content);
  for (const sp of content.birds.tells.species) {
    const plane = planes.get(sp.id);
    const drawn = TELL_DRAWN_PX[sp.id];
    const real = TELL_REAL_M[sp.id];
    if (plane === undefined || drawn === undefined || real === undefined) continue;
    const measure =
      sp.id === 'african_jacana' ? 'standing height' : 'length (bill or snout to tail)';
    rows.push(row(sp.id, real, measure, plane, drawn * (sp.scale ?? 1)));
  }
  // The meerkats: the colony's plane × sizeMul (the colonies are on the mid and near planes; the
  // ratio to the guineafowl is the same on both).
  const mk = content.birds.meerkats;
  for (const plane of ['mid', 'near'] as const)
    rows.push(
      row(
        `meerkat_${plane}`,
        MEERKAT_REAL_M,
        'standing (sentinel), feet to crown',
        plane,
        MEERKAT_STAND_PX * content.scoring.planes[plane].scale * mk.sizeMul,
      ),
    );
  rows.push(...trueSizeRows(content, feel, row));
  return rows;
}

type RowFn = (
  id: string,
  realM: number,
  measure: string,
  plane: PlaneId,
  drawnPx: number,
) => SizeRow;

/** v1.17b (D-080): the far herds, the mid ostriches, the baboons, the Harvest warthogs, Brakkie,
 *  the cameos and the weaver colony's birds. */
function trueSizeRows(content: ContentBundle, feel: Feel, row: RowFn): SizeRow[] {
  const rows: SizeRow[] = [];
  const scale = (p: PlaneId): number => content.scoring.planes[p].scale;
  // The far herds: drawn (the art is drawn at lookHeight, tools/art/faunaSheets.ts) against the
  // species' real height, on the far plane (the Ver plane's waterhole the same, smaller).
  const species = new Set<FaunaSpecies>();
  for (const herds of Object.values(FAUNA_HERDS))
    for (const h of herds) for (const a of h.animals) species.add(a.species);
  for (const sp of [...species].sort()) {
    const ppm = birdStandingPx(content, 'far') / GUINEAFOWL_M;
    const real = ANIMAL_M[sp];
    rows.push(
      row(
        `far_${sp}`,
        real,
        sp === 'giraffe' || sp === 'ostrich' ? 'head top' : 'shoulder',
        'far',
        lookHeight(sp, 'm', ppm, feel.fauna.sizeMul[sp]),
      ),
    );
  }
  // The mid ostriches (Namibië's pair): the sheet's standing bird at the mid plane's scale.
  const os = content.birds.ostriches;
  rows.push(
    row(
      'mid_ostrich',
      ANIMAL_M.ostrich,
      'head top (standing)',
      'mid',
      (OSTRICH_STAND_MID_PX / OSTRICH_ART_SCALE) * scale('mid') * os.sizeMul,
    ),
  );
  // The baboons: a sitting male drawn to heightPx (the raiders on the mid plane, the troop on the
  // far ridge), a mother × motherScale.
  const bb = content.birds.baboons;
  rows.push(
    row('baboon_raider', REAL_M.baboonMale, 'sitting male', 'mid', bb.heightPx * scale('mid')),
  );
  rows.push(
    row('baboon_ridge', REAL_M.baboonMale, 'sitting male', 'far', bb.heightPx * scale('far')),
  );
  rows.push(
    row(
      'baboon_mother',
      REAL_M.baboonFemale,
      'sitting female',
      'far',
      bb.heightPx * bb.motherScale * scale('far'),
    ),
  );
  // The Harvest's warthogs (mid and near) and piglets.
  const wh = content.modes.modes.harvest.warthogs;
  for (const p of ['mid', 'near'] as const) {
    rows.push(
      row(`harvest_warthog_${p}`, REAL_M.warthog, 'at the back', p, wh.heightPx * scale(p)),
    );
    rows.push(
      row(
        `harvest_piglet_${p}`,
        REAL_M.piglet,
        'at the back',
        p,
        wh.heightPx * wh.pigletScale * scale(p),
      ),
    );
  }
  // Brakkie on the near plane and, fetching, the mid plane.
  for (const p of ['near', 'mid'] as const)
    rows.push(
      row(
        `brakkie_${p}`,
        BRAKKIE_REAL_M,
        'shoulder',
        p,
        // His art is in near-plane px at scale 1; on a plane × that plane's scale (system.ts k).
        BRAKKIE_SHOULDER_PX * content.brakkie.sizeMul * (scale(p) / scale('near')),
      ),
    );
  // The cameos: their v1.13 size × sizeMul (drawn px on their plane already).
  for (const [kind, c] of Object.entries(CAMEO_V113))
    rows.push(
      row(
        `cameo_${kind}`,
        c.realM,
        c.measure,
        c.plane,
        c.px * content.cameos.kinds[kind as keyof typeof CAMEO_V113].sizeMul,
      ),
    );
  // The weaver colony's birds: their drawn wingspan on each plane.
  const ws = feel.treeLife.colony.wingspanPx;
  const fw = COLONY_FLY_W;
  for (const p of ['near', 'mid', 'far', 'ver'] as const) {
    rows.push(row(`colony_weaver_${p}`, REAL_M.weaverWingspan, 'wingspan', p, ws[p]));
    rows.push(
      row(
        `colony_falcon_${p}`,
        REAL_M.falconWingspan,
        'wingspan',
        p,
        ws[p] * feel.treeLife.colony.falconMul * (fw.falcon / fw.weaver),
      ),
    );
    rows.push(
      row(
        `colony_lovebird_${p}`,
        REAL_M.lovebirdWingspan,
        'wingspan',
        p,
        ws[p] * (fw.lovebird / fw.weaver),
      ),
    );
  }
  return rows;
}

/**
 * Animals NOT brought to true size (D-080: the owner asked for every animal; these stay, each with
 * its reason for the owner).
 */
export const NOT_FIXED: Readonly<Record<string, string>> = {
  cameo_dung_beetle: 'drawn about twice its true size on purpose, so a player can see it at all',
  bakkie:
    "a stage-set prop: at its true 1.8 m beside the mid guineafowl (208 → 398 px tall, ~1 050 px long) it would stand as tall as the 9 m windpomp (drawn 395 px) and 3× the reservoir (133 px) — the scene's props are all on a stage-set scale (docs/balance/perspective.md); the owner decides",
  guineafowl: `the yardstick (${GUINEAFOWL_M} m): its size and hit boxes never change`,
  harvest_mielies:
    "Die Oes's crop (not an animal; listed beside the Harvest's true-size workers and fence): true mielies (2.2–2.5 m) would be 490–550 px on the mid plane and the front rows would hide the flocks feeding in the field; they stay stage-scale (120–215 px); the owner decides",
  okavango_hippo:
    'an animal drawn as a stage-set prop (the Okavango secret "hippo": 96 px for ~1 m of head above the water, 0.43× true on the mid plane), sized with the reeds and the mokoro pole around it; its hit part is the secret\'s; the owner decides',
  okavango_lily_frog:
    "a prop (the lily-pad frog secret): drawn bigger than life so a player can find it, its hit part the secret's",
  bushveld_dassie:
    'drawn inside its prop (the dassie koppie secret) at 2× its old art, within its unchanged hit part; the koppie is a stage-set prop',
};
