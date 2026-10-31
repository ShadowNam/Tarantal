// v1.11 (D-068, GDD §8, art bible §6.1): Die Braai — the tally's night setting at Oupa's fire. The
// braai's lazy chunk: its files (the sheet, its HD twin, the bed, the nightjar, the vastrap sting,
// Oupa's story lines), the view drawn behind the slate, and Oupa's story told from the result.
//
// Texture memory (lesson 29): the sky is a code-drawn gradient, the horizon a code-drawn
// silhouette; only the one small sheet is a texture, added when the braai tally opens and removed
// when it closes (nothing else draws it), so no hunt carries it. The HD twin is used only while the
// textures in use leave room for it under the budget (feel.braai.hd); otherwise the Standard sheet.
//
// Phones (lessons 32–33): everything that moves is a baked frame set on change: the flames, the
// sparks, the glow's pulse in ten steps, Oupa's pose, the dance — ≤ 8 Phaser calls a frame, none
// when nothing changed; the stars, the sky and the horizon are built once. Its time is the tally's
// own braai clock (BraaiClock: held by the e2e hold, so a held frame shows the same picture).
import * as Phaser from 'phaser';
import type { Feel } from '../../content/schemas';
import type { FinalSound } from '../assets/AssetManifest';
import type { AssetIndex } from '../assets/assetIndex';
import { fetchAssetIndex, loadBytes, loadImage } from '../assets/finalLoader';
import { HD_INDEX_PATH } from '../assets/assetIndex';
import { parseHdIndex } from '../assets/hdIndex';
import { largestTextures, textureBytes } from '../assets/textureBytes';
import { loadVoiceIndex } from '../assets/voiceIndex';
import { voiceKey } from '../assets/AssetManifest';
import type { AudioDirector } from '../audio/AudioDirector';
import type { Rect } from '../ui/hudLayout';
import { BRAAI_SHEET, BRAAI_SOUNDS, braaiVoiceGroup } from './braaiKeys';
import type { BraaiTap } from './braaiTap';
import { CHRISTMAS_SHEET, xmasKeyIn } from '../feesdae/christmasKeys';
import { HALLOWEEN_SHEET } from '../feesdae/feesdaeAssets';
import { NEWYEAR_SHEET } from '../feesdae/newyearKeys';
import {
  braaiFrames,
  braaiTexelsPerPx,
  flameFrame,
  POKE_HAND,
  POKER,
  sparkFrame,
  STAR_TILE,
  type BraaiFrame,
  type BraaiFrameRect,
} from './braaiSheet';
import { braaiLayout, type BraaiLayout, type BraaiLayoutIn } from './braaiLayout';
import {
  animStateInto,
  newAnimState,
  type AnimTargets,
  applyAnim,
  captionText,
  GLOW_BASE,
  type AnimState,
  type Pose,
} from './braaiAnim';
import { earnsDance, tellStory, type StoryInput, type StoryLine } from './story';

export { braaiLayout } from './braaiLayout';
export { animState, applyAnim, captionText, STORY_SAY_KEYS } from './braaiAnim';
export { tellStory, earnsDance, isPerfectHunt } from './story';

type Tuning = Feel['braai'];

// --- files ---------------------------------------------------------------------------------------

const FILE_TIMEOUT_MS = 15_000;
let standard: HTMLImageElement | null = null;
let hdImage: HTMLImageElement | null = null;
let standardLoad: Promise<void> | null = null;
let hdLoad: Promise<void> | null = null;
let soundLoad: Promise<void> | null = null;
const voiceLoads = new Map<string, Promise<void>>();

/** Loads these index sounds into the director; true when every one arrived. */
async function loadSounds(
  audio: AudioDirector,
  entries: readonly [string, AssetIndex['audio'][string]][],
  format: 'ogg' | 'mp3',
): Promise<boolean> {
  const got = await Promise.all(
    entries.map(async ([key, entry]): Promise<FinalSound | null> => {
      const bytes = await loadBytes(entry[format].path, FILE_TIMEOUT_MS);
      return bytes === null ? null : { key, entry, bytes, format };
    }),
  );
  const files = got.filter((f): f is FinalSound => f !== null);
  audio.addRecorded(files);
  return files.length === entries.length;
}

/**
 * Starts (or joins) loading the braai's files: the Standard sheet always (the fallback when HD
 * doesn't fit), the HD twin when HD is chosen, the sounds and this voice language's story lines.
 * The delivery switch (lesson 35): no index, or an index without these files, loads nothing; an
 * index without audio loads no sound and no voice. A failed file is tried again next hunt.
 */
export function loadBraaiAssets(audio: AudioDirector, hd: boolean): void {
  const lang = audio.voiceLanguage;
  // Everything asked for is in (or on its way): no index fetch for this hunt.
  if (
    standardLoad !== null &&
    (!hd || hdLoad !== null) &&
    soundLoad !== null &&
    voiceLoads.has(lang)
  )
    return;
  const index = fetchAssetIndex(FILE_TIMEOUT_MS).then((r) => r.index);
  standardLoad ??= index.then(async (ix) => {
    const e = ix?.images[BRAAI_SHEET];
    const img = e === undefined ? null : await loadImage(e.file.path, FILE_TIMEOUT_MS);
    if (img === null) standardLoad = null;
    else standard = img;
  });
  if (hd)
    hdLoad ??= index.then(async (ix) => {
      if (ix?.images[BRAAI_SHEET] === undefined) {
        hdLoad = null;
        return;
      }
      const h = await fetch(HD_INDEX_PATH, { cache: 'no-cache' })
        .then(async (res) => (res.ok ? parseHdIndex(await res.json()) : null))
        .catch(() => null);
      const e = h?.images[BRAAI_SHEET];
      const img = e === undefined ? null : await loadImage(e.file.path, FILE_TIMEOUT_MS);
      if (img === null) hdLoad = null;
      else hdImage = img;
    });
  const format = audio.fileFormat();
  soundLoad ??= index.then(async (ix) => {
    // No index or no audio delivered: nothing (the voice index is fetched only with audio).
    if (ix === null || format === null || Object.keys(ix.audio).length === 0) {
      soundLoad = null;
      return;
    }
    const voice = await loadVoiceIndex();
    const all = { ...ix.audio, ...(voice?.audio ?? {}) };
    const want = Object.values(BRAAI_SOUNDS).flatMap((k) => {
      const e = all[k];
      return e === undefined ? [] : [[k, e] as [string, AssetIndex['audio'][string]]];
    });
    if (want.length === 0 || !(await loadSounds(audio, want, format))) soundLoad = null;
  });
  if (!voiceLoads.has(lang))
    voiceLoads.set(
      lang,
      index.then(async (ix) => {
        if (ix === null || format === null || Object.keys(ix.audio).length === 0) {
          voiceLoads.delete(lang);
          return;
        }
        const voice = await loadVoiceIndex();
        const group = braaiVoiceGroup(lang);
        const want = Object.entries(voice?.audio ?? {}).filter(([, e]) => e.group === group);
        if (want.length === 0 || !(await loadSounds(audio, want, format))) voiceLoads.delete(lang);
      }),
    );
}

/** The Standard sheet has arrived (the braai can show). */
export function braaiSheetIn(): boolean {
  return standard !== null;
}

/** Tests: forget what was loaded. */
export function resetBraaiFiles(): void {
  standard = null;
  hdImage = null;
  standardLoad = null;
  hdLoad = null;
  soundLoad = null;
  voiceLoads.clear();
}

// --- the view -------------------------------------------------------------------------------------

/** What the e2e hook shows of the braai (design px rects). */
export interface BraaiHook {
  sheet: 'standard' | 'hd';
  oupa: Rect | null;
  fire: Rect | null;
  /** The fire's base and Oupa's feet (null when left out): e2e reads real pixels there. */
  firePoint: { x: number; y: number } | null;
  flame: number;
  spark: number;
  pose: Pose;
  dancing: boolean;
  /** The dance is due this tally (a perfect hunt, a rank up, or ?braaiDance=1). */
  dance: boolean;
  /** When the dance started on the braai clock (null: not yet). */
  danceAt: number | null;
  story: { lines: string[]; captions: string[]; shown: number; skipped: boolean };
  /** Oupa's story bubble while it shows (design px), else null. */
  bubble: Rect | null;
  /** The last taps on the tally (design px) and what each did (braaiTap.ts). */
  taps: BraaiTap[];
  decorations: string[];
  /** Phaser calls the last frame made (perf: ≤ 40). */
  calls: number;
  textureMB: number;
}

export interface BraaiSetup {
  readonly scene: Phaser.Scene;
  readonly audio: AudioDirector;
  readonly tuning: Tuning;
  readonly layoutIn: BraaiLayoutIn;
  readonly biome: string;
  readonly story: StoryInput;
  readonly hd: boolean;
  readonly reducedMotion: boolean;
  readonly reduceFlashes: boolean;
  /** ?braaiDance=1: dance whatever the result. */
  readonly forceDance: boolean;
  /** The special day's id on a Feesdae Daily (its decorations join the fire), else null. */
  readonly special: string | null;
  /** Says a story line (the tally's bubble and Oupa's voice). */
  readonly tell: (voiceKey: string | null, caption: string) => void;
}

const SKY_TOP = 0x03050f;
const SKY_MID = 0x0b1430;
const SKY_LOW = 0x2a3456;
const LAND = 0x05060a;
const GROUND = 0x0b0a0c;
/** Behind everything the tally draws (the slate, the buttons, the bubble). */
const DEPTH = -10;

export class BraaiView {
  readonly hook: BraaiHook;
  /** ms the last update took (the tally adds it to hook.braaiMs). */
  lastMs = 0;
  readonly layout: BraaiLayout;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly k: number;
  private readonly frames = new Map<BraaiFrame, BraaiFrameRect>();
  private readonly flameImg: Phaser.GameObjects.Image | null = null;
  private readonly sparkImg: Phaser.GameObjects.Image | null = null;
  private readonly glowImg: Phaser.GameObjects.Image | null = null;
  private readonly oupaImg: Phaser.GameObjects.Image | null = null;
  private readonly pokerImg: Phaser.GameObjects.Image | null = null;
  private readonly hatImg: Phaser.GameObjects.Image | null = null;
  private last: AnimState | null = null;
  private readonly stateA = newAnimState();
  private readonly stateB = newAnimState();
  private readonly opts: {
    reducedMotion: boolean;
    reduceFlashes: boolean;
    danceFrom: number | null;
  };
  private animTargets: AnimTargets | null = null;
  private readonly lines: readonly StoryLine[];
  private storyFrom: number | null = null;
  private shown = 0;
  private danceFrom: number | null = null;
  private readonly danceDue: boolean;
  private nextNightjar: number;
  private destroyed = false;

  constructor(private readonly s: BraaiSetup) {
    this.opts = { reducedMotion: s.reducedMotion, reduceFlashes: s.reduceFlashes, danceFrom: null };
    const { scene } = s;
    const t0 = performance.now();
    this.layout = braaiLayout(s.layoutIn);
    this.lines = tellStory(s.story, s.tuning);
    this.danceDue = s.forceDance || earnsDance(s.story, s.tuning);
    this.nextNightjar = 6000;
    // The sheet: HD only while it fits the texture budget (lesson 29), else Standard.
    const budget = (s.tuning.hd.budgetMiB - s.tuning.hd.headroomMiB) * 1024 * 1024;
    const hd =
      s.hd &&
      hdImage !== null &&
      textureBytes(scene.textures) + hdImage.width * hdImage.height * 4 <= budget;
    const img = hd ? hdImage : standard;
    if (scene.textures.exists(BRAAI_SHEET)) scene.textures.remove(BRAAI_SHEET);
    // Safe: BraaiView is built only when braaiSheetIn() (the Standard image is in).
    const source = img as HTMLImageElement;
    const tex = scene.textures.addImage(BRAAI_SHEET, source);
    this.k = braaiTexelsPerPx(source.width);
    for (const f of braaiFrames()) {
      this.frames.set(f.name, f);
      tex?.add(
        f.name,
        0,
        f.x * this.k,
        f.y * this.k,
        Math.ceil(f.w * f.res) * this.k,
        Math.ceil(f.h * f.res) * this.k,
      );
    }
    const L = this.layout;
    const { width, height } = s.layoutIn;
    this.drawSky(width, height, L);
    this.drawStars(width, L.horizonY);
    this.put('milky', L.milky.x, L.milky.y, L.milky.scaleX, 1.3)
      .setRotation(L.milky.rotation)
      .setAlpha(0.85);
    this.put('cross', L.cross.x, L.cross.y, 1, 1);
    this.drawHorizon(width, height, L.horizonY);
    this.put('bakkie', L.bakkie.x, L.bakkie.y, L.bakkie.scale, L.bakkie.scale);
    const decorations: string[] = [];
    if (L.oupa !== null && L.fire !== null) {
      const sc = L.scale;
      const glow = this.put('glow', L.fire.x, L.fire.y - 30 * sc, 1.8 * sc, 1.8 * sc);
      glow.setBlendMode(Phaser.BlendModes.ADD).setAlpha(GLOW_BASE);
      this.glowImg = glow;
      this.sparkImg = this.put(sparkFrame(0), L.fire.x, L.fire.y - 20 * sc, sc, sc);
      this.flameImg = this.put(flameFrame(0), L.fire.x, L.fire.y - 4 * sc, sc, sc);
      this.put('hearth', L.fire.x, L.fire.y, sc, sc);
      this.oupaImg = this.put('sit_idle', L.oupa.x, L.oupa.y, sc, sc);
      this.pokerImg = this.put(
        'poker',
        L.oupa.x + POKE_HAND.x * sc,
        L.oupa.y + POKE_HAND.y * sc,
        sc,
        sc,
      );
      // The poker reaches from his hand to the coals.
      const dx = L.fire.x - 30 * sc - (L.oupa.x + POKE_HAND.x * sc);
      const dy = L.fire.y - 4 * sc - (L.oupa.y + POKE_HAND.y * sc);
      this.pokerImg.setRotation(Math.atan2(dy, dx)).setVisible(false);
      this.pokerImg.setScale(
        ((Math.hypot(dx, dy) / (POKER.w - 6)) * sc) / (this.res('poker') * this.k) / sc,
        sc / (this.res('poker') * this.k),
      );
      // A Feesdae Daily's decorations join the fire (from the special's own sheet, if it is in).
      this.hatImg = this.decorate(s.special, L, decorations);
    }
    this.hook = {
      sheet: hd ? 'hd' : 'standard',
      oupa: L.oupaRect,
      fire: L.fireRect,
      firePoint:
        L.fire === null
          ? null
          : { x: Math.round(L.fire.x), y: Math.round(L.fire.y - 30 * L.scale) },
      flame: 0,
      spark: 0,
      pose: 'sit_idle',
      dancing: false,
      dance: this.danceDue,
      danceAt: null,
      story: { lines: this.lines.map((l) => l.id), captions: [], shown: 0, skipped: false },
      bubble: null,
      taps: [],
      decorations,
      calls: 0,
      textureMB: Math.round((textureBytes(scene.textures) / (1024 * 1024)) * 10) / 10,
    };
    // The bed: the area's music fades into the guitar, the fire and the crickets.
    s.audio.setBraai({ music: BRAAI_SOUNDS.guitar, ambience: BRAAI_SOUNDS.fire });
    this.lastMs = performance.now() - t0;
  }

  /** The frame's sheet px per design px. */
  private res(name: BraaiFrame): number {
    return this.frames.get(name)?.res ?? 1;
  }

  /** An image of `name` at (x, y), its origin from the table, scaled to design px × (sx, sy). */
  private put(
    name: BraaiFrame,
    x: number,
    y: number,
    sx: number,
    sy: number,
  ): Phaser.GameObjects.Image {
    const f = this.frames.get(name);
    const img = this.s.scene.add.image(x, y, BRAAI_SHEET, name).setDepth(DEPTH);
    if (f !== undefined) {
      img.setOrigin(f.ox / f.w, f.oy / f.h);
      const m = 1 / (f.res * this.k);
      img.setScale(sx * m, sy * m);
    }
    this.objects.push(img);
    return img;
  }

  private drawSky(width: number, height: number, L: BraaiLayout): void {
    const g = this.s.scene.add.graphics().setDepth(DEPTH);
    const mid = Math.round(L.horizonY * 0.55);
    g.fillGradientStyle(SKY_TOP, SKY_TOP, SKY_MID, SKY_MID, 1);
    g.fillRect(0, 0, width, mid);
    g.fillGradientStyle(SKY_MID, SKY_MID, SKY_LOW, SKY_LOW, 1);
    g.fillRect(0, mid, width, L.horizonY - mid + 2);
    g.fillStyle(GROUND, 1).fillRect(0, L.horizonY, width, height - L.horizonY);
    this.objects.push(g);
  }

  /** Star tiles over the sky, alternately flipped so the repeat doesn't show. */
  private drawStars(width: number, horizonY: number): void {
    const S = STAR_TILE;
    let n = 0;
    for (let y = 0; y < horizonY; y += S)
      for (let x = 0; x < width; x += S) {
        const img = this.put('stars', x, y, 1, 1).setOrigin(0, 0);
        img.setFlipX(n % 2 === 1).setFlipY(n % 3 === 1);
        // Fainter toward the horizon (the glow of the land).
        img.setAlpha(Math.max(0.35, 1 - (y / horizonY) * 0.6));
        n++;
      }
  }

  /** The area's skyline, dark against the sky (code-drawn: no texture). */
  private drawHorizon(width: number, height: number, horizonY: number): void {
    const look = this.s.tuning.horizons[this.s.biome] ?? this.s.tuning.horizons['default'];
    const g = this.s.scene.add.graphics().setDepth(DEPTH);
    g.fillStyle(LAND, 1);
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, height)];
    const style = look?.style ?? 'hills';
    const amp = style === 'flat' ? 6 : style === 'dunes' ? 22 : style === 'ridge' ? 70 : 40;
    // A seeded, smooth skyline (the same every time for the area).
    let seed = 0;
    for (const c of this.s.biome) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const ph = [(seed % 97) / 15, (seed % 89) / 13, (seed % 83) / 11];
    for (let x = 0; x <= width + 20; x += 20) {
      const u = x / width;
      let y =
        Math.sin(u * 3.1 + (ph[0] ?? 0)) * 0.5 +
        Math.sin(u * 7.3 + (ph[1] ?? 0)) * 0.3 +
        Math.sin(u * 17 + (ph[2] ?? 0)) * 0.12;
      if (style === 'ridge')
        y = Math.max(y, 0.2 + Math.abs(Math.sin(u * 2.2 + (ph[0] ?? 0))) * 0.6);
      pts.push(new Phaser.Math.Vector2(x, horizonY - amp * (0.6 + y * 0.5)));
    }
    pts.push(new Phaser.Math.Vector2(width + 20, height));
    g.fillPoints(pts, true);
    // Trees on the skyline: acacias' flat crowns, palms, a baobab.
    const trees = look?.trees ?? 'none';
    if (trees !== 'none') {
      const xs = [0.08, 0.27, 0.71, 0.9].map((u, i) => (u + ((seed >> i) % 7) / 100) * width);
      for (const x of xs) {
        const base = horizonY - amp * 0.55;
        if (trees === 'acacia') {
          g.fillRect(x - 2, base - 44, 4, 46);
          g.fillEllipse(x, base - 48, 74, 14);
          g.fillEllipse(x + 12, base - 56, 46, 10);
        } else if (trees === 'palm') {
          g.fillRect(x - 2, base - 70, 4, 72);
          for (let a = -2; a <= 2; a++)
            g.fillEllipse(x + a * 12, base - 72 + Math.abs(a) * 5, 30, 6);
        } else {
          g.fillRect(x - 10, base - 40, 20, 42);
          g.fillEllipse(x, base - 46, 56, 18);
        }
      }
    }
    this.objects.push(g);
  }

  /** A special day's touch at the fire: Christmas's Santa hat and a present, New Year's party hat,
   *  Halloween's pumpkin lantern — from the special's sheet when it is in (else nothing). Returns
   *  the hat (it follows Oupa's pose). */
  private decorate(
    special: string | null,
    L: BraaiLayout,
    out: string[],
  ): Phaser.GameObjects.Image | null {
    if (special === null || L.oupa === null || L.fire === null) return null;
    const scene = this.s.scene;
    const sc = L.scale;
    const add = (
      key: string,
      frame: string,
      x: number,
      y: number,
      size: number,
    ): Phaser.GameObjects.Image | null => {
      if (!scene.textures.exists(key) || !scene.textures.get(key).has(frame)) return null;
      const img = scene.add.image(x, y, key, frame).setDepth(DEPTH);
      img.setScale(size / Math.max(1, img.frame.width));
      this.objects.push(img);
      out.push(`${key}:${frame}`);
      return img;
    };
    // The special's sheet as its hunt left it in the texture manager (never loaded here).
    const sheet =
      special === 'christmas'
        ? (xmasKeyIn(scene.textures) ?? CHRISTMAS_SHEET)
        : special === 'newyear'
          ? NEWYEAR_SHEET
          : HALLOWEEN_SHEET;

    let hat: Phaser.GameObjects.Image | null = null;
    if (special === 'christmas' || special === 'newyear') {
      hat = add(sheet, 'hat_m', L.oupa.x + 4 * sc, L.oupa.y - 150 * sc, 34 * sc);
      hat?.setOrigin(0.5, 0.86).setRotation(-0.2);
    }
    if (special === 'christmas')
      add(sheet, 'present_a_shut', L.fire.x + 64 * sc, L.fire.y + 4 * sc, 40 * sc)?.setOrigin(
        0.5,
        0.85,
      );
    if (special === 'halloween')
      add(sheet, 'lantern_bare_lit', L.fire.x + 64 * sc, L.fire.y - 6 * sc, 38 * sc)?.setOrigin(
        0.5,
        0.6,
      );
    return hat;
  }

  /** Oupa's story starts at `ms` on the braai clock (after the count-up and any verdict). */
  startStory(ms: number): void {
    if (this.storyFrom === null) this.storyFrom = ms;
  }

  /** The whole story is out (told or skipped): a skip has nothing left to do. */
  get storyDone(): boolean {
    return this.hook.story.skipped || this.shown >= this.lines.length;
  }

  /** A tap or key: the whole story at once (one caption), the dance now if it is due. */
  skip(ms: number): void {
    if (this.hook.story.skipped || this.shown >= this.lines.length) return;
    const rest = this.lines.slice(this.shown);
    this.shown = this.lines.length;
    this.hook.story.skipped = true;
    this.hook.story.shown = this.shown;
    // Review: only the closer goes in the bubble (every line joined overflowed it); the lines
    // skipped over are logged as captions, unsaid.
    for (const l of rest) this.hook.story.captions.push(captionText(l));
    const closer = rest.at(-1);
    if (closer !== undefined) this.s.tell(null, captionText(closer));
    if (this.danceDue && this.danceFrom === null) this.beginDance(ms);
  }

  private beginDance(ms: number): void {
    this.danceFrom = ms;
    this.hook.danceAt = ms;
    this.s.audio.playExtra(BRAAI_SOUNDS.vastrap, -0.3, () => 0);
  }

  /** One frame at `ms` on the braai clock. */
  update(ms: number): void {
    if (this.destroyed) return;
    const t0 = performance.now();
    let calls = 0;
    const t = this.s.tuning;
    // The story: each line in turn; the dance starts with the closer.
    if (this.storyFrom !== null && this.shown < this.lines.length) {
      const due = this.storyFrom + this.shown * (t.story.lineMs + t.story.gapMs);
      const line = this.lines[this.shown];
      if (ms >= due && line !== undefined) {
        this.shown++;
        const caption = captionText(line);
        this.hook.story.shown = this.shown;
        this.hook.story.captions.push(caption);
        this.s.tell(line.say, caption);
        if (this.shown === this.lines.length && this.danceDue && this.danceFrom === null)
          this.beginDance(ms);
      }
    }
    // A far nightjar now and then.
    if (ms >= this.nextNightjar) {
      this.nextNightjar = ms + 14_000;
      this.s.audio.playExtra(BRAAI_SOUNDS.nightjar, 0.6, () => 0);
    }
    // Two reused states (this frame's and the last), no allocation per frame (review 4).
    this.opts.danceFrom = this.danceFrom;
    const st = animStateInto(
      ms,
      t,
      this.opts,
      this.last === this.stateA ? this.stateB : this.stateA,
    );
    calls += this.apply(st);
    this.hook.calls = calls;
    this.lastMs = performance.now() - t0;
  }

  /** Applies a state, setting only what changed; returns the Phaser calls made. */
  private apply(st: AnimState): number {
    const n = applyAnim(this.last, st, this.targets());
    this.hook.pose = st.pose;
    this.hook.dancing = !st.pose.startsWith('sit_');
    this.hook.flame = st.flame;
    this.hook.spark = st.spark;
    this.last = st;
    return n;
  }

  /** What the animation sets: built once (after the images exist), then reused. */
  private targets(): AnimTargets {
    if (this.animTargets !== null) return this.animTargets;
    const L = this.layout;
    this.animTargets = {
      flame: this.flameImg,
      spark: this.sparkImg,
      glow: this.glowImg,
      oupa: L.oupa === null ? null : this.oupaImg,
      poker: this.pokerImg,
      hat: this.hatImg,
      oupaY: L.oupa?.y ?? 0,
      scale: L.scale,
      glowPulse: this.s.tuning.fire.glowPulse,
    };
    return this.animTargets;
  }

  /** The texture usage the e2e memory case reads (after the sheet was added). */
  textureTop(): { key: string; mb: number }[] {
    return largestTextures(this.s.scene.textures, 15);
  }

  /** Removes everything and the sheet's texture (nothing else draws it), and gives the music
   *  back to the area. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
    const textures = this.s.scene.textures;
    if (textures.exists(BRAAI_SHEET)) textures.remove(BRAAI_SHEET);
    this.s.audio.setBraai(null);
  }
}

/** The voice key the story's line plays (also what the voice tool generated). */
export const storyVoiceKey = (lang: string, line: StoryLine): string => voiceKey(lang, line.say);
