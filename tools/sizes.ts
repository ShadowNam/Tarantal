// v1.16 (D-078): the animals' sizes next to the helmeted guineafowl, the fixed yardstick (its size
// and hit boxes never change). v1.17b (D-080, the owner: "yes make all animals true size"): every
// animal, not only the small ones. Each animal is compared with the guineafowl standing on its own
// plane: real metres × (that bird's standing px / GUINEAFOWL_M) is the size real proportions give.
// Pure: the drawn sizes come from content values and frame-box constants measured once from the
// delivered (interim) art, so the tests need no PNG decoding. tools/sizes.test.ts holds the fixed
// species to ±15 % and lists the ones left for the owner, each with its reason. v1.20.2 (D-082,
// an audit of D-080): MEASURED_ART adds rows read from the art sources' opaque bounds (not
// computed from the metres the art was drawn to), and tools/sizesArt.test.ts re-measures the PNGs
// against them, so the table fails when the art drifts. v1.20.3 (D-083): the fly-overs and the
// kwêvoël (birds.json sizeMul), measured in their bird frames: the turtle dove, the spurfowl, the
// go-away-bird and the fish eagle (its body and, separately, its wings).
import type { ContentBundle, Feel } from '../src/content/schemas';
import type { ArtPlaneId } from '../src/game/assets/artPlane';
import { sizeMulOf } from '../src/sim/birds/size';
import type { CameoSheetArea } from '../src/game/cameos/cameoKeys';
import { CAMEO_SIZE_MUL } from '../src/game/cameos/cameoSheet';
import { WORKER_H } from '../src/game/view/harvest/harvestSheet';
import { RESIDENT_TRUE_MUL } from '../src/game/view/tree/residentTrueSize';
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
 *  drawn at the mid plane's scale (OSTRICH_ART_SCALE 0.42). D-082: measured from the art (the
 *  cock's m_stand frame, the crown's bristles included), 209.7 layout px — D-080 took
 *  tools/art/ostrich.ts OSTRICH_H, 197, the drawing's nominal head height. */
export const OSTRICH_STAND_MID_PX = 209.7;
/** The mid plane's scale the ostrich sheet is drawn at (src/game/view/namib/ostrichSheet.ts). */
export const OSTRICH_ART_SCALE = 0.42;

/** v1.20.2 (D-082): an ostrich hen standing, head top (m): a hen 1.7–2.0 m, a cock 2.1–2.8 m. */
export const OSTRICH_HEN_M = 1.9;

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

/**
 * v1.20.2 (D-082): where a measured size is read in the delivered art (art-source/), and how.
 * `top`: the highest opaque pixel above the feet (alpha ≥ 64), over the whole frame or, with a
 * band, over the columns dx ∈ band (px from the feet origin, facing right: the back at the
 * shoulder, where a head or horns rise above it elsewhere); `width`, `height`: the opaque width
 * and height.
 */
export type ArtSource =
  | {
      /** A far herd's sheet (sprites/fauna/<sheet>.png and its frame table): the look's `body`
       *  part (its back: the shoulder) or all its parts (`top`: the head top). */
      readonly kind: 'fauna';
      readonly sheet: string;
      readonly look: string;
      readonly part: 'body' | 'all';
      /** The drawn animal's display scale in its herd (HerdAnimal.s; 1 when not given). */
      readonly s?: number;
    }
  | {
      /** v1.20.3 (D-083): a bird frame (art-source/birds/<creature>/planes/<plane>/<frame>.png,
       *  the 620 × 400 bird box, sim position at (310, 230), facing right), in the creature's art
       *  units (the guineafowl's: its rig.json boxShrink undone). `top`: the highest opaque pixel
       *  above the sim position (a raised wing's tip above the body's centre line). */
      readonly kind: 'flyer';
      readonly creature: string;
      readonly artPlane: ArtPlaneId;
      readonly frame: string;
      readonly extent: 'top' | 'width' | 'height';
    }
  | {
      readonly kind: 'ostrich' | 'brakkie' | 'harvest' | 'resident' | `cameo:${CameoSheetArea}`;
      readonly frame: string;
      readonly extent: 'top' | 'width' | 'height';
      readonly band?: readonly [number, number];
    };

/** A size measured in the art: px in the art's own frame units (layout px at scale 1). */
export interface MeasuredArt {
  readonly id: string;
  readonly realM: number;
  readonly measure: string;
  readonly plane: PlaneId;
  readonly artPx: number;
  readonly source: ArtSource;
}

const fauna = (
  id: string,
  plane: 'far' | 'ver',
  sheet: string,
  look: string,
  part: 'body' | 'all',
  realM: number,
  artPx: number,
  measure: string,
  s = 1,
): MeasuredArt => ({
  id,
  realM,
  measure,
  plane,
  artPx,
  source: { kind: 'fauna', sheet, look, part, ...(s === 1 ? {} : { s }) },
});

/** v1.20.3 (D-083): half the fish eagle's wingspan (tools/art/flyers.ts EAGLE_WINGSPAN_M 2.1). */
export const EAGLE_HALF_SPAN_M = 1.05;

function flyer(
  id: string,
  plane: 'mid' | 'far',
  creature: string,
  frame: string,
  extent: 'top' | 'width' | 'height',
  realM: number,
  artPx: number,
  measure: string,
): MeasuredArt {
  return {
    id,
    realM,
    measure,
    plane,
    artPx,
    source: { kind: 'flyer', creature, artPlane: plane, frame, extent },
  };
}

/**
 * v1.20.2 (D-082): sizes measured from the delivered art (opaque bounds, alpha ≥ 64), each against
 * the animal's real size beside the guineafowl on its plane (sizeTable: drawn = artPx × the view's
 * scale for that art). tools/sizesArt.test.ts re-reads every one from the PNGs (±3 %).
 */
export const MEASURED_ART: readonly MeasuredArt[] = [
  // The far herds (drawn 1:1 on the far veld) and the Ver plane's waterhole.
  fauna(
    'far_elephant',
    'far',
    'okavango_elephants',
    'elephant.alert.m',
    'body',
    3.2,
    254,
    'shoulder (bull, alert)',
    0.95,
  ),
  fauna(
    'far_giraffe',
    'far',
    'bushveld_giraffes_a',
    'giraffe.alert.m',
    'all',
    5.0,
    430,
    'head top (bull, alert)',
  ),
  fauna(
    'far_zebra',
    'far',
    'namibie_zebra',
    'zebra.alert.f',
    'body',
    1.35,
    109,
    'shoulder (alert)',
    0.96,
  ),
  fauna(
    'far_wildebeest',
    'far',
    'okavango_wildebeest',
    'wildebeest.alert.m',
    'body',
    1.4,
    113,
    'shoulder (bull, alert)',
  ),
  fauna(
    'far_gemsbok',
    'far',
    'namibie_gemsbok',
    'gemsbok.alert.m',
    'body',
    1.2,
    97,
    'shoulder (alert)',
    0.96,
  ),
  fauna(
    'far_springbok',
    'far',
    'kalahari_springbok',
    'springbok.alert.m',
    'body',
    0.8,
    65,
    'shoulder (ram, alert)',
    0.95,
  ),
  fauna(
    'far_lechwe',
    'far',
    'okavango_lechwe',
    'lechwe.alert.m',
    'body',
    1.0,
    85,
    'shoulder (ram, alert)',
    0.96,
  ),
  fauna(
    'far_ostrich_cock',
    'far',
    'namibie_ostrich',
    'ostrich.alert.m',
    'all',
    2.5,
    200,
    'head top (cock, alert)',
  ),
  fauna(
    'far_ostrich_hen',
    'far',
    'karoo_ostrich',
    'ostrich.walk.f',
    'all',
    1.9,
    140,
    'head top (hen, walking; drawn at her herd scale 0.96)',
    0.96,
  ),
  fauna(
    'ver_giraffe',
    'ver',
    'namibie_waterhole',
    'giraffe.alert.m',
    'all',
    5.0,
    201,
    'head top (bull, alert)',
  ),
  fauna('ver_zebra', 'ver', 'namibie_waterhole', 'zebra.graze.m', 'body', 1.35, 51, 'shoulder'),
  fauna(
    'ver_gemsbok',
    'ver',
    'namibie_waterhole',
    'gemsbok.alert.m',
    'body',
    1.2,
    45,
    'shoulder (alert)',
  ),
  fauna(
    'ver_springbok',
    'ver',
    'namibie_waterhole',
    'springbok.alert.m',
    'body',
    0.8,
    31,
    'shoulder (alert)',
  ),
  fauna(
    'ver_ostrich_cock',
    'ver',
    'namibie_waterhole',
    'ostrich.walk.m',
    'all',
    2.5,
    86,
    'head top (cock, walking)',
  ),
  fauna(
    'ver_ostrich_hen',
    'ver',
    'namibie_waterhole',
    'ostrich.alert.f',
    'all',
    1.9,
    71,
    'head top (hen, alert)',
  ),
  // The cameos (frames in drawn px on their plane, at their sizeMul).
  {
    id: 'cameo_warthog',
    realM: 0.7,
    measure: 'back (the sow trotting)',
    plane: 'mid',
    artPx: 161,
    source: { kind: 'cameo:bushveld', frame: 'hog_trot_a', extent: 'top', band: [-60, 60] },
  },
  {
    id: 'cameo_springbok',
    realM: 0.8,
    measure: 'shoulder (walking)',
    plane: 'mid',
    artPx: 188,
    source: { kind: 'cameo:kalahari', frame: 'sb_walk_a', extent: 'top', band: [-40, 20] },
  },
  {
    id: 'cameo_gemsbok',
    realM: 1.2,
    measure: 'back (walking)',
    plane: 'mid',
    artPx: 272,
    source: { kind: 'cameo:namibie', frame: 'gb_walk_a', extent: 'top', band: [-150, -30] },
  },
  {
    id: 'cameo_ostrich',
    realM: 2.5,
    measure: 'head top (sprinting, its highest stride)',
    plane: 'mid',
    artPx: 556.6,
    source: { kind: 'cameo:karoo', frame: 'ost_run_b', extent: 'top' },
  },
  {
    id: 'cameo_tortoise',
    realM: 0.25,
    measure: 'shell top (walking)',
    plane: 'near',
    artPx: 130,
    source: { kind: 'cameo:karoo', frame: 'tort_walk_a', extent: 'top', band: [-50, 50] },
  },
  // Namibië's mid-plane pair (layout px × sizeMul; the hen's frames are drawn smaller, D-082).
  {
    id: 'mid_ostrich_cock',
    realM: 2.5,
    measure: 'head top (cock, standing)',
    plane: 'mid',
    artPx: 209.7,
    source: { kind: 'ostrich', frame: 'm_stand', extent: 'top' },
  },
  {
    id: 'mid_ostrich_hen',
    realM: 1.9,
    measure: 'head top (hen, standing)',
    plane: 'mid',
    artPx: 153.9,
    source: { kind: 'ostrich', frame: 'f_stand', extent: 'top' },
  },
  // Brakkie (near-plane px × sizeMul) and the bird he carries (its own true size, D-082).
  {
    id: 'brakkie_withers',
    realM: BRAKKIE_REAL_M,
    measure: 'back at the withers (trotting)',
    plane: 'near',
    artPx: 114,
    source: { kind: 'brakkie', frame: 'trot_a', extent: 'top', band: [-20, 30] },
  },
  {
    id: 'brakkie_bird',
    realM: 0.55,
    measure: 'tail tip to bill, across as it hangs (its drooping neck shortens it a little)',
    plane: 'near',
    artPx: 271,
    source: { kind: 'brakkie', frame: 'bird', extent: 'width' },
  },
  // The Harvest's farm workers (WORKER_H layout px × heightPx × the mid scale ÷ WORKER_H) and its
  // fence post (the gap panel's posts, 1:1 on the mid layer).
  {
    id: 'harvest_worker_0',
    realM: 1.7,
    measure: 'hat top (a person, working)',
    plane: 'mid',
    artPx: 171,
    source: { kind: 'harvest', frame: 'wk0_work_b', extent: 'top', band: [0, 20] },
  },
  {
    id: 'harvest_worker_1',
    realM: 1.7,
    measure: 'hat top (a person, working)',
    plane: 'mid',
    artPx: 169.5,
    source: { kind: 'harvest', frame: 'wk1_work_a', extent: 'top' },
  },
  {
    id: 'harvest_worker_2',
    realM: 1.7,
    measure: 'hat top (a person, working)',
    plane: 'mid',
    artPx: 177,
    source: { kind: 'harvest', frame: 'wk2_work_b', extent: 'top', band: [0, 20] },
  },
  {
    id: 'harvest_fence_post',
    realM: 1.2,
    measure: 'post top (a prop)',
    plane: 'mid',
    artPx: 265,
    source: { kind: 'harvest', frame: 'gap_4', extent: 'top', band: [-70, -50] },
  },
  // The baobab's residents brought to true size (prop px, 1:1 on the mid layer; D-082).
  {
    id: 'baobab_owl_flying',
    realM: 0.87,
    measure: 'wingspan (a barn owl: 0.8–0.95 m)',
    plane: 'mid',
    artPx: 193,
    source: { kind: 'resident', frame: 'owl_fly_a', extent: 'width' },
  },
  {
    id: 'baobab_hornbill_flying',
    realM: 0.54,
    measure: 'bill to tail (0.48–0.6 m)',
    plane: 'mid',
    artPx: 130,
    source: { kind: 'resident', frame: 'hornbill_fly_a', extent: 'width' },
  },
  {
    id: 'baobab_hornbill_clinging',
    realM: 0.54,
    measure: 'crown to tail tip, upright on the bark',
    plane: 'mid',
    artPx: 112.5,
    source: { kind: 'resident', frame: 'hornbill_cling', extent: 'height' },
  },
  // v1.20.3 (D-083): the fly-overs and the kwêvoël, in their bird frames × plane scale × sizeMul.
  ...(['mid', 'far'] as const).flatMap((plane): MeasuredArt[] => [
    flyer(
      `flyover_tortelduif_${plane}`,
      plane,
      'tortelduif',
      'glide/00',
      'width',
      0.265,
      plane === 'mid' ? 313 : 320,
      'bill to tail tip, gliding (a Cape turtle dove: 25–28 cm)',
    ),
    flyer(
      `flyover_fisant_${plane}`,
      plane,
      'fisant',
      'glide/00',
      'width',
      0.355,
      plane === 'mid' ? 312 : 317,
      "bill to tail tip, gliding (Swainson's spurfowl: a hen 33 cm, a cock 38 cm)",
    ),
  ]),
  flyer(
    'kwevoel_perched',
    'mid',
    'kwevoel',
    'alert/03',
    'height',
    0.525,
    339,
    'crest tip to tail tip, perched and calling with its crest raised: a grey go-away-bird is 0.47–0.51 m bill to tail tip, less its bill and face ahead of the crown (~0.03 m), plus its raised 6–7 cm crest',
  ),
  flyer(
    'visarend_body',
    'far',
    'visarend',
    'glide/00',
    'width',
    0.69,
    417,
    'bill to tail tip, soaring (an African fish eagle: 63–75 cm)',
  ),
  flyer(
    'visarend_wing',
    'far',
    'visarend',
    'flap/00',
    'top',
    EAGLE_HALF_SPAN_M,
    640,
    'half its wingspan: the raised wing’s tip above its body’s centre line (a span of 2.0–2.4 m, 1.75–2.1 m in other guides; 2.1 m)',
  ),
];

/** The view's drawn design px per art px of a measured source (see MEASURED_ART). */
export function drawnPerArtPx(content: ContentBundle, s: ArtSource): number {
  switch (s.kind) {
    case 'flyer': {
      // D-083: the plane's scale × the creature's sizeMul (src/game/view/BirdView.ts).
      const c = content.birds.creatures.find((x) => x.id === s.creature);
      if (c === undefined) throw new Error(`no creature ${s.creature}`);
      return content.scoring.planes[s.artPlane].scale * sizeMulOf(c);
    }
    case 'ostrich':
      // The sheet is at the mid plane's scale; the view × the family's scale ÷ it × sizeMul.
      return (
        (content.scoring.planes.mid.scale / OSTRICH_ART_SCALE) * content.birds.ostriches.sizeMul
      );
    case 'brakkie':
      // His own frames grow with brakkie.sizeMul; the bird he carries keeps its own size.
      return s.frame === 'bird' ? 1 : content.brakkie.sizeMul;
    case 'harvest': {
      if (s.frame.startsWith('gap_')) return 1;
      const w = content.modes.modes.harvest.workers;
      return (w.heightPx * content.scoring.planes.mid.scale) / WORKER_H;
    }
    case 'fauna':
      return s.s ?? 1;
    default:
      return 1;
  }
}

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
  // v1.20.2 (D-082): the sizes measured in the art.
  for (const m of MEASURED_ART)
    rows.push(
      row(
        `measured_${m.id}`,
        m.realM,
        m.measure,
        m.plane,
        m.artPx * drawnPerArtPx(content, m.source),
      ),
    );
  // The bushbaby at its hole: its head (the drawing's head ellipse, 12.4 px across at k 1, × its
  // scale) beside a lesser bushbaby's ~0.06 m.
  rows.push(
    row(
      'baobab_bushbaby_head',
      0.06,
      'head width (ears apart), at its hole',
      'mid',
      GALAGO_HEAD_PX * 1.6 * RESIDENT_TRUE_MUL.galago,
    ),
  );
  return rows;
}

/** The bushbaby's head ellipse across at scale 1 (tools/art/baobabLife.ts galagoHead: rx 6.2). */
export const GALAGO_HEAD_PX = 12.4;

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
  // D-082: the hen at henScale of the cock (a hen 1.7–2.0 m).
  rows.push(
    row(
      'mid_ostrich_hen',
      OSTRICH_HEN_M,
      'head top (hen, standing)',
      'mid',
      (OSTRICH_STAND_MID_PX / OSTRICH_ART_SCALE) * scale('mid') * os.sizeMul * os.henScale,
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
  // v1.20.2 (D-082): the audit of D-080.
  baobab_owl_perched:
    "the barn owl in its cavity shows its head and shoulders through the stage-set baobab's 38 × 50 px hole (0.17 × 0.23 m on the mid plane; the 15 m tree is drawn ~0.17× true): its head is drawn ~25 px across (0.11 m, about a real one's), but a whole true owl (0.3–0.39 m: 66–86 px) would not fit the hole — measured whole it is 48.5 px, 0.64×; flying off it is at its true size (wingspan 193 px, 0.87 m)",
  baobab_buffalo_weaver:
    'the red-billed buffalo weaver lands at its stick nest, a stage-set prop 46 × 30 px (0.21 × 0.14 m; a real nest is a 1–2 m mass of sticks): a true weaver (0.24 m, 53 px) would be longer than its whole nest; it stays 18–22.5 px (0.35–0.42×)',
  baobab_squirrel:
    'the tree squirrel runs along a stage-set limb: 63 px nose to tail tip running (its tail arched), 0.29 m beside a real one of ~0.35 m (0.8×, just outside ±15 %), its head sized to its 14 × 17 px hole; the audit called it close enough; the owner decides',
  generaal:
    'a boss bird (Generaal Tarentaal, the Autumn boss with his pot helmet): a "legendary" guineafowl, fantasy, with no real size to hold him to',
  ou_grys:
    'a boss bird (Ou Grys, the Winter boss, a grizzled veteran with an eye patch): a "legendary" guineafowl, fantasy, no real size',
  kuifkop_koning:
    'a boss bird (the Kuifkop Koning, the Spring boss, a crested king): a "legendary" crested guineafowl, fantasy, no real size',
  stormvoel:
    'a boss bird (Die Stormvoël, the Summer finale, a giant shadow seen only in lightning): a "legendary" bird, fantasy, no real size',
};
