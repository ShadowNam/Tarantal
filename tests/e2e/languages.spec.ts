// v1.5 (D-041): text language, voice language and the Afrikaans-names toggle. Each test stores
// the settings in the e2e save before the page loads (fields it leaves out take their defaults,
// as an old save's would), then checks what the player sees and hears:
//   - Deutsch text: the Skiet-Skuur shows the German gun names;
//   - English text with the Afrikaans voice: the af voice pack is fetched (never en or de) once
//     the first gesture unlocks audio, and Oupa's caption is the English line;
//   - English text with "Afrikaans names" on: the Skiet-Skuur shows the Afrikaans gun names.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { loadFeel } from '../../tools/testContent';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapRect,
} from './helpers';

// The service worker would answer fetches itself, out of sight of page.on('request').
test.use({ serviceWorkers: 'block' });

const greeting = loadFeel().barks.triggers.firstToday.lines[0] ?? 'bark.morning';

/** Puts these settings into the e2e save before the game reads it. */
async function withSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('tm.e2e.seeded') === '1') return;
    sessionStorage.setItem('tm.e2e.seeded', '1');
    localStorage.setItem('tm.e2e.save.v1', JSON.stringify({ v: 1, settings: s }));
  }, settings);
}

/** Landscape profiles only (portrait shows the rotate card); not during preview runs. */
function gate(info: TestInfo): void {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.skip(process.env['ART_PREVIEW'] === '1', 'previews run on their own');
}

async function openShed(page: Page, touch: boolean): Promise<string[]> {
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'shed');
  await page.waitForFunction(() => (window.__TM__?.shedNames?.length ?? 0) > 0, null, {
    timeout: 60_000,
  });
  return (await hook(page)).shedNames ?? [];
}

test.describe('languages (v1.5)', () => {
  test('Deutsch text: the Skiet-Skuur shows German gun names', async ({ page }, info) => {
    gate(info);
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await withSettings(page, { language: 'de' });
    await boot(page, 'seed=42');
    const names = await openShed(page, isTouchProject(info));
    expect(names).toContain(de['weapon.dubbelloop']);
    expect(names).toContain('Doppelflinte');
    expect(names).toContain('Hof-Pumpe');
    expect(names).not.toContain('Dubbelloop');
    expect(errors).toEqual([]);
  });

  test('Afrikaans voice with English text: the af voice pack loads, the caption is English', async ({
    page,
  }, info) => {
    gate(info);
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    const voice: string[] = [];
    page.on('request', (r) => {
      const m = /assets\/voice-(\w+)\//.exec(r.url());
      if (m?.[1] !== undefined) voice.push(`${m[1]} ${r.url()}`);
    });
    await withSettings(page, { language: 'en', voiceLanguage: 'af' });
    await boot(page, 'seed=42&huntSeconds=30');
    // Nothing is fetched before the first gesture (audio can't play yet).
    expect(voice).toEqual([]);
    let h = await hook(page);
    expect(h.voice.language).toBe('af');
    await startHunt(page, isTouchProject(info));
    // The greeting bark: its English caption shows.
    await page.waitForFunction(() => window.__TM__?.bark != null, null, { timeout: 60_000 });
    h = await hook(page);
    expect(h.bark?.line).toBe(greeting);
    expect(h.bark?.text).toBe((en as Record<string, string>)[greeting]);
    // The af file for that bark was requested (the pack loads after the gesture), and no other
    // language's pack.
    const file = `af-${greeting.replace('.', '_')}.`;
    await expect.poll(() => voice.some((v) => v.includes(file)), { timeout: 60_000 }).toBe(true);
    expect(voice.every((v) => v.startsWith('af '))).toBe(true);
    await page.waitForFunction(() => window.__TM__?.voice.pack === 'ready', null, {
      timeout: 60_000,
    });
    expect(errors).toEqual([]);
  });

  test('voice volume 0: no voice pack is fetched at all', async ({ page }, info) => {
    gate(info);
    test.setTimeout(180_000);
    const voice: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/assets/voice-')) voice.push(r.url());
    });
    await withSettings(page, { language: 'en', voiceVolume: 0 });
    await boot(page, 'seed=42&huntSeconds=4');
    await startHunt(page, isTouchProject(info));
    await page.waitForFunction(() => window.__TM__?.bark != null, null, { timeout: 60_000 });
    expect(voice).toEqual([]);
    expect((await hook(page)).voice.played).toEqual([]);
  });

  test('"Afrikaans names" on with English text: the Skiet-Skuur shows the Afrikaans gun names', async ({
    page,
  }, info) => {
    gate(info);
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await withSettings(page, { language: 'en', afrikaansNames: true });
    await boot(page, 'seed=42');
    const names = await openShed(page, isTouchProject(info));
    expect(names).toContain('Dubbelloop');
    expect(names).toContain('Plaas-Pomp');
    expect(names).not.toContain(en['weapon.dubbelloop']);
    expect(errors).toEqual([]);
  });
});
