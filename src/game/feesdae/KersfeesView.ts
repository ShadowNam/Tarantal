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
import { CHRISTMAS_SHEET_HD, xmasKeyIn, xmasMasterOf } from './christmasKeys';

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

/** Adds the frame table to a texture (texture px = design px × its master: 1 Standard, 2 HD). */
export function addXmasFrames(tex: Phaser.Textures.Texture, master: number): void {
  for (const f of xmasFrames()) {
    if (tex.has(f.name)) continue;
    tex.add(f.name, 0, f.x * master, f.y * master, f.w * master, f.h * master);
  }
}

/**
 * The delivered sheet when it is in (D-064 round 2: a 2× image is the HD sheet, a 1× one the
 * Standard pack; each has its own key), else the best one already loaded, else the stand-in
 * (drawn once per page, at 2×).
 */
export function ensureXmasTexture(scene: Phaser.Scene, sheet: HTMLImageElement | null): string {
  const textures = scene.textures;
  if (sheet !== null) {
    const master = xmasMasterOf(sheet.width);
    const key = master >= 2 ? CHRISTMAS_SHEET_HD : CHRISTMAS_SHEET;
    if (!textures.exists(key)) {
      const tex = textures.addImage(key, sheet);
      if (tex !== null) addXmasFrames(tex, master);
    }
    if (textures.exists(key)) return key;
  }
  const have = xmasKeyIn(textures);
  if (have !== null) return have;
  const canvas = document.createElement('canvas');
  canvas.width = XMAS_SHEET_W * XMAS_MASTER;
  canvas.height = XMAS_SHEET_H * XMAS_MASTER;
  const g = canvas.getContext('2d');
  if (g !== null) drawChristmasStandin(g, XMAS_MASTER);
  const tex = textures.addCanvas(XMAS_STANDIN, canvas);
  if (tex !== null) addXmasFrames(tex, XMAS_MASTER);
  return XMAS_STANDIN;
}

/** Texture px per design px of the texture under `key`. */
function masterOf(scene: Phaser.Scene, key: string): number {
  return xmasMasterOf(scene.textures.get(key).getSourceImage().width);
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
  readonly bow: Phaser.GameObjects.Image;
  /** The lid has landed behind the box (moved under the present in its container). */
  landed: boolean;
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
  /** The e2e hooks are on: `__TM_XMAS_HIDE__(true)` hides the presents and the tinsel, so a spec
   *  can grab the same held tick with and without them (the drawn art, not only hook flags). */
  readonly hooks?: boolean;
}

export class KersfeesSceneView {
  private key: string;
  /** Texture px per design px of the sheet drawn now (1 Standard, 2 HD or the stand-in). */
  private master: number;
  private readonly scene: Phaser.Scene;
  private readonly parallax: ParallaxView;
  private readonly look: ChristmasLook;
  private readonly planeScale: Readonly<Record<PlaneId, number>>;
  private readonly drawn = new Map<number, DrawnPresent>();
  private readonly garlands: { img: Phaser.GameObjects.Image; frame: XmasFrame }[] = [];
  private readonly baubles: Bauble[] = [];
  /** One glint per decorated tree, walking that tree's baubles. */
  private readonly glints: {
    img: Phaser.GameObjects.Image;
    baubles: readonly Bauble[];
    phase: number;
  }[] = [];
  private readonly reduceFlashes: boolean;
  private last: FeesdagState | null = null;
  /** e2e hook: what "Presents found!" paid (null until every present is open). */
  foundPoints: number | null = null;
  /** e2e only: presents and tinsel hidden (__TM_XMAS_HIDE__). */
  private hidden = false;
  /** Each decorated tree's crown (layer px): the hook gives its screen rect. */
  private readonly crowns: {
    id: string;
    layer: string;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }[] = [];
  /** The trees the tinsel hangs on (props by id, layer trees as layer@u). */
  readonly tinselTrees: string[] = [];
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
    this.master = masterOf(d.scene, this.key);
    const look = d.look;
    if (d.hooks === true)
      (window as { __TM_XMAS_HIDE__?: (on: boolean) => void }).__TM_XMAS_HIDE__ = (on) => {
        this.hidden = on;
        for (const g of this.garlands) g.img.setVisible(!on);
        for (const b of this.baubles) b.img.setVisible(!on);
      };
    if (d.decorations.includes('heatHaze')) d.setHeat(look.heat);
    // Tinsel on every listed tree the day's map has: a prop (a layout may have moved it), or a
    // tree painted in this biome's layer art. Each tree gets its own glint.
    if (d.decorations.includes('tinsel'))
      for (const t of look.tinsel) {
        let at: { x: number; y: number; layer: string; id: string } | null = null;
        if ('prop' in t) {
          const prop = d.mapBiome.props.find((p) => p.id === t.prop);
          const l = prop === undefined ? undefined : d.parallax.layer(prop.layer);
          if (prop !== undefined && l !== undefined)
            at = {
              x: prop.u * coreWidth(l.scrollFactor),
              y: prop.y,
              layer: prop.layer,
              id: t.prop,
            };
        } else if (t.biome === d.mapBiome.id) {
          const l = d.parallax.layer(t.layer);
          if (l !== undefined)
            at = {
              x: t.u * coreWidth(l.scrollFactor),
              y: t.y,
              layer: t.layer,
              id: `${t.layer}@${t.u}`,
            };
        }
        const layer = at === null ? undefined : d.parallax.layer(at.layer);
        if (at === null || layer === undefined) continue;
        for (const gl of t.garlands) {
          const [x0, y0] = gl.from;
          const [x1, y1] = gl.to;
          const span = Math.hypot(x1 - x0, y1 - y0) / GARLAND_SPAN_PX;
          const frame: XmasFrame = gl.colour === 'red' ? 'garland_red' : 'garland_silver';
          const img = d.scene.add.image(
            at.x + (x0 + x1) / 2,
            at.y + (y0 + y1) / 2,
            this.key,
            frame,
          );
          const f = ORIGINS.get(frame);
          if (f !== undefined) img.setOrigin(f.ox / f.w, f.oy / f.h);
          img.setRotation(Math.atan2(y1 - y0, x1 - x0)).setScale(span / this.master);
          layer.fixtures.add(img);
          this.garlands.push({ img, frame });
        }
        const mine: Bauble[] = [];
        for (const b of t.baubles) {
          const frame: XmasFrame = `bauble_${b.colour}`;
          const x = at.x + b.at[0];
          const y = at.y + b.at[1];
          const img = d.scene.add.image(x, y, this.key, frame);
          const f = ORIGINS.get(frame);
          if (f !== undefined) img.setOrigin(f.ox / f.w, f.oy / f.h);
          img.setScale(1 / this.master);
          layer.fixtures.add(img);
          mine.push({ img, x, y: y + 23 });
        }
        this.baubles.push(...mine);
        if (!this.reduceFlashes && mine.length > 0) {
          const glint = d.scene.add.image(0, 0, this.key, 'glint');
          glint.setScale(look.glint.scale / this.master).setAlpha(0);
          layer.fixtures.add(glint);
          this.glints.push({ img: glint, baubles: mine, phase: this.glints.length * 0.37 });
        }
        this.tinselTrees.push(at.id);
        // The crown's box round every anchor (layer px), for the e2e hook's screen rects.
        const pts = [
          ...t.garlands.flatMap((gl) => [gl.from, gl.to]),
          ...t.baubles.map((b) => b.at),
        ];
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        this.crowns.push({
          id: at.id,
          layer: at.layer,
          x0: at.x + Math.min(...xs),
          x1: at.x + Math.max(...xs),
          y0: at.y + Math.min(...ys),
          y1: at.y + Math.max(...ys) + 40,
        });
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

  /** The delivered sheet arrived: every image moves over to it (rescaled to its master). */
  useSheet(img: HTMLImageElement): void {
    const key = ensureXmasTexture(this.scene, img);
    if (key === XMAS_STANDIN || key === this.key) return;
    const k = this.master / masterOf(this.scene, key);
    this.key = key;
    this.master = masterOf(this.scene, key);
    for (const g of this.garlands) g.img.setTexture(key, g.frame).setScale(g.img.scaleX * k);
    for (const b of this.baubles) b.img.setTexture(key, b.img.frame.name).setScale(1 / this.master);
    for (const gl of this.glints)
      gl.img.setTexture(key, 'glint').setScale(this.look.glint.scale / this.master);
    for (const d of this.drawn.values()) {
      d.img.setScale(this.planeScale[d.plane] / this.master);
      if (d.landed)
        d.lid
          .setTexture(key, d.lid.frame.name)
          .setScale((this.planeScale[d.plane] / this.master) * 0.92);
    }
  }

  /** Whether the delivered sheet (not the stand-in) is drawn. */
  get final(): boolean {
    return this.key === CHRISTMAS_SHEET || this.key === CHRISTMAS_SHEET_HD;
  }

  /** e2e: which sheet is drawn ('hd', 'standard' or 'standin'). */
  get sheetKind(): 'hd' | 'standard' | 'standin' {
    return this.key === CHRISTMAS_SHEET_HD
      ? 'hd'
      : this.key === CHRISTMAS_SHEET
        ? 'standard'
        : 'standin';
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
        const bow = this.scene.add.image(t.x, t.y, this.key, 'bow_a').setVisible(false);
        const confetti = this.scene.add.image(t.x, t.y, this.key, 'confetti').setVisible(false);
        // Under the props (a prop covers part of the box), over the layer's art; the lid and
        // confetti fly over everything in the plane.
        node.fruit.add(img);
        node.overlay?.add(lid);
        node.overlay?.add(bow);
        node.overlay?.add(confetti);
        img.setScale(s / this.master);
        d = { img, lid, bow, confetti, plane: t.plane, openedAt: null, landed: false };
        this.drawn.set(t.id, d);
      }
      const wrap = wrapOf(t.id);
      setFrame(d.img, this.key, `present_${wrap}_${t.dark ? 'open' : 'shut'}`);
      if (d.img.visible === this.hidden) d.img.setVisible(!this.hidden);
      if (t.dark && d.openedAt === null) d.openedAt = tick;
      if (d.openedAt !== null) this.animateOpen(d, t.x, t.y, s, wrap, tick - d.openedAt);
    }
    // Each tree's glint walks its baubles: a soft swell up and down at each in turn (sim time).
    const per = this.look.glint.periodSeconds * TICKS_PER_SECOND;
    for (const gl of this.glints) {
      const t = tick + gl.phase * per;
      const n = Math.floor(t / per);
      const k = (t - n * per) / per;
      const b = gl.baubles[n % gl.baubles.length];
      if (b === undefined) continue;
      if (gl.img.x !== b.x - 6 || gl.img.y !== b.y - 6) gl.img.setPosition(b.x - 6, b.y - 6);
      // Up and down in the first 40 % of the period, then dark: never a flash.
      gl.img.setAlpha(k < 0.4 ? this.look.glint.alpha * Math.sin((k / 0.4) * Math.PI) : 0);
    }
  }

  /**
   * A present opening, on sim ticks (a held frame shows it): the lid (its bow popped off) is flung
   * up, tumbles a full turn and lands tilted behind the box, where it stays; the bow flies higher,
   * spinning, and fades; a puff of paper confetti bursts up and falls. No flash.
   */
  private animateOpen(
    d: DrawnPresent,
    x: number,
    y: number,
    s: number,
    wrap: string,
    ticks: number,
  ): void {
    const t = ticks / TICKS_PER_SECOND;
    const lidT = Math.min(1, t / this.look.lidSeconds);
    const top = y - 38 * s;
    const restX = x + 14 * s;
    const restY = y - 54 * s;
    const restRot = -0.244;
    const sc = s / this.master;
    if (!d.landed) {
      setFrame(d.lid, this.key, `lid_${wrap}` as XmasFrame);
      const hop = this.look.lidHopPx * s * 4 * lidT * (1 - lidT);
      const e = lidT * lidT * (3 - 2 * lidT);
      d.lid
        .setVisible(true)
        .setScale(sc * (1 - 0.08 * e))
        .setPosition(x + (restX - x) * e, top + (restY - top) * e - hop)
        .setRotation(restRot * e - Math.PI * 2 * (1 - e));
      if (lidT >= 1) {
        // Landed: behind the box (under the present in its container), for good.
        d.landed = true;
        d.lid
          .setRotation(restRot)
          .setPosition(restX, restY)
          .setScale(sc * 0.92);
        const node = this.parallax.plane(d.plane);
        node.overlay?.remove(d.lid);
        node.fruit.addAt(d.lid, node.fruit.getIndex(d.img));
      }
    }
    const bowT = t / (this.look.lidSeconds * 0.9);
    if (bowT < 1) {
      setFrame(d.bow, this.key, `bow_${wrap}` as XmasFrame);
      d.bow
        .setVisible(true)
        .setScale(sc)
        .setPosition(
          x - 40 * s * bowT,
          top - 30 * s - this.look.lidHopPx * 1.6 * s * 4 * bowT * (1 - bowT * 0.6),
        )
        .setRotation(-3 * bowT)
        .setAlpha(bowT < 0.6 ? 1 : (1 - bowT) / 0.4);
    } else if (d.bow.visible) d.bow.setVisible(false);
    const cT = t / this.look.confettiSeconds;
    if (cT < 1) {
      setFrame(d.confetti, this.key, 'confetti');
      d.confetti
        .setVisible(true)
        .setPosition(x, top - 20 * s - 90 * s * cT + 140 * s * cT * cT)
        .setScale(((0.5 + 0.8 * cT) * s) / this.master)
        .setAlpha(cT < 0.6 ? 1 : (1 - cT) / 0.4);
    } else if (d.confetti.visible) d.confetti.setVisible(false);
  }

  /** The sting at the start; a present's paper and bell where it is. */
  handle(events: readonly SimEvent[], audio: AudioDirector, width: number): void {
    const half = width / 2;
    for (const e of events) {
      if (e.type === 'feesdagStarted') playXmasSound(audio, 'sting', 0);
      else if (e.type === 'presentsFound') this.foundPoints = e.points;
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
  tinsel(): {
    prop: string | null;
    trees: string[];
    garlands: number;
    baubles: number;
    found: number | null;
    sheet: 'hd' | 'standard' | 'standin';
    crowns: { id: string; x: number; y: number; w: number; h: number }[];
  } {
    return {
      prop: this.tinselTrees[0] ?? null,
      trees: [...this.tinselTrees],
      garlands: this.garlands.length,
      baubles: this.baubles.length,
      found: this.foundPoints,
      sheet: this.sheetKind,
      crowns: this.crowns.flatMap((c) => {
        const node = this.parallax.layer(c.layer);
        if (node === undefined) return [];
        const k = node.root.scaleX;
        const x = node.root.x + c.x0 * k;
        const y = node.root.y + c.y0 * node.root.scaleY;
        return [
          {
            id: c.id,
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round((c.x1 - c.x0) * k),
            h: Math.round((c.y1 - c.y0) * node.root.scaleY),
          },
        ];
      }),
    };
  }

  clear(): void {
    for (const d of this.drawn.values()) {
      d.img.destroy();
      d.lid.destroy();
      d.bow.destroy();
      d.confetti.destroy();
    }
    this.drawn.clear();
  }
}
