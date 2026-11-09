// v1.16 (D-078): the animals' sizes next to the helmeted guineafowl, the fixed yardstick (its size
// and hit boxes never change). Each animal is compared with the guineafowl standing on its own
// plane: real metres × (that bird's standing px / GUINEAFOWL_M) is the size real proportions give.
// Pure: the drawn sizes come from content values and frame-box constants measured once from the
// delivered (interim) art, so the tests need no PNG decoding. tools/sizes.test.ts holds the fixed
// species to ±15 % and lists the ones left for the owner, each with its reason.
import type { ContentBundle, Feel } from '../src/content/schemas';
import type { PlaneId } from '../src/sim/types';
import { GUINEAFOWL_M, targetPx } from './perspective';

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
  return rows;
}

/**
 * Animals NOT brought to real size in D-078: each needs the owner's decision (a gameplay, art or
 * earlier-decision change), so it is listed here with the reason instead.
 */
export const NOT_FIXED: Readonly<Record<string, string>> = {
  far_herds:
    'D-054: the owner asked for the far animals at 0.57 × true size (elephant, giraffe, zebra, wildebeest, gemsbok, springbok, lechwe)',
  far_ostriches: 'D-054: the owner asked for the far ostriches smaller still (0.45 × true size)',
  baboons: 'D-062/D-078: the raiders are targets (their size is their hit area and their points)',
  brakkie:
    "D-069: the dog's line-of-fire geometry (where he may run and fetch) is built on his size",
  cameo_warthog: 'the cameo textures are drawn at their size: bigger needs redrawn, bigger art',
  cameo_springbok: 'the cameo textures are drawn at their size: bigger needs redrawn, bigger art',
  cameo_gemsbok: 'the cameo textures are drawn at their size: bigger needs redrawn, bigger art',
  cameo_tortoise: 'the cameo textures are drawn at their size: bigger needs redrawn, bigger art',
  cameo_dung_beetle: 'drawn bigger than life on purpose, so a player can see it at all',
  mid_ostriches: 'D-059: penalty animals: their size is their hit (penalty) area',
  harvest_warthogs: 'D-063: Harvest targets: their size is their hit area and their points',
  colony_weavers:
    "D-057: the weaver colony's ambient birds (feel.treeLife.colony.wingspanPx) are their own sheet and tuning, left as they were",
  bakkie:
    'a stage-set prop: its scale is set against the windpomp and the reservoir, not the birds',
  guineafowl: `the yardstick (${GUINEAFOWL_M} m): its size and hit boxes never change`,
};
