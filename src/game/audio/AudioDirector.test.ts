import { beforeEach, describe, expect, it } from 'vitest';
import { FakeContext, fakeFile, type FakeGain } from '../../../tools/fakeAudio';
import { loadFeel } from '../../../tools/testContent';
import type { SimEvent } from '../../sim/events';
import { ambienceKey, musicKey, sfxKey, voiceKey, type FinalSound } from '../assets/AssetManifest';
import { AudioDirector, type AudioEnv } from './AudioDirector';

const tuning = loadFeel().audio;

function rig(canPlay: (m: string) => string = () => 'probably', guns = {}) {
  const ctx = new FakeContext();
  let hidden: (h: boolean) => void = () => undefined;
  let now = 0;
  const env: AudioEnv = {
    createContext: () => ctx as unknown as AudioContext,
    onVisibility: (fn) => {
      hidden = fn;
    },
    now: () => now,
    setTimer: () => undefined,
    canPlay,
    fetchBytes: (path) => Promise.resolve(fakeFile(1, `mp3:${path}`)),
  };
  const audio = new AudioDirector(tuning, env, guns);
  return {
    ctx,
    audio,
    setHidden: (h: boolean) => {
      hidden(h);
    },
    advance: (ms: number) => {
      now += ms;
      ctx.currentTime += ms / 1000;
    },
  };
}
const file = (key: string, seconds = 1, format: 'ogg' | 'mp3' = 'ogg'): FinalSound => ({
  key,
  bytes: fakeFile(seconds, key),
  format,
  entry: {
    group: 'common',
    kind: 'sfx',
    ogg: { path: 'a.ogg', bytes: 1, hash: '0123456789ab' },
    mp3: { path: 'a.mp3', bytes: 1, hash: '0123456789ab' },
    loop: false,
    lufs: -14,
    peakDb: -1,
  },
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const shot: SimEvent = { type: 'shotFired' } as unknown as SimEvent;

describe('AudioDirector (M10)', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => {
    r = rig();
  });

  it('picks Ogg where the browser is sure, else MP3, else no files', () => {
    expect(rig(() => 'probably').audio.fileFormat()).toBe('ogg');
    expect(rig((m) => (m === 'audio/mpeg' ? 'maybe' : '')).audio.fileFormat()).toBe('mp3');
    expect(rig(() => '').audio.fileFormat()).toBeNull();
  });

  it('plays a delivered recording instead of the synth; other sounds stay on the synth', async () => {
    r.audio.addRecorded([file(sfxKey('shot'))]);
    // Nothing decodes before the first gesture.
    expect(r.ctx.decoded).toEqual([]);
    r.audio.unlock();
    await flush();
    expect(r.audio.recorded).toEqual(['sfx/shot']);
    r.audio.handle([shot], () => 0);
    expect(r.ctx.sources.some((s) => s.buffer?.id === 'sfx/shot' && s.startedAt !== null)).toBe(
      true,
    );
    const before = r.ctx.sources.length;
    r.audio.handle([{ type: 'emptyClick' } as unknown as SimEvent], () => 0);
    // The click is synthesised: no new buffer source carries a recording.
    expect(r.ctx.sources.slice(before).every((s) => s.buffer?.id === undefined)).toBe(true);
  });

  it('mute rules: hidden tab, pause and ads zero the master and silence events', () => {
    r.audio.unlock();
    expect(r.audio.masterGain).toBeCloseTo(tuning.masterLevel);
    r.setHidden(true);
    expect(r.audio.masterGain).toBe(0);
    expect(r.ctx.state).toBe('suspended');
    r.setHidden(false);
    expect(r.audio.masterGain).toBeCloseTo(tuning.masterLevel);
    r.audio.setMuted('ad', true);
    r.audio.setMuted('pause', true);
    expect(r.audio.masterGain).toBe(0);
    const n = r.ctx.sources.length;
    r.audio.handle([shot], () => 0);
    expect(r.ctx.sources.length).toBe(n);
    r.audio.setMuted('ad', false);
    expect(r.audio.masterGain).toBe(0);
    r.audio.setMuted('pause', false);
    expect(r.audio.masterGain).toBeCloseTo(tuning.masterLevel);
  });

  it('per-biome music starts once decoded and crossfades with intensity', async () => {
    r.audio.setBiome('karoo-autumn');
    r.audio.addRecorded([
      file(musicKey('karoo-autumn', 'calm'), 30),
      file(musicKey('karoo-autumn', 'build'), 30),
      file(ambienceKey('karoo-autumn'), 20),
    ]);
    expect(r.audio.music).toBeNull();
    r.audio.unlock();
    await flush();
    expect(r.audio.music).toEqual({ id: 'karoo-autumn', stem: 'calm' });
    // One batch of decodes starts the music once (2 stems + ambience = 3 sources, not restarts).
    expect(r.ctx.sources.filter((s) => s.loop)).toHaveLength(3);
    r.audio.setIntensity('stampede');
    expect(r.audio.music?.stem).toBe('build');
    r.audio.setBiome('bushveld-winter');
    // No bushveld music delivered: the Karoo set fades out, nothing replaces it.
    expect(r.audio.music).toBeNull();
    expect(r.ctx.sources.every((s) => s.stoppedAt !== null)).toBe(true);
  });

  it('barks: only delivered ones, one voice at a time, never over the tally; music ducks −6 dB', async () => {
    r.audio.addRecorded([file(voiceKey('en', 'bark.kos_is_reg'), 2)]);
    r.audio.unlock();
    await flush();
    expect(r.audio.bark('bark.missing')).toBe(false);
    r.audio.setTallyCounting(true);
    expect(r.audio.bark('bark.kos_is_reg')).toBe(false);
    r.audio.setTallyCounting(false);
    expect(r.audio.bark('bark.kos_is_reg')).toBe(true);
    // The duck node feeds the music bus: down to −6 dB during the bark, back up after.
    const duck = (r.audio as unknown as { duck: FakeGain }).duck;
    expect(duck.gain.at(1)).toBeCloseTo(10 ** (tuning.duckDb / 20), 3);
    expect(duck.gain.at(2 + tuning.duckReleaseMs / 1000 + 0.01)).toBe(1);
    // v1.0.1 (D-028 review): the gap is the BarkDirector's; a new line here plays at once and
    // stops the one still playing (one Oupa voice at a time).
    const voices = () => r.ctx.sources.filter((s) => s.buffer?.id.includes('bark') === true);
    const first = voices().at(-1);
    expect(r.audio.bark('bark.kos_is_reg')).toBe(true);
    expect(voices()).toHaveLength(2);
    expect(first?.stoppedAt).not.toBeNull();
    expect(voices().at(-1)?.stoppedAt).toBeNull();
  });
});

describe('AudioDirector voice language (v1.5, D-041)', () => {
  const buffers = (r: ReturnType<typeof rig>) =>
    [...(r.audio as unknown as { buffers: Map<string, unknown> }).buffers.keys()].sort();

  it('speaks from the chosen language only and keeps one pack in memory', async () => {
    const r = rig();
    r.audio.setVoiceLanguage('af');
    r.audio.addRecorded([
      file(voiceKey('af', 'bark.kos_is_reg'), 1),
      // A pack for another language arriving late is not kept.
      file(voiceKey('de', 'bark.kos_is_reg'), 1),
    ]);
    r.audio.unlock();
    await flush();
    expect(buffers(r)).toEqual(['voice/af/bark.kos_is_reg']);
    expect(r.audio.bark('bark.kos_is_reg')).toBe(true);
    expect(r.audio.voicePlayed).toEqual(['voice/af/bark.kos_is_reg']);
    r.audio.setVoiceLanguage('de');
    expect(buffers(r)).toEqual([]);
    expect(r.audio.bark('bark.kos_is_reg')).toBe(false);
    r.audio.addRecorded([file(voiceKey('de', 'bark.kos_is_reg'), 1)]);
    await flush();
    expect(r.audio.bark('bark.kos_is_reg')).toBe(true);
    expect(r.audio.voicePlayed.at(-1)).toBe('voice/de/bark.kos_is_reg');
  });

  it('no voice at all with the voice volume at 0 (and no music duck)', async () => {
    const r = rig();
    r.audio.addRecorded([file(voiceKey('en', 'bark.lekker'), 1)]);
    r.audio.unlock();
    await flush();
    r.audio.setVolumes({ master: 1, sfx: 1, music: 1, voice: 0 });
    expect(r.audio.bark('bark.lekker')).toBe(false);
    expect(r.audio.voicePlayed).toEqual([]);
    r.audio.setVolumes({ master: 1, sfx: 1, music: 1, voice: 0.5 });
    expect(r.audio.bark('bark.lekker')).toBe(true);
  });

  it('a bark whose line is still loading plays when it arrives within barkWaitMs', async () => {
    const r = rig();
    r.audio.unlock();
    // The greeting fires before the pack is in: no voice yet (the caption shows regardless).
    expect(r.audio.bark('bark.morning')).toBe(false);
    r.advance(tuning.barkWaitMs / 2);
    r.audio.addRecorded([file(voiceKey('en', 'bark.morning'), 1)]);
    await flush();
    expect(r.audio.voicePlayed).toEqual(['voice/en/bark.morning']);
  });

  it('a line that arrives after barkWaitMs, or after a newer bark, stays silent', async () => {
    const r = rig();
    r.audio.unlock();
    expect(r.audio.bark('bark.morning')).toBe(false);
    r.advance(tuning.barkWaitMs + 1);
    r.audio.addRecorded([file(voiceKey('en', 'bark.morning'), 1)]);
    await flush();
    expect(r.audio.voicePlayed).toEqual([]);
    // A newer bark replaces the waiting one: the old line arriving later says nothing.
    expect(r.audio.bark('bark.lekker')).toBe(false);
    expect(r.audio.bark('bark.aim')).toBe(false);
    r.audio.addRecorded([file(voiceKey('en', 'bark.lekker'), 1)]);
    await flush();
    expect(r.audio.voicePlayed).toEqual([]);
    expect(tuning.barkWaitMs).toBeGreaterThan(0);
    expect(tuning.barkWaitMs).toBeLessThanOrEqual(3000);
  });

  it('runs unlock callbacks once, on the first gesture (or at once after it)', () => {
    const r = rig();
    const seen: string[] = [];
    r.audio.onUnlocked(() => seen.push('a'));
    expect(seen).toEqual([]);
    r.audio.unlock();
    r.audio.unlock();
    expect(seen).toEqual(['a']);
    r.audio.onUnlocked(() => seen.push('b'));
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('AudioDirector memory and fallbacks (M10 review)', () => {
  const buffers = (r: ReturnType<typeof rig>) =>
    [...(r.audio as unknown as { buffers: Map<string, unknown> }).buffers.keys()].sort();

  it('keeps only the biome on screen decoded; a revisit decodes it again', async () => {
    const r = rig();
    r.audio.setBiome('karoo-autumn');
    r.audio.addRecorded([
      file(sfxKey('shot')),
      file(musicKey('karoo-autumn', 'calm'), 30),
      file(musicKey('bushveld-winter', 'calm'), 30),
      file(ambienceKey('bushveld-winter'), 20),
    ]);
    r.audio.unlock();
    await flush();
    expect(buffers(r)).toEqual(['music/karoo-autumn/calm', 'sfx/shot']);
    r.audio.setBiome('bushveld-winter');
    await flush();
    expect(buffers(r)).toEqual(['amb/bushveld-winter', 'music/bushveld-winter/calm', 'sfx/shot']);
    expect(r.audio.music?.id).toBe('bushveld-winter');
    r.audio.setBiome('karoo-autumn');
    await flush();
    expect(buffers(r)).toEqual(['music/karoo-autumn/calm', 'sfx/shot']);
  });

  it('an Ogg the browser cannot decode retries the MP3 twin', async () => {
    const r = rig();
    const bad = file(sfxKey('shot'));
    const bytes = new Uint8Array(bad.bytes.slice(0));
    bytes[0] = 255;
    r.audio.addRecorded([{ ...bad, bytes: bytes.buffer }]);
    r.audio.unlock();
    await flush();
    await flush();
    expect(buffers(r)).toEqual(['sfx/shot']);
    expect(r.ctx.decoded).toContain('mp3:a.mp3');
  });

  it('a new hunt starts calm, not on the last stampede stem', async () => {
    const r = rig();
    r.audio.setBiome('karoo-autumn');
    r.audio.addRecorded(
      ['calm', 'build', 'stampede'].map((s) => file(musicKey('karoo-autumn', s), 30)),
    );
    r.audio.unlock();
    await flush();
    r.audio.setIntensity('stampede');
    expect(r.audio.music?.stem).toBe('stampede');
    r.audio.resetIntensity();
    expect(r.audio.music?.stem).toBe('calm');
  });
});

describe('tally sounds and mute rules (M10 review)', () => {
  const reasons = ['pause', 'ad', 'menu', 'portal'] as const;
  it('ui tick and thud play when audible and stay silent for every mute reason', () => {
    const r = rig();
    // Before the first gesture: no context, nothing plays.
    r.audio.ui('tick');
    expect(r.ctx.panners).toBe(0);
    r.audio.unlock();
    const count = () => r.ctx.panners;
    let n = count();
    r.audio.ui('tick');
    r.audio.ui('thud');
    expect(count()).toBeGreaterThan(n);
    for (const reason of reasons) {
      r.audio.setMuted(reason, true);
      n = count();
      r.audio.ui('tick');
      r.audio.ui('thud');
      expect(count(), reason).toBe(n);
      r.audio.setMuted(reason, false);
    }
    r.setHidden(true);
    n = count();
    r.audio.ui('thud');
    expect(count()).toBe(n);
  });
});

describe('AudioDirector: each gun its own sounds (v1.1, D-032)', () => {
  const guns = Object.fromEntries(
    Object.entries(loadFeel().guns.weapons).map(([id, w]) => [id, w.sfx]),
  );
  const playedIds = (r: ReturnType<typeof rig>, from: number): (string | undefined)[] =>
    r.ctx.sources.slice(from).map((s) => s.buffer?.id);

  it("a shot plays the firing gun's recording; a reload plays the gun in hand's", async () => {
    const r = rig(undefined, guns);
    r.audio.addRecorded(
      ['shot', 'shotWindbuks', 'shotKettie', 'cockWindbuks', 'rackPomp', 'shell'].map((id) =>
        file(sfxKey(id)),
      ),
    );
    r.audio.unlock();
    await flush();
    let at = r.ctx.sources.length;
    r.audio.handle([{ type: 'shotFired', weapon: 'windbuks' } as unknown as SimEvent], () => 0);
    expect(playedIds(r, at)).toEqual(['sfx/shotWindbuks']);
    at = r.ctx.sources.length;
    r.audio.handle([{ type: 'shellLoaded', shells: 1 } as unknown as SimEvent], () => 0);
    expect(playedIds(r, at)).toEqual(['sfx/cockWindbuks']);
    at = r.ctx.sources.length;
    r.audio.handle([{ type: 'shotFired', weapon: 'kettie' } as unknown as SimEvent], () => 0);
    expect(playedIds(r, at)).toEqual(['sfx/shotKettie']);
    r.audio.setWeapon('pomp');
    at = r.ctx.sources.length;
    r.audio.handle(
      [
        { type: 'shellLoaded', shells: 1 },
        { type: 'reloadFinished', shells: 6 },
      ] as unknown as SimEvent[],
      () => 0,
    );
    expect(playedIds(r, at)).toEqual(['sfx/shell', 'sfx/rackPomp']);
  });

  it("v1.6b: while Blitslaai runs a reload starts with the zip, else the gun's own sound", async () => {
    const r = rig(undefined, guns);
    r.audio.addRecorded(['zip', 'rackPomp', 'shell'].map((id) => file(sfxKey(id))));
    r.audio.unlock();
    await flush();
    r.audio.setWeapon('dubbelloop');
    const start = { type: 'reloadStarted', perShell: false } as unknown as SimEvent;
    let at = r.ctx.sources.length;
    r.audio.setFastReload(true);
    r.audio.handle([start], () => 0);
    expect(playedIds(r, at)).toEqual(['sfx/zip']);
    r.audio.setFastReload(false);
    at = r.ctx.sources.length;
    r.audio.handle([start], () => 0);
    expect(playedIds(r, at)).not.toContain('sfx/zip');
  });

  it('the Voorlaaier (a crate gun, no reload events) plays its ramrod after a shot that leaves rounds', async () => {
    const timers: { fn: () => void; ms: number }[] = [];
    const r = rig(undefined, guns);
    (r as unknown as { audio: { env: { setTimer: unknown } } }).audio.env.setTimer = (
      fn: () => void,
      ms: number,
    ) => timers.push({ fn, ms });
    r.audio.addRecorded(['shotVoorlaaier', 'ramrod'].map((id) => file(sfxKey(id))));
    r.audio.unlock();
    await flush();
    const at = r.ctx.sources.length;
    r.audio.handle(
      [{ type: 'shotFired', weapon: 'voorlaaier', shellsLeft: 2 } as unknown as SimEvent],
      () => 0,
    );
    const ramrod = timers.find((t) => t.ms === 900);
    expect(ramrod).toBeDefined();
    ramrod?.fn();
    expect(playedIds(r, at)).toEqual(['sfx/shotVoorlaaier', 'sfx/ramrod']);
    // The last shot leaves nothing to load: no ramrod.
    const n = timers.length;
    r.audio.handle(
      [{ type: 'shotFired', weapon: 'voorlaaier', shellsLeft: 0 } as unknown as SimEvent],
      () => 0,
    );
    expect(timers.slice(n).some((t) => t.ms === 900)).toBe(false);
  });

  it('a muted director plays no gun sound', async () => {
    const r = rig(undefined, guns);
    r.audio.unlock();
    await flush();
    r.audio.setMuted('pause', true);
    const at = r.ctx.sources.length;
    r.audio.handle([{ type: 'shotFired', weapon: 'voorlaaier' } as unknown as SimEvent], () => 0);
    expect(r.ctx.sources.length).toBe(at);
    expect(r.audio.masterGain).toBe(0);
  });
  it('playExtra (the Skietbaan sounds) plays its synth, and nothing while muted', async () => {
    const r = rig(undefined, guns);
    r.audio.unlock();
    await flush();
    let calls = 0;
    const synth = (): number => {
      calls++;
      return 0.1;
    };
    r.audio.playExtra('sfx/range_ding', 0, synth);
    expect(calls).toBe(1);
    r.audio.setMuted('ad', true);
    r.audio.playExtra('sfx/range_ding', 0, synth);
    expect(calls).toBe(1);
  });
});
