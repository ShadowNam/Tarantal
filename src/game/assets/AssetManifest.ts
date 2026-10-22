// Every texture and sound the game uses comes through here (art bible §9, Tech §10). Each key has
// a procedural placeholder from ProceduralAssetFactory (or the synth, for sounds). M10: when the
// asset index (assetIndex.ts, written by tools/pack-atlases.ts) lists a final file for a key and
// it loads, that file is used and the placeholder is skipped; otherwise the placeholder stays.
// Views only ask for keys, so delivered art drops in without code changes.
import type * as Phaser from 'phaser';
import type { PlaneId } from '../../sim/types';
import type {
  AssetIndex,
  AssetOrigin,
  AudioEntry,
  BirdPlaneEntry,
  GunEntry,
  ImageEntry,
} from './assetIndex';
import { COMMON_GROUP, LATE_GROUP } from './assetIndex';
import { checkAtlas, checkBirdAtlas } from './atlasCheck';
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

/** D-029: `interim` = delivered, but code-drawn stand-in art (tools/art/), not the launch art. */
export type AssetStatus = 'final' | 'interim' | 'placeholder';
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

/** A delivered animated gun (D-029) after loading. */
export interface FinalGun {
  readonly atlasKey: string;
  readonly entry: GunEntry;
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
  /** The biome this manifest draws: entries of other biomes' groups are skipped (D-029). */
  readonly biome?: string;
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
  private readonly finalGuns = new Map<
    string,
    FinalGun & { img: HTMLImageElement[]; data: object[] }
  >();
  /** Sound keys whose file loaded (status); the bytes themselves are handed off once. */
  private readonly finalSoundKeys = new Set<string>();
  /** Delivered keys (texture, layer, `bird/<c>/<plane>`, gun texture, sound) marked interim. */
  private readonly interimKeys = new Set<string>();
  /** Weapon ids whose animated rig is interim (a rig's provenance wins over a gun image's). */
  private readonly interimGuns = new Set<string>();
  private soundFiles: FinalSound[] = [];
  private soundsLoaded: Promise<void> = Promise.resolve();
  /** D-029: the late group's downloads (resolves when they have all settled). */
  lateLoaded: Promise<void> = Promise.resolve();

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

  /**
   * D-029: puts a delivered bird atlas on the GPU the first time a view needs it. Returns the
   * atlas (or null: not delivered, or still downloading — the placeholder draws meanwhile).
   */
  ensureBird(
    textures: Phaser.Textures.TextureManager,
    creature: string,
    plane: PlaneId,
  ): FinalBird | null {
    const b = this.finalBirds.get(`${creature}/${plane}`);
    if (b === undefined) return null;
    if (!textures.exists(b.atlasKey)) textures.addAtlasJSONHash(b.atlasKey, b.img, b.data);
    return b;
  }

  /**
   * D-029: uploads the bird atlases that came with the first download (not the late group) when
   * a hunt starts, so their GPU upload never lands mid-hunt. Late arrivals upload on first use.
   */
  prewarmBirds(textures: Phaser.Textures.TextureManager): void {
    for (const b of this.finalBirds.values())
      if (b.entry.group !== LATE_GROUP && !textures.exists(b.atlasKey))
        textures.addAtlasJSONHash(b.atlasKey, b.img, b.data);
  }

  /** D-029: like ensureBird, for a weapon's animated gun. */
  ensureGun(textures: Phaser.Textures.TextureManager, weaponId: string): FinalGun | null {
    const g = this.finalGuns.get(weaponId);
    if (g === undefined) return null;
    if (!textures.exists(g.atlasKey)) textures.addAtlasJSONHash(g.atlasKey, g.img, g.data);
    return g;
  }

  /** D-029: the delivered animated gun for a weapon id, or null (single image or placeholder). */
  finalGun(weaponId: string): FinalGun | null {
    return this.finalGuns.get(weaponId) ?? null;
  }

  private mark(key: string, origin: AssetOrigin | undefined): void {
    if (origin === 'interim') this.interimKeys.add(key);
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
    // D-029: the late group downloads after everything else (it isn't needed to start a hunt).
    const late: (() => Promise<void>)[] = [];
    const queue = (group: string, job: () => Promise<void>): void => {
      // A key every biome has can still be delivered for one biome only (rig.json group): only
      // that biome's manifest loads it.
      if (
        o.biome !== undefined &&
        group !== COMMON_GROUP &&
        group !== LATE_GROUP &&
        group !== o.biome
      )
        return;
      if (group === LATE_GROUP) late.push(job);
      else jobs.push(job());
    };
    for (const [key, entry] of Object.entries(index.images)) {
      if (!this.specs.has(key) || this.layerOfTile.has(key)) continue;
      queue(entry.group, () =>
        loadImage(entry.file.path, o.timeoutMs).then((img) => {
          if (img === null) return;
          this.finalImages.set(key, { img, entry });
          this.mark(key, entry.origin);
        }),
      );
    }
    for (const [id, entry] of Object.entries(index.layers)) {
      if (!this.layerArt.has(id)) continue;
      queue(entry.group, () =>
        Promise.all(entry.tiles.map((t) => loadImage(t.path, o.timeoutMs))).then((imgs) => {
          // A layer is all or nothing: half a delivered panorama would show a seam.
          if (imgs.some((i) => i === null)) return;
          const tiles = imgs.map((img, i) => ({
            key: `final:layer/${id}/${i}`,
            // Safe: the line above returned if any image is null.
            img: img as HTMLImageElement,
          }));
          this.mark(id, entry.origin);
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
        queue(entry.group, () =>
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
            // Every clip's frames must exist in the pages (Phaser throws on a short clip).
            const check = checkBirdAtlas(entry.clips, data);
            if (check.dropped.length > 0)
              console.warn(
                `[assets] ${creature} ${plane}: clips with missing frames dropped: ${check.dropped.join(', ')}`,
              );
            if (check.clips === null) return;
            this.mark(`bird/${creature}/${plane}`, entry.origin);
            this.finalBirds.set(`${creature}/${plane}`, {
              atlasKey: `final:bird/${creature}/${plane}@${use2x ? 2 : 1}x`,
              entry: { ...entry, clips: check.clips },
              scale: use2x ? entry.scale / 2 : entry.scale,
              img: imgs,
              data,
            });
          }),
        );
      }
    }
    for (const [id, entry] of Object.entries(index.guns)) {
      if (!this.specs.has(gunKey(id))) continue;
      const use2x = o.atlasScale === 2 && entry.x2 !== undefined;
      const atlas = use2x && entry.x2 !== undefined ? entry.x2 : entry.x1;
      queue(entry.group, () =>
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
            if (img === null || typeof d !== 'object' || d === null) return;
            imgs.push(img);
            data.push(d);
          }
          const check = checkAtlas(entry.clips, data);
          // Without its idle frame the gun can't stand still: keep the placeholder.
          if (check.clips?.idle === undefined) return;
          if (check.dropped.length > 0)
            console.warn(
              `[assets] gun ${id}: clips with missing frames dropped: ${check.dropped.join(', ')}`,
            );
          if (entry.origin === 'interim') this.interimGuns.add(id);
          this.finalGuns.set(id, {
            atlasKey: `final:gun/${id}@${use2x ? 2 : 1}x`,
            entry: { ...entry, clips: check.clips },
            scale: use2x ? 0.5 : 1,
            img: imgs,
            data,
          });
        }),
      );
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
            if (bytes === null) return;
            this.finalSoundKeys.add(key);
            this.mark(key, entry.origin);
            this.soundFiles.push({ key, entry, bytes, format });
          }),
        );
      }
    }
    this.soundsLoaded = Promise.all(sounds).then(() => undefined);
    await Promise.all(jobs);
    this.lateLoaded = Promise.all(late.map((job) => job())).then(() => undefined);
  }

  /**
   * Delivered sounds once their bytes are in, handed over once: the manifest keeps no copy (the
   * AudioDirector decides what stays in memory).
   */
  takeSounds(): Promise<readonly FinalSound[]> {
    return this.soundsLoaded.then(() => {
      const files = this.soundFiles;
      this.soundFiles = [];
      return files;
    });
  }

  /** Final, interim or placeholder, for every key (birds and layers as one entry each). */
  status(key: string): AssetStatus {
    const bird = /^bird\/([^/]+)\/([^/]+)/.exec(key);
    const birdKeyOf = bird === null ? null : `bird/${bird[1]}/${bird[2]}`;
    const gun = /^gun\/(.+)$/.exec(key);
    const delivered =
      this.finalImages.has(key) ||
      this.finalLayers.has(key) ||
      this.finalSoundKeys.has(key) ||
      (bird !== null && this.finalBirds.has(`${bird[1]}/${bird[2]}`)) ||
      (gun?.[1] !== undefined && this.finalGuns.has(gun[1]));
    if (!delivered) return 'placeholder';
    // An animated gun wins over a single gun image, so its provenance decides.
    const rigId = gun?.[1] !== undefined && this.finalGuns.has(gun[1]) ? gun[1] : null;
    const interim =
      rigId !== null ? this.interimGuns.has(rigId) : this.interimKeys.has(birdKeyOf ?? key);
    return interim ? 'interim' : 'final';
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
    // Bird and gun atlases go to the GPU on first use (ensureBird / ensureGun, D-029), so a hunt
    // only holds the creatures and guns it actually shows.
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

  /** Every texture key this manifest puts in the texture manager (placeholders, final files). */
  textureKeys(): Set<string> {
    const out = new Set<string>(this.specs.keys());
    for (const key of this.finalImages.keys()) out.add(key);
    for (const { tiles } of this.finalLayers.values()) for (const t of tiles) out.add(t.key);
    return out;
  }

  /**
   * D-031 (low-tier memory): removes the textures this manifest installed that `next` doesn't
   * use: the old biome's layers, props and biome-only placeholders, and every bird atlas `next`
   * won't prewarm at hunt start (bosses, late variants, biome creatures). Shared keys (UI, FX,
   * first-download birds) stay. Decoded images stay cached here, so install() / ensureBird()
   * re-add them when needed. With `anims`, the removed atlases' animations go too (they hold
   * frames of the removed textures; BirdView recreates them on first use). Gun atlases are kept.
   * Call it only once nothing draws the old biome's objects. Returns the removed keys.
   */
  release(
    textures: Phaser.Textures.TextureManager,
    next: AssetManifest,
    anims?: Phaser.Animations.AnimationManager,
  ): string[] {
    if (next === this) return [];
    const keep = next.textureKeys();
    for (const b of next.finalBirds.values())
      if (b.entry.group !== LATE_GROUP) keep.add(b.atlasKey);
    const removed: string[] = [];
    for (const key of this.textureKeys()) {
      if (keep.has(key) || !textures.exists(key)) continue;
      textures.remove(key);
      removed.push(key);
    }
    for (const [id, b] of this.finalBirds) {
      if (keep.has(b.atlasKey) || !textures.exists(b.atlasKey)) continue;
      textures.remove(b.atlasKey);
      removed.push(b.atlasKey);
      // `id` is `${creature}/${plane}`: BirdView's animation keys are `final:${id}/${clip}`.
      for (const clip of Object.keys(b.entry.clips)) {
        const key = `final:${id}/${clip}`;
        if (anims?.exists(key) === true) anims.remove(key);
      }
    }
    return removed;
  }

  /** Keys not yet in the texture manager (0 once install() has completed). */
  missing(textures: Phaser.Textures.TextureManager): string[] {
    // Bird and gun atlases are installed on demand; until then their placeholders draw.
    const finals = [...this.finalLayers.values()].flatMap((l) => l.tiles.map((t) => t.key));
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

/** M10: a biome's music stem (calm / build / stampede), its ambience loop, an Oupa bark. */
export function musicKey(biome: string, stem: string): string {
  return `music/${biome}/${stem}`;
}
export function ambienceKey(biome: string): string {
  return `amb/${biome}`;
}
export function voiceKey(barkKey: string): string {
  return `voice/${barkKey}`;
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
