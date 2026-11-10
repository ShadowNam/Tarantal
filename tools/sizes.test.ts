// v1.16 (D-078): the animals brought to real size stay within ±15 % of it next to the guineafowl
// on their plane; the ones left for the owner are listed, each with its reason. v1.17b (D-080):
// every animal ("yes make all animals true size"): only the guineafowl, the dung beetle and the
// bakkie are left. v1.20.2 (D-082, an audit of D-080): rows measured from the delivered art
// (MEASURED_ART, re-read from the PNGs by sizesArt.test.ts), the ostrich hen, the baobab's
// residents; the boss birds (fantasy) and the residents a stage-set baobab cannot hold at true
// size are listed with their reasons.
import { describe, expect, it } from 'vitest';
import { TELL_BOXES } from '../src/game/view/tell/tellSheet';
import { FAUNA_HERDS } from '../src/game/view/faunaHerds';
import {
  GUINEAFOWL_STANDING_PX,
  MEASURED_ART,
  NOT_FIXED,
  offBy,
  OWNER_SET,
  sizeTable,
  TELL_DRAWN_PX,
  TELL_REAL_M,
} from './sizes';
import { loadContent, loadFeel } from './testContent';
import { KNOB_ROWS } from './sizeKnobRows';

const TOLERANCE = 0.15;

describe('real animal sizes next to the guineafowl (D-078, D-080)', () => {
  const content = loadContent();
  const rows = sizeTable(content, loadFeel());

  it('covers the weavers, every tell and the meerkats', () => {
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('sociable_weaver');
    expect(ids).toContain('meerkat_mid');
    for (const sp of content.birds.tells.species) expect(ids).toContain(sp.id);
  });

  it('D-080: covers every other animal too', () => {
    const ids = new Set(rows.map((r) => r.id));
    for (const id of [
      'far_elephant',
      'far_giraffe',
      'far_zebra',
      'far_wildebeest',
      'far_gemsbok',
      'far_springbok',
      'far_lechwe',
      'far_ostrich',
      'mid_ostrich',
      'baboon_raider',
      'baboon_ridge',
      'baboon_mother',
      'harvest_warthog_mid',
      'harvest_warthog_near',
      'harvest_piglet_mid',
      'brakkie_near',
      'brakkie_mid',
      'cameo_warthogs',
      'cameo_springbok',
      'cameo_gemsbok',
      'cameo_ostrich',
      'cameo_tortoise',
      'colony_weaver_near',
      'colony_weaver_mid',
      'colony_weaver_far',
      'colony_weaver_ver',
      'colony_falcon_near',
      'colony_lovebird_near',
    ])
      expect(ids.has(id), id).toBe(true);
  });

  it('D-080, D-082: only the yardstick, the dung beetle, the stage-set props, the mielies, the residents the stage-set baobab cannot hold and the fantasy bosses are left, each with its reason', () => {
    expect(Object.keys(NOT_FIXED).sort()).toEqual([
      'bakkie',
      'baobab_buffalo_weaver',
      'baobab_owl_perched',
      'baobab_squirrel',
      'bushveld_dassie',
      'cameo_dung_beetle',
      'generaal',
      'guineafowl',
      'harvest_mielies',
      'kuifkop_koning',
      'okavango_hippo',
      'okavango_lily_frog',
      'ou_grys',
      'stormvoel',
    ]);
  });

  it('D-082: the boss birds are in NOT_FIXED as fantasy; the ordinary fly-overs are not', () => {
    const bosses = content.birds.creatures.filter((c) => c.kind === 'boss').map((c) => c.id);
    expect(bosses.sort()).toEqual(['generaal', 'kuifkop_koning', 'ou_grys', 'stormvoel']);
    for (const id of bosses) expect(NOT_FIXED[id], id).toMatch(/fantasy/);
  });

  it("D-082: a far herd row is drawn at that animal's own herd scale", () => {
    for (const m of MEASURED_ART) {
      if (m.source.kind !== 'fauna') continue;
      const { sheet, look } = m.source;
      const s = m.source.s ?? 1;
      const drawn = Object.values(FAUNA_HERDS)
        .flat()
        .filter((h) => (h.sheet ?? h.key) === `fauna/${sheet}`)
        .flatMap((h) => h.animals)
        .filter((a) => `${a.species}.${a.pose}.${a.variant}` === look)
        .map((a) => a.s);
      expect(drawn.length, m.id).toBeGreaterThan(0);
      expect(drawn, m.id).toContain(s);
    }
  });

  it('D-082: covers the measured art, the ostrich hen and the baobab residents', () => {
    const ids = new Set(rows.map((r) => r.id));
    for (const m of MEASURED_ART) expect(ids.has(`measured_${m.id}`), m.id).toBe(true);
    for (const id of [
      'mid_ostrich_hen',
      'measured_mid_ostrich_hen',
      'measured_brakkie_bird',
      'measured_baobab_owl_flying',
      'measured_baobab_hornbill_flying',
      'baobab_bushbaby_head',
    ])
      expect(ids.has(id), id).toBe(true);
    // The hen is the cock's henScale, between a real hen's 1.7 and 2.0 m on the mid plane.
    const hen = rows.find((r) => r.id === 'measured_mid_ostrich_hen');
    const per = (content.scoring.planes.mid.scale * GUINEAFOWL_STANDING_PX) / 0.5;
    if (hen === undefined) throw new Error('no hen row');
    expect(hen.drawnPx / per).toBeGreaterThanOrEqual(1.7);
    expect(hen.drawnPx / per).toBeLessThanOrEqual(2.0);
  });

  // v1.22.1 (D-086): a row the owner set by eye (npm run sizes:apply) is held to his record
  // instead; every other row stays within ±15 %.
  for (const r of rows)
    if (OWNER_SET[r.id] === undefined)
      it(`${r.id} (${r.realM} m, ${r.measure}, ${r.plane}) is within ±15 %`, () => {
        expect(
          Math.abs(offBy(r)),
          `${r.drawnPx.toFixed(1)} px drawn, ${r.targetPx.toFixed(1)} px real`,
        ).toBeLessThanOrEqual(TOLERANCE);
      });
    else
      it(`${r.id} (${r.realM} m) is the owner's size, set by eye and recorded`, () => {
        const o = OWNER_SET[r.id];
        expect(o?.why).toMatch(/the owner set this by eye/);
        expect(o?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

  it('D-086: every owner-set size names a row of this table and a size knob', () => {
    const ids = new Set(rows.map((r) => r.id));
    for (const [id, o] of Object.entries(OWNER_SET)) {
      expect(ids.has(id), id).toBe(true);
      expect(KNOB_ROWS[o.knob] ?? [], id).toContain(id);
    }
  });

  it('the measured tell lengths fit their frame boxes', () => {
    for (const [sp, px] of Object.entries(TELL_DRAWN_PX)) {
      const box = TELL_BOXES[sp as keyof typeof TELL_BOXES];
      expect(box, sp).toBeDefined();
      expect(px).toBeLessThanOrEqual(Math.max(box.w, box.h));
      expect(TELL_REAL_M[sp], sp).toBeGreaterThan(0);
    }
  });

  it('lists the animals left for the owner, each with its reason, none also fixed', () => {
    const fixed = new Set(rows.map((r) => r.id));
    expect(Object.keys(NOT_FIXED).length).toBeGreaterThan(0);
    for (const [id, why] of Object.entries(NOT_FIXED)) {
      expect(why.trim().length, id).toBeGreaterThan(10);
      expect(fixed.has(id), id).toBe(false);
    }
  });
});
