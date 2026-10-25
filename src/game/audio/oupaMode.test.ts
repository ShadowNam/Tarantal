import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../tools/testContent';
import { repairSave } from '../../meta/save';
import { defaultSave, DEFAULT_SETTINGS } from '../../meta/saveSchema';
import { computePrefs } from '../prefs';
import { oupaShows, oupaSpeaks } from './oupaMode';

const inputs = {
  feel: loadFeel(),
  device: { coarsePointer: false, cores: 8, memoryGb: 8 },
  reducedMotion: false,
};

describe("Settings → Oupa's comments (D-046)", () => {
  it('three states: On (bubble and voice), Text only (bubble), Off (nothing)', () => {
    expect([oupaShows('on'), oupaSpeaks('on')]).toEqual([true, true]);
    expect([oupaShows('text'), oupaSpeaks('text')]).toEqual([true, false]);
    expect([oupaShows('off'), oupaSpeaks('off')]).toEqual([false, false]);
  });

  it('defaults to On, reaches the live prefs, and a bad saved value is repaired to On', () => {
    expect(DEFAULT_SETTINGS.oupa).toBe('on');
    for (const oupa of ['on', 'text', 'off'] as const)
      expect(computePrefs({ ...DEFAULT_SETTINGS, oupa }, inputs).oupa).toBe(oupa);
    const raw = { ...defaultSave(), settings: { ...DEFAULT_SETTINGS, oupa: 'loud' } };
    const { data, repaired } = repairSave(
      JSON.parse(JSON.stringify(raw)) as Record<string, unknown>,
    );
    expect(data.settings.oupa).toBe('on');
    expect(repaired).toContain('settings.oupa');
  });

  it('an older save without the setting keeps its other settings and gets On', () => {
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS, captions: true };
    delete settings['oupa'];
    const { data } = repairSave({ ...defaultSave(), settings });
    expect(data.settings.oupa).toBe('on');
    expect(data.settings.captions).toBe(true);
  });
});
