// D-064: how "Christmas in the sun" looks and sounds in the hunt — wrapped presents tucked in
// behind the day's props (drawn under the prop, so it covers part of the box), each popping its
// lid and a puff of paper confetti when shot; silver and red tinsel and baubles on the map's big
// tree with a small glint walking the baubles; guineafowl in tiny Santa hats; the heat shimmer
// along the horizon (WorldView's mirage strips). Everything moves on sim time (a held frame
// holds it), no flashes. Part of the lazy feesdae chunk; the art is the "feesdae-christmas"
// group's sheet, with a code-drawn stand-in until it arrives.
import type * as Phaser from 'phaser';
import type { Biome, ChristmasLook } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import type { FeesdagView as FeesdagState, PlaneId } from '../../sim/types';
import { coreWidth } from '../../sim/world';
import type { AudioDirector, Synth } from '../audio/AudioDirector';
import type { HatSource } from '../view/BirdView';
import type { ParallaxView } from '../view/ParallaxView';
import {
  CHRISTMAS_SHEET,
  GARLAND_SPAN_PX,
  santaHatFrame,
  wrapOf,
  XMAS_MASTER,
  XMAS_SHEET_H,
  XMAS_SHEET_W,
  XMAS_SOUNDS,
  xmasFrames,
  type XmasFrame,
  type XmasSound,
} from './christmasAssets';
import { drawChristmasStandin } from './christmasStandin';
import anchorsJson from './hatAnchors.json';

type Anchor = readonly [number, number, number, number];
/** The guineafowl's head in every frame of every clip (tools/art/hatAnchors.ts): the Santa hats
 *  sit where Halloween's witch hats do. */
const HAT_ANCHORS = anchorsJson as unknown as {
  readonly placeholder: Anchor;
  readonly clips: Readonly<Record<string, readonly Anchor[]>>;
};

/** The stand-in's texture key (the delivered sheet takes CHRISTMAS_SHEET itself). */
export const XMAS_STANDIN = `${CHRISTMAS_SHEET}#standin`;
const TICKS_PER_SECOND = 60;

const ORIGINS = new Map(xmasFrames().map((f) => [f.name, f]));

/** Adds the frame table to a texture (texture px = design px × XMAS_MASTER). */
export function addXmasFrames(tex: Phaser.Textures.Texture): void {
  for (const f of xmasFrames()) {
    if (tex.has(f.name)) continue;
    tex.add(f.name, 0, f.x * XMAS_MASTER, f.y * XMAS_MASTER, f.w * XMAS_MASTER, f.h * XMAS_MASTER);
  }
}

/** The delivered sheet when it is in, else the stand-in (drawn once per page). */
export function ensureXmasTexture(scene: Phaser.Scene, sheet: HTMLImageElement | null): string {
  const textures = scene.textures;
  if (sheet !== null && !textures.exists(CHRISTMAS_SHEET)) {
    const tex = textures.addImage(CHRISTMAS_SHEET, sheet);
    if (tex !== null) addXmasFrames(tex);
  }
  if (textures.exists(CHRISTMAS_SHEET)) return CHRISTMAS_SHEET;
  if (!textures.exists(XMAS_STANDIN)) {
    const canvas = document.createElement('canvas');
    canvas.width = XMAS_SHEET_W * XMAS_MASTER;
    canvas.height = XMAS_SHEET_H * XMAS_MASTER;
    const g = canvas.getContext('2d');
    if (g !== null) drawChristmasStandin(g, XMAS_MASTER);
    const tex = textures.addCanvas(XMAS_STANDIN, canvas);
    if (tex !== null) addXmasFrames(tex);
  }
  return XMAS_STANDIN;
}

/** Sets a frame and its origin, only when they change. */
function setFrame(img: Phaser.GameObjects.Image, key: string, frame: XmasFrame): void {
  if (img.texture.key === key && img.frame.name === frame) return;
  img.setTexture(key, frame);
  const f = ORIGINS.get(frame);
  if (f !== undefined) img.setOrigin(f.ox / f.w, f.oy / f.h);
}

// --- sounds ----------------------------------------------------------------------------------

function note(
  ctx: AudioContext,
  out: AudioNode,
  f: number,
  at: number,
  len: number,
  peak: number,
): void {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 0.94, t0);
  o.frequency.exponentialRampToValueAtTime(f, t0 + 0.035);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** Stand-ins until the recordings arrive: the same tunes on a plain whistle tone. */
const SYNTH: Record<XmasSound, Synth> = {
  sting: (ctx, out) => {
    // "Jingle Bells" (1857, public domain): the chorus's first line.
    const tune: [number, number][] = [
      [66, 0.5],
      [66, 0.5],
      [66, 1],
      [66, 0.5],
      [66, 0.5],
      [66, 1],
      [66, 0.5],
      [69, 0.5],
      [62, 0.75],
      [64, 0.25],
      [66, 2],
    ];
    let t = 0;
    for (const [m, b] of tune) {
      note(ctx, out, mtof(m), t * 0.22, b * 0.22 * 0.95, 0.25);
      t += b;
    }
    return t * 0.22 + 0.3;
  },
  tally: (ctx, out) => {
    // "Silent Night" (1818, public domain): its first phrase.
    const tune: [number, number][] = [
      [69, 1.5],
      [71, 0.5],
      [69, 1],
      [66, 2.5],
    ];
    let t = 0;
    for (const [m, b] of tune) {
      note(ctx, out, mtof(m), t * 0.3, b * 0.3 * 0.95, 0.22);
      t += b;
    }
    return t * 0.3 + 0.3;
  },
  present: (ctx, out, noise) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    s.connect(f).connect(g).connect(out);
    s.start(t0);
    s.stop(t0 + 0.22);
    note(ctx, out, 2093, 0.1, 0.5, 0.12);
    return 0.65;
  },
};

export function playXmasSound(audio: AudioDirector, id: XmasSound, pan: number): void {
  audio.playExtra(XMAS_SOUNDS[id], Math.max(-1, Math.min(1, pan)), SYNTH[id]);
}

// --- the view ----------------------------------------------------------------------------------

interface DrawnPresent {
  readonly img: Phaser.GameObjects.Image;
  readonly lid: Phaser.GameObjects.Image;
  readonly confetti: Phaser.GameObjects.Image;
  readonly plane: PlaneId;
  /** The tick it was opened (lid hop and confetti run from it), or null while shut. */
  openedAt: number | null;
}

interface Bauble {
  readonly img: Phaser.GameObjects.Image;
  readonly x: number;
  readonly y: number;
}

/** A stable 0..1 hash of a bird id (which guineafowl wear hats). */
function share(id: number): number {
  let h = Math.imul(id ^ 0x2545f491, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface KersfeesDeps {
  readonly scene: Phaser.Scene;
  readonly parallax: ParallaxView;
  readonly look: ChristmasLook;
  readonly planeScale: Readonly<Record<PlaneId, number>>;
  readonly mapBiome: Biome;
  readonly decorations: readonly string[];
  readonly sheet: HTMLImageElement | null;
  /** "Reduce flashes" (the glint stays off). */
  readonly reduceFlashes: boolean;
  /** The heat shimmer's strength goes to WorldView (it owns the mirage strips). */
  readonly setHeat: (strength: number) => void;
}

export class KersfeesSceneView {
  private key: string;
  private readonly scene: Phaser.Scene;
  private readonly parallax: ParallaxView;
  private readonly look: ChristmasLook;
  private readonly planeScale: Readonly<Record<PlaneId, number>>;
  private readonly drawn = new Map<number, DrawnPresent>();
  private readonly garlands: { img: Phaser.GameObjects.Image; frame: XmasFrame }[] = [];
  private readonly baubles: Bauble[] = [];
  private readonly glint: Phaser.GameObjects.Image | null = null;
  private readonly reduceFlashes: boolean;
  private last: FeesdagState | null = null;
  /** The tree the tinsel hangs on (null: the map has none of the listed trees). */
  readonly tinselProp: string | null = null;
  /** The rifle zoom the world is drawn at (1 = no sight up). */
  viewZoom = 1;
  /** Santa hats for the BirdView (cosmetic: picked by bird id). */
  readonly hats: HatSource;

  constructor(d: KersfeesDeps) {
    this.scene = d.scene;
    this.parallax = d.parallax;
    this.look = d.look;
    this.planeScale = d.planeScale;
    this.reduceFlashes = d.reduceFlashes;
    this.key = ensureXmasTexture(d.scene, d.sheet);
    const look = d.look;
    if (d.decorations.includes('heatHaze')) d.setHeat(look.heat);
    // Tinsel on the first listed tree the day's map has (a layout may have moved it).
    if (d.decorations.includes('tinsel'))
      for (const t of look.tinsel) {
        const prop = d.mapBiome.props.find((p) => p.id === t.prop);
        const layer = prop === undefined ? undefined : d.parallax.layer(prop.layer);
        if (prop === undefined || layer === undefined) continue;
        const px = prop.u * coreWidth(layer.scrollFactor);
        for (const gl of t.garlands) {
          const [x0, y0] = gl.from;
          const [x1, y1] = gl.to;
          const span = Math.hypot(x1 - x0, y1 - y0) / GARLAND_SPAN_PX;
          const frame: XmasFrame = gl.colour === 'red' ? 'garland_red' : 'garland_silver';
          const img = d.scene.add.image(
            px + (x0 + x1) / 2,
            prop.y + (y0 + y1) / 2,
            this.key,
            frame,
          );
          const f = ORIGINS.get(frame);
          if (f !== undefined) img.setOrigin(f.ox / f.w, f.oy / f.h);
          img.setRotation(Math.atan2(y1 - y0, x1 - x0)).setScale(span / XMAS_MASTER);
          layer.fixtures.add(img);
          this.garlands.push({ img, frame });
        }
        for (const b of t.baubles) {
          const frame: XmasFrame = `bauble_${b.colour}`;
          const x = px + b.at[0];
          const y = prop.y + b.at[1];
          const img = d.scene.add.image(x, y, this.key, frame);
          const f = ORIGINS.get(frame);
          if (f !== undefined) img.setOrigin(f.ox / f.w, f.oy / f.h);
          img.setScale(1 / XMAS_MASTER);
          layer.fixtures.add(img);
          this.baubles.push({ img, x, y: y + 23 });
        }
        if (!this.reduceFlashes && this.baubles.length > 0) {
          this.glint = d.scene.add.image(0, 0, this.key, 'glint');
          this.glint.setScale(look.glint.scale / XMAS_MASTER).setAlpha(0);
          layer.fixtures.add(this.glint);
        }
        this.tinselProp = t.prop;
        break;
      }
    const hatsOn = d.decorations.includes('santaHats');
    this.hats = {
      frameFor: (w) => {
        const frame = santaHatFrame(w);
        const f = ORIGINS.get(frame);
        return {
          key: this.key,
          frame,
          ox: f === undefined ? 0.5 : f.ox / f.w,
          oy: f === undefined ? 0.9 : f.oy / f.h,
        };
      },
      wears: (id, creature) =>
        hatsOn && creature.startsWith('tarentaal') && share(id) < look.hatShare,
      head: (clip, n) => {
        const frames = clip === null ? undefined : HAT_ANCHORS.clips[clip];
        const a = frames === undefined ? HAT_ANCHORS.placeholder : (frames[n] ?? frames[0]);
        return a ?? HAT_ANCHORS.placeholder;
      },
      widthPerHeadR: look.hat.widthPerHeadR,
      tilt: look.hat.tilt,
    };
  }

  /** No vignette on a sunny day: nothing to fit. */
  layout(): void {
    // The view has no screen-fixed parts.
  }

  /** The delivered sheet arrived: every image moves over to it. */
  useSheet(img: HTMLImageElement): void {
    this.key = ensureXmasTexture(this.scene, img);
    if (this.key !== CHRISTMAS_SHEET) return;
    for (const g of this.garlands) g.img.setTexture(this.key, g.frame);
    for (const b of this.baubles) b.img.setTexture(this.key, b.img.frame.name);
    this.glint?.setTexture(this.key, 'glint');
  }

  /** Whether the delivered sheet (not the stand-in) is drawn. */
  get final(): boolean {
    return this.key === CHRISTMAS_SHEET;
  }

  /** One frame: the presents (shut, or open with the lid hop and confetti on sim time), the glint. */
  update(
    state: FeesdagState | undefined,
    _prev: FeesdagState | undefined,
    _alpha: number,
    tick: number,
  ): void {
    if (state === undefined) return;
    this.last = state;
    for (const t of state.things) {
      if (t.kind !== 'present') continue;
      let d = this.drawn.get(t.id);
      const s = this.planeScale[t.plane];
      if (d === undefined) {
        const node = this.parallax.plane(t.plane);
        const img = this.scene.add.image(t.x, t.y, this.key, 'present_a_shut');
        const lid = this.scene.add.image(t.x, t.y, this.key, 'lid_a').setVisible(false);
        const confetti = this.scene.add.image(t.x, t.y, this.key, 'confetti').setVisible(false);
        // Under the props (a prop covers part of the box), over the layer's art; the lid and
        // confetti fly over everything in the plane.
        node.fruit.add(img);
        node.overlay?.add(lid);
        node.overlay?.add(confetti);
        img.setScale(s / XMAS_MASTER);
        d = { img, lid, confetti, plane: t.plane, openedAt: null };
        this.drawn.set(t.id, d);
      }
      const wrap = wrapOf(t.id);
      setFrame(d.img, this.key, `present_${wrap}_${t.dark ? 'open' : 'shut'}`);
      if (t.dark && d.openedAt === null) d.openedAt = tick;
      if (d.openedAt !== null) this.animateOpen(d, t.x, t.y, s, wrap, tick - d.openedAt);
    }
    // The glint walks the baubles: a soft swell up and down at each in turn (sim time).
    if (this.glint !== null) {
      const per = this.look.glint.periodSeconds * TICKS_PER_SECOND;
      const n = Math.floor(tick / per);
      const k = (tick - n * per) / per;
      const b = this.baubles[n % this.baubles.length];
      if (b !== undefined) {
        if (this.glint.x !== b.x - 6 || this.glint.y !== b.y - 6)
          this.glint.setPosition(b.x - 6, b.y - 6);
        // Up and down in the first 40 % of the period, then dark: never a flash.
        const a = k < 0.4 ? this.look.glint.alpha * Math.sin((k / 0.4) * Math.PI) : 0;
        this.glint.setAlpha(a);
      }
    }
  }

  private animateOpen(
    d: DrawnPresent,
    x: number,
    y: number,
    s: number,
    wrap: string,
    ticks: number,
  ): void {
    const t = ticks / TICKS_PER_SECOND;
    const lidT = t / this.look.lidSeconds;
    const top = y - 50 * s;
    if (lidT < 1) {
      setFrame(d.lid, this.key, `lid_${wrap}` as XmasFrame);
      // Up and off to the side, turning, then fading as it lands.
      const hop = this.look.lidHopPx * s * 4 * lidT * (1 - lidT);
      d.lid
        .setVisible(true)
        .setScale(s / XMAS_MASTER)
        .setPosition(x + 60 * s * lidT, top - hop)
        .setRotation(0.9 * lidT)
        .setAlpha(lidT < 0.7 ? 1 : (1 - lidT) / 0.3);
    } else if (d.lid.visible) d.lid.setVisible(false);
    const cT = t / this.look.confettiSeconds;
    if (cT < 1) {
      setFrame(d.confetti, this.key, 'confetti');
      d.confetti
        .setVisible(true)
        .setPosition(x, top - 20 * s - 40 * s * cT)
        .setScale(((0.5 + 0.8 * cT) * s) / XMAS_MASTER)
        .setAlpha(1 - cT);
    } else if (d.confetti.visible) d.confetti.setVisible(false);
  }

  /** The sting at the start; a present's paper and bell where it is. */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    const half = width / 2;
    for (const e of events) {
      if (e.type === 'feesdagStarted') playXmasSound(audio, 'sting', 0);
      else if (e.type === 'presentOpened')
        playXmasSound(audio, 'present', (this.parallax.screenX(e.plane, e.x) - half) / half);
    }
  }

  /** e2e hook: where each present is on screen (design px), whether it is open, its frame. */
  spots(): {
    id: number;
    kind: string;
    x: number;
    y: number;
    dark: boolean;
    frame: string | null;
  }[] {
    return (this.last?.things ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      x: Math.round(this.parallax.screenX(t.plane, t.x) * 10) / 10,
      y: Math.round(t.y * 10) / 10,
      dark: t.dark,
      frame: this.drawn.get(t.id)?.img.frame.name ?? null,
    }));
  }

  /** e2e hook: the tinsel's tree and how many garlands and baubles hang on it. */
  tinsel(): { prop: string | null; garlands: number; baubles: number } {
    return { prop: this.tinselProp, garlands: this.garlands.length, baubles: this.baubles.length };
  }

  clear(): void {
    for (const d of this.drawn.values()) {
      d.img.destroy();
      d.lid.destroy();
      d.confetti.destroy();
    }
    this.drawn.clear();
  }
}
