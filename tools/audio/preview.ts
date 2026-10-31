// v1.9 (D-066) `npm run audio:preview`: for the product owner (never shipped, in no build), per
// area a 20-second mix as the game plays it — the ambience bed, the soundscape at the area's main
// light (the real scheduler, seed 42, rates × 2 so 20 s shows more of the set) and the calm music stem, crossfading
// into the Stampede stem for the last 5 s — to docs/audio-preview/<area>.ogg (≤ 200 KB), a
// labelled spectrogram per mix (<area>-spectrogram.png: time × frequency, the calls marked) and
// docs/audio-preview/README.md listing what plays when. Levels follow the game: each sound
// normalised as the pack does (music −16, ambience −20, effects −14 LUFS), the call's level and
// distance (gain + low-pass), its pan, the master headroom (feel.json audio.masterLevel).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { encodeOgg } from '../assets/encode';
import { applyGain, integratedLufs, normaliseGainDb, truePeakDb } from '../assets/loudness';
import { LOUDNESS, TRUE_PEAK_CEILING_DB } from '../assets/targets';
import { loadFeel, loadSoundscape } from '../testContent';
import {
  SoundscapeDirector,
  type CallOutcome,
  type SoundscapeCall,
} from '../../src/game/audio/soundscape';
import { lowpass, type Buf } from './dsp';
import { AMB_RATE, MUSIC_BIOMES, MUSIC_RATE, renderAmbience, renderStem } from './music';
import { renderCall, SOUNDSCAPE_RATE } from './soundscape';

const root = join(import.meta.dirname, '..', '..');
const outDir = join(root, 'docs', 'audio-preview');
const SR = 32000;
const SEC = 20;
const STAMPEDE_AT = 15;
const TPS = 60;
const MAX_BYTES = 200 * 1024;
/** Rates × this in the preview only: 20 s at the game's rates holds just 2–4 calls. */
const PREVIEW_RATE_MUL = 2;

/** Each area's main light (its character) for the preview. */
const MAIN_LIGHT: Readonly<Record<string, string>> = {
  'karoo-autumn': 'golden',
  'bushveld-winter': 'dawn_mist',
  'kalahari-summer': 'midday',
  'okavango-spring': 'dusk',
  namibie: 'dusk',
  oes: 'golden',
};

const sc = loadSoundscape();
const feel = loadFeel();

function normalised(x: Buf, rate: number, lufs: number): Buf {
  const pcm = { sampleRate: rate, channels: [x] };
  const g = normaliseGainDb(pcm, lufs, TRUE_PEAK_CEILING_DB);
  return applyGain(pcm, g).channels[0] ?? x;
}

/** Linear-interpolation resample (a preview, not a mastering tool). */
function resample(x: Buf, from: number, to: number): Buf {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i * from) / to;
    const k = Math.floor(p);
    const f = p - k;
    y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f;
  }
  return y;
}

interface Placed {
  key: string;
  at: number;
  pan: number;
  levelDb: number;
  lowpassHz: number;
  distance: string;
}

/** The soundscape's calls over SEC seconds: the real scheduler with a sink that plays all. */
function schedule(area: string, light: string): Placed[] {
  const boosted = {
    ...sc,
    areas: Object.fromEntries(
      Object.entries(sc.areas).map(([a, l]) => [
        a,
        l.map((e) => ({ ...e, perMinute: e.perMinute * PREVIEW_RATE_MUL })),
      ]),
    ),
  };
  const d = new SoundscapeDirector(boosted);
  d.start({ area, light, hazeDb: 0, seed: 42, title: false, startTick: 0 });
  const out: Placed[] = [];
  const sink = {
    play(c: Readonly<SoundscapeCall>): CallOutcome {
      out.push({
        key: c.key,
        at: c.at / TPS,
        pan: c.pan,
        levelDb: c.levelDb,
        lowpassHz: c.lowpassHz,
        distance: c.distance,
      });
      return 'played';
    },
    quiet: () => false,
  };
  for (let t = 1; t <= SEC * TPS; t++) d.step(t, sink);
  return out;
}

const calls = new Map<string, Buf>();
function callBuf(key: string): Buf {
  let b = calls.get(key);
  if (b === undefined) {
    const raw = renderCall(key.slice('sfx/'.length));
    b = resample(normalised(raw, SOUNDSCAPE_RATE, LOUDNESS.sfx), SOUNDSCAPE_RATE, SR);
    calls.set(key, b);
  }
  return b;
}

/** The area's mix (stereo) and what played. */
function mixArea(area: string, light: string): { l: Buf; r: Buf; placed: Placed[] } {
  const n = SEC * SR;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const add = (x: Buf, at: number, gain: number, pan = 0): void => {
    const a = ((pan + 1) * Math.PI) / 4;
    const gl = gain * Math.cos(a) * Math.SQRT2;
    const gr = gain * Math.sin(a) * Math.SQRT2;
    const o = Math.round(at * SR);
    for (let i = 0; i < x.length && o + i < n; i++) {
      const v = x[i] ?? 0;
      l[o + i] = (l[o + i] ?? 0) + v * gl;
      r[o + i] = (r[o + i] ?? 0) + v * gr;
    }
  };
  const hasMusic = MUSIC_BIOMES.includes(area);
  if (hasMusic) {
    // The ambience bed loops beside the music (the SFX bus).
    const amb = resample(
      normalised(renderAmbience(area), AMB_RATE, LOUDNESS.ambience),
      AMB_RATE,
      SR,
    );
    for (let t = 0; t < SEC; t += amb.length / SR) add(amb, t, 1);
    // All stems start together; the mixer crossfades calm → Stampede (feel.json crossfadeMs).
    const calm = resample(
      normalised(renderStem(area, 'calm'), MUSIC_RATE, LOUDNESS.music),
      MUSIC_RATE,
      SR,
    );
    const stam = resample(
      normalised(renderStem(area, 'stampede'), MUSIC_RATE, LOUDNESS.music),
      MUSIC_RATE,
      SR,
    );
    const fade = feel.audio.crossfadeMs / 1000;
    const len = calm.length;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const k = Math.min(1, Math.max(0, (t - STAMPEDE_AT) / fade));
      const v =
        (calm[i % len] ?? 0) * Math.cos((k * Math.PI) / 2) +
        (stam[i % len] ?? 0) * Math.sin((k * Math.PI) / 2);
      l[i] = (l[i] ?? 0) + v;
      r[i] = (r[i] ?? 0) + v;
    }
  }
  const placed = schedule(area, light);
  for (const p of placed) {
    let x = callBuf(p.key).slice();
    // The game's biquad low-pass ≈ two one-pole stages.
    if (p.lowpassHz > 0) x = lowpass(lowpass(x, SR, p.lowpassHz), SR, p.lowpassHz);
    add(x, p.at, 10 ** (p.levelDb / 20), p.pan * 0.7);
  }
  const m = feel.audio.masterLevel;
  for (let i = 0; i < n; i++) {
    l[i] = (l[i] ?? 0) * m;
    r[i] = (r[i] ?? 0) * m;
  }
  return { l, r, placed };
}

// --- spectrogram ---------------------------------------------------------------------------

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
  }
}

// 5×7 capitals, digits and a few marks for the labels.
const FONT: Readonly<Record<string, string>> = {
  A: '01110100011000111111100011000110001',
  B: '11110100011000111110100011000111110',
  C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110',
  E: '11111100001000011110100001000011111',
  F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111',
  H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100',
  K: '10001100101010011000101001001010001',
  L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001',
  N: '10001110011010110011100011000110001',
  O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101',
  R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110',
  T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100',
  W: '10001100011000110101101011010101010',
  X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100',
  Z: '11111000010001000100010001000011111',
  '0': '01110100011001110101110011000101110',
  '1': '00100011000010000100001000010001110',
  '2': '01110100010000100010001000100011111',
  '3': '11111000100010000010000011000101110',
  '4': '00010001100101010010111110001000010',
  '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110',
  '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110',
  '9': '01110100011000101111000010001001100',
  '-': '00000000000000011111000000000000000',
  '.': '00000000000000000000000000110001100',
  ':': '00000011000110000000011000110000000',
  '/': '00001000010001000100010001000010000',
  '+': '00000001000010011111001000010000000',
  ' ': '00000000000000000000000000000000000',
};

function draw(
  img: PNG,
  s: string,
  x: number,
  y: number,
  rgb: readonly [number, number, number],
  px = 1,
): void {
  const text = s.toUpperCase();
  for (let i = 0; i < text.length; i++) {
    const g = FONT[text.charAt(i)] ?? FONT[' '] ?? '';
    for (let k = 0; k < 35; k++) {
      if (g.charAt(k) !== '1') continue;
      for (let dy = 0; dy < px; dy++)
        for (let dx = 0; dx < px; dx++) {
          const xx = x + (i * 6 + (k % 5)) * px + dx;
          const yy = y + Math.floor(k / 5) * px + dy;
          if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
          const o = (yy * img.width + xx) * 4;
          img.data[o] = rgb[0];
          img.data[o + 1] = rgb[1];
          img.data[o + 2] = rgb[2];
          img.data[o + 3] = 255;
        }
    }
  }
}

/** Dark → purple → orange → pale yellow (a magma-like ramp), t in 0..1. */
function ramp(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0, 4, 4, 18],
    [0.35, 90, 22, 110],
    [0.65, 220, 70, 60],
    [0.85, 252, 160, 60],
    [1, 252, 250, 190],
  ];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (a === undefined || b === undefined || t > b[0]) continue;
    const f = (t - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
  }
  return [252, 250, 190];
}

const short = (key: string): string => {
  const id = key.replace('sfx/amb_', '');
  const names: Record<string, string> = {
    cape_turtle_dove: 'DOVE',
    laughing_dove: 'L.DOVE',
    hadeda: 'HADEDA',
    cicada: 'CICADA',
    fish_eagle: 'F.EAGLE',
    reed_frog: 'FROGS',
    hippo: 'HIPPO',
    wind_gust: 'WIND',
    windpomp: 'WINDPOMP',
    sheep: 'SHEEP',
    barking_gecko: 'GECKOS',
    korhaan: 'KORHAAN',
    francolin: 'FRANCOLIN',
    go_away_bird: 'KWEVOEL',
  };
  return names[id] ?? id.toUpperCase();
};

function spectrogram(
  area: string,
  light: string,
  mono: Buf,
  placed: readonly Placed[],
  music: boolean,
): Buffer {
  const N = 1024;
  const hop = 320;
  const cols = Math.floor((mono.length - N) / hop);
  const maxHz = 12000;
  const bins = Math.round((maxHz / (SR / 2)) * (N / 2));
  const L = 70;
  const T = 44;
  const W = 1000;
  const H = 360;
  const B = 34;
  const img = new PNG({ width: L + W + 12, height: T + H + B });
  img.data.fill(255);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  const db = new Float32Array(cols * bins);
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let top = -Infinity;
  for (let c = 0; c < cols; c++) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (mono[c * hop + i] ?? 0) * (win[i] ?? 0);
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      const v = 10 * Math.log10((re[b] ?? 0) ** 2 + (im[b] ?? 0) ** 2 + 1e-12);
      db[c * bins + b] = v;
      top = Math.max(top, v);
    }
  }
  const range = 80;
  for (let x = 0; x < W; x++) {
    const c = Math.min(cols - 1, Math.floor((x / W) * cols));
    for (let y = 0; y < H; y++) {
      const b = Math.min(bins - 1, Math.floor(((H - 1 - y) / H) * bins));
      const raw = Math.max(0, Math.min(1, ((db[c * bins + b] ?? -200) - (top - range)) / range));
      // 24 colour steps: the PNG stays small enough for the repo.
      const t = Math.round(raw * 24) / 24;
      const [r, g, bl] = ramp(t);
      const o = ((T + y) * img.width + L + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = bl;
    }
  }
  const ink: [number, number, number] = [20, 20, 20];
  draw(
    img,
    `${area}  ${light.replace('_', ' ')}  -  soundscape${music ? ' + calm music, stampede from 15 s' : ' (no music in this area)'}`,
    L,
    8,
    ink,
    2,
  );
  // Frequency axis: 0..12 kHz.
  for (let k = 0; k <= maxHz; k += 2000) {
    const y = T + H - 1 - Math.round((k / maxHz) * (H - 1));
    draw(img, k === 0 ? '0' : `${k / 1000}K`, L - 30, y - 3, ink);
    for (let x = L - 6; x < L; x++) {
      const o = (y * img.width + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 20;
    }
  }
  draw(img, 'HZ', 6, T + H / 2 - 3, ink);
  // Time axis: every 2 s.
  for (let s = 0; s <= SEC; s += 2) {
    const x = L + Math.round((s / SEC) * (W - 1));
    for (let y = T + H; y < T + H + 5; y++) {
      const o = (y * img.width + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 20;
    }
    draw(img, `${s}`, x - 3, T + H + 8, ink);
  }
  draw(img, 'TIME S', L + W / 2 - 18, T + H + 20, ink);
  // The Stampede switch and each call (a white tick at its start, its name above).
  const vline = (
    sec: number,
    rgb: readonly [number, number, number],
    y0: number,
    y1: number,
  ): void => {
    const x = L + Math.round((sec / SEC) * (W - 1));
    for (let y = y0; y < y1; y++) {
      const o = (y * img.width + x) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
    }
  };
  if (music) {
    vline(STAMPEDE_AT, [255, 255, 255], T, T + H);
    draw(img, 'STAMPEDE', L + Math.round((STAMPEDE_AT / SEC) * W) + 4, T + H - 12, [255, 255, 255]);
  }
  placed.forEach((p, i) => {
    vline(p.at, [120, 230, 255], T, T + 14);
    draw(
      img,
      short(p.key),
      Math.min(L + Math.round((p.at / SEC) * W) + 3, img.width - 6 * short(p.key).length - 2),
      T + 2 + (i % 3) * 9,
      [120, 230, 255],
    );
  });
  return PNG.sync.write(img, { colorType: 2, deflateLevel: 9 });
}

// --- run ---------------------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const readme: string[] = [
  '# Audio preview: the veld soundscape and local music (v1.9, D-066)',
  '',
  'Made by `npm run audio:preview` (tools/audio/preview.ts) for review; never shipped, in no build.',
  "Each file is 20 seconds as the game plays it: the area's ambience bed, the soundscape at the",
  "area's main light (the real scheduler, seed 42, the rates in `content/client/soundscape.json`",
  "× 2 so that 20 s shows more of each area's set: the game plays half as many),",
  'and the calm music stem, crossfading into the Stampede stem at 15 s (feel.json `crossfadeMs`).',
  'Levels as in the game: music −16, ambience −20 and effects −14 LUFS before their bus, then',
  "each call's level and distance (far = quieter and low-passed), its pan (±0.7) and the master",
  'headroom. All sounds are interim code-made synths (tools/audio); recordings will replace them',
  '(docs/06-ASSET-DELIVERY.md). In a hunt, calls that sound like a penalty creature (hadeda, fish',
  "eagle, kwêvoël) also go quiet around that creature's own appearance; the preview has none.",
  '',
  'The spectrogram (`<area>-spectrogram.png`) is time × frequency (0–12 kHz, 80 dB range); a blue',
  "tick and name mark each call's start, the white line the switch to the Stampede stem.",
  '',
];
const areas = Object.keys(sc.areas);
for (const area of areas) {
  const light = MAIN_LIGHT[area] ?? sc.defaultLight;
  const { l, r, placed } = mixArea(area, light);
  const pcm = { sampleRate: SR, channels: [l, r] };
  const ogg = await encodeOgg(pcm, 'music');
  if (ogg.length > MAX_BYTES) throw new Error(`${area}.ogg is ${ogg.length} bytes (> 200 KB)`);
  writeFileSync(join(outDir, `${area}.ogg`), ogg);
  const mono = l.map((v, i) => (v + (r[i] ?? 0)) / 2);
  const music = MUSIC_BIOMES.includes(area);
  writeFileSync(
    join(outDir, `${area}-spectrogram.png`),
    spectrogram(area, light, mono, placed, music),
  );
  const lufs = integratedLufs(pcm);
  const peak = truePeakDb(pcm);
  console.log(
    `${area.padEnd(16)} ${light.padEnd(10)} ${placed.length} calls  ${(ogg.length / 1024).toFixed(0)} KB  ${lufs.toFixed(1)} LUFS  ${peak.toFixed(1)} dBTP`,
  );
  readme.push(`## ${area} — ${light.replace('_', ' ')}`, '');
  readme.push(
    `[${area}.ogg](${area}.ogg) · [spectrogram](${area}-spectrogram.png) · ${(ogg.length / 1024).toFixed(0)} KB, ${lufs.toFixed(1)} LUFS, ${peak.toFixed(1)} dBTP`,
    '',
  );
  readme.push(
    music
      ? '- 0–15 s: ambience bed + calm stem (pennywhistle over the mbira); 15–20 s: the Stampede stem (marimba, hand drums over the kit).'
      : '- No music or ambience bed is delivered for this area: the soundscape alone.',
  );
  for (const p of placed)
    readme.push(
      `- ${p.at.toFixed(1)} s: ${p.key} — ${p.distance}, pan ${(p.pan * 0.7).toFixed(2)}, ${p.levelDb.toFixed(0)} dB${p.lowpassHz > 0 ? `, low-pass ${p.lowpassHz} Hz` : ''}`,
    );
  const entries = sc.areas[area] ?? [];
  readme.push('', "The area's set (calls a minute under this light):", '');
  for (const e of entries) {
    const f = sc.profiles[e.profile]?.[light] ?? 0;
    readme.push(`- ${e.call}: ${(e.perMinute * f).toFixed(1)} / min (${e.distance}, ${e.profile})`);
  }
  readme.push('');
}
writeFileSync(join(outDir, 'README.md'), `${readme.join('\n')}\n`);
console.log(`audio:preview — ${areas.length} areas in docs/audio-preview/`);
