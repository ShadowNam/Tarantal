// v1.12 (D-069, GDD §11.3f, art bible §5.6) Brakkie on screen — a lazy chunk (not in the first
// download): his files (the sheet, its HD twin, his barks, yelp and panting), the hunt's view and
// the title's wag.
//
// Texture memory (lessons 29, 38, 40): his one sheet (v1.17: 0.875 MiB Standard, 3.5 MiB HD twin) becomes a
// texture when a hunt (or the title) first draws him and is removed when it ends — before the
// tally opens, so the hunt → braai hand-over carries none of it. The HD twin is used only while the
// textures in use leave room for it under the budget (feel.brakkie.hd); otherwise the Standard.
//
// Phones (lessons 32–33): one image for him and one for the bird he carries; every property set
// only when it changes (frames are baked, so a frame swap is one call), nothing allocated a frame,
// hidden off screen; his own timer (lastMs → the hook's brakkieMs). Everything runs on sim time
// from the snapshot, so a held frame (?holdAt) holds him.
import type * as Phaser from 'phaser';
// v1.17 (D-079): the wind's near grass and HUD meter ride in this lazy chunk.
export { WindGrassView, drawWindMeter } from '../view/wind/WindGrassView';
import type { Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { BrakkieView as SimDog, SimState } from '../../sim/types';
import type { FinalSound } from '../assets/AssetManifest';
import type { AssetIndex } from '../assets/assetIndex';
import { HD_INDEX_PATH } from '../assets/assetIndex';
import { fetchAssetIndex, loadBytes, loadImage } from '../assets/finalLoader';
import { parseHdIndex } from '../assets/hdIndex';
import { textureBytes } from '../assets/textureBytes';
import type { AudioDirector } from '../audio/AudioDirector';
import { designSize } from '../layout';
import { setFootOrigin } from '../view/footOrigin';
import type { ParallaxView } from '../view/ParallaxView';
import { crossEase, dogFrame, wagFrame } from './brakkieAnim';
import { BRAKKIE_SHEET, BRAKKIE_SOUNDS } from './brakkieKeys';
import {
  MOUTH,
  brakkieFrame,
  brakkieFrames,
  brakkieTexelsPerPx,
  type BrakkieFrame,
} from './brakkieSheet';

export { dogFrame, wagFrame } from './brakkieAnim';

type Tuning = Feel['brakkie'];

// --- files ---------------------------------------------------------------------------------------

const FILE_TIMEOUT_MS = 15_000;
let standard: HTMLImageElement | null = null;
let hdImage: HTMLImageElement | null = null;
let standardLoad: Promise<void> | null = null;
let hdLoad: Promise<void> | null = null;
let soundLoad: Promise<void> | null = null;

/**
 * Starts (or joins) loading his files: the Standard sheet always (the fallback when HD doesn't
 * fit), the HD twin when HD is chosen, and his sounds. The delivery switch (lesson 35): no index,
 * or an index without his files, loads nothing; an index without audio loads no sound. A failed
 * file is tried again next time.
 */
export function loadBrakkieAssets(audio: AudioDirector, hd: boolean): void {
  if (standardLoad !== null && (!hd || hdLoad !== null) && soundLoad !== null) return;
  const index = fetchAssetIndex(FILE_TIMEOUT_MS).then((r) => r.index);
  standardLoad ??= index.then(async (ix) => {
    const e = ix?.images[BRAKKIE_SHEET];
    const img = e === undefined ? null : await loadImage(e.file.path, FILE_TIMEOUT_MS);
    if (img === null) standardLoad = null;
    else standard = img;
  });
  if (hd)
    hdLoad ??= index.then(async (ix) => {
      if (ix?.images[BRAKKIE_SHEET] === undefined) {
        hdLoad = null;
        return;
      }
      const h = await fetch(HD_INDEX_PATH, { cache: 'no-cache' })
        .then(async (res) => (res.ok ? parseHdIndex(await res.json()) : null))
        .catch(() => null);
      const e = h?.images[BRAKKIE_SHEET];
      const img = e === undefined ? null : await loadImage(e.file.path, FILE_TIMEOUT_MS);
      if (img === null) hdLoad = null;
      else hdImage = img;
    });
  const format = audio.fileFormat();
  soundLoad ??= index.then(async (ix) => {
    if (ix === null || format === null || Object.keys(ix.audio).length === 0) {
      soundLoad = null;
      return;
    }
    const want = Object.values(BRAKKIE_SOUNDS).flatMap((k) => {
      const e = ix.audio[k];
      return e === undefined ? [] : [[k, e] as [string, AssetIndex['audio'][string]]];
    });
    if (want.length === 0) {
      soundLoad = null;
      return;
    }
    const got = await Promise.all(
      want.map(async ([key, entry]): Promise<FinalSound | null> => {
        const bytes = await loadBytes(entry[format].path, FILE_TIMEOUT_MS);
        return bytes === null ? null : { key, entry, bytes, format };
      }),
    );
    const files = got.filter((f): f is FinalSound => f !== null);
    audio.addRecorded(files);
    if (files.length !== want.length) soundLoad = null;
  });
}

/** His Standard sheet has arrived (the HD twin may follow). */
export function brakkieSheetIn(): boolean {
  return standard !== null;
}

/** Tests: images as if they had arrived. */
export function setBrakkieImagesForTest(
  std: HTMLImageElement | null,
  hd: HTMLImageElement | null,
): void {
  standard = std;
  hdImage = hd;
}

/** Tests: forget what was loaded. */
export function resetBrakkieFiles(): void {
  standard = null;
  hdImage = null;
  standardLoad = null;
  hdLoad = null;
  soundLoad = null;
}

/**
 * Puts his sheet under BRAKKIE_SHEET if it isn't there yet: the HD twin when HD is chosen and it
 * fits the texture budget with what is in use now (lesson 29), else the Standard. Returns the
 * texels per design px of the sheet under the key (null: nothing has arrived).
 */
export function ensureBrakkieTexture(
  textures: Phaser.Textures.TextureManager,
  hd: boolean,
  budgetBytes: number,
): { readonly k: number; readonly sheet: 'standard' | 'hd' } | null {
  if (textures.exists(BRAKKIE_SHEET)) {
    const k = brakkieTexelsPerPx(textures.get(BRAKKIE_SHEET).getSourceImage().width);
    return { k, sheet: k > 1 ? 'hd' : 'standard' };
  }
  if (standard === null) return null;
  const useHd =
    hd &&
    hdImage !== null &&
    textureBytes(textures) + hdImage.width * hdImage.height * 4 <= budgetBytes;
  // Safe: standard is non-null (checked above); hdImage when useHd.
  const img = (useHd ? hdImage : standard) as HTMLImageElement;
  const tex = textures.addImage(BRAKKIE_SHEET, img);
  if (tex === null) return null;
  const k = brakkieTexelsPerPx(img.width);
  for (const f of brakkieFrames()) {
    const fr = tex.add(
      f.name,
      0,
      f.x * k,
      f.y * k,
      Math.ceil(f.w * f.res) * k,
      Math.ceil(f.h * f.res) * k,
    );
    if (fr === null) continue;
    fr.customPivot = true;
    fr.pivotX = f.ox / f.w;
    fr.pivotY = f.oy / f.h;
  }
  return { k, sheet: useHd ? 'hd' : 'standard' };
}

/** Takes his sheet out of the texture manager (nothing may draw it any more: the views that did
 *  are destroyed first). */
export function releaseBrakkieTexture(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(BRAKKIE_SHEET)) textures.remove(BRAKKIE_SHEET);
}

// --- the hunt's view -----------------------------------------------------------------------------

/** Off-screen margin (design px) before he is hidden. */
const CULL_PX = 200;
const SHEET_POLL_FRAMES = 30;

/** e2e: Brakkie as drawn this frame. */
export interface BrakkieHook {
  present: boolean;
  phase: string;
  pose: string;
  plane: string;
  frame: string | null;
  visible: boolean;
  /** His feet on screen (design px), and the ground line he stands on there. */
  x: number;
  y: number;
  groundY: number;
  facing: number;
  carrying: boolean;
  bird: boolean;
  sheet: 'standard' | 'hd' | null;
  /** Phaser calls the last frame made (perf: his share of the ≈ 40 a frame). */
  calls: number;
  /** The sim's counts. */
  fetches: number;
  barks: number;
  flushes: number;
  hits: number;
  /** v1.17 (D-079): the point's marker as drawn (screen design px; null: none shown). */
  marker: { x: number; y: number } | null;
  /** v1.17: the word over him now ("Staan!", "Hier!" …; null: none), the Bring streak, the
   *  reaction playing and the sim's companion counts. */
  word: string | null;
  streak: number;
  bestStreak: number;
  react: string | null;
  whistle: string | null;
  points: number;
  goodPoints: number;
  reactions: number;
  whistles: number;
}

/** v1.17 (D-079): the command words shown over him (the lazy guide tables, from the scene: ''
 *  while they are not in yet — then no word). */
export interface BrakkieWords {
  readonly word: (key: 'point' | 'spring' | 'heel' | 'seek') => string;
  /** The game's font family. */
  readonly font: string;
}

/** How long a word stays up over him (sim ticks: a held tick holds it). */
const WORD_TICKS = 84;
/** The marker's tuft rustles one way, then the other, every this many ticks. */
const RUSTLE_TICKS = 6;

export interface BrakkieViewSetup {
  readonly scene: Phaser.Scene;
  readonly parallax: ParallaxView;
  readonly now: () => number;
  readonly tuning: Tuning;
  readonly hd: boolean;
  /** The e2e hooks are on (else no hook object is kept up to date). */
  readonly hooks: boolean;
  /** v1.17 (D-079): the words over him; "reduce motion" keeps the marker still. */
  readonly words?: BrakkieWords;
  readonly reducedMotion?: boolean;
}

export class BrakkieView {
  private readonly img: Phaser.GameObjects.Image;
  private readonly bird: Phaser.GameObjects.Image;
  /** v1.17 (D-079): the pointed flock's marker (its own layer: the mid plane's fixtures). */
  private readonly marker: Phaser.GameObjects.Image;
  private markerLayer: string | null = null;
  private markerShown = false;
  private markerScale = NaN;
  private markerX = NaN;
  private markerY = NaN;
  private markerRot = NaN;
  /** v1.17: the word over him and until when (sim tick). */
  private readonly word: Phaser.GameObjects.Text;
  private wordText: string | null = null;
  private wordUntil = -1;
  private layerId: string | null = null;
  private k = 1;
  private sheet: 'standard' | 'hd' | null = null;
  private waitFrames = 0;
  // What is set now (set only on change).
  private frame: BrakkieFrame | null = null;
  private shown = false;
  private birdShown = false;
  private flip = false;
  private x = NaN;
  private y = NaN;
  private scale = NaN;
  private tint = 0xffffff;
  private calls = 0;
  /** The bark alternates its two recordings. */
  private barkSecond = false;
  /** He went home with a bird: he pants when he's back. */
  private fetchedHome = false;
  /** Milliseconds the last update took (perf.spec: brakkieMs). */
  lastMs = 0;
  readonly hook: BrakkieHook = {
    present: false,
    phase: 'away',
    pose: 'sit',
    plane: 'near',
    frame: null,
    visible: false,
    x: 0,
    y: 0,
    groundY: 0,
    facing: 1,
    carrying: false,
    bird: false,
    sheet: null,
    calls: 0,
    fetches: 0,
    barks: 0,
    flushes: 0,
    hits: 0,
    marker: null,
    word: null,
    streak: 0,
    bestStreak: 0,
    react: null,
    whistle: null,
    points: 0,
    goodPoints: 0,
    reactions: 0,
    whistles: 0,
  };

  constructor(private readonly s: BrakkieViewSetup) {
    // Built hidden on the sheet's key (a placeholder until the sheet is in: never shown so).
    this.img = s.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.bird = s.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.marker = s.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.word = s.scene.add
      .text(0, 0, '', {
        fontFamily: s.words?.font ?? 'sans-serif',
        fontSize: '34px',
        fontStyle: '900',
        color: '#FFF3D6',
        stroke: '#1C130F',
        strokeThickness: 7,
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    // e2e only (test hooks on): hide him, so a spec can grab the same held tick with and without
    // him and find his drawn pixels (lessons 14 and 22: real pixels, the centroid on his shape).
    if (s.hooks && typeof window !== 'undefined')
      (window as { __TM_BRAKKIE_HIDE__?: (on: boolean | 'bird') => void }).__TM_BRAKKIE_HIDE__ = (
        on,
      ) => {
        // 'bird': only the bird he carries (the e2e measures his own body without it).
        this.hidden = on === true;
        this.birdHidden = on === 'bird';
        this.x = NaN;
      };
  }

  /** e2e only: hidden, or only his bird hidden (__TM_BRAKKIE_HIDE__). */
  private hidden = false;
  private birdHidden = false;

  /** The sheet under the key (polled every SHEET_POLL_FRAMES frames until it arrives). */
  private sheetReady(): boolean {
    if (this.sheet !== null) return true;
    if (this.waitFrames++ % SHEET_POLL_FRAMES !== 0) return false;
    const budget = (this.s.tuning.hd.budgetMiB - this.s.tuning.hd.headroomMiB) * 1024 * 1024;
    const t = ensureBrakkieTexture(this.s.scene.textures, this.s.hd, budget);
    if (t === null) return false;
    this.k = t.k;
    this.sheet = t.sheet;
    this.img.setTexture(BRAKKIE_SHEET, 'sit');
    this.bird.setTexture(BRAKKIE_SHEET, 'bird');
    this.marker.setTexture(BRAKKIE_SHEET, 'marker');
    setFootOrigin(this.bird, false);
    setFootOrigin(this.marker, false);
    this.frame = 'sit';
    this.calls += 4;
    return true;
  }

  private hide(): void {
    if (this.word.visible) {
      this.word.setVisible(false);
      this.calls++;
    }
    if (this.shown) {
      this.img.setVisible(false);
      this.shown = false;
      this.calls++;
    }
    if (this.birdShown) {
      this.bird.setVisible(false);
      this.birdShown = false;
      this.calls++;
    }
  }

  /** Moves both images into a layer's fixtures (above its props, below its birds). */
  private moveTo(layerId: string): boolean {
    if (layerId === this.layerId) return true;
    const layer = this.s.parallax.layer(layerId);
    if (layer === undefined) return false;
    layer.fixtures.add(this.img);
    layer.fixtures.add(this.bird);
    layer.fixtures.add(this.word);
    this.layerId = layerId;
    const tint = this.s.parallax.layerTint(layerId);
    if (tint !== this.tint) {
      if (tint === 0xffffff) {
        this.img.clearTint();
        this.bird.clearTint();
      } else {
        this.img.setTint(tint);
        this.bird.setTint(tint);
      }
      this.tint = tint;
    }
    this.calls += 4;
    return true;
  }

  /** Draws him at this tick. */
  update(state: SimState): void {
    const t0 = this.s.now();
    this.calls = 0;
    const d = state.brakkie;
    const frame = d === null ? null : dogFrame(d);
    if (d === null || frame === null || this.hidden || !this.sheetReady()) {
      this.hide();
      if (this.markerShown) {
        this.marker.setVisible(false);
        this.markerShown = false;
      }
      if (d !== null) this.fillHook(d, null, false, 0, 0, 0);
      this.hook.calls = this.calls;
      this.lastMs = this.s.now() - t0;
      return;
    }
    // Where he is on the layer he's drawn in (a crossing: in the near layer, between the points).
    let layerId = d.layerId;
    let x = d.x;
    let y = d.y;
    let scale = d.scale;
    const c = d.cross;
    if (c !== null) {
      const near = this.s.parallax.layer(c.from === 'near' ? c.fromLayerId : c.toLayerId);
      const far = this.s.parallax.layer(c.from === 'near' ? c.toLayerId : c.fromLayerId);
      if (near !== undefined && far !== undefined) {
        layerId = near.id;
        // The mid point in the near layer's coordinates (through the screen).
        const toNearX = (lx: number): number =>
          (far.root.x + lx * far.root.scaleX - near.root.x) / near.root.scaleX;
        const toNearY = (ly: number): number =>
          (far.root.y + ly * far.root.scaleY - near.root.y) / near.root.scaleY;
        const fx = c.from === 'near' ? c.fromX : toNearX(c.fromX);
        const fy = c.from === 'near' ? c.fromY : toNearY(c.fromY);
        const tx = c.to === 'near' ? c.toX : toNearX(c.toX);
        const ty = c.to === 'near' ? c.toY : toNearY(c.toY);
        const p = crossEase(c.p);
        x = fx + (tx - fx) * p;
        y = fy + (ty - fy) * p;
        const fs =
          c.from === 'near' ? c.fromScale : c.fromScale * (far.root.scaleX / near.root.scaleX);
        const ts = c.to === 'near' ? c.toScale : c.toScale * (far.root.scaleX / near.root.scaleX);
        scale = fs + (ts - fs) * p;
      }
    }
    if (!this.moveTo(layerId)) {
      this.hide();
      this.lastMs = this.s.now() - t0;
      return;
    }
    // Hidden off screen.
    const layer = this.s.parallax.layer(layerId);
    const sx = layer === undefined ? 0 : layer.root.x + x * layer.root.scaleX;
    const w = designSize().width;
    const onScreen = sx > -CULL_PX && sx < w + CULL_PX;
    if (!onScreen) {
      this.hide();
      this.drawMarker(d);
      this.fillHook(d, null, false, x, y, d.y);
      this.hook.calls = this.calls;
      this.lastMs = this.s.now() - t0;
      return;
    }
    if (!this.shown) {
      this.img.setVisible(true);
      this.shown = true;
      this.calls++;
    }
    const flip = d.facing < 0;
    if (frame !== this.frame) {
      this.img.setFrame(frame);
      this.frame = frame;
      setFootOrigin(this.img, flip);
      this.calls += 2;
    }
    if (flip !== this.flip) {
      this.img.setFlipX(flip);
      this.bird.setFlipX(flip);
      this.flip = flip;
      setFootOrigin(this.img, flip);
      setFootOrigin(this.bird, flip);
      this.calls += 4;
    }
    const res = brakkieFrame(frame).res;
    const sc = scale / (res * this.k);
    if (sc !== this.scale) {
      this.img.setScale(sc);
      // v1.17b (D-080): the bird keeps its own size when he grows (brakkie.sizeMul), at its own
      // frame's sheet resolution (his frames are drawn finer).
      this.bird.setScale(scale / d.sizeMul / (brakkieFrame('bird').res * this.k));
      this.scale = sc;
      this.calls += 2;
    }
    if (x !== this.x || y !== this.y) {
      this.img.setPosition(x, y);
      this.x = x;
      this.y = y;
      this.calls++;
    }
    // The bird in his mouth (the running frames only).
    const carry =
      d.carrying &&
      !this.birdHidden &&
      (frame === 'run_a' || frame === 'run_b' || frame === 'run_c' || frame === 'run_d');
    if (carry !== this.birdShown) {
      this.bird.setVisible(carry);
      this.birdShown = carry;
      this.calls++;
    }
    if (carry) {
      const m = MOUTH[frame];
      this.bird.setPosition(x + m.x * scale * d.facing, y + m.y * scale);
      this.calls++;
    }
    this.drawWord(state.tick, x, y, scale);
    this.drawMarker(d);
    this.fillHook(d, frame, true, x, y, d.cross === null ? d.y : y);
    this.hook.calls = this.calls;
    this.lastMs = this.s.now() - t0;
  }

  /** v1.17 (D-079): the word over his head, up WORD_TICKS sim ticks after the event. */
  private drawWord(tick: number, x: number, y: number, scale: number): void {
    const on = this.wordText !== null && tick <= this.wordUntil;
    if (on !== this.word.visible) {
      this.word.setVisible(on);
      this.calls++;
    }
    if (!on) return;
    const wx = x;
    const wy = y - 200 * scale;
    if (this.word.x !== wx || this.word.y !== wy) {
      this.word.setPosition(wx, wy).setScale(Math.max(0.6, scale));
      this.calls += 2;
    }
  }

  /** v1.17 (D-079): the marker where the pointed flock sits (a rustling tuft and a chevron). */
  private drawMarker(d: SimDog): void {
    const p = d.point;
    if (p === null) {
      if (this.markerShown) {
        this.marker.setVisible(false);
        this.markerShown = false;
        this.calls++;
      }
      return;
    }
    if (p.layerId !== this.markerLayer) {
      const layer = this.s.parallax.layer(p.layerId);
      if (layer === undefined) return;
      layer.fixtures.add(this.marker);
      this.markerLayer = p.layerId;
      const tint = this.s.parallax.layerTint(p.layerId);
      if (tint === 0xffffff) this.marker.clearTint();
      else this.marker.setTint(tint);
    }
    if (!this.markerShown) {
      this.marker.setVisible(true);
      this.markerShown = true;
      this.calls++;
    }
    const res = brakkieFrame('marker').res;
    // Drawn at near-plane size × the mid plane's (his own scale there), a little larger to read.
    const sc = (p.scale * 1.4) / (res * this.k);
    if (sc !== this.markerScale) {
      this.marker.setScale(sc);
      this.markerScale = sc;
      this.calls++;
    }
    if (p.x !== this.markerX || p.y !== this.markerY) {
      this.marker.setPosition(p.x, p.y);
      this.markerX = p.x;
      this.markerY = p.y;
      this.calls++;
    }
    // The grass rustles every few ticks (still with "reduce motion").
    const rot =
      this.s.reducedMotion === true
        ? 0
        : (Math.floor(d.t / RUSTLE_TICKS) % 2 === 0 ? 1 : -1) * 0.08;
    if (rot !== this.markerRot) {
      this.marker.setRotation(rot);
      this.markerRot = rot;
      this.calls++;
    }
  }

  /** The e2e hook (kept only with the hooks on: no work otherwise). */
  private fillHook(
    d: SimDog,
    frame: BrakkieFrame | null,
    visible: boolean,
    x: number,
    y: number,
    groundY: number,
  ): void {
    if (!this.s.hooks) return;
    const h = this.hook;
    const layer = this.layerId === null ? undefined : this.s.parallax.layer(this.layerId);
    h.present = d.present;
    h.phase = d.phase;
    h.pose = d.pose;
    h.plane = d.cross === null ? d.plane : 'cross';
    h.frame = frame;
    h.visible = visible;
    h.facing = d.facing;
    h.carrying = d.carrying;
    h.bird = this.birdShown;
    h.sheet = this.sheet;
    h.fetches = d.fetches;
    h.barks = d.barks;
    h.flushes = d.flushes;
    h.hits = d.hits;
    h.streak = d.streak;
    h.bestStreak = d.bestStreak;
    h.react = d.react;
    h.whistle = d.whistle;
    h.points = d.points;
    h.goodPoints = d.goodPoints;
    h.reactions = d.reactions;
    h.whistles = d.whistles;
    h.word = this.word.visible ? this.wordText : null;
    const ml = this.markerLayer === null ? undefined : this.s.parallax.layer(this.markerLayer);
    h.marker =
      this.markerShown && ml !== undefined && d.point !== null
        ? {
            x: Math.round(ml.root.x + d.point.x * ml.root.scaleX),
            y: Math.round(ml.root.y + d.point.y * ml.root.scaleY),
          }
        : null;
    if (layer !== undefined) {
      h.x = Math.round(layer.root.x + x * layer.root.scaleX);
      h.y = Math.round(layer.root.y + y * layer.root.scaleY);
      h.groundY = Math.round(layer.root.y + groundY * layer.root.scaleY);
    }
  }

  /** His sounds: a bark, the flush's double bark, the yelp, panting when he's back from a fetch.
   *  Only once his sheet is in (he isn't drawn before: no bark from nowhere). */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    if (this.sheet === null) return;
    for (const e of events) {
      let key: string | null = null;
      if (e.type === 'brakkieBarked') {
        key = this.barkSecond ? BRAKKIE_SOUNDS.bark2 : BRAKKIE_SOUNDS.bark;
        this.barkSecond = !this.barkSecond;
      } else if (e.type === 'brakkieFlushed') key = BRAKKIE_SOUNDS.bark2;
      else if (e.type === 'brakkieHit') key = BRAKKIE_SOUNDS.yelp;
      else if (e.type === 'brakkieFetched') {
        this.fetchedHome = true;
        // v1.17 (D-079): a happy yap as he delivers ("Bring!"); he's off screen at the bakkie,
        // so it comes from the bakkie's side.
        audio.playExtra(BRAKKIE_SOUNDS.yap, 0, () => 0, 1, -4);
      } else if (e.type === 'brakkiePointed') this.say(this.s.words?.word('point'), e.tick);
      else if (e.type === 'brakkieWhistled') {
        audio.playExtra(BRAKKIE_SOUNDS.whistle, 0, () => 0, 1, -2);
        this.say(this.s.words?.word(e.action), e.tick);
      } else if (e.type === 'brakkieReacted' && e.kind === 'proud') key = BRAKKIE_SOUNDS.bark2;
      else if (e.type === 'brakkieArrived' && this.fetchedHome) {
        this.fetchedHome = false;
        key = BRAKKIE_SOUNDS.pant;
      }
      if (key !== null) audio.playExtra(key, this.pan(width), () => 0);
    }
  }

  /** v1.17: a word over him for WORD_TICKS. */
  private say(text: string | undefined, tick: number): void {
    if (text === undefined || text === '') return;
    if (text !== this.wordText) this.word.setText(text);
    this.wordText = text;
    this.wordUntil = tick + WORD_TICKS;
  }

  private pan(width: number): number {
    if (!this.shown || this.layerId === null) return 0;
    const layer = this.s.parallax.layer(this.layerId);
    if (layer === undefined) return 0;
    const sx = layer.root.x + this.x * layer.root.scaleX;
    return Math.max(-1, Math.min(1, (sx - width / 2) / (width / 2)));
  }

  /** Gone with the hunt: both images and his sheet (before the tally opens, lesson 40). */
  destroy(): void {
    this.img.destroy();
    this.bird.destroy();
    this.marker.destroy();
    this.word.destroy();
    releaseBrakkieTexture(this.s.scene.textures);
    this.sheet = null;
  }
}

// --- the whistle button (v1.17, D-079) ------------------------------------------------------------

// The last drawn look per Graphics: the HUD scene makes a new Graphics each hunt, so a key kept for
// the module would skip drawing the new one.
const whistleKeys = new WeakMap<Phaser.GameObjects.Graphics, string>();

/**
 * The HUD's round 72-px whistle button (touch; `r` null on a mouse or without a layout), drawn by
 * this lazy chunk: shown while Brakkie is out, dimmed while the whistle would do nothing, a whistle
 * on it; redrawn only on a change. Keeps the e2e hook's `whistleButton`.
 */
export function drawWhistleButton(
  g: Phaser.GameObjects.Graphics,
  r: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null,
  d: SimDog | null,
  ink: number,
  enamel: number,
  hook: {
    whistleButton: { x: number; y: number; w: number; h: number; on: boolean } | null;
  } | null,
): void {
  const show = r !== null && d !== null && d.present;
  const on = show && d.whistle !== null;
  if (hook) hook.whistleButton = show ? { x: r.x, y: r.y, w: r.w, h: r.h, on } : null;
  if (show !== g.visible) g.setVisible(show);
  if (!show) return;
  const key = `${r.x},${r.y},${on ? 1 : 0}`;
  if (key === whistleKeys.get(g)) return;
  whistleKeys.set(g, key);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = r.w / 2;
  g.clear();
  g.fillStyle(ink, 0.9).fillCircle(cx, cy, rad);
  g.fillStyle(on ? enamel : 0x7a7466, 1).fillCircle(cx, cy, rad - 6);
  // The whistle: a round chamber with its mouthpiece and the lanyard ring.
  g.fillStyle(ink, 1);
  g.fillCircle(cx + 6, cy + 4, 15);
  g.fillRect(cx - 24, cy - 8, 24, 12);
  g.fillStyle(on ? 0xd8dde4 : 0xa0a0a0, 1);
  g.fillCircle(cx + 6, cy + 4, 11);
  g.fillRect(cx - 21, cy - 5, 22, 6);
  g.fillStyle(ink, 1).fillRect(cx - 2, cy - 7, 7, 4);
  g.lineStyle(3, ink, 1).strokeCircle(cx + 18, cy - 12, 5);
}

/** The pop-up of a bonus: Brakkie's ("Bring! +15", "Goeie hond! +30", "Mooi punt! +20", the word
 *  from the lazy guide tables) or the points alone (any other bonus, or before the tables are in);
 *  Brakkie's go to the e2e hook's log. */
export function popText(
  bonus: string,
  award: string,
  lookup: (key: string) => string,
  hook: { brakkiePops: string[] } | null,
): string {
  const key =
    bonus === 'bring'
      ? 'bring'
      : bonus === 'bringStreak'
        ? 'streak'
        : bonus === 'goodPoint'
          ? 'good_point'
          : null;
  const word = key === null ? '' : lookup(`guide.brakkie.${key}`);
  if (word === '') return award;
  const text = `${word} ${award}`;
  if (hook) {
    hook.brakkiePops.push(text);
    if (hook.brakkiePops.length > 40) hook.brakkiePops.shift();
  }
  return text;
}

// --- the title's wag -----------------------------------------------------------------------------

/** e2e: the title's Brakkie (design px). */
export interface TitleBrakkieHook {
  rect: { x: number; y: number; w: number; h: number } | null;
  frame: string | null;
  taps: number;
  sheet: 'standard' | 'hd' | null;
}

/**
 * Brakkie sitting on the title beside Oupa (his spot laid out by the title against every title
 * rect, lesson 25). A tap on him makes him wag; "reduce motion" keeps him calm. Built hidden; shown
 * once his sheet is in.
 */
export class TitleBrakkie {
  private readonly img: Phaser.GameObjects.Image;
  private sheet: 'standard' | 'hd' | null = null;
  private k = 1;
  private waitFrames = 0;
  private tapAt: number | null = null;
  private frame: BrakkieFrame = 'sit';
  readonly hook: TitleBrakkieHook = { rect: null, frame: null, taps: 0, sheet: null };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tuning: Tuning,
    private readonly hd: boolean,
    private readonly reducedMotion: boolean,
    /** Feet (design px) and his height on screen; null: no room on this screen. */
    private spot: { x: number; y: number; h: number; facing: 1 | -1 } | null,
    depth: number,
    /** e2e only: the wag held on its wag frame (the screenshot spec; false otherwise). */
    private readonly holdWag: () => boolean = () => false,
  ) {
    this.img = scene.add
      .image(0, 0, '__DEFAULT')
      .setVisible(false)
      .setDepth(depth)
      .setName('titleBrakkie');
  }

  /** A new spot (the title re-laid out). */
  place(spot: { x: number; y: number; h: number; facing: 1 | -1 } | null): void {
    this.spot = spot;
    this.layout();
  }

  private layout(): void {
    const s = this.spot;
    if (this.sheet === null || s === null) {
      this.img.setVisible(false);
      this.hook.rect = null;
      return;
    }
    const f = brakkieFrame('sit');
    const scale = s.h / f.h;
    this.img
      .setFrame(this.frame)
      .setScale(scale / (f.res * this.k))
      .setFlipX(s.facing < 0)
      .setPosition(s.x, s.y)
      .setVisible(true);
    setFootOrigin(this.img, s.facing < 0);
    const w = f.w * scale;
    this.hook.rect = { x: s.x - w / 2, y: s.y - s.h, w, h: s.h };
  }

  /** Each title frame: his sheet once it's in, then the wag's frame on change. */
  update(nowMs: number): void {
    if (this.sheet === null) {
      if (this.waitFrames++ % SHEET_POLL_FRAMES !== 0) return;
      const budget = (this.tuning.hd.budgetMiB - this.tuning.hd.headroomMiB) * 1024 * 1024;
      const t = ensureBrakkieTexture(this.scene.textures, this.hd, budget);
      if (t === null) return;
      this.k = t.k;
      this.sheet = t.sheet;
      this.hook.sheet = t.sheet;
      this.img.setTexture(BRAKKIE_SHEET, 'sit');
      this.layout();
    }
    const since = this.tapAt === null ? null : nowMs - this.tapAt;
    // e2e (screenshots): a held wag shows the wag frame until released.
    const f = this.holdWag()
      ? 'wag_a'
      : wagFrame(since, this.tuning.title.wagMs, this.tuning.title.swishMs, this.reducedMotion);
    if (f !== this.frame) {
      this.frame = f;
      this.img.setFrame(f);
      setFootOrigin(this.img, (this.spot?.facing ?? 1) < 0);
    }
    this.hook.frame = this.hook.rect === null ? null : f;
  }

  /** A tap at (x, y) design px: on him, he wags (true). */
  tap(x: number, y: number, nowMs: number): boolean {
    const r = this.hook.rect;
    if (r === null || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return false;
    this.tapAt = nowMs;
    this.hook.taps++;
    return true;
  }

  destroy(): void {
    this.img.destroy();
    releaseBrakkieTexture(this.scene.textures);
  }
}
