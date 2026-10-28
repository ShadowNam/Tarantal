import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { ContentBundle } from '../../content/schemas';
import enStrings from '../../i18n/en.json';
import { LANGUAGES, translator } from '../../i18n/i18n';
import {
  effectText,
  formatNumber,
  guideCards,
  guideIds,
  guideValues,
  shortText,
} from './powerupGuide';

const content = loadContent();
const en = translator('en');

/** The content with every number a sentence uses changed to an odd value. */
function oddNumbers(b: ContentBundle): ContentBundle {
  return {
    ...b,
    powerups: {
      ...b.powerups,
      powerups: b.powerups.powerups.map((p) => ({
        ...p,
        ...(p.padstalPrice !== undefined ? { padstalPrice: 17 } : {}),
        ...(p.durationMs !== undefined ? { durationMs: 13_000 } : {}),
        ...(p.durationShells !== undefined ? { durationShells: 11 } : {}),
        effect: {
          ...p.effect,
          ...(p.effect.spreadMul !== undefined ? { spreadMul: 3.5 } : {}),
          ...(p.effect.creatureTimeScale !== undefined ? { creatureTimeScale: 0.37 } : {}),
          ...(p.effect.reloadTimeMul !== undefined ? { reloadTimeMul: 0.37 } : {}),
          ...(p.effect.idleTopUpMs !== undefined ? { idleTopUpMs: 900 } : {}),
          ...(p.effect.fireCooldownMul !== undefined ? { fireCooldownMul: 0.37 } : {}),
        },
      })),
    },
    weapons: {
      ...b.weapons,
      weapons: b.weapons.weapons.map((w) =>
        w.kind !== 'crate'
          ? w
          : {
              ...w,
              pellets: w.pellets > 1 ? 31 : w.pellets,
              ...(w.shots !== undefined ? { shots: 7 } : {}),
              ...(w.durationMs !== undefined ? { durationMs: 13_000 } : {}),
              ...(w.reloadMs !== undefined ? { reloadMs: 4_500 } : {}),
            },
      ),
    },
    run: { ...b.run, padstal: { ...b.run.padstal, weaponRentalPrice: 19 } },
  };
}

describe('the power-up guide (D-046)', () => {
  it('has a card for each of the four power-ups, the two reload ones, the Rooikol and the two crate guns', () => {
    expect(guideIds(content).map((c) => c.id)).toEqual([
      'chilli_biltong',
      'boeretroos',
      'bush_buckshot',
      'meerkat_spotter',
      'blitslaai',
      'oupa_laai',
      'rooikol',
      'voorlaaier',
      'mielie_masjien',
    ]);
  });

  it('reads the numbers from content (the brief: "For 10 seconds everything moves at half speed.")', () => {
    expect(effectText(content, 'boeretroos', en, 'en')).toBe(
      'For 10 seconds everything moves at half speed.',
    );
    expect(effectText(content, 'bush_buckshot', en, 'en')).toContain('next 6 shells spread 2.5×');
    expect(effectText(content, 'blitslaai', en, 'en')).toContain('only 35 % of the time');
    expect(effectText(content, 'oupa_laai', en, 'en')).toContain('after 0.6 s');
    expect(effectText(content, 'voorlaaier', en, 'en')).toContain('3 huge blasts of 24 pellets');
    expect(shortText(content, 'mielie_masjien', en, 'en')).toBe('Hold to spray maize · 10 s');
  });

  it('every card sentence changes with its content numbers (none are typed into the strings)', () => {
    const odd = oddNumbers(content);
    for (const card of guideCards(odd, [], en, 'en')) {
      const all = [card.effect, card.short, ...card.how].join(' | ');
      const v = guideValues(odd, card.id, en, 'en');
      // Each number the content gives this card shows up in its texts.
      for (const [k, value] of Object.entries(v)) {
        if (k === 'speed' || k === 'stall' || k === 'run') continue;
        expect(all, `${card.id} {${k}}`).toContain(value);
      }
    }
    expect(effectText(odd, 'boeretroos', en, 'en')).toBe(
      'For 13 seconds everything moves at 37 % speed.',
    );
  });

  it('fills every placeholder in all four languages', () => {
    for (const lang of LANGUAGES) {
      const tr = translator(lang);
      for (const card of guideCards(content, [], tr, lang)) {
        for (const text of [card.name, card.effect, card.short, card.tip, ...card.how]) {
          expect(text, `${lang} ${card.id}`).not.toMatch(/[{}]/);
          expect(text.length, `${lang} ${card.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('says how to get each one: crates, the Padstal price, and secrets where content has them', () => {
    const cards = guideCards(content, ['oupa_laai'], en, 'en');
    const by = (id: string) => cards.find((c) => c.id === id);
    expect(by('boeretroos')?.how).toEqual([
      'Shoot a supply crate in a Classic or Daily hunt',
      'Buy it at the Farm Stall in a Season Run: 3 caps',
    ]);
    expect(by('voorlaaier')?.how[1]).toBe(
      'Rent it at the Farm Stall in a Season Run for one hunt: 5 caps',
    );
    expect(by('meerkat_spotter')?.how).toContain('Some farm secrets give it too');
    // 1.9.2 (D-055): rifle-only, from crates, never sold.
    expect(by('rooikol')?.how).toEqual([
      'Shoot a supply crate in a Classic or Daily hunt while you carry a rifle (The Twenty-Two or The Long Rifle)',
    ]);
    expect(by('rooikol')?.effect).toContain('75 % of normal');
    expect(by('rooikol')?.icon).toBe('ui/pu_rooikol');
    expect(by('oupa_laai')?.found).toBe(true);
    expect(by('blitslaai')?.found).toBe(false);
    expect(by('chilli_biltong')?.icon).toBe('ui/pu_chilli_biltong');
  });

  it('formats decimals per language', () => {
    expect(formatNumber(0.6, 'en')).toBe('0.6');
    expect(formatNumber(0.6, 'de')).toBe('0,6');
    expect(formatNumber(10, 'af')).toBe('10');
    expect(effectText(content, 'oupa_laai', translator('de'), 'de')).toContain('0,6 s');
  });
});

describe('power-up strings carry no numbers of their own (D-046)', () => {
  it('guide.*, pickup.*, caption.pu* and bark.pu.* have no digits outside {…} in any language', () => {
    const prefixes = ['guide.', 'pickup.', 'caption.pu', 'bark.pu.'];
    for (const lang of LANGUAGES) {
      const tr = translator(lang);
      const keys = Object.keys(enStrings).filter((k) => prefixes.some((p) => k.startsWith(p)));
      expect(keys.length).toBeGreaterThan(40);
      for (const key of keys) {
        const text = tr.or(key, '');
        expect(text.replace(/\{\w+\}/g, ''), `${lang} ${key}`).not.toMatch(/\d/);
      }
    }
  });
});
