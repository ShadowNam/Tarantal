// v1.22.1 (D-086): every non-target animal whose size the owner can set by eye (admin page → Sizes,
// and the size editor in the game), from tools/sizes.ts' true-size table: the far and Ver herds,
// the cameos, Namibië's ostriches, the baboons, the meerkats, Brakkie, the Harvest's warthogs,
// piglets and workers, the weaver colony, the angry weavers, the tells and the baobab's residents;
// v1.23.1 (D-083): and the birds drawn at a sizeMul (the Harvest's turtle dove and spurfowl, the
// kwêvoël, the fish eagle).
// A knob is one size: the content value(s) it changes (or a code constant), the hit box sets drawn
// in px that grow with it, the real size it stands for, and how the editor finds its sprites (the
// texture key and frame name). Lazy (the Sizes tab and the editor); the boot reader needs none of
// it (each saved edit names its own path, src/meta/sizeEdits.ts).
import type { ContentBundle, Feel } from '../../content/schemas';
import { getAt, parseSizePath } from '../../content/sizePaths';
import type { PlaneId } from '../../sim/types';
import { RESIDENT_TRUE_MUL } from '../view/tree/residentTrueSize';
import type { SizeArea } from './sizeAreas';

/** The areas in the lists' order, each the biome it plays (Die Oes: the Harvest's field). */
export const SIZE_AREAS: readonly SizeArea[] = [
  'karoo',
  'bushveld',
  'kalahari',
  'okavango',
  'namibie',
  'oes',
];

export const SIZE_AREA_BIOME: Readonly<Record<SizeArea, string>> = {
  karoo: 'karoo-autumn',
  bushveld: 'bushveld-winter',
  kalahari: 'kalahari-summer',
  okavango: 'okavango-spring',
  namibie: 'namibie',
  oes: 'oes',
};

export interface SizeKnob {
  readonly id: string;
  /** Where the editor shows it (the admin page lists it under each). */
  readonly areas: readonly SizeArea[];
  /** The value(s) it sets (the first is the one shown); all × the same factor. */
  readonly targets: readonly string[];
  /** Hit box sets in px (same file) that grow with it. */
  readonly hitboxes?: readonly string[];
  /** Whole design px (heights, wingspans) or a multiplier (3 decimals). */
  readonly unit: 'px' | 'x';
  /** The real size it stands for (m) and what is measured (admin.sizes.m.<measure>). */
  readonly realM: number;
  readonly measure: string;
  /** The plane its yardstick guineafowl stands on when the plane can't be read off the sprite. */
  readonly plane: PlaneId;
  /** Metres it shows as, per unit of its value × the values of its `with` knobs (tools/sizes.ts,
   *  held by tools/sizeKnobs.test.ts); null: not measured (the dung beetle, drawn big on purpose). */
  readonly mPerUnit: number | null;
  /** Other knobs whose size it is drawn × (the hen is the cock's × henScale). */
  readonly with?: readonly string[];
  /** How the editor shows a change live: `pass` scales its sprites each frame (SizeEditor);
   *  `factor`: its view reads sizeFactor (several parts, or a code constant). */
  readonly live: 'pass' | 'factor';
  /** Its sprites: the texture key and the frame name. */
  readonly tex: RegExp;
  readonly frame: RegExp;
}

const FEEL = 'content/client/feel.json';
const BIRDS = 'content/birds.json';
const CODE_RESIDENTS = 'code:src/game/view/tree/residentTrueSize.ts#RESIDENT_TRUE_MUL';
const ALL: readonly SizeArea[] = ['karoo', 'bushveld', 'kalahari', 'okavango', 'namibie', 'oes'];
const WILD: readonly SizeArea[] = ['karoo', 'bushveld', 'kalahari', 'okavango', 'namibie'];

const far = (
  species: string,
  areas: readonly SizeArea[],
  realM: number,
  measure: string,
  mPerUnit: number,
): SizeKnob => ({
  id: `far_${species}`,
  areas,
  targets: [`${FEEL}#fauna.sizeMul.${species}`],
  unit: 'x',
  realM,
  measure,
  plane: 'far',
  mPerUnit,
  live: 'factor',
  tex: /^fauna\//,
  frame: new RegExp(`^${species}\\.`),
});

const cameo = (
  kind: string,
  areas: readonly SizeArea[],
  realM: number,
  measure: string,
  plane: PlaneId,
  mPerUnit: number | null,
  frame: RegExp,
): SizeKnob => ({
  id: `cameo_${kind}`,
  areas,
  targets: [`content/cameos.json#kinds.${kind}.sizeMul`],
  unit: 'x',
  realM,
  measure,
  plane,
  mPerUnit,
  live: 'pass',
  tex: /^cameos\//,
  frame,
});

const tell = (
  species: string,
  area: SizeArea,
  realM: number,
  plane: PlaneId,
  mPerUnit: number,
): SizeKnob => ({
  id: `tell_${species}`,
  areas: [area],
  targets: [`${BIRDS}#tells.species[id=${species}].scale`],
  unit: 'x',
  realM,
  measure: species === 'african_jacana' ? 'standing' : 'length',
  plane,
  mPerUnit,
  live: 'pass',
  tex: /^tells\/sheet$/,
  frame: new RegExp(`^${species}_(rest|act_a|act_b|flee)$`),
});

/** v1.23.1 (D-083): a bird drawn at its birds.json sizeMul (its drawing and, in the sim, its hit
 *  shapes; its final atlas `final:bird/<id>/<plane>@nx` or its placeholder `bird/<id>/<plane>/…`). */
const bird = (
  creature: string,
  areas: readonly SizeArea[],
  realM: number,
  plane: PlaneId,
  mPerUnit: number,
): SizeKnob => ({
  id: `bird_${creature}`,
  areas,
  targets: [`${BIRDS}#creatures[id=${creature}].sizeMul`],
  unit: 'x',
  realM,
  measure: 'length',
  plane,
  mPerUnit,
  live: 'pass',
  tex: new RegExp(`^(final:)?bird/${creature}/`),
  frame: /./,
});

const resident = (
  id: string,
  key: keyof typeof RESIDENT_TRUE_MUL,
  realM: number,
  measure: string,
  mPerUnit: number,
  frame: RegExp,
): SizeKnob => ({
  id,
  areas: ['bushveld'],
  targets: [`${CODE_RESIDENTS}.${key}`],
  unit: 'x',
  realM,
  measure,
  plane: 'mid',
  mPerUnit,
  live: 'factor',
  tex: /^bushveld\/baobab_life$/,
  frame,
});

/** Every knob, in the order the lists show them (big to small, far to near). */
export const SIZE_KNOBS: readonly SizeKnob[] = [
  far('elephant', ['bushveld', 'okavango'], 3.2, 'shoulder', 3.2),
  far('giraffe', ['bushveld', 'namibie'], 5, 'head', 5),
  far('ostrich', ['karoo', 'kalahari', 'namibie'], 2.5, 'head', 2.5),
  far('wildebeest', ['bushveld', 'okavango', 'kalahari'], 1.4, 'shoulder', 1.4),
  far('zebra', ['bushveld', 'okavango', 'namibie'], 1.35, 'shoulder', 1.35),
  far('gemsbok', ['namibie'], 1.2, 'shoulder', 1.2),
  far('lechwe', ['okavango'], 1.0, 'shoulder', 1.0),
  far('springbok', ['karoo', 'kalahari', 'namibie'], 0.8, 'shoulder', 0.8),
  cameo('ostrich', ['karoo'], 2.5, 'head', 'mid', 0.91285, /^(ost|dust)_/),
  cameo('gemsbok', ['namibie'], 1.2, 'back', 'mid', 0.36212, /^gb_/),
  cameo('springbok', ['kalahari'], 0.8, 'shoulder', 'mid', 0.28847, /^sb_/),
  cameo('warthogs', ['bushveld'], 0.7, 'back', 'mid', 0.26992, /^(hog|pig)_/),
  cameo('tortoise', ['karoo'], 0.25, 'shell', 'near', 0.095057, /^tort_/),
  cameo('dungBeetle', ['bushveld'], 0.03, 'length', 'near', null, /^beetle_/),
  {
    id: 'mid_ostrich',
    areas: ['namibie'],
    targets: [`${BIRDS}#ostriches.sizeMul`],
    unit: 'x',
    realM: 2.5,
    measure: 'head',
    plane: 'mid',
    mPerUnit: 0.94921,
    live: 'pass',
    tex: /^namibie\/ostriches$/,
    frame: /^(m_|scrape$|egg$)/,
  },
  {
    id: 'ostrich_hen',
    areas: ['namibie'],
    targets: [`${BIRDS}#ostriches.henScale`],
    unit: 'x',
    realM: 1.9,
    measure: 'head',
    plane: 'mid',
    mPerUnit: 0.95431,
    with: ['mid_ostrich'],
    live: 'pass',
    tex: /^namibie\/ostriches$/,
    frame: /^f_/,
  },
  {
    id: 'harvest_worker',
    areas: ['oes'],
    targets: ['content/modes.json#modes.harvest.workers.heightPx'],
    hitboxes: ['content/modes.json#modes.harvest.workers.hitboxes'],
    unit: 'px',
    realM: 1.7,
    measure: 'hat',
    plane: 'mid',
    mPerUnit: 0.0018061,
    live: 'pass',
    tex: /^oes\/harvest$/,
    frame: /^wk\d_/,
  },
  {
    id: 'baboon',
    areas: ALL,
    targets: [`${BIRDS}#baboons.heightPx`],
    hitboxes: [`${BIRDS}#baboons.hitboxes`],
    unit: 'px',
    realM: 0.8,
    measure: 'crown',
    plane: 'mid',
    mPerUnit: 0.0019011,
    live: 'pass',
    tex: /^baboons\/sheet$/,
    frame: /^(?!fx_|r_mother)/,
  },
  {
    id: 'baboon_mother',
    areas: ALL,
    targets: [`${BIRDS}#baboons.motherScale`],
    unit: 'x',
    realM: 0.65,
    measure: 'crown',
    plane: 'far',
    mPerUnit: 0.0019011,
    with: ['baboon'],
    live: 'pass',
    tex: /^baboons\/sheet$/,
    frame: /^r_mother/,
  },
  {
    id: 'harvest_warthog',
    areas: ['oes'],
    targets: ['content/modes.json#modes.harvest.warthogs.heightPx'],
    hitboxes: ['content/modes.json#modes.harvest.warthogs.hitboxes'],
    unit: 'px',
    realM: 0.7,
    measure: 'back',
    plane: 'mid',
    mPerUnit: 0.0019011,
    live: 'pass',
    tex: /^oes\/harvest$/,
    frame: /^wh_/,
  },
  {
    id: 'harvest_piglet',
    areas: ['oes'],
    targets: ['content/modes.json#modes.harvest.warthogs.pigletScale'],
    unit: 'x',
    realM: 0.3,
    measure: 'back',
    plane: 'mid',
    mPerUnit: 0.0019011,
    with: ['harvest_warthog'],
    live: 'pass',
    tex: /^oes\/harvest$/,
    frame: /^pg_/,
  },
  {
    id: 'brakkie',
    areas: WILD,
    targets: ['content/brakkie.json#sizeMul'],
    unit: 'x',
    realM: 0.3,
    measure: 'withers',
    plane: 'near',
    mPerUnit: 0.21673,
    live: 'pass',
    tex: /^brakkie\/sheet$/,
    frame: /^(?!bird$|marker$)/,
  },
  {
    id: 'meerkat',
    areas: ['kalahari', 'namibie'],
    targets: [`${BIRDS}#meerkats.sizeMul`],
    unit: 'x',
    realM: 0.3,
    measure: 'standing',
    plane: 'mid',
    mPerUnit: 0.23289,
    live: 'pass',
    tex: /^desert\/meerkats$/,
    frame: /^(peek|stand|sit|sunbathe|dig|run|dive|scold|tumble|front|emerge|bark|pup|flick)/,
  },
  {
    id: 'colony_falcon',
    areas: ['kalahari', 'namibie'],
    targets: [`${FEEL}#treeLife.colony.falconMul`],
    unit: 'x',
    realM: 0.37,
    measure: 'wingspan',
    plane: 'near',
    mPerUnit: 0.0023724,
    with: ['colony_weaver'],
    live: 'pass',
    tex: /^desert\/colony$/,
    frame: /^falcon_/,
  },
  {
    id: 'colony_weaver',
    areas: ['kalahari', 'namibie'],
    targets: ['near', 'mid', 'far', 'ver'].map((p) => `${FEEL}#treeLife.colony.wingspanPx.${p}`),
    unit: 'px',
    realM: 0.22,
    measure: 'wingspan',
    plane: 'near',
    mPerUnit: 0.0019011,
    live: 'pass',
    tex: /^desert\/colony$/,
    frame: /^(weaver|lovebird)_/,
  },
  {
    id: 'weavers',
    areas: ['kalahari', 'namibie'],
    targets: [`${FEEL}#juice.weavers.sizePx`],
    unit: 'px',
    realM: 0.14,
    measure: 'length',
    plane: 'near',
    mPerUnit: 0.0015051,
    live: 'pass',
    tex: /^fx\/weaver_(up|down)$/,
    frame: /./,
  },
  bird('visarend', ['okavango'], 0.69, 'far', 0.79278),
  bird('kwevoel', ['karoo', 'bushveld', 'kalahari', 'okavango'], 0.525, 'mid', 0.64449),
  bird('fisant', ['oes'], 0.355, 'mid', 0.59316),
  bird('tortelduif', ['oes'], 0.265, 'mid', 0.59506),
  resident('baobab_owl', 'owlFly', 0.87, 'wingspan', 0.31201, /^owl_fly/),
  resident('baobab_hornbill', 'hornbill', 0.54, 'length', 0.25585, /^hornbill_/),
  resident('baobab_galago', 'galago', 0.06, 'head', 0.089806, /^galago_/),
  tell('pied_crow', 'namibie', 0.47, 'mid', 0.27838),
  tell('rock_kestrel', 'karoo', 0.33, 'mid', 0.22633),
  tell('lilac_breasted_roller', 'kalahari', 0.29, 'mid', 0.21727),
  tell('african_jacana', 'okavango', 0.25, 'mid', 0.15494),
  tell('fork_tailed_drongo', 'bushveld', 0.25, 'mid', 0.21727),
  tell('flap_necked_chameleon', 'kalahari', 0.25, 'mid', 0.19238),
  tell('fiscal_shrike', 'karoo', 0.22, 'mid', 0.20369),
  tell('rock_agama', 'bushveld', 0.3, 'mid', 0.18106),
  tell('striped_skink', 'bushveld', 0.2, 'mid', 0.1539),
  tell('red_billed_oxpecker', 'okavango', 0.2, 'mid', 0.12448),
  tell('striped_mouse', 'karoo', 0.2, 'mid', 0.11882),
  tell('cape_wagtail', 'karoo', 0.19, 'mid', 0.13806),
  tell('malachite_kingfisher', 'okavango', 0.14, 'mid', 0.11769),
];

export const knobById = (id: string): SizeKnob | undefined => SIZE_KNOBS.find((k) => k.id === id);

/** The knobs an area shows. */
export const knobsIn = (area: SizeArea): SizeKnob[] =>
  SIZE_KNOBS.filter((k) => k.areas.includes(area));

/** A value at its path in the game's content (null: not there). */
export function valueAt(path: string, c: { bundle: ContentBundle; feel: Feel }): number | null {
  const p = parseSizePath(path);
  if (p === null) return null;
  if (p.kind === 'code') {
    if (p.constant !== 'RESIDENT_TRUE_MUL') return null;
    const v = (RESIDENT_TRUE_MUL as Readonly<Record<string, number>>)[p.key];
    return v ?? null;
  }
  const roots: Readonly<Record<string, unknown>> = {
    'content/cameos.json': c.bundle.cameos,
    'content/birds.json': c.bundle.birds,
    'content/brakkie.json': c.bundle.brakkie,
    'content/modes.json': c.bundle.modes,
    'content/client/feel.json': c.feel,
  };
  const v = getAt(roots[p.file], p.keys);
  return typeof v === 'number' ? v : null;
}

/** A knob's value as shipped (its first target). */
export const knobValue = (k: SizeKnob, c: { bundle: ContentBundle; feel: Feel }): number | null =>
  valueAt(k.targets[0] ?? '', c);

/** A value × a factor, rounded the knob's way (whole px, or 3 decimals). */
export function roundSize(k: Pick<SizeKnob, 'unit'>, v: number): number {
  return k.unit === 'px' ? Math.max(1, Math.round(v)) : Math.round(v * 1000) / 1000;
}

/** The knobs a sprite belongs to (texture key, frame name), the first being its own; [] if none. */
export function knobsOfSprite(texture: string, frame: string): SizeKnob[] {
  const own = SIZE_KNOBS.find((k) => k.tex.test(texture) && k.frame.test(frame));
  if (own === undefined) return [];
  return [own, ...(own.with ?? []).flatMap((id) => knobById(id) ?? [])];
}
