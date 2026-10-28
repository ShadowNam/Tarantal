import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../src/i18n/i18n';
import {
  androidPageHtml,
  APK_FILE,
  pageTexts,
  sizeMb,
  type AndroidPageTables,
} from './androidPage';

const tables: AndroidPageTables = Object.fromEntries(
  LANGUAGES.map((l) => [
    l,
    JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'src', 'i18n', 'android', `${l}.json`), 'utf8'),
    ) as Record<string, string>,
  ]),
);

describe('Android download page (D-058)', () => {
  it('links the APK and shows the version and size', () => {
    const html = androidPageHtml({ version: '1.9.5', apkBytes: 42 * 1024 * 1024, tables });
    expect(html).toContain(`href="${APK_FILE}"`);
    expect(html).toContain('Version 1.9.5 · 42.0 MB');
    expect(html).toContain('Test build for friends');
    for (const l of LANGUAGES) expect(html).toContain(`?lang=${l}`);
  });

  it('carries every language, filled in', () => {
    const html = androidPageHtml({ version: '1.9.5', apkBytes: 1024 * 1024, tables });
    expect(html).toContain('Weergawe 1.9.5 · 1.0 MB');
    expect(html).toContain('Versie 1.9.5');
    expect(html).not.toMatch(/\{version\}|\{size\}/);
    expect(pageTexts(tables['de'] ?? {}, '2.0.0', null)['android.version']).toBe(
      'Version 2.0.0 · ? MB',
    );
  });

  it('says so, with no download link, when CI built no APK', () => {
    const html = androidPageHtml({ version: '1.9.5', apkBytes: null, tables });
    expect(html).not.toContain(`href="${APK_FILE}"`);
    expect(html).toContain('No app has been built for this version yet');
  });

  it('rounds the size to one decimal MB', () => {
    expect(sizeMb(31_500_000)).toBe('30.0');
  });
});
