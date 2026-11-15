// v1.22.1 (D-086): the size editor's knobs (src/game/sizes/sizeKnobs.ts) against the true-size
// table (tools/sizes.ts): every animal of the table is a knob (but the bird Brakkie carries, which
// keeps its own size, and the Harvest's fence, a prop), every knob's values and hit boxes are in
// the content, the metres it shows as match its row, and the editor finds its sprites.
import { describe, expect, it } from 'vitest';
import { getAt, parseSizePath } from '../src/content/sizePaths';
import { SIZE_CODE_VALUES } from '../src/game/sizes/sizeCode';
import {
  knobById,
  knobsIn,
  knobsOfSprite,
  knobValue,
  SIZE_AREA_BIOME,
  SIZE_AREAS,
  SIZE_KNOBS,
  valueAt,
} from '../src/game/sizes/sizeKnobs';
import { shownM } from '../src/game/sizes/sizeWork';
import { FAUNA_HERDS } from '../src/game/view/faunaHerds';
import { KNOB_ROWS } from './sizeKnobRows';
import { sizeTable } from './sizes';
import { loadContent, loadFeel } from './testContent';

const content = loadContent();
const feel = loadFeel();
const c = { bundle: content, feel };
const rows = new Map(sizeTable(content, feel).map((r) => [r.id, r]));
const NOT_KNOBS = ['measured_brakkie_bird', 'measured_harvest_fence_post'];

describe('size knobs (D-086)', () => {
  it('ids are unique and each has its table rows', () => {
    const ids = SIZE_KNOBS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(KNOB_ROWS).sort()).toEqual([...ids].sort());
    for (const [id, list] of Object.entries(KNOB_ROWS))
      for (const r of list) expect(rows.has(r), `${id}: ${r}`).toBe(true);
  });

  it('every animal of the true-size table is some knob', () => {
    const covered = new Set(Object.values(KNOB_ROWS).flat());
    for (const id of rows.keys())
      if (!NOT_KNOBS.includes(id)) expect(covered.has(id), id).toBe(true);
  });

  it("every value, hit box set and code constant is there, the code's as built", () => {
    for (const k of SIZE_KNOBS) {
      for (const t of k.targets) {
        expect(valueAt(t, c), `${k.id}: ${t}`).not.toBeNull();
        if (parseSizePath(t)?.kind === 'code') expect(SIZE_CODE_VALUES[t], t).toBe(valueAt(t, c));
      }
      for (const h of k.hitboxes ?? []) {
        const p = parseSizePath(h);
        expect(p?.kind, h).toBe('content');
        if (p?.kind !== 'content') continue;
        const root = p.file === 'content/birds.json' ? content.birds : content.modes;
        expect(typeof getAt(root, p.keys), h).toBe('object');
      }
      for (const id of k.with ?? []) expect(knobById(id), `${k.id} with ${id}`).toBeDefined();
    }
  });

  it('the metres each shows as is its row of the table (±1 %)', () => {
    for (const k of SIZE_KNOBS) {
      const rowId = KNOB_ROWS[k.id]?.[0];
      const m = shownM(k, c, {});
      if (rowId === undefined) {
        expect(k.mPerUnit, k.id).toBeNull();
        continue;
      }
      const r = rows.get(rowId);
      if (r === undefined || m === null) throw new Error(`${k.id}: no row or no metres`);
      const real = (r.drawnPx / r.targetPx) * r.realM;
      expect(
        Math.abs(m / real - 1),
        `${k.id}: ${String(m)} m, the table ${String(real)}`,
      ).toBeLessThan(0.01);
      expect(k.realM, k.id).toBeCloseTo(r.realM, 5);
      expect(knobValue(k, c), k.id).not.toBeNull();
    }
  });

  it("each area lists its far herds' species and its cameos", () => {
    for (const area of SIZE_AREAS) {
      const biome = SIZE_AREA_BIOME[area];
      const ids = new Set(knobsIn(area).map((k) => k.id));
      for (const h of FAUNA_HERDS[biome] ?? [])
        for (const a of h.animals)
          expect(ids.has(`far_${a.species}`), `${area}: ${a.species}`).toBe(true);
      const cameos = content.cameos.areas.find((x) => x.biome === biome)?.cameos ?? [];
      for (const kind of cameos)
        if (kind !== 'elephants') expect(ids.has(`cameo_${kind}`), `${area}: ${kind}`).toBe(true);
      for (const sp of content.biomes.find((b) => b.id === biome)?.props ?? []) {
        const tell = sp.secret?.tell?.species;
        if (tell !== undefined) expect(ids.has(`tell_${tell}`), `${area}: ${tell}`).toBe(true);
      }
      expect(ids.has('baboon'), area).toBe(true);
    }
    expect(knobsIn('oes').map((k) => k.id)).toEqual(
      expect.arrayContaining(['harvest_warthog', 'harvest_piglet', 'harvest_worker']),
    );
  });

  it('finds an animal from its sprite (texture and frame), with the knobs it is drawn ×', () => {
    const ids = (tex: string, frame: string): string[] =>
      knobsOfSprite(tex, frame).map((k) => k.id);
    expect(ids('cameos/karoo', 'ost_run_b')).toEqual(['cameo_ostrich']);
    expect(ids('cameos/karoo', 'tort_walk_a')).toEqual(['cameo_tortoise']);
    expect(ids('namibie/ostriches', 'f_stand')).toEqual(['ostrich_hen', 'mid_ostrich']);
    expect(ids('namibie/ostriches', 'm_run_0')).toEqual(['mid_ostrich']);
    expect(ids('baboons/sheet', 'r_mother_peek')).toEqual(['baboon_mother', 'baboon']);
    expect(ids('baboons/sheet', 'walk_a')).toEqual(['baboon']);
    expect(ids('baboons/sheet', 'fx_fruit')).toEqual([]);
    expect(ids('brakkie/sheet', 'trot_a')).toEqual(['brakkie']);
    expect(ids('brakkie/sheet', 'bird')).toEqual([]);
    expect(ids('oes/harvest', 'pg_run')).toEqual(['harvest_piglet', 'harvest_warthog']);
    expect(ids('oes/harvest', 'wk1_duck')).toEqual(['harvest_worker']);
    expect(ids('oes/harvest', 'gap_2')).toEqual([]);
    expect(ids('desert/colony', 'falcon_fly_a')).toEqual(['colony_falcon', 'colony_weaver']);
    expect(ids('fauna/namibie_waterhole', 'giraffe.alert.m.head')).toEqual(['far_giraffe']);
    expect(ids('tells/sheet', 'rock_agama_rest')).toEqual(['tell_rock_agama']);
    expect(ids('bushveld/baobab_life', 'owl_fly_a')).toEqual(['baobab_owl']);
    expect(ids('bushveld/baobab_life', 'owl_front')).toEqual([]);
    // D-083: a bird drawn at a sizeMul, final atlas or placeholder; the guineafowl is no knob.
    expect(ids('final:bird/visarend/far@2x', 'glide/00')).toEqual(['bird_visarend']);
    expect(ids('bird/kwevoel/mid/alert_0', '__BASE')).toEqual(['bird_kwevoel']);
    expect(ids('final:bird/tortelduif/far@1x', 'flap/01')).toEqual(['bird_tortelduif']);
    expect(ids('final:bird/tarentaal/mid@1x', 'glide/00')).toEqual([]);
    expect(ids('karoo/windpomp', 'x')).toEqual([]);
  });
});
