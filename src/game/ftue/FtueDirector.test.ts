import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../sim/events';
import { FtueDirector, type FtueStep } from './FtueDirector';
import en from '../../i18n/en.json';
import af from '../../i18n/af.json';
import de from '../../i18n/de.json';
import nl from '../../i18n/nl.json';
import feelJson from '../../../content/client/feel.json';

const full = { shells: 8, reloading: false };
const ev = (e: Record<string, unknown>): SimEvent => e as unknown as SimEvent;

function director(inputKind: 'touch' | 'pointer' = 'touch') {
  const steps: [FtueStep, number][] = [];
  const d = new FtueDirector({
    inputKind,
    durationTicks: 3600,
    secretHintAt: 0.67,
    bannerTicks: 120,
    onStep: (s, t) => steps.push([s, t]),
  });
  return { d, steps };
}

describe('FTUE director (GDD §16)', () => {
  it('starts with the one-line shoot hint and a hand at the flock', () => {
    expect(director('touch').d.prompt).toEqual({ key: 'ftue.shoot_touch', hand: 'flock' });
    expect(director('pointer').d.prompt).toEqual({ key: 'ftue.shoot_mouse', hand: 'flock' });
  });

  it('walks every step once, with telemetry, in the order the hunt produces them', () => {
    const { d, steps } = director();
    d.update([ev({ type: 'shotFired', tick: 30 })], 30, { shells: 7, reloading: false });
    expect(d.prompt).toBeNull();
    d.update([ev({ type: 'targetBagged', tick: 31 })], 31, { shells: 7, reloading: false });
    d.update([ev({ type: 'flockStateChanged', tick: 400, to: 'run' })], 400, full);
    expect(d.prompt?.key).toBe('ftue.run');
    d.update([], 600, { shells: 0, reloading: false });
    expect(d.prompt).toEqual({ key: 'ftue.reload_touch', hand: 'belt' });
    d.update([ev({ type: 'reloadStarted', tick: 610 })], 610, { shells: 0, reloading: true });
    expect(d.prompt).toBeNull();
    d.update([ev({ type: 'flockStateChanged', tick: 1800, to: 'flush' })], 1800, full);
    expect(d.prompt?.key).toBe('ftue.flush');
    d.update([], 2412, full);
    expect(d.prompt?.key).toBe('ftue.secret');
    d.update([], 2600, full);
    expect(d.prompt).toBeNull();
    d.complete(3600);
    expect(steps).toEqual([
      ['start', 0],
      ['first_shot', 30],
      ['first_bag', 31],
      ['run', 400],
      ['reload', 600],
      ['flush', 1800],
      ['secret', 2412],
      ['complete', 3600],
    ]);
  });

  it('a second run or flush shows no banner again; skip ends it', () => {
    const { d, steps } = director();
    d.update([ev({ type: 'flockStateChanged', tick: 10, to: 'run' })], 10, full);
    d.update([], 200, full);
    d.update([ev({ type: 'flockStateChanged', tick: 210, to: 'run' })], 210, full);
    expect(d.prompt?.key).toBe('ftue.shoot_touch');
    d.skip(220);
    expect(d.prompt).toBeNull();
    expect(steps.map((s) => s[0])).toEqual(['start', 'run', 'skip']);
  });

  it('every FTUE prompt is one short line in every language', () => {
    const max = feelJson.ftue.maxPromptChars;
    for (const table of [en, af, de, nl] as Record<string, string>[]) {
      const keys = Object.keys(table).filter((k) => k.startsWith('ftue.'));
      expect(keys.length).toBeGreaterThanOrEqual(7);
      for (const k of keys) {
        const text = table[k] ?? '';
        expect(text, k).not.toMatch(/\n/);
        expect(Array.from(text).length, `${k}: "${text}"`).toBeLessThanOrEqual(max);
      }
    }
  });
});
