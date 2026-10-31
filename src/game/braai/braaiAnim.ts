// v1.11 (D-068): the braai's pure parts — the story's captions, and its animation as a function of
// the braai clock (animState) applied on change only (applyAnim, ≤ 10 calls a frame). No Phaser:
// BraaiView.ts draws with them, BraaiView.test.ts checks them with stubs.
import type { Feel } from '../../content/schemas';
import { fill, getLanguage, tOr, type Language } from '../../i18n/i18n';
import af from '../../i18n/braai/af.json';
import de from '../../i18n/braai/de.json';
import en from '../../i18n/braai/en.json';
import nl from '../../i18n/braai/nl.json';
import { formatScore } from '../ui/format';
import { braaiFrame, flameFrame, sparkFrame } from './braaiSheet';
import { STORY_LINE_IDS, sayKey, type StoryLine } from './story';

type Tuning = Feel['braai'];

/** The glow's alpha at its base step; the pulse adds ± tuning.fire.glowPulse. */
export const GLOW_BASE = 0.75;

// --- captions ------------------------------------------------------------------------------------

const TABLES: Readonly<Record<Language, Readonly<Record<string, string>>>> = { en, af, de, nl };

/** A story line's caption in `lang`, its numbers filled in. */
export function captionText(line: StoryLine, lang: Language = getLanguage()): string {
  const text = TABLES[lang][line.caption] ?? TABLES.en[line.caption] ?? '';
  const v = line.vars;
  return fill(text, {
    ...(v.n === undefined ? {} : { n: v.n }),
    ...(v.crop === undefined ? {} : { crop: v.crop }),
    ...(v.score === undefined ? {} : { score: formatScore(v.score) }),
    ...(v.gap === undefined ? {} : { gap: formatScore(v.gap) }),
    ...(v.rank === undefined ? {} : { rank: tOr(`rank.${v.rank}`, v.rank) }),
  });
}

/** Every voiced story key (for the voice tool and the tests). */
export const STORY_SAY_KEYS: readonly string[] = STORY_LINE_IDS.map(sayKey);

// --- animation (pure) -----------------------------------------------------------------------------

export type Pose = 'sit_idle' | 'sit_sip' | 'sit_poke' | 'dance_a' | 'dance_b';

export interface AnimState {
  readonly flame: number;
  readonly spark: number;
  /** The glow's pulse step, 0 … 10 (5 = its base). */
  readonly glow: number;
  readonly pose: Pose;
  /** The dance's mirrored step (the other foot). */
  readonly flip: boolean;
  /** The dance's hop (a few px up on the knee-up frames). */
  readonly hop: boolean;
}

export interface AnimOptions {
  readonly reducedMotion: boolean;
  readonly reduceFlashes: boolean;
  /** When the dance starts on the braai clock (null: no dance). */
  readonly danceFrom: number | null;
}

/** What the braai shows at `ms` on its clock. Pure: the same ms, the same picture. */
export function animState(ms: number, t: Tuning, o: AnimOptions): AnimState {
  const flame = Math.floor(ms / t.fire.flameFrameMs) % 4;
  const spark = o.reducedMotion ? 0 : Math.floor(ms / t.fire.sparkFrameMs) % 3;
  const glow = o.reduceFlashes
    ? 5
    : Math.round(5 + 5 * Math.sin((2 * Math.PI * ms) / t.fire.glowPulseMs));
  if (
    !o.reducedMotion &&
    o.danceFrom !== null &&
    ms >= o.danceFrom &&
    ms < o.danceFrom + t.danceMs
  ) {
    const k = Math.floor((ms - o.danceFrom) / t.danceFrameMs) % 4;
    return {
      flame,
      spark,
      glow,
      pose: k % 2 === 0 ? 'dance_a' : 'dance_b',
      flip: k >= 2,
      hop: k % 2 === 0,
    };
  }
  const cycle = t.idle.idleEveryMs + t.idle.poseMs;
  const c = Math.floor(ms / cycle);
  const within = ms - c * cycle;
  const pose: Pose =
    within < t.idle.idleEveryMs ? 'sit_idle' : c % 2 === 0 ? 'sit_sip' : 'sit_poke';
  return { flame, spark, glow, pose, flip: false, hop: false };
}

/** What applyAnim sets (a Phaser image, or a stub in the tests). */
export interface AnimSprite {
  setFrame(frame: string): unknown;
  setOrigin(x: number, y: number): unknown;
  setAlpha(a: number): unknown;
  setVisible(v: boolean): unknown;
  setFlipX(f: boolean): unknown;
  setY(y: number): unknown;
}

export interface AnimTargets {
  readonly flame: AnimSprite | null;
  readonly spark: AnimSprite | null;
  readonly glow: AnimSprite | null;
  readonly oupa: AnimSprite | null;
  readonly poker: AnimSprite | null;
  readonly hat: AnimSprite | null;
  /** Oupa's feet (design px y) and the figures' scale. */
  readonly oupaY: number;
  readonly scale: number;
  readonly glowPulse: number;
}

/** Sets only what changed from `p` to `st`; returns the calls made (≤ 10 a frame). */
export function applyAnim(p: AnimState | null, st: AnimState, t: AnimTargets): number {
  let n = 0;
  if (p?.flame !== st.flame && t.flame !== null) {
    t.flame.setFrame(flameFrame(st.flame));
    n++;
  }
  if (p?.spark !== st.spark && t.spark !== null) {
    t.spark.setFrame(sparkFrame(st.spark));
    n++;
  }
  if (p?.glow !== st.glow && t.glow !== null) {
    t.glow.setAlpha(GLOW_BASE + ((st.glow - 5) / 5) * t.glowPulse);
    n++;
  }
  const oupa = t.oupa;
  if (oupa !== null && (p?.pose !== st.pose || p.flip !== st.flip || p.hop !== st.hop)) {
    const f = braaiFrame(st.pose);
    if (p?.pose !== st.pose && f !== undefined) {
      oupa.setFrame(st.pose);
      oupa.setOrigin(f.ox / f.w, f.oy / f.h);
      n += 2;
    }
    oupa.setFlipX(st.flip);
    oupa.setY(t.oupaY - (st.hop ? 8 * t.scale : 0));
    n += 2;
    const poke = st.pose === 'sit_poke';
    if (p === null || (p.pose === 'sit_poke') !== poke) {
      t.poker?.setVisible(poke);
      n++;
    }
    const sitting = st.pose.startsWith('sit_');
    if (t.hat !== null && (p === null || p.pose.startsWith('sit_') !== sitting)) {
      t.hat.setVisible(sitting);
      n++;
    }
  }
  return n;
}
