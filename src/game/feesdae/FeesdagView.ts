// D-048: how a special day looks and sounds in the hunt — Halloween's Spookjag: a low moon with
// little bats round it, pumpkin lanterns glowing on rocks and fence posts (warm, small, local;
// a slow flicker, never a flash), the twist's bats and owls, cobwebs on the big props and witch
// hats on some guineafowl. This module (with its sounds) is a lazy chunk, loaded only when a
// special day's hunt starts. Its art is the "feesdae" group's sheet (feesdaeAssets.ts); until
// that arrives (or without an asset index) a stand-in drawn here at the same frame layout shows,
// and the view swaps its images over with setTexture — the stand-in is never removed.
import * as Phaser from 'phaser';
import type { Biome, Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { FeesdagView as FeesdagState, PlaneId, SpookThingView } from '../../sim/types';
import { coreWidth } from '../../sim/world';
import type { FinalSound } from '../assets/AssetManifest';
import { fetchAssetIndex, loadBytes, loadImage } from '../assets/finalLoader';
import type { AudioDirector, Synth } from '../audio/AudioDirector';
import type { HatSource } from '../view/BirdView';
import type { ParallaxView } from '../view/ParallaxView';
import {
  hatFrame,
  HALLOWEEN_SHEET,
  SHEET_H,
  SHEET_MASTER,
  SHEET_W,
  sheetFrames,
  SPOOK_SOUNDS,
  type HalloweenFrame,
  type SpookSound,
} from './feesdaeAssets';
import { drawStandin } from './standin';

export type SpecialLook = Feel['feesdae']['looks'][string];

/** The stand-in's texture key (the delivered sheet takes HALLOWEEN_SHEET itself). */
const STANDIN = `${HALLOWEEN_SHEET}#standin`;
const FILE_TIMEOUT_MS = 15_000;

/** Adds the frame table to a texture (texture px = design px × SHEET_MASTER). */
function addFrames(tex: Phaser.Textures.Texture): void {
  for (const f of sheetFrames()) {
    if (tex.has(f.name)) continue;
    tex.add(
      f.name,
      0,
      f.x * SHEET_MASTER,
      f.y * SHEET_MASTER,
      f.w * SHEET_MASTER,
      f.h * SHEET_MASTER,
    );
  }
}

const ORIGINS = new Map(sheetFrames().map((f) => [f.name, f]));
function setFrame(img: Phaser.GameObjects.Image, key: string, frame: HalloweenFrame): void {
  if (img.texture.key !== key || img.frame.name !== frame) img.setTexture(key, frame);
  const f = ORIGINS.get(frame);
  if (f !== undefined) img.setOrigin(f.ox / f.w, f.oy / f.h);
}

// --- sounds ----------------------------------------------------------------------------------

function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  peak: number,
  at: number,
  len: number,
): void {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.08, len / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}

/** Stand-ins until the recordings arrive (same character, much simpler). */
const SYNTH: Record<SpookSound, Synth> = {
  sting: (ctx, out) => {
    // A minor organ chord that slides down, and a kalimba plink on top.
    for (const [f, p] of [
      [220, 0.12],
      [261.6, 0.1],
      [329.6, 0.09],
      [110, 0.12],
    ] as const) {
      tone(ctx, out, 'sawtooth', f, f * 0.94, p * 0.5, 0, 1.6);
      tone(ctx, out, 'sine', f * 2, f * 1.88, p, 0, 1.6);
    }
    tone(ctx, out, 'sine', 1318, 1310, 0.25, 0.25, 0.5);
    tone(ctx, out, 'sine', 987.8, 985, 0.22, 0.6, 0.6);
    return 1.8;
  },
  hoot: (ctx, out) => {
    tone(ctx, out, 'sine', 420, 380, 0.35, 0, 0.32);
    tone(ctx, out, 'sine', 400, 350, 0.35, 0.42, 0.5);
    return 0.95;
  },
  squeak: (ctx, out) => {
    tone(ctx, out, 'triangle', 5200, 7400, 0.12, 0, 0.05);
    tone(ctx, out, 'triangle', 6100, 4800, 0.1, 0.07, 0.05);
    return 0.14;
  },
  puff: (ctx, out, noise) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    s.connect(f).connect(g).connect(out);
    s.start(t0);
    s.stop(t0 + 0.3);
    return 0.3;
  },
};

export function playSpookSound(audio: AudioDirector, id: SpookSound, pan: number): void {
  audio.playExtra(SPOOK_SOUNDS[id], Math.max(-1, Math.min(1, pan)), SYNTH[id]);
}

let sounds: Promise<void> | null = null;
let sheet: Promise<HTMLImageElement | null> | null = null;

/**
 * The feesdae group's files, in the background: its recordings (all at once) and the sheet.
 * Resolves with the sheet (null if it is not delivered or failed). A load that came back empty
 * is tried again on the next special-day hunt; one that worked is kept for the page.
 */
export function loadFeesdaeAssets(audio: AudioDirector): Promise<HTMLImageElement | null> {
  const index = fetchAssetIndex(FILE_TIMEOUT_MS).then((r) => r.index);
  const format = audio.fileFormat();
  sounds ??= index.then(async (ix) => {
    if (ix === null || format === null) {
      sounds = null;
      return;
    }
    const got = await Promise.all(
      Object.values(SPOOK_SOUNDS).map(async (key): Promise<FinalSound | null> => {
        const entry = ix.audio[key];
        if (entry === undefined) return null;
        const bytes = await loadBytes(entry[format].path, FILE_TIMEOUT_MS);
        return bytes === null ? null : { key, entry, bytes, format };
      }),
    );
    const files = got.filter((f): f is FinalSound => f !== null);
    audio.addRecorded(files);
    if (files.length < Object.keys(SPOOK_SOUNDS).length) sounds = null;
  });
  sheet ??= index.then(async (ix) => {
    const entry = ix?.images[HALLOWEEN_SHEET];
    const img = entry === undefined ? null : await loadImage(entry.file.path, FILE_TIMEOUT_MS);
    if (img === null) sheet = null;
    return img;
  });
  const own = sheet;
  return Promise.all([sounds, own]).then(([, img]) => img);
}

// --- the view ----------------------------------------------------------------------------------

interface Drawn {
  readonly kind: SpookThingView['kind'];
  readonly img: Phaser.GameObjects.Image;
  readonly glow: Phaser.GameObjects.Image | null;
  readonly plane: PlaneId;
}

interface SkyBat {
  readonly img: Phaser.GameObjects.Image;
  readonly r: number;
  readonly period: number;
  readonly phase: number;
}

/** A stable 0..1 hash of a bird id (which guineafowl wear hats). */
function share(id: number): number {
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class FeesdagSceneView {
  private key: string;
  private readonly drawn = new Map<number, Drawn>();
  private readonly moon: Phaser.GameObjects.Image | null;
  private readonly skyBats: SkyBat[] = [];
  private readonly webs: Phaser.GameObjects.Image[] = [];
  private last: FeesdagState | null = null;
  /** Witch hats for the BirdView (cosmetic: picked by bird id). */
  readonly hats: HatSource;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parallax: ParallaxView,
    private readonly look: SpecialLook,
    private readonly planeScale: Readonly<Record<PlaneId, number>>,
    mapBiome: Biome,
    propBox: (asset: string) => {
      w: number;
      h: number;
      ox: number;
      oy: number;
      scale: number;
    } | null,
    decorations: readonly string[],
  ) {
    const textures = scene.textures;
    if (!textures.exists(STANDIN)) {
      const canvas = document.createElement('canvas');
      canvas.width = SHEET_W * SHEET_MASTER;
      canvas.height = SHEET_H * SHEET_MASTER;
      const g = canvas.getContext('2d');
      if (g !== null) drawStandin(g, SHEET_MASTER);
      const tex = textures.addCanvas(STANDIN, canvas);
      if (tex !== null) addFrames(tex);
    }
    this.key = textures.exists(HALLOWEEN_SHEET) ? HALLOWEEN_SHEET : STANDIN;
    const sky = parallax.layer('sky');
    this.moon = null;
    if (decorations.includes('moon') && sky !== undefined) {
      const x = look.moon.u * coreWidth(sky.scrollFactor);
      this.moon = scene.add.image(x, look.moon.y, this.key, 'moon');
      this.moon.setScale(look.moon.scale / SHEET_MASTER);
      sky.fixtures.add(this.moon);
      if (decorations.includes('bats'))
        for (let i = 0; i < look.skyBats.count; i++) {
          const k = (i + 0.5) / Math.max(1, look.skyBats.count);
          const [r0, r1] = look.skyBats.radius;
          const [p0, p1] = look.skyBats.periodMs;
          const img = scene.add.image(x, look.moon.y, this.key, 'skybat_0');
          img.setScale((0.6 + 0.5 * share(i + 17)) / SHEET_MASTER);
          sky.fixtures.add(img);
          this.skyBats.push({
            img,
            r: r0 + (r1 - r0) * share(i + 3),
            period: (p0 + (p1 - p0) * k) / (1000 / 60),
            phase: share(i + 41) * Math.PI * 2,
          });
        }
    }
    if (decorations.includes('cobwebs'))
      for (const w of look.cobwebs) {
        const prop = mapBiome.props.find((p) => p.id === w.prop);
        const layer = prop === undefined ? undefined : parallax.layer(prop.layer);
        const box = prop === undefined ? null : propBox(prop.asset);
        if (prop === undefined || layer === undefined || box === null) continue;
        const px = prop.u * coreWidth(layer.scrollFactor);
        const x = px + (w.at[0] * box.w - box.ox) * box.scale;
        const y = prop.y + (w.at[1] * box.h - box.oy) * box.scale;
        const img = scene.add.image(x, y, this.key, 'cobweb').setOrigin(0, 0);
        img.setScale(((w.flip ? -1 : 1) * w.scale) / SHEET_MASTER, w.scale / SHEET_MASTER);
        img.setAlpha(0.85);
        layer.fixtures.add(img);
        this.webs.push(img);
      }
    const hatsOn = decorations.includes('witchHats');
    this.hats = {
      frameFor: (s) => {
        const frame = hatFrame(s);
        const fs = ORIGINS.get(frame)?.forScale ?? 1;
        return { key: this.key, frame, scale: 1 / (fs * SHEET_MASTER) };
      },
      wears: (id, creature) =>
        hatsOn && creature.startsWith('tarentaal') && share(id) < look.hatShare,
    };
  }

  /** The delivered sheet arrived: every image moves over to it on the next update. */
  useSheet(img: HTMLImageElement): void {
    const textures = this.scene.textures;
    if (!textures.exists(HALLOWEEN_SHEET)) {
      const tex = textures.addImage(HALLOWEEN_SHEET, img);
      if (tex !== null) addFrames(tex);
    }
    if (!textures.exists(HALLOWEEN_SHEET)) return;
    this.key = HALLOWEEN_SHEET;
    if (this.moon !== null) setFrame(this.moon, this.key, 'moon');
    for (const w of this.webs) w.setTexture(this.key, 'cobweb');
  }

  /** Whether the delivered sheet (not the stand-in) is drawn. */
  get final(): boolean {
    return this.key === HALLOWEEN_SHEET;
  }

  /** One frame: the snapshot's things, interpolated between the last two ticks. */
  update(
    state: FeesdagState | undefined,
    prev: FeesdagState | undefined,
    alpha: number,
    tick: number,
  ): void {
    if (state === undefined) return;
    this.last = state;
    const before = new Map((prev?.things ?? []).map((t) => [t.id, t]));
    const seen = new Set<number>();
    for (const t of state.things) {
      seen.add(t.id);
      const p = before.get(t.id);
      const x = p === undefined ? t.x : p.x + (t.x - p.x) * alpha;
      const y = p === undefined ? t.y : p.y + (t.y - p.y) * alpha;
      let d = this.drawn.get(t.id);
      const node = this.parallax.plane(t.plane);
      if (d === undefined) {
        const img = this.scene.add.image(x, y, this.key, 'bat_0');
        const glow =
          t.kind === 'lantern'
            ? this.scene.add.image(x, y, this.key, 'glow').setBlendMode(Phaser.BlendModes.ADD)
            : null;
        if (t.kind === 'lantern') {
          if (glow !== null) node.fixtures.add(glow);
          node.fixtures.add(img);
        } else node.overlay?.add(img);
        d = { kind: t.kind, img, glow, plane: t.plane };
        this.drawn.set(t.id, d);
      }
      const s = this.planeScale[t.plane] / SHEET_MASTER;
      if (t.kind === 'lantern') {
        const base = t.id % 2 === 0 ? 'lantern_post' : 'lantern_rock';
        setFrame(d.img, this.key, `${base}_${t.dark ? 'dark' : 'lit'}` as HalloweenFrame);
        d.img.setPosition(x, y).setScale(s);
        if (d.glow !== null) {
          setFrame(d.glow, this.key, 'glow');
          // A slow, small flicker from the sim tick (still on a held frame, never a flash).
          const g = this.look.glow;
          const period = Math.max(1, g.flickerMs / (1000 / 60));
          const wave = Math.sin(((tick + t.id * 13) / period) * Math.PI * 2);
          // flicker ≤ 0.5 (schema), so the alpha never goes below 0.
          d.glow
            .setPosition(x, y)
            .setScale(s * g.scale)
            .setAlpha(t.dark ? 0 : g.alpha * (1 - g.flicker + g.flicker * wave));
        }
      } else {
        const fps = t.kind === 'bat' ? this.look.batFps : this.look.owlFps;
        const n = Math.floor(((tick + t.id * 7) * fps) / 60) % 4;
        const i = n === 3 ? 1 : n;
        setFrame(d.img, this.key, `${t.kind}_${i}` as HalloweenFrame);
        d.img.setPosition(x, y).setScale(s * t.facing, s);
      }
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      d.img.destroy();
      d.glow?.destroy();
      this.drawn.delete(id);
    }
    // Sky bats circle the moon (sim ticks: still on a held frame).
    if (this.moon !== null)
      for (const [i, b] of this.skyBats.entries()) {
        const a = b.phase + (tick / b.period) * Math.PI * 2;
        setFrame(
          b.img,
          this.key,
          Math.floor((tick + i * 5) / 5) % 2 === 0 ? 'skybat_0' : 'skybat_1',
        );
        b.img.setPosition(this.moon.x + Math.cos(a) * b.r, this.moon.y + Math.sin(a) * b.r * 0.45);
      }
  }

  /** A lantern shot out: a small puff of smoke where it stood (no flash). */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    const half = width / 2;
    for (const e of events) {
      const pan = (plane: PlaneId, x: number): number =>
        (this.parallax.screenX(plane, x) - half) / half;
      if (e.type === 'feesdagStarted') playSpookSound(audio, 'sting', 0);
      else if (e.type === 'spookFlew') {
        if (e.thing === 'owl') playSpookSound(audio, 'hoot', 0);
      } else if (e.type === 'spookHit') {
        if (e.thing === 'owl') playSpookSound(audio, 'hoot', pan(e.plane, e.x));
        else if (e.thing === 'bat') playSpookSound(audio, 'squeak', pan(e.plane, e.x));
        else {
          playSpookSound(audio, 'puff', pan(e.plane, e.x));
          this.puff(e.plane, e.x, e.y);
        }
      }
    }
  }

  private puff(plane: PlaneId, x: number, y: number): void {
    const node = this.parallax.plane(plane);
    const s = this.planeScale[plane] / SHEET_MASTER;
    const img = this.scene.add.image(x, y - 20 * this.planeScale[plane], this.key, 'puff');
    img.setScale(s * 0.6).setAlpha(0.8);
    node.overlay?.add(img);
    this.scene.tweens.add({
      targets: img,
      scale: s * 1.3,
      alpha: 0,
      y: img.y - 60 * this.planeScale[plane],
      duration: 900,
      onComplete: () => {
        img.destroy();
      },
    });
  }

  /** e2e hook: where each thing is on screen (design px) and whether a lantern is dark. */
  spots(): { id: number; kind: string; x: number; y: number; dark: boolean }[] {
    return (this.last?.things ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      x: Math.round(this.parallax.screenX(t.plane, t.x) * 10) / 10,
      y: Math.round(t.y * 10) / 10,
      dark: t.dark,
    }));
  }

  clear(): void {
    for (const d of this.drawn.values()) {
      d.img.destroy();
      d.glow?.destroy();
    }
    this.drawn.clear();
  }
}
