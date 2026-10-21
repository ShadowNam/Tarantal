// Ogg Vorbis + MP3 encoding for the audio pipeline (M10), via wasm-media-encoders (LAME and
// libvorbis compiled to WebAssembly: no ffmpeg, no native build). Same input → same bytes (fixed
// Ogg serial number), so content hashes stay stable between runs.
import { createMp3Encoder, createOggEncoder } from 'wasm-media-encoders';
import type { AudioKind } from '../../src/game/assets/assetIndex';
import type { Pcm } from './wav';

/** Encoder quality per kind: Vorbis q (−1…10, higher = better) and LAME VBR (0…9, lower = better). */
export const ENCODE_QUALITY: Readonly<Record<AudioKind, { ogg: number; mp3: number }>> = {
  sfx: { ogg: 4, mp3: 4 },
  voice: { ogg: 3, mp3: 5 },
  // Long files: lower bitrates keep a biome's stems inside the download budget.
  music: { ogg: 2, mp3: 6 },
  ambience: { ogg: 1, mp3: 7 },
};

const OGG_SERIAL = 0x544d; // "TM"

function channelsOf(pcm: Pcm): { channels: 1 | 2; data: Float32Array[] } {
  const [l, r] = pcm.channels;
  if (l === undefined) throw new Error('audio has no channels');
  // More than two channels are folded to stereo (games ship stereo at most).
  return r === undefined ? { channels: 1, data: [l] } : { channels: 2, data: [l, r] };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Feeds the encoder in 1 s chunks (it owns its output buffer: each chunk is copied). */
function run(
  enc: { encode(s: readonly Float32Array[]): Uint8Array; finalize(): Uint8Array },
  data: readonly Float32Array[],
  rate: number,
): Uint8Array {
  const parts: Uint8Array[] = [];
  const n = data[0]?.length ?? 0;
  for (let at = 0; at < n; at += rate) {
    parts.push(enc.encode(data.map((c) => c.subarray(at, Math.min(n, at + rate)))).slice());
  }
  parts.push(enc.finalize().slice());
  return concat(parts);
}

export async function encodeOgg(pcm: Pcm, kind: AudioKind): Promise<Uint8Array> {
  const { channels, data } = channelsOf(pcm);
  const enc = await createOggEncoder();
  enc.configure({
    channels,
    sampleRate: pcm.sampleRate,
    vbrQuality: ENCODE_QUALITY[kind].ogg,
    oggSerialNo: OGG_SERIAL,
  });
  return run(enc, data, pcm.sampleRate);
}

export async function encodeMp3(pcm: Pcm, kind: AudioKind): Promise<Uint8Array> {
  const { channels, data } = channelsOf(pcm);
  const enc = await createMp3Encoder();
  enc.configure({ channels, sampleRate: pcm.sampleRate, vbrQuality: ENCODE_QUALITY[kind].mp3 });
  return run(enc, data, pcm.sampleRate);
}
