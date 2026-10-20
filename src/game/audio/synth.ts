// Placeholder SFX synthesised with Web Audio (no files to download): shot, empty click, reload,
// poof, kek, penalty scratch; M3 adds the flush alarm, the flush music sting, the Vuvuzela and the
// whole-flock stamp. Real recorded assets replace these in M10 (art/audio bible §10).
export type SfxId =
  | 'shot'
  | 'click'
  | 'shell'
  | 'poof'
  | 'kek'
  | 'kekAlarm'
  | 'sting'
  | 'vuvuzela'
  | 'stamp'
  | 'scratch'
  | 'stampede';

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Plays one sound into `out` starting now; returns its length in seconds. */
export function playSfx(ctx: AudioContext, out: AudioNode, id: SfxId, noise: AudioBuffer): number {
  const now = ctx.currentTime;
  const env = (g: GainNode, peak: number, attack: number, decay: number): void => {
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  };
  const noiseSrc = (): AudioBufferSourceNode => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    return s;
  };
  const tone = (
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    at = 0,
  ): void => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now + at);
    o.frequency.exponentialRampToValueAtTime(f1, now + at + dur);
    g.gain.setValueAtTime(0.0001, now + at);
    g.gain.exponentialRampToValueAtTime(peak, now + at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
    o.connect(g).connect(out);
    o.start(now + at);
    o.stop(now + at + dur + 0.02);
  };
  switch (id) {
    case 'shot': {
      const s = noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(4000, now);
      f.frequency.exponentialRampToValueAtTime(300, now + 0.35);
      const g = ctx.createGain();
      env(g, 0.9, 0.003, 0.4);
      s.connect(f).connect(g).connect(out);
      s.start(now);
      s.stop(now + 0.45);
      tone('sine', 140, 40, 0.25, 0.8);
      return 0.45;
    }
    case 'click':
      tone('square', 1800, 1200, 0.03, 0.25);
      tone('square', 900, 700, 0.04, 0.15, 0.05);
      return 0.1;
    case 'shell':
      tone('triangle', 600, 400, 0.05, 0.25);
      tone('square', 1400, 1000, 0.03, 0.12, 0.06);
      return 0.1;
    case 'poof': {
      const s = noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(900, now);
      f.frequency.exponentialRampToValueAtTime(2400, now + 0.18);
      const g = ctx.createGain();
      env(g, 0.5, 0.01, 0.22);
      s.connect(f).connect(g).connect(out);
      s.start(now);
      s.stop(now + 0.25);
      return 0.25;
    }
    case 'kek':
      for (let k = 0; k < 3; k++) tone('square', 1500, 1100, 0.05, 0.12, k * 0.09);
      return 0.3;
    case 'kekAlarm':
      // The whole flock at once: fast, overlapping, slightly detuned keks.
      for (let k = 0; k < 7; k++) {
        const f = 1350 + (k % 3) * 140;
        tone('square', f, f * 0.72, 0.045, 0.1, k * 0.055);
      }
      return 0.45;
    case 'sting':
      // Short rising brass-ish arpeggio: the flush music sting.
      [392, 494, 587, 784].forEach((f, k) => {
        tone('sawtooth', f, f * 1.01, 0.16, 0.12, k * 0.07);
      });
      return 0.5;
    case 'vuvuzela': {
      const o = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(233, now);
      lfo.frequency.setValueAtTime(6, now);
      lfoGain.gain.setValueAtTime(5, now);
      lfo.connect(lfoGain).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.3, now + 0.06);
      g.gain.setValueAtTime(0.3, now + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o.connect(g).connect(out);
      o.start(now);
      lfo.start(now);
      o.stop(now + 0.95);
      lfo.stop(now + 0.95);
      return 0.95;
    }
    case 'stamp':
      tone('sine', 120, 50, 0.3, 0.7);
      tone('triangle', 660, 880, 0.25, 0.15, 0.12);
      return 0.4;
    case 'scratch':
      tone('sawtooth', 300, 80, 0.3, 0.3);
      return 0.3;
    case 'stampede':
      tone('sawtooth', 60, 45, 0.9, 0.35);
      tone('sine', 220, 440, 0.4, 0.2, 0.1);
      return 1;
  }
}

export function createNoise(ctx: BaseAudioContext): AudioBuffer {
  return noiseBuffer(ctx, 1);
}
