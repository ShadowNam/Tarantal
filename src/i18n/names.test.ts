// v1.5 (D-041): names in each language (docs/i18n-names.md). English and German strings carry no
// Afrikaans name unless the allow-list says why; the table in the doc matches the language files;
// the "Afrikaans names" toggle brings back each renamed key's pre-v1.5 text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import af from './af.json';
import de from './de.json';
import en from './en.json';
import afNames from './flavour/afNames.json';
import nl from './nl.json';
import { isI18nKey, setAfrikaansNames, setLanguage, t, translator, type Language } from './i18n';

const TABLES: Record<Language, Record<string, string>> = { en, af, de, nl };

/** Afrikaans name words the game uses (whole words, case-sensitive). */
const AF_TERMS = [
  'Dubbelloop',
  'Plaas-Pomp',
  'Kettie',
  'Windbuks',
  'Langloop',
  'Twee-Twee',
  'Verder',
  'Verste',
  'Skiet-Skuur',
  'Notaboek',
  'Padstal',
  'Doppies',
  'doppies',
  'Bakkie',
  'bakkie',
  'Stadsjapie',
  'Plaaswerker',
  'Bosveld',
  'Bosveldjagter',
  'Generaal',
  'Ou Grys',
  'Kuifkop',
  'Stormvoël',
  'Voorlaaier',
  'Mielie',
  'Mielie-Masjien',
  'Boeretroos',
  'Biltong',
  'Windpomp',
  'windpomp',
  'Potjie',
  'potjie',
  'Kremetart',
  'kremetart',
  'Dassie',
  'dassie',
  'Koppie',
  'koppie',
  'Herfs',
  'Lente',
  'Somer',
  'Hele Swerm',
  'hele swerm',
  'HELE SWERM',
  'Twee Vlieë',
  'Oom',
  'Konsertina',
  'Snelhand',
  'Grondwerk',
  'Vlerkskoot',
  'Fluitjie',
  'Spaarblik',
  'Rooi Patrone',
  'Laaste Patroon',
  'Stil Loop',
  'Plaashond',
  'Hadeda-Fluit',
  'Windleser',
  'Haelstorm',
  'Stampede-Kenner',
  'Kettingreaksie',
  'Kaart',
  'Seën',
  'Resep',
  'Ekstra',
  'Bril',
  'Kwêvoël',
  'se',
  'Les',
  'Namibië',
];

/**
 * Where an Afrikaans word may stay in English or German, and why. A key prefix allows every term;
 * `key: [terms]` allows only those.
 */
const ALLOW_PREFIXES: readonly [string, string][] = [
  ['bark.', "Oupa's spoken lines keep his Afrikaans exclamations (art bible §10)"],
  ['fx.', 'onomatopoeia (KWÊ-KWÊ!)'],
  ['admin.', 'the playtest admin page names the Skietbaan tools as the team does'],
];
const ALLOW_KEYS: Readonly<Record<string, { terms: readonly string[]; why: string }>> = {
  'de:charm.windleser': { terms: ['Windleser'], why: '"Windleser" is good German' },
};

const word = (term: string): RegExp =>
  new RegExp(`(?<![\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');

describe('v1.5 names (D-041)', () => {
  afterEach(() => {
    setAfrikaansNames(false);
    setLanguage('en');
  });

  it('no English or German string carries an Afrikaans name unless the allow-list says why', () => {
    const found: string[] = [];
    for (const lang of ['en', 'de'] as const) {
      for (const [key, text] of Object.entries(TABLES[lang])) {
        if (ALLOW_PREFIXES.some(([p]) => key.startsWith(p))) continue;
        const allowed = ALLOW_KEYS[`${lang}:${key}`]?.terms ?? [];
        for (const term of AF_TERMS)
          if (!allowed.includes(term) && word(term).test(text))
            found.push(`${lang} ${key}: "${term}" in "${text}"`);
      }
    }
    expect(found).toEqual([]);
  });

  it('the allow-list has a reason for every entry and each entry is still needed', () => {
    for (const [, why] of ALLOW_PREFIXES) expect(why.length).toBeGreaterThan(10);
    for (const [id, { terms, why }] of Object.entries(ALLOW_KEYS)) {
      expect(why.length, id).toBeGreaterThan(10);
      const [lang = '', key = ''] = id.split(':');
      const text = TABLES[lang as Language][key] ?? '';
      for (const term of terms) expect(word(term).test(text), `${id} ${term}`).toBe(true);
    }
  });

  it('docs/i18n-names.md matches the language files row by row', () => {
    const doc = readFileSync(
      join(import.meta.dirname, '..', '..', 'docs', 'i18n-names.md'),
      'utf8',
    );
    const rows = doc
      .split('\n')
      .filter((l) => l.startsWith('| `'))
      .map((l) =>
        l
          .slice(1, -1)
          .split(/(?<!\\)\|/)
          .map((c) => c.trim().replace(/\\\|/g, '|')),
      );
    expect(rows.length).toBeGreaterThan(100);
    for (const [k = '', a, e, d, n] of rows) {
      const key = k.replace(/`/g, '');
      expect(isI18nKey(key), key).toBe(true);
      expect(
        [af, en, de, nl].map((tb) => (tb as Record<string, string>)[key]),
        key,
      ).toEqual([a, e, d, n]);
    }
  });

  it('every renamed key keeps its Afrikaans flavour text, and Afrikaans keeps its names', () => {
    for (const [lang, table] of Object.entries(afNames)) {
      expect(['en', 'de', 'nl']).toContain(lang);
      for (const [key, old] of Object.entries(table)) {
        expect(isI18nKey(key), key).toBe(true);
        expect(TABLES[lang as Language][key], key).not.toBe(old);
      }
    }
    expect(af['weapon.dubbelloop']).toBe('Dubbelloop');
    expect(af['title.shed']).toBe('Skiet-Skuur');
    expect(af['map.verder']).toBe('Verder');
  });

  it('the toggle shows the Afrikaans names in English, German and Dutch (share text too)', () => {
    setLanguage('de');
    expect(t('weapon.pomp')).toBe('Hof-Pumpe');
    expect(t('title.shed')).toBe('Waffenschuppen');
    setAfrikaansNames(true);
    expect(t('weapon.pomp')).toBe('Plaas-Pomp');
    expect(t('title.shed')).toBe('Skiet-Skuur');
    // A key that kept its text is unaffected.
    expect(t('settings.title')).toBe('Optionen');
    setLanguage('en');
    expect(t('weapon.dubbelloop')).toBe('Dubbelloop');
    expect(t('title.verder_locked')).toBe('Beat {quota} to unlock Verder');
    expect(translator('en').text('share.rank.stadsjapie')).toBe('Stadsjapie');
    setLanguage('af');
    expect(t('weapon.dubbelloop')).toBe('Dubbelloop');
    setAfrikaansNames(false);
    setLanguage('en');
    expect(t('weapon.dubbelloop')).toBe('Double Barrel');
    expect(t('map.verder')).toBe('Further');
  });
});
