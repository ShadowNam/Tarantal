// 1.9.3 (D-056, review M7): the privacy paragraphs load lazily, English is the fallback, and a
// failed load is tried again (the promise is not kept).
import { describe, expect, it, vi } from 'vitest';

describe('privacy paragraphs (lazy)', () => {
  it('a failed import is retried on the next call', async () => {
    vi.resetModules();
    let fail = true;
    vi.doMock('./privacyTables', () => {
      if (fail) throw new Error('offline');
      return {
        PRIVACY_TABLES: { en: { 'privacy.personal': 'P' }, af: {}, de: {}, nl: {} },
        PRIVACY_FLAVOUR: {},
      };
    });
    const m = await import('./privacyI18n');
    await expect(m.loadPrivacy()).rejects.toThrow();
    expect(m.privacyLoaded()).toBe(false);
    fail = false;
    vi.resetModules();
    await m.loadPrivacy();
    expect(m.privacyLoaded()).toBe(true);
    expect(m.privacyString('af', 'privacy.personal')).toBe('P');
    vi.doUnmock('./privacyTables');
  });

  it('the Afrikaans-names setting re-words the lazy paragraph (review M18)', async () => {
    vi.resetModules();
    const i18n = await import('../../i18n/i18n');
    const m = await import('./privacyI18n');
    await m.loadPrivacy();
    const plain = m.privacyString('en', 'privacy.stored');
    expect(plain).toContain('Notebook');
    i18n.setAfrikaansNames(true);
    try {
      expect(m.privacyString('en', 'privacy.stored')).toContain('Notaboek');
      expect(m.privacyString('de', 'privacy.stored')).toContain('Notaboek');
      // Afrikaans keeps its own text.
      expect(m.privacyString('af', 'privacy.stored')).toBe(
        (await import('../../i18n/privacy/af.json')).default['privacy.stored'],
      );
    } finally {
      i18n.setAfrikaansNames(false);
    }
    expect(m.privacyString('en', 'privacy.stored')).toBe(plain);
  });
});
