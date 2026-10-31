// v1.9 (D-066): the soundscape's file load — the title tries once (titleLoadDelayMs after start),
// a failed voice index is retried only by the next hunt's load(), never every frame, and a
// browser that plays neither Ogg nor MP3 fetches nothing.
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

function runtime(format: 'ogg' | 'mp3' | null) {
  const audio = {
    fileFormat: () => format,
    addRecorded: vi.fn(),
    setSoundscapeKeys: vi.fn(),
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
