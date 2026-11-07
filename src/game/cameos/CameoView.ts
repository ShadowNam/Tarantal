// v1.13 (D-075, GDD §11.3g, art bible §5.7) the veld cameos on screen — a lazy chunk (not in the
// first download): each area's files (its sheet, its HD twin, its sounds; the Okavango's group is
// the elephants' trumpet only) and the hunt's view.
//
// Texture memory (lessons 29, 38, 40): the hunt's one area sheet (≤ 0.5 MiB Standard, ≤ 2 MiB HD)
// becomes a texture when the hunt first draws a cameo and is removed when the hunt ends — before
// the tally opens. The HD twin is used only while the textures in use leave room for it under the
// budget (feel.cameos.hd); otherwise the Standard.
//
// Phones (lessons 32–33): a small pool of images (grown when a bigger herd first comes, never a
// frame), every property set only when it changes (frames are baked), hidden off screen; its own
// timer (lastMs → the hook's cameoMs). Everything runs on sim time from the snapshot, so a held
// frame (?holdAt) holds them. Until the sheet is in nothing is drawn (the sim runs them anyway).
import type * as Phaser from 'phaser';
import type { Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { CameoVisitView, SimState } from '../../sim/types';
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
import { CAMEO_KIND_AREA, CAMEO_SPECIES, cameoPose, type MutableCameoPose } from './cameoAnim';
import {
  CAMEO_AREA_SOUNDS,
  CAMEO_SHEETS,
  CAMEO_SOUNDS,
  type CameoArea,
  type CameoSheetArea,
} from './cameoKeys';
import { cameoFrame, cameoFrames, cameoTexelsPerPx, type CameoFrame } from './cameoSheet';

type Tuning = Feel['cameos'];

// --- files ---------------------------------------------------------------------------------------

const FILE_TIMEOUT_MS = 15_000;
const standard = new Map<CameoSheetArea, HTMLImageElement>();
const hdImage = new Map<CameoSheetArea, HTMLImageElement>();
const standardLoad = new Map<CameoArea, Promise<void>>();
const hdLoad = new Map<CameoArea, Promise<void>>();
const soundLoad = new Map<CameoArea, Promise<void>>();

const isSheetArea = (a: CameoArea): a is CameoSheetArea => a !== 'okavango';

/**
 * Starts (or joins) loading an area's files: the Standard sheet always (the fallback when HD
 * doesn't fit), the HD twin when HD is chosen, and its sounds. The delivery switch (lesson 35): no
 * index, or an index without these files, loads nothing; an index without audio loads no sound. A
 * failed file is tried again next time.
 */
export function loadCameoAssets(area: CameoArea, audio: AudioDirector, hd: boolean): void {
  const index = fetchAssetIndex(FILE_TIMEOUT_MS).then((r) => r.index);
  if (isSheetArea(area)) {
    const key = CAMEO_SHEETS[area];
    if (!standardLoad.has(area))
      standardLoad.set(
        area,
        index.then(async (ix) => {
          const e = ix?.images[key];
          const img = e === undefined ? null : await loadImage(e.file.path, FILE_TIMEOUT_MS);
          if (img === null) standardLoad.delete(area);
          else standard.set(area, img);
        }),
      );
    if (hd && !hdLoad.has(area))
      hdLoad.set(
        area,
        index.then(async (ix) => {
          if (ix?.images[key] === undefined) {
            hdLoad.delete(area);
            return;
          }
          const h = await fetch(HD_INDEX_PATH, { cache: 'no-cache' })
            .then(async (res) => (res.ok ? parseHdIndex(await res.json()) : null))
            .catch(() => null);
          const e = h?.images[key];
          const img = e === undefined ? null : await loadImage(e.file.path, FILE_TIMEOUT_MS);
          if (img === null) hdLoad.delete(area);
          else hdImage.set(area, img);
        }),
      );
  }
  const format = audio.fileFormat();
  if (!soundLoad.has(area))
    soundLoad.set(
      area,
      index.then(async (ix) => {
        if (ix === null || format === null || Object.keys(ix.audio).length === 0) {
          soundLoad.delete(area);
          return;
        }
        const want = CAMEO_AREA_SOUNDS[area].flatMap((id) => {
          const k = CAMEO_SOUNDS[id];
          const e = ix.audio[k];
          return e === undefined ? [] : [[k, e] as [string, AssetIndex['audio'][string]]];
        });
        if (want.length === 0) {
          soundLoad.delete(area);
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
        if (files.length !== want.length) soundLoad.delete(area);
      }),
    );
}

/** Tests: images as if they had arrived. */
export function setCameoImagesForTest(
  area: CameoSheetArea,
  std: HTMLImageElement | null,
  hd: HTMLImageElement | null,
): void {
  if (std === null) standard.delete(area);
  else standard.set(area, std);
  if (hd === null) hdImage.delete(area);
  else hdImage.set(area, hd);
}

/** Tests: forget what was loaded. */
export function resetCameoFiles(): void {
  standard.clear();
  hdImage.clear();
  standardLoad.clear();
  hdLoad.clear();
  soundLoad.clear();
}

/**
 * Puts an area's sheet under its key if it isn't there yet: the HD twin when HD is chosen and it
 * fits the texture budget with what is in use now (lesson 29), else the Standard. Returns the
 * texels per sheet px of the sheet under the key (null: nothing has arrived).
 */
export function ensureCameoTexture(
  textures: Phaser.Textures.TextureManager,
  area: CameoSheetArea,
  hd: boolean,
  budgetBytes: number,
): { readonly k: number; readonly sheet: 'standard' | 'hd' } | null {
  const key = CAMEO_SHEETS[area];
  if (textures.exists(key)) {
    const k = cameoTexelsPerPx(area, textures.get(key).getSourceImage().width);
    return { k, sheet: k > 1 ? 'hd' : 'standard' };
  }
  const std = standard.get(area);
  if (std === undefined) return null;
  const h = hdImage.get(area);
  const hdFits =
    hd && h !== undefined && textureBytes(textures) + h.width * h.height * 4 <= budgetBytes;
  const img = hdFits ? h : std;
  const useHd = img !== std;
  const tex = textures.addImage(key, img);
  if (tex === null) return null;
  const k = cameoTexelsPerPx(area, img.width);
  for (const f of cameoFrames(area)) {
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

/** Takes an area's sheet out of the texture manager (the views that drew it are destroyed first). */
export function releaseCameoTexture(
  textures: Phaser.Textures.TextureManager,
  area: CameoSheetArea,
): void {
  const key = CAMEO_SHEETS[area];
  if (textures.exists(key)) textures.remove(key);
}

// --- the hunt's view -----------------------------------------------------------------------------

/** Off-screen margin (design px) before an animal is hidden. */
const CULL_PX = 200;
const SHEET_POLL_FRAMES = 30;

/** e2e: one drawn animal. */
export interface CameoMemberHook {
  frame: string | null;
  visible: boolean;
  /** Its feet on screen (design px), and the ground line it stands on there. */
  x: number;
  y: number;
  groundY: number;
  facing: number;
  alpha: number;
}

/** e2e: the cameos as drawn this frame. */
export interface CameoHook {
  area: CameoArea;
  sheet: 'standard' | 'hd' | null;
  visits: {
    id: number;
    kind: string;
    plane: string;
    phase: string;
    reaction: string | null;
    members: CameoMemberHook[];
  }[];
  /** Phaser calls the last frame made (perf: their share of the ≈ 40 a frame). */
  calls: number;
  /** Species drawn on screen this hunt (the field guide's sightings). */
  seen: string[];
  /** The sim's counts. */
  hits: number;
  aimedHits: number;
  alarms: number;
  trumpets: number;
}

export interface CameoViewSetup {
  readonly scene: Phaser.Scene;
  readonly parallax: ParallaxView;
  readonly now: () => number;
  readonly tuning: Tuning;
  readonly hd: boolean;
  readonly area: CameoArea;
  readonly reducedMotion: boolean;
  /** Alpha at which a drawn animal counts as seen (the Journal's sightingAlpha). */
  readonly sightingAlpha: number;
  /** A species drawn on screen (the field guide): true when it counted (then it isn't reported
   *  again this hunt). */
  readonly onSighted: (species: string) => boolean;
  /** The e2e hooks are on (else no hook object is kept up to date). */
  readonly hooks: boolean;
}

/** One pooled image and what is set on it now (set only on change). */
interface Slot {
  readonly img: Phaser.GameObjects.Image;
  layerId: string | null;
  frame: CameoFrame | null;
  shown: boolean;
  flip: boolean;
  x: number;
  y: number;
  alpha: number;
}

export class CameoView {
  private readonly slots: Slot[] = [];
  private readonly dust: Slot | null;
  private k = 1;
  private sheet: 'standard' | 'hd' | null = null;
  private waitFrames = 0;
  private tint = new Map<string, number>();
  private calls = 0;
  private readonly sheetArea: CameoSheetArea | null;
  private readonly seenSet = new Set<string>();
  /** Each plane's layer (learnt from the visits drawn), for the sounds' stereo pan. */
  private readonly planeLayer = new Map<string, string>();
  /** The pose each animal is drawn in (reused: no allocation a frame). */
  private readonly pose: MutableCameoPose = { frame: 'gb_walk_a', lift: 0, dust: false };
  /** Milliseconds the last update took (perf.spec: cameoMs). */
  lastMs = 0;
  readonly hook: CameoHook;

  constructor(private readonly s: CameoViewSetup) {
    this.sheetArea = isSheetArea(s.area) ? s.area : null;
    this.dust = this.sheetArea === 'karoo' ? this.makeSlot() : null;
    this.hook = {
      area: s.area,
      sheet: null,
      visits: [],
      calls: 0,
      seen: [],
      hits: 0,
      aimedHits: 0,
      alarms: 0,
      trumpets: 0,
    };
    // e2e only (test hooks on): hide them, so a spec can grab the same held tick with and without
    // them and find their drawn pixels (lesson 14: real pixels).
    if (s.hooks && typeof window !== 'undefined')
      (window as { __TM_CAMEOS_HIDE__?: (on: boolean) => void }).__TM_CAMEOS_HIDE__ = (on) => {
        this.hidden = on;
      };
  }

  /** e2e only: hidden (__TM_CAMEOS_HIDE__). */
  private hidden = false;

  private makeSlot(): Slot {
    // Built hidden on a placeholder key until the sheet is in (never shown so).
    const img = this.s.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    if (this.sheet !== null && this.sheetArea !== null)
      img.setTexture(CAMEO_SHEETS[this.sheetArea]);
    return { img, layerId: null, frame: null, shown: false, flip: false, x: NaN, y: NaN, alpha: 1 };
  }

  /** The sheet under the key (polled every SHEET_POLL_FRAMES frames until it arrives). */
  private sheetReady(): boolean {
    if (this.sheet !== null) return true;
    if (this.sheetArea === null) return false;
    if (this.waitFrames++ % SHEET_POLL_FRAMES !== 0) return false;
    const budget = (this.s.tuning.hd.budgetMiB - this.s.tuning.hd.headroomMiB) * 1024 * 1024;
    const t = ensureCameoTexture(this.s.scene.textures, this.sheetArea, this.s.hd, budget);
    if (t === null) return false;
    this.k = t.k;
    this.sheet = t.sheet;
    const key = CAMEO_SHEETS[this.sheetArea];
    for (const sl of [...this.slots, ...(this.dust === null ? [] : [this.dust])]) {
      sl.img.setTexture(key);
      sl.frame = null;
      this.calls++;
    }
    return true;
  }

  private hideSlot(sl: Slot): void {
    if (!sl.shown) return;
    sl.img.setVisible(false);
    sl.shown = false;
    this.calls++;
  }

  /** Puts a slot into a layer's fixtures (above its props, below its birds). */
  private toLayer(sl: Slot, layerId: string): boolean {
    if (sl.layerId === layerId) return true;
    const layer = this.s.parallax.layer(layerId);
    if (layer === undefined) return false;
    layer.fixtures.add(sl.img);
    sl.layerId = layerId;
    let tint = this.tint.get(layerId);
    if (tint === undefined) {
      tint = this.s.parallax.layerTint(layerId);
      this.tint.set(layerId, tint);
    }
    if (tint === 0xffffff) sl.img.clearTint();
    else sl.img.setTint(tint);
    this.calls += 2;
    return true;
  }

  /** Places one slot: frame, facing, position, alpha (each only on change). */
  private place(
    sl: Slot,
    layerId: string,
    frame: CameoFrame,
    facing: 1 | -1,
    x: number,
    y: number,
    alpha: number,
  ): boolean {
    if (!this.toLayer(sl, layerId)) return false;
    const layer = this.s.parallax.layer(layerId);
    const sx = layer === undefined ? 0 : layer.root.x + x * layer.root.scaleX;
    if (sx < -CULL_PX || sx > designSize().width + CULL_PX) {
      this.hideSlot(sl);
      return false;
    }
    const flip = facing < 0;
    if (frame !== sl.frame) {
      sl.img.setFrame(frame);
      if (sl.frame === null || this.sheetArea === null) {
        const res = this.sheetArea === null ? 0.5 : cameoFrame(this.sheetArea, frame).res;
        sl.img.setScale(1 / (res * this.k));
        this.calls++;
      }
      sl.frame = frame;
      setFootOrigin(sl.img, flip);
      this.calls += 2;
    }
    if (flip !== sl.flip) {
      sl.img.setFlipX(flip);
      sl.flip = flip;
      setFootOrigin(sl.img, flip);
      this.calls += 2;
    }
    if (x !== sl.x || y !== sl.y) {
      sl.img.setPosition(x, y);
      sl.x = x;
      sl.y = y;
      this.calls++;
    }
    if (alpha !== sl.alpha) {
      sl.img.setAlpha(alpha);
      sl.alpha = alpha;
      this.calls++;
    }
    if (!sl.shown) {
      sl.img.setVisible(true);
      sl.shown = true;
      this.calls++;
    }
    return true;
  }

  /** Draws them at this tick. */
  update(state: SimState): void {
    const t0 = this.s.now();
    this.calls = 0;
    const c = state.cameos;
    const hook = this.s.hooks ? this.hook : null;
    if (hook !== null) hook.visits.length = 0;
    let used = 0;
    let dustUsed = false;
    if (c !== null && !this.hidden && this.sheetReady() && this.sheetArea !== null) {
      for (const v of c.visits) {
        if (CAMEO_KIND_AREA[v.kind as keyof typeof CAMEO_KIND_AREA] !== this.sheetArea) continue;
        const hv = hook === null ? null : this.visitHook(v);
        if (!this.planeLayer.has(v.plane)) this.planeLayer.set(v.plane, v.layerId);
        let drawn = false;
        for (const m of v.members) {
          // The pool grows only when a bigger herd first comes (never a frame after).
          const sl = this.slots[used] ?? this.addSlot();
          used++;
          const pose = cameoPose(v, m, this.s.reducedMotion, this.pose);
          const y = m.y - pose.lift;
          const on = this.place(sl, v.layerId, pose.frame, v.facing, m.x, y, v.alpha);
          // Seen (the field guide) only with its feet on the screen itself, not in the margin.
          if (on && v.alpha >= this.s.sightingAlpha && this.onScreen(v.layerId, m.x)) drawn = true;
          if (on && pose.dust && this.dust !== null && !dustUsed) {
            dustUsed = this.place(
              this.dust,
              v.layerId,
              'dust',
              v.facing,
              m.x - v.facing * 40,
              m.y,
              1,
            );
          }
          if (hv !== null)
            hv.members.push(this.memberHook(sl, on, v.layerId, m.y, v.facing, v.alpha));
        }
        if (drawn) this.sighted(CAMEO_SPECIES[v.kind]);
        if (hv !== null && hook !== null) hook.visits.push(hv);
      }
    }
    // The elephants' sighting: a flapping elephant drawn on screen (FaunaView).
    if (c !== null && this.s.area === 'okavango' && this.s.parallax.faunaTrumpetSeen())
      this.sighted(CAMEO_SPECIES.elephants);
    for (let i = used; i < this.slots.length; i++) {
      const sl = this.slots[i];
      if (sl !== undefined) this.hideSlot(sl);
    }
    if (this.dust !== null && !dustUsed) this.hideSlot(this.dust);
    if (hook !== null) {
      hook.sheet = this.sheet;
      hook.calls = this.calls;
      if (c !== null) {
        hook.hits = c.hits;
        hook.aimedHits = c.aimedHits;
        hook.alarms = c.alarms;
        hook.trumpets = c.trumpets;
      }
    }
    this.lastMs = this.s.now() - t0;
  }

  /** Layer x on the layer is inside the screen (design px). */
  private onScreen(layerId: string, x: number): boolean {
    const layer = this.s.parallax.layer(layerId);
    if (layer === undefined) return false;
    const sx = layer.root.x + x * layer.root.scaleX;
    return sx >= 0 && sx <= designSize().width;
  }

  private addSlot(): Slot {
    const sl = this.makeSlot();
    this.slots.push(sl);
    return sl;
  }

  private sighted(species: string): void {
    if (this.seenSet.has(species)) return;
    if (!this.s.onSighted(species)) return;
    this.seenSet.add(species);
    if (this.s.hooks) this.hook.seen.push(species);
  }

  private visitHook(v: CameoVisitView): CameoHook['visits'][number] {
    return {
      id: v.id,
      kind: v.kind,
      plane: v.plane,
      phase: v.phase,
      reaction: v.reaction,
      members: [],
    };
  }

  private memberHook(
    sl: Slot,
    on: boolean,
    layerId: string,
    groundY: number,
    facing: number,
    alpha: number,
  ): CameoMemberHook {
    const layer = this.s.parallax.layer(layerId);
    const rx = layer?.root.x ?? 0;
    const ry = layer?.root.y ?? 0;
    const k = layer?.root.scaleX ?? 1;
    return {
      frame: on ? sl.frame : null,
      visible: on,
      x: Math.round(rx + sl.x * k),
      y: Math.round(ry + sl.y * k),
      groundY: Math.round(ry + groundY * k),
      facing,
      alpha,
    };
  }

  /** Their sounds (only once the area's files could have come: a sound with nothing to see is
   *  fine for the trumpet, whose herd is always drawn). */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    for (const e of events) {
      let key: string | null = null;
      if (e.type === 'cameoTrumpeted') key = CAMEO_SOUNDS.trumpet;
      else if (this.sheet === null) continue;
      else if (e.type === 'cameoAlarm') key = CAMEO_SOUNDS.whistle;
      else if (e.type === 'cameoArrived' && e.kind === 'warthogs') key = CAMEO_SOUNDS.grunt;
      else if (e.type === 'cameoArrived' && e.kind === 'ostrich') key = CAMEO_SOUNDS.boom;
      else if (e.type === 'cameoHit') {
        if (e.kind === 'warthogs') key = CAMEO_SOUNDS.grunt;
        else if (e.kind === 'dungBeetle') key = CAMEO_SOUNDS.plop;
        else if (e.kind === 'tortoise') key = CAMEO_SOUNDS.tok;
        else if (e.kind === 'gemsbok') key = CAMEO_SOUNDS.snort;
        else if (e.kind === 'ostrich') key = CAMEO_SOUNDS.boom;
      }
      if (key !== null) audio.playExtra(key, this.pan(e, width), () => 0);
    }
  }

  /** Stereo pan from where the event happened on screen (−1 … 1; the trumpet: the centre). */
  private pan(e: SimEvent, width: number): number {
    if (e.type !== 'cameoHit' && e.type !== 'cameoArrived' && e.type !== 'cameoAlarm') return 0;
    const plane = e.type === 'cameoAlarm' ? 'mid' : e.plane;
    const layerId = this.planeLayer.get(plane);
    const layer = layerId === undefined ? undefined : this.s.parallax.layer(layerId);
    if (layer === undefined) return 0;
    const sx = layer.root.x + e.x * layer.root.scaleX;
    return Math.max(-1, Math.min(1, (sx - width / 2) / (width / 2)));
  }

  /** Gone with the hunt: the images and the sheet (before the tally opens, lesson 40). */
  destroy(): void {
    for (const sl of this.slots) sl.img.destroy();
    this.dust?.img.destroy();
    this.slots.length = 0;
    if (this.sheetArea !== null) releaseCameoTexture(this.s.scene.textures, this.sheetArea);
    this.sheet = null;
  }
}
