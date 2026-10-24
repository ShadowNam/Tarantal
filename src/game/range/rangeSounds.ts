// 24 Oct update (D-037) Skietbaan sounds and art loading, in the range's lazy chunk. Every sound
// goes through the AudioDirector: the recording from the "range" asset group once it has
// arrived, else the small synth here (so a build without delivered files still rings).
import { fetchAssetIndex, loadBytes, loadImage } from '../assets/finalLoader';
import type { FinalSound } from '../assets/AssetManifest';
import type { AudioDirector, Synth } from '../audio/AudioDirector';
import { PLATE_FRAME_TEX, PLATE_TEX, RANGE_SOUNDS, type RangeSound } from './rangeAssets';

/** How long one file may take (as feel.json assets.fileTimeoutMs); then the stand-in stays. */
const FILE_TIMEOUT_MS = 15_000;

function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  peak: number,
  decay: number,
): void {
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  o.frequency.exponentialRampToValueAtTime(f1, now + decay);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  o.connect(g).connect(out);
  o.start(now);
  o.stop(now + decay + 0.02);
}

function burst(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, hz: number, len: number) {
  const now = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + len);
  s.connect(f).connect(g).connect(out);
  s.start(now);
  s.stop(now + len + 0.02);
}

/** Stand-ins until the recordings arrive (same character, much simpler). */
const SYNTH: Record<RangeSound, Synth> = {
  thwack: (ctx, out, noise) => {
    burst(ctx, out, noise, 2400, 0.05);
    tone(ctx, out, 'sine', 190, 120, 0.5, 0.08);
    return 0.12;
  },
  ding: (ctx, out) => {
    tone(ctx, out, 'sine', 880, 876, 0.45, 1.2);
    tone(ctx, out, 'sine', 2121, 2115, 0.2, 0.6);
    tone(ctx, out, 'triangle', 3458, 3450, 0.1, 0.3);
    return 1.25;
  },
  hit: (ctx, out, noise) => {
    tone(ctx, out, 'sine', 150, 70, 0.5, 0.1);
    burst(ctx, out, noise, 1500, 0.06);
    return 0.12;
  },
};

export function playRangeSound(audio: AudioDirector, id: RangeSound, pan: number): void {
  audio.playExtra(RANGE_SOUNDS[id], pan, SYNTH[id]);
}

let sounds: Promise<void> | null = null;

/** The range group's recordings (once per page) and the plate's art (once per scene). */
export function loadRangeAssets(
  textures: { exists(key: string): boolean; addImage(key: string, img: HTMLImageElement): unknown },
  audio: AudioDirector,
): Promise<void> {
  const index = fetchAssetIndex(FILE_TIMEOUT_MS).then((r) => r.index);
  const format = audio.fileFormat();
  sounds ??= index.then(async (ix) => {
    if (ix === null || format === null) return;
    const files: FinalSound[] = [];
    for (const key of Object.values(RANGE_SOUNDS)) {
      const entry = ix.audio[key];
      if (entry === undefined) continue;
      const bytes = await loadBytes(entry[format].path, FILE_TIMEOUT_MS);
      if (bytes !== null) files.push({ key, entry, bytes, format });
    }
    audio.addRecorded(files);
  });
  // The plate and its frame (D-040): each swaps in for the code-drawn stand-in once it arrives.
  const art = index.then(async (ix) => {
    for (const key of [PLATE_TEX, PLATE_FRAME_TEX]) {
      const entry = ix?.images[key];
      if (entry === undefined || textures.exists(key)) continue;
      const img = await loadImage(entry.file.path, FILE_TIMEOUT_MS);
      if (img !== null && !textures.exists(key)) textures.addImage(key, img);
    }
  });
  return Promise.all([sounds, art]).then(() => undefined);
}
