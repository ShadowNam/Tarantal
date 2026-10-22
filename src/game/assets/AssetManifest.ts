// Every texture and sound the game uses comes through here (art bible §9, Tech §10). Each key has
// a procedural placeholder from ProceduralAssetFactory (or the synth, for sounds). M10: when the
// asset index (assetIndex.ts, written by tools/pack-atlases.ts) lists a final file for a key and
// it loads, that file is used and the placeholder is skipped; otherwise the placeholder stays.
// Views only ask for keys, so delivered art drops in without code changes.
import type * as Phaser from 'phaser';
import type { PlaneId } from '../../sim/types';
import type { AssetIndex, AudioEntry, BirdPlaneEntry, ImageEntry } from './assetIndex';
import { loadBytes, loadImage, loadJson } from './finalLoader';

/** A texture drawn at runtime onto a canvas. Origin is in texture pixels. */
export interface CanvasSpec {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

/** A parallax layer cut into tiles ≤ 2048 px wide (art bible §4.1). */
export interface LayerArt {
  readonly tiles: readonly string[];
  /** Width of one tile in layer px (after `scale`). */
  readonly tileWidth: number;
  /** Layer x of the first tile's left edge (−bleed). */
  readonly left: number;
  readonly top: number;
  /** Textures are drawn at 1/scale resolution and displayed scaled up (soft layers like the sky). */
  readonly scale: number;
}

export type AssetStatus = 'final' | 'placeholder';
export type AssetKind = 'texture' | 'layer' | 'bird' | 'sound';

/** One manifest key as the audit and the test hook see it. */
export interface ManifestEntry {
  readonly key: string;
  readonly kind: AssetKind;
  readonly status: AssetStatus;
}

/** A delivered bird atlas for one creature on one plane (after loading). */
export interface FinalBird {
  readonly atlasKey: string;
  readonly entry: BirdPlaneEntry;
  /** Design px per texture px of the atlas set in use (@2x halves it). */
  readonly scale: number;
}

/** A sound's delivered file bytes, handed to the AudioDirector to decode. */
export interface FinalSound {
  readonly key: string;
  readonly entry: AudioEntry;
  readonly bytes: ArrayBuffer;
  readonly format: 'ogg' | 'mp3';
}

export interface FinalLoadOptions {
  /** 2 = use @2x bird atlases where delivered (high tier); else @1x. */
  readonly atlasScale: 1 | 2;
  readonly timeoutMs: number;
  /** Which audio file the browser plays (null = no audio files at all). */
  readonly audioFormat: 'ogg' | 'mp3' | null;
}

export type BirdFrame = 'up' | 'down' | 'stand';

export const MAX_TILE_WIDTH = 2048;

export class AssetManifest {
  private readonly specs = new Map<string, CanvasSpec>();
  private readonly layerArt = new Map<string, LayerArt>();
  /** Placeholder tile key → its layer's asset id (skipped when the layer has final art). */
  private readonly layerOfTile = new Map<string, string>();
  /** Sound keys this manifest's hunts can play (placeholders are the synth or silence). */
  private readonly sounds = new Set<string>();
  // Final files that loaded (M10).
  private readonly finalImages = new Map<string, { img: HTMLImageElement; entry: ImageEntry }>();
  private readonly finalLayers = new Map<
    string,
    { art: LayerArt; tiles: readonly { key: string; img: HTMLImageElement }[] }
  >();
  private readonly finalBirds = new Map<
    string,
    FinalBird & { img: HTMLImageElement[]; data: object[] }
  >();
  private readonly finalSounds = new Map<string, FinalSound>();
  private soundsLoaded: Promise<readonly FinalSound[]> = Promise.resolve([]);

  addTexture(spec: CanvasSpec): void {
    this.specs.set(spec.key, spec);
  }

  addLayer(assetId: string, art: LayerArt, tiles: readonly CanvasSpec[]): void {
    for (const t of tiles) {
      this.addTexture(t);
      this.layerOfTile.set(t.key, assetId);
    }
    this.layerArt.set(assetId, art);
  }

  addBird(creature: string, plane: PlaneId, frame: BirdFrame, spec: CanvasSpec): void {
    this.addTexture({ ...spec, key: birdKey(creature, plane, frame) });
  }

  addSound(key: string): void {
    this.sounds.add(key);
  }

  /** The layer's final art when it loaded, else its placeholder. */
  layer(assetId: string): LayerArt | undefined {
    return this.finalLayers.get(assetId)?.art ?? this.layerArt.get(assetId);
  }

  has(key: string): boolean {
    return this.specs.has(key);
  }

  /** Texture key for a bird; creatures without art yet fall back to the plain tarentaal. */
  bird(creature: string, plane: PlaneId, frame: BirdFrame): string {
    const key = birdKey(creature, plane, frame);
    return this.specs.has(key) ? key : birdKey('tarentaal', plane, frame);
  }

  /** The delivered atlas and clips for a bird on a plane, or null (placeholder frames). */
  finalBird(creature: string, plane: PlaneId): FinalBird | null {
    return this.finalBirds.get(`${creature}/${plane}`) ?? null;
  }

  /** Origin as fractions (for setOrigin). A final image may set its own. */
  origin(key: string): { x: number; y: number } {
    const s = this.specs.get(key);
    const base = s ? { x: s.originX / s.width, y: s.originY / s.height } : { x: 0.5, y: 0.5 };
    const f = this.finalImages.get(key)?.entry;
    return f ? { x: f.originX ?? base.x, y: f.originY ?? base.y } : base;
  }

  /** Placeholder size of a texture key in texture px (the size a delivered image must match). */
  size(key: string): { width: number; height: number } | null {
    const s = this.specs.get(key);
    return s ? { width: Math.ceil(s.width), height: Math.ceil(s.height) } : null;
  }

  /**
   * Loads every final file the index names for this manifest's keys. Never rejects: a file that
   * fails or times out leaves its key on the placeholder. Call before install(); keys already in
   * the texture manager keep what they have.
   */
  async loadFinal(index: AssetIndex, o: FinalLoadOptions): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const [key, entry] of Object.entries(index.images)) {
      if (!this.specs.has(key) || this.layerOfTile.has(key)) continue;
      jobs.push(
        loadImage(entry.file.path, o.timeoutMs).then((img) => {
          if (img !== null) this.finalImages.set(key, { img, entry });
        }),
      );
    }
    for (const [id, entry] of Object.entries(index.layers)) {
      if (!this.layerArt.has(id)) continue;
      jobs.push(
        Promise.all(entry.tiles.map((t) => loadImage(t.path, o.timeoutMs))).then((imgs) => {
          // A layer is all or nothing: half a delivered panorama would show a seam.
          if (imgs.some((i) => i === null)) return;
          const tiles = imgs.map((img, i) => ({
            key: `final:layer/${id}/${i}`,
            // Safe: the line above returned if any image is null.
            img: img as HTMLImageElement,
          }));
          this.finalLayers.set(id, {
            tiles,
            art: {
              tiles: tiles.map((t) => t.key),
              tileWidth: entry.tileWidth,
              left: entry.left,
              top: entry.top,
              scale: 1,
            },
          });
        }),
      );
    }
    for (const [creature, planes] of Object.entries(index.birds)) {
      for (const [plane, entry] of Object.entries(planes) as [PlaneId, BirdPlaneEntry][]) {
        // Only birds this biome can show (it has placeholder frames for them).
        if (!this.specs.has(birdKey(creature, plane, 'stand'))) continue;
        const use2x = o.atlasScale === 2 && entry.x2 !== undefined;
        const atlas = use2x && entry.x2 !== undefined ? entry.x2 : entry.x1;
        jobs.push(
          Promise.all(
            atlas.pages.map((pg) =>
              Promise.all([
                loadImage(pg.image.path, o.timeoutMs),
                loadJson(pg.data.path, o.timeoutMs),
              ]),
            ),
          ).then((pages) => {
            const imgs: HTMLImageElement[] = [];
            const data: object[] = [];
            for (const [img, d] of pages) {
              // All pages or none: a missing page would leave clips without frames.
              if (img === null || typeof d !== 'object' || d === null) return;
              imgs.push(img);
              data.push(d);
            }
            this.finalBirds.set(`${creature}/${plane}`, {
              atlasKey: `final:bird/${creature}/${plane}@${use2x ? 2 : 1}x`,
              entry,
              scale: use2x ? entry.scale / 2 : entry.scale,
              img: imgs,
              data,
            });
          }),
        );
      }
    }
    // Sounds load beside the game, not before it: nothing plays before the first tap, so boot
    // never waits on audio (music stems are the largest files).
    const sounds: Promise<void>[] = [];
    if (o.audioFormat !== null) {
      const format = o.audioFormat;
      for (const [key, entry] of Object.entries(index.audio)) {
        if (!this.sounds.has(key)) continue;
        sounds.push(
          loadBytes(entry[format].path, o.timeoutMs).then((bytes) => {
            if (bytes !== null) this.finalSounds.set(key, { key, entry, bytes, format });
          }),
        );
      }
    }
    this.soundsLoaded = Promise.all(sounds).then(() => [...this.finalSounds.values()]);
    await Promise.all(jobs);
  }

  /** Delivered sounds once their bytes are in (after loadFinal; empty without an index). */
  soundsReady(): Promise<readonly FinalSound[]> {
    return this.soundsLoaded;
  }

  /** Final or placeholder, for every key (birds and layers as one entry each). */
  status(key: string): AssetStatus {
    if (this.finalImages.has(key) || this.finalLayers.has(key) || this.finalSounds.has(key))
      return 'final';
    const bird = /^bird\/([^/]+)\/([^/]+)/.exec(key);
    if (bird !== null && this.finalBirds.has(`${bird[1]}/${bird[2]}`)) return 'final';
    return 'placeholder';
  }

  /** Every key once: textures, layers (not their tiles), birds per plane, sounds. */
  entries(): ManifestEntry[] {
    const out: ManifestEntry[] = [];
    const birds = new Set<string>();
    for (const key of this.specs.keys()) {
      if (this.layerOfTile.has(key)) continue;
      const bird = /^(bird\/[^/]+\/[^/]+)\//.exec(key);
      if (bird?.[1] !== undefined) {
        if (!birds.has(bird[1])) out.push({ key: bird[1], kind: 'bird', status: this.status(key) });
        birds.add(bird[1]);
        continue;
      }
      out.push({ key, kind: 'texture', status: this.status(key) });
    }
    for (const id of this.layerArt.keys())
      out.push({ key: id, kind: 'layer', status: this.status(id) });
    for (const key of this.sounds) out.push({ key, kind: 'sound', status: this.status(key) });
    return out;
  }

  /**
   * Puts textures into the texture manager (each once per game): final files first, then
   * placeholders drawn for the rest. With `filter`, only matching placeholder keys; with
   * `budgetMs`, stops drawing after that much time so the rest can follow on later frames.
   * Returns true only when every texture in the manifest is in (filtered-out ones count as
   * still missing), so callers know whether more work is left.
   */
  install(
    textures: Phaser.Textures.TextureManager,
    filter: (key: string) => boolean = () => true,
    budgetMs = Infinity,
  ): boolean {
    for (const [key, { img }] of this.finalImages)
      if (!textures.exists(key)) textures.addImage(key, img);
    for (const { tiles } of this.finalLayers.values())
      for (const t of tiles) if (!textures.exists(t.key)) textures.addImage(t.key, t.img);
    for (const b of this.finalBirds.values())
      if (!textures.exists(b.atlasKey)) textures.addAtlasJSONHash(b.atlasKey, b.img, b.data);
    const start = performance.now();
    let complete = true;
    for (const spec of this.specs.values()) {
      if (textures.exists(spec.key) || this.skipped(spec.key)) continue;
      if (!filter(spec.key) || performance.now() - start > budgetMs) {
        complete = false;
        continue;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(spec.width));
      canvas.height = Math.max(1, Math.ceil(spec.height));
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('2D canvas unavailable');
      spec.draw(ctx);
      textures.addCanvas(spec.key, canvas);
    }
    return complete;
  }

  /** Keys not yet in the texture manager (0 once install() has completed). */
  missing(textures: Phaser.Textures.TextureManager): string[] {
    const finals = [
      ...[...this.finalLayers.values()].flatMap((l) => l.tiles.map((t) => t.key)),
      ...[...this.finalBirds.values()].map((b) => b.atlasKey),
    ];
    return [...[...this.specs.keys()].filter((k) => !this.skipped(k)), ...finals].filter(
      (k) => !textures.exists(k),
    );
  }

  /** A placeholder tile of a layer whose final art loaded is never drawn. */
  private skipped(key: string): boolean {
    const layer = this.layerOfTile.get(key);
    return layer !== undefined && this.finalLayers.has(layer);
  }
}

/** Textures the start card needs; birds can be drawn while the card is showing. */
export function neededBeforeStart(key: string): boolean {
  return !key.startsWith('bird/');
}

/** Manifest key of a sound effect (synth placeholder until a recording is delivered). */
export function sfxKey(id: string): string {
  return `sfx/${id}`;
}

export function birdKey(creature: string, plane: PlaneId, frame: BirdFrame): string {
  return `bird/${creature}/${plane}/${frame}`;
}

/** Fixed keys for UI and FX textures. */
export const TEX = {
  stone: 'fx/stone',
  glare: 'omen/glare',
  water: 'biome/water',
  rain: 'omen/rain',
  rainbow: 'omen/rainbow',
  splash: 'fx/splash',
  shell: 'ui/shell',
  shellEmpty: 'ui/shell_empty',
  reticle: 'ui/reticle',
  badgeNo: 'ui/badge_no',
  feather: 'fx/feather',
  flash: 'fx/flash',
  bubble: 'fx/bubble',
  puff: 'fx/puff',
  grassTuft: 'fx/grass_tuft',
  gun: 'gun/dubbelloop',
  // M4: secrets, crates, omen, boss, helpers, crate weapons.
  rotor: 'secret/rotor',
  mark: 'secret/mark',
  markHit: 'secret/mark_hit',
  glint: 'fx/glint',
  ring: 'fx/ring',
  spark: 'fx/spark',
  crateChute: 'crate/chute',
  crateBox: 'crate/box',
  dustDevil: 'fx/dust_devil',
  leaf: 'fx/leaf',
  dust: 'fx/dust',
  smoke: 'fx/smoke',
  pot: 'fx/pot',
  meerkat: 'helper/meerkat',
  windsock: 'ui/windsock',
} as const;

/** First-person art for a weapon id (crate weapons get their own; unknown ids use the shotgun). */
export function gunKey(weaponId: string): string {
  return `gun/${weaponId}`;
}
