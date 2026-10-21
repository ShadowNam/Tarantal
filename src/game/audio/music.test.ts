import { describe, expect, it } from 'vitest';
import { FakeContext, type FakeGain } from '../../../tools/fakeAudio';
import type { SimState } from '../../sim/types';
import {
  MusicMixer,
  StemHold,
  availableStem,
  stemFor,
  type MixContext,
  type MusicSet,
} from './music';

const buf = (id: string) => ({ id, duration: 30 }) as unknown as AudioBuffer;
const timing = { crossfadeMs: 1000, biomeFadeMs: 2000 };

function setup() {
  const ctx = new FakeContext();
  const music = ctx.createGain();
  const amb = ctx.createGain();
  const mixer = new MusicMixer(
    ctx as unknown as MixContext,
    music as unknown as AudioNode,
    amb as unknown as AudioNode,
    timing,
  );
  return { ctx, mixer };
}
/** The gain node feeding a source (its stem gain). */
const gainOf = (ctx: FakeContext, id: string): FakeGain => {
  const src = ctx.sources.find((s) => s.buffer?.id === id);
  return src?.outputs[0] as FakeGain;
};

describe('music mixer (M10)', () => {
  it('starts every stem together, only the wanted one audible, and fades the set in', () => {
    const { ctx, mixer } = setup();
    const set: MusicSet = {
      stems: { calm: buf('c'), build: buf('b'), stampede: buf('s') },
      ambience: buf('a'),
    };
    mixer.play('karoo', set);
    expect(ctx.sources.map((s) => [s.buffer?.id, s.loop, s.startedAt])).toEqual([
      ['c', true, 0],
      ['b', true, 0],
      ['s', true, 0],
      ['a', true, 0],
    ]);
    expect(gainOf(ctx, 'c').gain.value).toBe(1);
    expect(gainOf(ctx, 'b').gain.value).toBe(0);
    const setGain = gainOf(ctx, 'c').outputs[0] as FakeGain;
    expect(setGain.gain.at(0)).toBe(0);
    expect(setGain.gain.at(1)).toBeCloseTo(0.5);
    expect(setGain.gain.at(2)).toBe(1);
    expect(mixer.state).toEqual({ id: 'karoo', stem: 'calm' });
  });

  it('crossfades stems by intensity, falling back to a calmer stem that exists', () => {
    const { ctx, mixer } = setup();
    mixer.play('karoo', { stems: { calm: buf('c'), build: buf('b') }, ambience: null });
    ctx.currentTime = 10;
    mixer.setStem('stampede'); // no stampede stem → build
    expect(mixer.state?.stem).toBe('build');
    expect(gainOf(ctx, 'b').gain.at(10.5)).toBeCloseTo(0.5);
    expect(gainOf(ctx, 'b').gain.at(11)).toBe(1);
    expect(gainOf(ctx, 'c').gain.at(11)).toBe(0);
    expect(availableStem({ stems: { build: buf('b') }, ambience: null }, 'calm')).toBeNull();
  });

  it('a new biome fades the old set out and stops it; the same set again is a no-op', () => {
    const { ctx, mixer } = setup();
    const karoo: MusicSet = { stems: { calm: buf('k') }, ambience: null };
    mixer.play('karoo', karoo);
    mixer.play('karoo', karoo);
    expect(ctx.sources).toHaveLength(1);
    ctx.currentTime = 5;
    mixer.play('bushveld', { stems: { calm: buf('v') }, ambience: buf('va') });
    const old = ctx.sources[0];
    expect(old?.stoppedAt).toBe(7);
    const oldSet = gainOf(ctx, 'k').outputs[0] as FakeGain;
    expect(oldSet.gain.at(6)).toBeCloseTo(0.5);
    expect(mixer.state).toEqual({ id: 'bushveld', stem: 'calm' });
  });

  it('nothing delivered: no sources, no music', () => {
    const { ctx, mixer } = setup();
    mixer.play('karoo', { stems: {}, ambience: null });
    expect(ctx.sources).toHaveLength(0);
    expect(mixer.state).toBeNull();
  });
});

describe('intensity (M10)', () => {
  const state = (over: Partial<SimState>): SimState =>
    ({ stampedeActive: false, frenzyMul: 1, flocks: [], ...over }) as unknown as SimState;
  it('calm by default, build for a fleeing flock or a high Frenzy, stampede in the Stampede', () => {
    const rules = { buildAtFrenzy: 2 };
    expect(stemFor(null, rules)).toBe('calm');
    expect(stemFor(state({}), rules)).toBe('calm');
    expect(stemFor(state({ frenzyMul: 2 }), rules)).toBe('build');
    expect(
      stemFor(state({ flocks: [{ state: 'flush' }] as unknown as SimState['flocks'] }), rules),
    ).toBe('build');
    expect(stemFor(state({ stampedeActive: true }), rules)).toBe('stampede');
  });
  it('rises at once, calms down only after the hold', () => {
    const h = new StemHold(4000);
    expect(h.next('build', 0)).toBe('build');
    expect(h.next('stampede', 100)).toBe('stampede');
    expect(h.next('calm', 3000)).toBe('stampede');
    expect(h.next('calm', 4200)).toBe('calm');
  });
});
