// Placeholder SFX synthesised with Web Audio (no files to download): shot, empty click, reload,
// poof, kek, penalty scratch; M3 adds the flush alarm, the flush music sting, the Vuvuzela and the
// whole-flock stamp; M4 the secret ting and fanfare, car alarm, reservoir splash, CLANG, the
// kwêvoël's call, crate pop, power-up chime and the dust devil. Real recorded assets replace these in M10 (art/audio bible §10).
export const SFX_IDS = [
  'shot',
  'click',
  'shell',
  'poof',
  'kek',
  'kekAlarm',
  'sting',
  'vuvuzela',
  'stamp',
  'scratch',
  'stampede',
  'ting',
  'secret',
  'alarm',
  'splash',
  'clang',
  'kwe',
  'crate',
  'powerup',
  'whoosh',
  // M10 tally (GDD §17): count-up tick and the rank stamp thud.
  'tick',
  'thud',
  // v1.1 (D-032): each gun's own shot and reload (feel.json guns.weapons.<id>.sfx).
  'shotPomp',
  'shotWindbuks',
  'shotKettie',
  'shotVoorlaaier',
  'shotMielie',
  'rackPomp',
  'cockWindbuks',
  'ramrod',
  // v1.3 (D-036): the .22's rimfire crack and its bolt.
  'shotTweeTwee',
  'bolt',
  // v1.4 (D-038): the Langloop's heavy rifle crack.
  'shotLangloop',
  // v1.4 B (D-039): angry sociable weavers chattering and scolding round a shot nest.
  'weavers',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

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
    // v1.1: synth fallbacks for the per-gun sounds (used only while their recording is missing).
    case 'shotPomp':
    case 'shotVoorlaaier':
    case 'shotLangloop':
      return playSfx(ctx, out, 'shot', noise);
    case 'shotMielie':
    case 'shotWindbuks':
    case 'shotTweeTwee':
      tone('sine', 420, 140, 0.06, 0.4);
      return 0.1;
    case 'shotKettie':
      tone('sawtooth', 260, 90, 0.1, 0.3);
      return 0.15;
    case 'rackPomp':
    case 'bolt':
    case 'cockWindbuks':
    case 'ramrod':
      return playSfx(ctx, out, 'shell', noise);
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
    case 'tick':
      tone('square', 1800, 1500, 0.025, 0.08);
      return 0.04;
    case 'thud':
      tone('sine', 90, 40, 0.25, 0.8);
      tone('triangle', 180, 90, 0.12, 0.25);
      return 0.3;
    case 'scratch':
      tone('sawtooth', 300, 80, 0.3, 0.3);
      return 0.3;
    case 'weavers':
      // Many small birds at once: quick, harsh "chip-chip" calls at jittered pitches.
      for (let k = 0; k < 18; k++) {
        const f = 3200 + ((k * 7919) % 1400);
        tone('square', f, f * 0.7, 0.045, 0.06, k * 0.07 + ((k * 31) % 5) * 0.008);
      }
      return 1.4;
    case 'stampede':
      tone('sawtooth', 60, 45, 0.9, 0.35);
      tone('sine', 220, 440, 0.4, 0.2, 0.1);
      return 1;
    case 'ting':
      tone('sine', 2200, 2100, 0.25, 0.25);
      tone('sine', 3300, 3200, 0.18, 0.08);
      return 0.3;
    case 'secret':
      [523, 659, 784, 1047].forEach((f, k) => {
        tone('triangle', f, f, 0.18, 0.18, k * 0.08);
      });
      return 0.55;
    case 'alarm':
      // Two-tone bakkie alarm, four cycles.
      for (let k = 0; k < 8; k++)
        tone('square', k % 2 === 0 ? 880 : 660, k % 2 === 0 ? 880 : 660, 0.18, 0.12, k * 0.2);
      return 1.7;
    case 'splash': {
      const s = noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2500, now);
      f.frequency.exponentialRampToValueAtTime(400, now + 0.6);
      const g = ctx.createGain();
      env(g, 0.6, 0.02, 0.6);
      s.connect(f).connect(g).connect(out);
      s.start(now);
      s.stop(now + 0.7);
      return 0.7;
    }
    case 'clang':
      tone('square', 1250, 1180, 0.5, 0.25);
      tone('triangle', 1870, 1800, 0.45, 0.18);
      tone('sine', 620, 600, 0.6, 0.2);
      return 0.65;
    case 'kwe':
      // "Kwê-kwê": two falling, nasal calls.
      tone('sawtooth', 820, 520, 0.22, 0.18);
      tone('sawtooth', 820, 520, 0.22, 0.18, 0.3);
      return 0.55;
    case 'crate':
      tone('triangle', 300, 900, 0.12, 0.3);
      tone('square', 1200, 1600, 0.1, 0.1, 0.1);
      return 0.25;
    case 'powerup':
      [660, 880, 1320].forEach((f, k) => {
        tone('sine', f, f * 1.02, 0.12, 0.2, k * 0.06);
      });
      return 0.35;
    case 'whoosh': {
      const s = noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(300, now);
      f.frequency.exponentialRampToValueAtTime(1200, now + 0.8);
      const g = ctx.createGain();
      env(g, 0.35, 0.2, 0.8);
      s.connect(f).connect(g).connect(out);
      s.start(now);
      s.stop(now + 1);
      return 1;
    }
  }
}

export function createNoise(ctx: BaseAudioContext): AudioBuffer {
  return noiseBuffer(ctx, 1);
}
