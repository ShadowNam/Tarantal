// Music and ambience per biome (M10, art bible §10, Tech §7): three looping stems (calm / build /
// stampede) started together and crossfaded by intensity, plus one ambience loop. A new biome
// fades the old set out while the new one fades in. Missing stems fall back to the next calmer
// one; with nothing delivered there is no music (the synth stings stay). Rendering-side only.
import type { SimState } from '../../sim/types';

export const STEMS = ['calm', 'build', 'stampede'] as const;
export type Stem = (typeof STEMS)[number];

export interface MusicSet {
  readonly stems: Partial<Record<Stem, AudioBuffer>>;
  readonly ambience: AudioBuffer | null;
}

/** The part of BaseAudioContext the mixer uses (a fake implements it in tests). */
export type MixContext = Pick<
  BaseAudioContext,
  'currentTime' | 'createGain' | 'createBufferSource'
>;

export interface MixTiming {
  /** Stem-to-stem crossfade and the old biome's fade-out / new biome's fade-in, in ms. */
  readonly crossfadeMs: number;
  readonly biomeFadeMs: number;
}

/** The stem to use for `want`: it, or the next calmer stem that was delivered. */
export function availableStem(set: MusicSet, want: Stem): Stem | null {
  for (let i = STEMS.indexOf(want); i >= 0; i--) {
    const s = STEMS[i];
    if (s !== undefined && set.stems[s] !== undefined) return s;
  }
  return null;
}

/** Ramps a gain from its current value to `to` over `ms`. */
function ramp(ctx: MixContext, g: GainNode, to: number, ms: number): void {
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(to, now + ms / 1000);
}

interface Playing {
  readonly id: string;
  readonly set: MusicSet;
  readonly sources: AudioBufferSourceNode[];
  readonly stemGain: Partial<Record<Stem, GainNode>>;
  readonly setGain: GainNode;
  readonly ambGain: GainNode | null;
}

export class MusicMixer {
  private playing: Playing | null = null;
  private stem: Stem = 'calm';

  constructor(
    private readonly ctx: MixContext,
    private readonly musicOut: AudioNode,
    private readonly ambienceOut: AudioNode,
    private readonly timing: MixTiming,
  ) {}

  /** What plays now (test hook and tests): biome id and audible stem, or null. */
  get state(): { id: string; stem: Stem | null } | null {
    const p = this.playing;
    return p === null ? null : { id: p.id, stem: availableStem(p.set, this.stem) };
  }

  /**
   * Plays a biome's set (`id` names it; the same id and stems again is a no-op). The previous set
   * fades out over biomeFadeMs and is stopped; the new one fades in.
   */
  play(id: string, set: MusicSet): void {
    const p = this.playing;
    if (p !== null && p.id === id && sameSet(p.set, set)) return;
    this.fadeOutAndStop(p);
    const empty = STEMS.every((s) => set.stems[s] === undefined) && set.ambience === null;
    if (empty) {
      this.playing = null;
      return;
    }
    const setGain = this.ctx.createGain();
    setGain.gain.value = 0;
    setGain.connect(this.musicOut);
    const sources: AudioBufferSourceNode[] = [];
    const stemGain: Partial<Record<Stem, GainNode>> = {};
    const audible = availableStem(set, this.stem);
    for (const s of STEMS) {
      const buf = set.stems[s];
      if (buf === undefined) continue;
      const g = this.ctx.createGain();
      g.gain.value = s === audible ? 1 : 0;
      g.connect(setGain);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g);
      sources.push(src);
      stemGain[s] = g;
    }
    let ambGain: GainNode | null = null;
    if (set.ambience !== null) {
      ambGain = this.ctx.createGain();
      ambGain.gain.value = 0;
      ambGain.connect(this.ambienceOut);
      const src = this.ctx.createBufferSource();
      src.buffer = set.ambience;
      src.loop = true;
      src.connect(ambGain);
      sources.push(src);
    }
    // Stems start on the same tick so they stay in sync while they loop.
    const at = this.ctx.currentTime;
    for (const src of sources) src.start(at);
    ramp(this.ctx, setGain, 1, this.timing.biomeFadeMs);
    if (ambGain !== null) ramp(this.ctx, ambGain, 1, this.timing.biomeFadeMs);
    this.playing = { id, set, sources, stemGain, setGain, ambGain };
  }

  /** Crossfades to the stem for `want` (or its calmer fallback). */
  setStem(want: Stem): void {
    if (want === this.stem) return;
    this.stem = want;
    const p = this.playing;
    if (p === null) return;
    const audible = availableStem(p.set, want);
    for (const s of STEMS) {
      const g = p.stemGain[s];
      if (g !== undefined) ramp(this.ctx, g, s === audible ? 1 : 0, this.timing.crossfadeMs);
    }
  }

  stop(): void {
    this.fadeOutAndStop(this.playing);
    this.playing = null;
  }

  private fadeOutAndStop(p: Playing | null): void {
    if (p === null) return;
    ramp(this.ctx, p.setGain, 0, this.timing.biomeFadeMs);
    if (p.ambGain !== null) ramp(this.ctx, p.ambGain, 0, this.timing.biomeFadeMs);
    const end = this.ctx.currentTime + this.timing.biomeFadeMs / 1000;
    for (const src of p.sources) src.stop(end);
  }
}

function sameSet(a: MusicSet, b: MusicSet): boolean {
  return a.ambience === b.ambience && STEMS.every((s) => a.stems[s] === b.stems[s]);
}

export interface IntensityRules {
  /** Frenzy multiplier at or above which the build stem plays. */
  readonly buildAtFrenzy: number;
}

/**
 * The stem a moment calls for: no hunt → calm; the Stampede → stampede; a fleeing flock (run or
 * flush) or a Frenzy at `buildAtFrenzy` → build; otherwise calm.
 */
export function stemFor(state: SimState | null, rules: IntensityRules): Stem {
  if (state === null) return 'calm';
  if (state.stampedeActive) return 'stampede';
  if (state.frenzyMul >= rules.buildAtFrenzy) return 'build';
  if (state.flocks.some((f) => f.state === 'run' || f.state === 'flush')) return 'build';
  return 'calm';
}

/**
 * Rising intensity switches at once; falling back waits until the current stem has played for
 * `holdMs`, so a short lull doesn't make the music flutter.
 */
export class StemHold {
  private current: Stem = 'calm';
  private since = -Infinity;

  constructor(private readonly holdMs: number) {}

  next(want: Stem, nowMs: number): Stem {
    const rank = STEMS.indexOf(want) - STEMS.indexOf(this.current);
    if (rank >= 0) {
      // Rising switches at once; staying (or rising) restarts the hold, so calming waits until
      // the moment has been calmer for holdMs — not just since the last change.
      this.current = want;
      this.since = nowMs;
    } else if (nowMs - this.since >= this.holdMs) {
      this.current = want;
      this.since = nowMs;
    }
    return this.current;
  }

  /** Back to calm with no hold (a new hunt). */
  reset(): void {
    this.current = 'calm';
    this.since = -Infinity;
  }
}
