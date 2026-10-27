// D-051: the potjie's sounds through the AudioDirector: a soft simmer (single bubbles PotjieView
// plays on sim ticks while the pot is in view, so it stops with the hunt and holds on a held
// frame), the lid's rattle and its clang when it lands. A delivered recording under these keys
// replaces a synth once there is one; until then these small synths cost no download.
import type { AudioDirector, Synth } from '../audio/AudioDirector';

export const POTJIE_SOUNDS = {
  bubble: 'sfx/potjie_bubble',
  rattle: 'sfx/potjie_rattle',
  clang: 'sfx/potjie_clang',
} as const;
export type PotjieSound = keyof typeof POTJIE_SOUNDS;

/** A soft "blop": a short sine that rises (a bubble bursting), very quiet. */
const bubble: Synth = (ctx, out) => {
  const t = ctx.currentTime;
  const len = 0.07;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  const hz = 260 + Math.random() * 180;
  o.frequency.setValueAtTime(hz, t);
  o.frequency.exponentialRampToValueAtTime(hz * 1.9, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.02);
  return len + 0.02;
};

/** Metal on metal: a few inharmonic partials over a burst of filtered noise. */
function metal(partials: readonly number[], peak: number, len: number, hiss: number): Synth {
  return (ctx, out, noise) => {
    const t = ctx.currentTime;
    partials.forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(hz, t);
      const p = peak / (i + 1);
      const l = len * (1 - i * 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + l);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + l + 0.02);
    });
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    const n = ctx.createGain();
    n.gain.setValueAtTime(hiss, t);
    n.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(n).connect(out);
    s.start(t);
    s.stop(t + 0.08);
    return len + 0.03;
  };
}

const SYNTH: Record<PotjieSound, Synth> = {
  bubble,
  // A light clack of the lid on the rim (cast iron: dull, short).
  rattle: metal([1180, 1730, 2510], 0.05, 0.09, 0.05),
  // The lid landing on the ground: a ringing cast-iron clang.
  clang: metal([410, 1013, 1650, 2380], 0.3, 0.9, 0.22),
};

export function playPotjieSound(audio: AudioDirector, id: PotjieSound, pan: number): void {
  audio.playExtra(POTJIE_SOUNDS[id], Math.max(-1, Math.min(1, pan)), SYNTH[id]);
}
