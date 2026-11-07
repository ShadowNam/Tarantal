// v1.9 (D-066): the soundscape's file load — the title tries once (titleLoadDelayMs after start),
// a failed voice index is retried only by the next hunt's load(), never every frame, and a
// browser that plays neither Ogg nor MP3 fetches nothing. v1.10 (D-067): a Reënbui hunt's
// sounds are released when the next hunt in the same area has none.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { AudioDirector } from './AudioDirector';
import { FORECAST_SIM } from './forecastSim';
import { SoundscapeRuntime } from './soundscapeRuntime';

const fetchAssetIndex = vi.fn<() => Promise<unknown>>();
const loadVoiceIndex = vi.fn<() => Promise<unknown>>();
vi.mock('../assets/finalLoader', () => ({
  fetchAssetIndex: () => fetchAssetIndex(),
  loadBytes: () => Promise.resolve(null),
}));
vi.mock('../assets/voiceIndex', () => ({
  loadVoiceIndex: () => loadVoiceIndex(),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

function runtime(format: 'ogg' | 'mp3' | null, setSoundscapeKeys = vi.fn()) {
  const audio = {
    fileFormat: () => format,
    addRecorded: vi.fn(),
    setSoundscapeKeys,
    ambient: () => 'played',
    ambientPlaying: 0,
  } as unknown as AudioDirector;
  return new SoundscapeRuntime(audio, loadContent(), false, 0, FORECAST_SIM);
}

describe('SoundscapeRuntime file load (v1.9, D-066)', () => {
  beforeEach(() => {
    fetchAssetIndex.mockReset();
    loadVoiceIndex.mockReset();
    fetchAssetIndex.mockResolvedValue({ index: { audio: { 'sfx/shot': {} } } });
    loadVoiceIndex.mockResolvedValue(null);
  });

  it('the title tries once; a failed voice index waits for the next hunt, not the next frame', async () => {
    const rt = runtime('ogg');
    const delay = rt.sc.titleLoadDelayMs;
    rt.frame(0, null, null, delay - 1);
    await flush();
    expect(fetchAssetIndex).not.toHaveBeenCalled();
    for (let f = 0; f < 30; f++) {
      rt.frame(f, null, null, delay + f * 16);
      await flush();
    }
    expect(fetchAssetIndex).toHaveBeenCalledTimes(1);
    expect(loadVoiceIndex).toHaveBeenCalledTimes(1);
    // A hunt starts: it tries again (once).
    await rt.load();
    for (let f = 0; f < 30; f++) {
      rt.frame(f, null, null, delay + 1_000 + f * 16);
      await flush();
    }
    expect(fetchAssetIndex).toHaveBeenCalledTimes(2);
  });

  it('a browser with no playable format fetches nothing, ever', async () => {
    const rt = runtime(null);
    for (let f = 0; f < 10; f++) {
      rt.frame(f, null, null, rt.sc.titleLoadDelayMs + f * 16);
      await flush();
    }
    await rt.load();
    expect(fetchAssetIndex).not.toHaveBeenCalled();
    expect(loadVoiceIndex).not.toHaveBeenCalled();
  });
});

describe('SoundscapeRuntime Reënbui sounds (v1.10, D-067)', () => {
  it("a Reënbui hunt then a plain hunt in the same area: only the area's calls stay decoded", () => {
    const keys = vi.fn<(k: readonly string[]) => void>();
    const rt = runtime('ogg', keys);
    const area = 'okavango-spring';
    const scene = (seed: number) => {
      rt.setScene({
        area,
        lights: [],
        mapLights: [],
        title: false,
        hunt: { seed, mode: { id: 'classic' } },
        startTick: 0,
      });
    };
    const own = rt.sc.reenbui.cues.flatMap((c) => {
      const call = rt.sc.calls[c.call];
      return call === undefined ? [] : [call.sound];
    });
    expect(own.length).toBeGreaterThan(0);
    scene(1);
    const areaKeys = keys.mock.calls.at(-1)?.[0] ?? [];
    expect(areaKeys.length).toBeGreaterThan(0);
    expect(areaKeys.some((k) => own.includes(k))).toBe(false);
    // The Reënbui hunt: its sounds are decoded with the area's.
    const timing = {
      buildupTick: 600,
      dropsTick: 900,
      swarmTick: 1200,
      easingTick: 2400,
      endTick: 3000,
      withStorm: false,
    };
    rt.frame(10, [], [], 0, timing);
    expect(keys.mock.calls.at(-1)?.[0]).toEqual(expect.arrayContaining([...areaKeys, ...own]));
    // The next hunt, same area, no Reënbui: the event's sounds are released.
    scene(2);
    rt.frame(10, [], [], 0, null);
    expect([...(keys.mock.calls.at(-1)?.[0] ?? [])].sort()).toEqual([...areaKeys].sort());
  });

  it('v1.12 (D-069): the calls make room while Brakkie barks, yelps or digs, and only then', () => {
    const rt = runtime('ogg');
    rt.frame(10, [], [], 0, null, false);
    expect(rt.room(10)).toBe(false);
    rt.frame(11, [], [], 0, null, true);
    expect(rt.room(11)).toBe(true);
    rt.frame(12, [], [], 0, null, false);
    expect(rt.room(12)).toBe(false);
  });
});
