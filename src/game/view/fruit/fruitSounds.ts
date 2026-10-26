// v1.7c (D-047): a soft "thock" when a shot knocks a fruit and a thud when a dropped one lands,
// through the AudioDirector: a delivered recording under these keys once there is one, else
// these small synths (no download).
import type { AudioDirector, Synth } from '../../audio/AudioDirector';

export const FRUIT_SOUNDS = { thock: 'sfx/fruit_thock', thud: 'sfx/fruit_thud' } as const;
export type FruitSound = keyof typeof FRUIT_SOUNDS;

function knock(hz: number, peak: number, len: number, hiss: number): Synth {
  return (ctx, out, noise) => {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.55, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = hz * 4;
    const n = ctx.createGain();
    n.gain.setValueAtTime(hiss, t);
    n.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.6);
    s.connect(f).connect(n).connect(out);
    s.start(t);
    s.stop(t + len);
    return len + 0.02;
  };
}

const SYNTH: Record<FruitSound, Synth> = {
  // A dull wooden knock on a pod.
  thock: knock(520, 0.18, 0.09, 0.08),
  // A soft low thud in the dust.
  thud: knock(150, 0.3, 0.16, 0.12),
};

export function playFruitSound(audio: AudioDirector, id: FruitSound, pan: number): void {
  audio.playExtra(FRUIT_SOUNDS[id], Math.max(-1, Math.min(1, pan)), SYNTH[id]);
}
