// WAV masters for the audio pipeline (M10): reads 16/24/32-bit PCM and 32-bit float WAV into
// float channels, and writes 16-bit PCM (stand-in sounds). Pure, no dependencies.

export interface Pcm {
  readonly sampleRate: number;
  /** One Float32Array per channel, samples in −1..1. */
  readonly channels: readonly Float32Array[];
}

export function readWav(bytes: Uint8Array): Pcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string =>
    String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data: { at: number; size: number } | null = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first 2 bytes of the sub-format GUID.
      if (format === 0xfffe) format = view.getUint16(at + 32, true);
    } else if (id === 'data') {
      data = { at: at + 8, size: Math.min(size, bytes.length - at - 8) };
    }
    at += 8 + size + (size % 2);
  }
  if (data === null || channels === 0) throw new Error('WAV has no fmt or data chunk');
  const float = format === 3;
  if (!(format === 1 || float) || ![16, 24, 32].includes(bits))
    throw new Error(
      `unsupported WAV: format ${format}, ${bits}-bit (use PCM 16/24/32 or float 32)`,
    );
  const step = bits / 8;
  const frames = Math.floor(data.size / (step * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const at = data.at + (f * channels + c) * step;
      let v: number;
      if (float) v = view.getFloat32(at, true);
      else if (bits === 16) v = view.getInt16(at, true) / 32768;
      else if (bits === 24) {
        const raw = (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
        v = ((raw << 8) >> 8) / 8388608;
      } else v = view.getInt32(at, true) / 2147483648;
      // Safe: out has `channels` arrays of `frames` samples.
      (out[c] as Float32Array)[f] = v;
    }
  }
  return { sampleRate, channels: out };
}

export function writeWav(pcm: Pcm): Uint8Array {
  const ch = pcm.channels.length;
  const frames = pcm.channels[0]?.length ?? 0;
  const size = frames * ch * 2;
  const bytes = new Uint8Array(44 + size);
  const view = new DataView(bytes.buffer);
  const put = (at: number, s: string): void => {
    for (let i = 0; i < 4; i++) bytes[at + i] = s.charCodeAt(i);
  };
  put(0, 'RIFF');
  view.setUint32(4, 36 + size, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, pcm.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  put(36, 'data');
  view.setUint32(40, size, true);
  for (let f = 0; f < frames; f++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, pcm.channels[c]?.[f] ?? 0));
      view.setInt16(44 + (f * ch + c) * 2, Math.round(v * 32767), true);
    }
  return bytes;
}
