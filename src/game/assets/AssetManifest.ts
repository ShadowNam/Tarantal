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
  HdImage,
  ImageEntry,
} from './assetIndex';
import { COMMON_GROUP, LATE_GROUP, VER_GROUP, sharedTileKeys } from './assetIndex';
import type { FaunaFrames } from '../view/faunaHerds';
import { DESERT_GROUP } from './desertAssets';
import { BABOON_GROUP, BABOON_SHEET } from '../view/baboon/baboonKeys';
import { atlasRegion, checkAtlas, checkBirdAtlas, type AtlasRegion } from './atlasCheck';
import { loadBytes, loadImage, loadJson } from './finalLoader';
import { halveTexture, type TextureLike } from './hdTexture';

/** A texture drawn at runtime onto a canvas. Origin is in texture pixels. */
export interface CanvasSpec {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  /** D-051: a placeholder that is never shown (an HD stand-in): installed as a 1×1 canvas, while
   *  `width`/`height`/origin still give the texture's design size. */
  readonly empty?: boolean;
  /** D-053: its views scale it by displayScale() (props, far animals): an HD texture keeps its
   *  own size and displayScale() halves. Other keys draw HD textures at half size by themselves
   *  (hdTexture.ts). */
  readonly viewScaled?: boolean;
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
  /** v1.4 (#56): delivered art's opaque rows per bucket (asset index); none for placeholders. */
  readonly solid?: {
    readonly bucket: number;
    readonly rows: readonly (readonly [number, number] | null)[];
  };
  /** D-053: `solid` is in design px though the tiles are scaled (the HD tiles reuse the
   *  standard layer's profile). */
  readonly solidDesignPx?: boolean;
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
  /** D-053: the HD pack's atlas (its animations are keyed apart from the standard ones). */
  readonly hd?: boolean;
}

/** A delivered animated gun (D-029) after loading. */
export interface FinalGun {
  readonly atlasKey: string;
  readonly entry: GunEntry;
  /** Design px per texture px of the atlas set in use (@2x halves it). */
  readonly scale: number;
  /** D-053: the HD pack's atlas. */
  readonly hd?: boolean;
}

/** D-053: one HD file an area needs, for its size and the loading bar. */
export interface HdFile {
  readonly path: string;
  readonly bytes: number;
  readonly group: string;
}

/** D-053: an area's HD files: before its hunt (common, the area, desert) and after (late, Ver). */
export interface HdFiles {
  readonly now: readonly HdFile[];
  readonly background: readonly HdFile[];
}

/** D-053: how far the HD files before the hunt have come (bytes of the files that are in). */
export interface HdProgress {
  readonly done: number;
  readonly total: number;
  /** True once every file before the hunt has settled (loaded or failed). */
  readonly settled: boolean;
}

/** D-053: the groups a biome's manifest loads (D-029: other biomes' groups are skipped). */
export function groupForBiome(group: string, biome: string | undefined): boolean {
  return (
    biome === undefined ||
    group === COMMON_GROUP ||
    group === LATE_GROUP ||
    group === VER_GROUP ||
    group === DESERT_GROUP ||
    // v1.8b (D-062): the baboon sheet, loaded with every hunt (every area has a troop).
    group === BABOON_GROUP ||
    group === biome
  );
}

/** D-053: late and Ver groups load after the hunt can start (in the background). */
export function backgroundGroup(group: string): boolean {
  return group === LATE_GROUP || group === VER_GROUP || group === BABOON_GROUP;
}

/**
 * D-053: image keys whose HD texture is the one under the key now, with the display scale their
 * views apply (texture state is per game, shared by every biome's manifest).
 */
export const hdUnderKey = new Map<string, number>();
/** D-053: textures swapped out (Standard ↔ HD) or no longer wanted, freed once nothing draws them. */
export const retiredTextures = new Set<string>();
/** D-053: every decoded HD image (to count HD textures for the test hook and the memory check). */
export const hdSources = new WeakSet<object>();

/** D-053: textures in the texture manager whose image is an HD file. */
export function hdTextureCount(textures: Phaser.Textures.TextureManager): number {
  let n = 0;
  for (const key of textures.getTextureKeys())
    if (textures.get(key).source.some((src) => hdSources.has(src.image as object))) n++;
  return n;
}
/** D-053 (test hook): true when `texture` draws an HD file. */
export function isHdTexture(texture: Phaser.Textures.Texture): boolean {
  return texture.source.some((src) => hdSources.has(src.image as object));
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

/** v1.6 (D-042): a delivered key whose file failed, with the group it was delivered in. */
export interface MissingFile {
  readonly key: string;
  readonly path: string;
  readonly group: string;
}

/** v1.6 (D-042): what a hunt needs of the background-loaded Ver group (all of it waits otherwise). */
export interface LateNeed {
  /** A rifle's sight pictures (`sight/*`): a scoped hunt or the Skietbaan. */
  readonly sight: boolean;
  /** The map opens the Ver plane: its strip (and Ver-only props). */
  readonly ver: boolean;
  /** The hunt's weapon: its gun rig when it is delivered with the Ver group (the rifles). */
  readonly weapon?: string;
  /** v1.8b (D-062): the map has a baboon troop: its sheet (the baboons group). */
  readonly baboons?: boolean;
}

/**
 * v1.6 (D-042): the Ver-group files a hunt needs that failed to load. The late group (rare
 * variants, other guns) keeps its placeholders as before: nothing here starts on them.
 */
export function neededLateMissing(
  missing: readonly MissingFile[],
  need: LateNeed,
): readonly MissingFile[] {
  return missing.filter((m) => {
    if (m.key === BABOON_SHEET) return need.baboons === true;
    if (m.group !== VER_GROUP) return false;
    if (m.key.startsWith('sight/')) return need.sight;
    const gun = /^gun\/(.+)$/.exec(m.key);
    if (gun !== null) return gun[1] === need.weapon;
    return need.ver;
  });
}

export const MAX_TILE_WIDTH = 2048;

/** v1.7e (review R12): how many times the normal timeout a late or Ver image may take. */
export const LAZY_TIMEOUT_MUL = 8;

/** Placeholders upgrade() has renamed out of the way (keeps their new keys unique). */
let retiredPlaceholders = 0;

export class AssetManifest {
  /** @internal */
  readonly specs = new Map<string, CanvasSpec>();
  /** v1.8b (D-062): image keys whose delivered file the last load queued. */
  private readonly listedImages = new Set<string>();
  /** @internal */
  readonly layerArt = new Map<string, LayerArt>();
  /** Placeholder tile key → its layer's asset id (skipped when the layer has final art). */
  /** @internal */
  readonly layerOfTile = new Map<string, string>();
  /** Sound keys this manifest's hunts can play (placeholders are the synth or silence). */
  private readonly sounds = new Set<string>();
  // Final files that loaded (M10).
  /** @internal */
  readonly finalImages = new Map<string, { img: HTMLImageElement; entry: ImageEntry }>();
  /** @internal */
  readonly finalLayers = new Map<
    string,
    { art: LayerArt; tiles: readonly { key: string; img: HTMLImageElement }[] }
  >();
  /** @internal */
  readonly finalBirds = new Map<string, FinalBird & { img: HTMLImageElement[]; data: object[] }>();
  /** @internal */
  readonly finalGuns = new Map<string, FinalGun & { img: HTMLImageElement[]; data: object[] }>();
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
  /** v1.6 (D-042): true once the last loadFinal's late group (incl. the Ver group) has settled. */
  lateDone = true;
  /** v1.6 (D-042): texture keys install() drew as placeholders (upgrade() can swap them). */
  private readonly drawn = new Set<string>();
  // D-053: the HD pack's files that loaded (each key keeps its standard file too).
  /** @internal */
  readonly hdImages = new Map<
    string,
    { img: HTMLImageElement; entry: HdImage; std: number; path: string }
  >();
  /** @internal */
  readonly hdLayers = new Map<
    string,
    { art: LayerArt; tiles: readonly { key: string; img: HTMLImageElement; path: string }[] }
  >();
  /** @internal */
  readonly hdBirds = new Map<
    string,
    FinalBird & { img: HTMLImageElement[]; data: object[]; paths: string[] }
  >();
  /** @internal */
  readonly hdGuns = new Map<
    string,
    FinalGun & { img: HTMLImageElement[]; data: object[]; paths: string[] }
  >();
  /** D-053: the player's choice for this manifest (applied by install() / applyHd()). */
  /** @internal */
  hdWanted = false;
  /**
   * D-054: true until this manifest's install() runs, and again after release() (another area's
   * hunt took the GPU) until its next install(): an area whose HD pack is only preloaded on the
   * title uploads nothing. graphics.sync()/applyHd() calls every manifest, and put a released
   * area's HD layers straight back (the title's Karoo HD layers, +103 MB in every other area's
   * HD hunt on the Pixel 7 profile).
   */
  parked = true;
  /** D-053: layers whose HD tiles are in the texture manager. */
  /** @internal */
  readonly hdTilesIn = new Set<string>();
  /** @internal */
  hdLoading: { now: Promise<void>; all: Promise<void> } | null = null;
  /** @internal */
  hdBytes = { done: 0, total: 0, settled: false };
  /** D-053: bumps whenever applyHd() swaps art in or out (views refresh when it changes). */
  hdEpoch = 0;

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
    // D-053: the HD tiles once they are in the texture manager (applyHd / install).
    if (this.hdWanted && this.hdTilesIn.has(assetId)) {
      const hd = this.hdLayers.get(assetId);
      if (hd !== undefined) return hd.art;
    }
    return this.finalLayers.get(assetId)?.art ?? this.layerArt.get(assetId);
  }

  has(key: string): boolean {
    return this.specs.has(key);
  }

  /** v1.8b (D-062): the delivered index lists a file for this image (and this manifest loads it). */
  listed(key: string): boolean {
    return this.listedImages.has(key);
  }

  /** Texture key for a bird; creatures without art yet fall back to the plain tarentaal. */
  bird(creature: string, plane: PlaneId, frame: BirdFrame): string {
    const key = birdKey(creature, plane, frame);
    return this.specs.has(key) ? key : birdKey('tarentaal', plane, frame);
  }

  /** The delivered atlas and clips for a bird on a plane, or null (placeholder frames). */
  finalBird(creature: string, plane: PlaneId): FinalBird | null {
    return this.birdOf(`${creature}/${plane}`) ?? null;
  }

  /** D-053: the HD atlas while HD is chosen and it loaded, else the standard one. */
  private birdOf(
    id: string,
  ): (FinalBird & { img: HTMLImageElement[]; data: object[] }) | undefined {
    return (this.hdWanted ? this.hdBirds.get(id) : undefined) ?? this.finalBirds.get(id);
  }

  private gunOf(id: string): (FinalGun & { img: HTMLImageElement[]; data: object[] }) | undefined {
    return (this.hdWanted ? this.hdGuns.get(id) : undefined) ?? this.finalGuns.get(id);
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
    const b = this.birdOf(`${creature}/${plane}`);
    if (b === undefined) return null;
    if (!textures.exists(b.atlasKey)) textures.addAtlasJSONHash(b.atlasKey, b.img, b.data);
    retiredTextures.delete(b.atlasKey);
    return b;
  }

  /**
   * D-029: uploads the bird atlases that came with the first download (not the late group) when
   * a hunt starts, so their GPU upload never lands mid-hunt. Late arrivals upload on first use.
   */
  prewarmBirds(textures: Phaser.Textures.TextureManager): void {
    for (const id of this.finalBirds.keys()) {
      const b = this.birdOf(id);
      if (b !== undefined && b.entry.group !== LATE_GROUP && !textures.exists(b.atlasKey))
        textures.addAtlasJSONHash(b.atlasKey, b.img, b.data);
    }
  }

  /** D-029: like ensureBird, for a weapon's animated gun. */
  ensureGun(textures: Phaser.Textures.TextureManager, weaponId: string): FinalGun | null {
    const g = this.gunOf(weaponId);
    if (g === undefined) return null;
    if (!textures.exists(g.atlasKey)) textures.addAtlasJSONHash(g.atlasKey, g.img, g.data);
    retiredTextures.delete(g.atlasKey);
    return g;
  }

  /** D-029: the delivered animated gun for a weapon id, or null (single image or placeholder). */
  finalGun(weaponId: string): FinalGun | null {
    return this.gunOf(weaponId) ?? null;
  }

  /**
   * D-035: a delivered gun's idle frame as a region of its decoded page image, for small icons
   * (the Skiet-Skuur cards). Nothing goes to the GPU: the caller crops the region onto its own
   * small canvas. Null while the gun's art is not in (the late group may still be downloading).
   */
  gunIdleImage(weaponId: string): { img: HTMLImageElement; region: AtlasRegion } | null {
    const g = this.finalGuns.get(weaponId);
    const name = g?.entry.clips.idle?.frames[0];
    if (g === undefined || name === undefined) return null;
    const region = atlasRegion(g.data, name);
    const img = region === null ? undefined : g.img[region.page];
    return region === null || img === undefined ? null : { img, region };
  }

  /**
   * v1.6 (D-042): delivered keys whose files failed in the last loadFinal (the late group not
   * counted). A hunt never starts while this is not empty (main.ts retries, then asks).
   */
  missingFinal: readonly { key: string; path: string }[] = [];

  /**
   * v1.6 (D-042): delivered late and Ver-group keys whose files failed in the last loadFinal,
   * known once `lateLoaded` has settled (empty before). HuntScene asks neededLateMissing() which
   * of them a scoped hunt or the Skietbaan needs; main.ts retries those, then asks.
   */
  missingLate: readonly MissingFile[] = [];

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

  /** D-054: a far-animal sheet's frame table (design px), once its delivered file is in. */
  faunaFrames(key: string): FaunaFrames | undefined {
    return this.finalImages.get(key)?.entry.frames;
  }

  /** v1.4 B (D-039): display scale of a texture (design px per texture px; 2× art is 0.5). */
  displayScale(key: string): number {
    // D-053: a view-scaled key's HD texture is its own size; it shows at the HD scale.
    return hdUnderKey.get(key) ?? this.finalImages.get(key)?.entry.scale ?? 1;
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
    // v1.6 (D-042): what this load must deliver before a hunt may start (not the late group),
    // checked once the jobs are done; a failure is a key with the file that failed.
    const expect: { key: string; path: string; done: () => boolean }[] = [];
    // v1.6 (D-042): the same for the late and Ver groups, checked once they have settled.
    const expectLate: { key: string; path: string; group: string; done: () => boolean }[] = [];
    const queue = (
      group: string,
      job: () => Promise<void>,
      need?: { key: string; path: string; done: () => boolean },
    ): void => {
      // A key every biome has can still be delivered for one biome only (rig.json group): only
      // that biome's manifest loads it.
      if (
        o.biome !== undefined &&
        group !== COMMON_GROUP &&
        group !== LATE_GROUP &&
        group !== VER_GROUP &&
        // v1.7 (D-044): only a desert map's manifest lists the desert keys (others skip them).
        group !== DESERT_GROUP &&
        group !== BABOON_GROUP &&
        group !== o.biome
      )
        return;
      // v1.3: the Ver strips aren't needed to start a hunt either (only bonus maps show them).
      // v1.8b (D-062): the baboon sheet too (a hunt with a troop waits for that one file).
      if (group === LATE_GROUP || group === VER_GROUP || group === BABOON_GROUP) {
        late.push(job);
        if (need !== undefined) expectLate.push({ ...need, group });
      } else {
        jobs.push(job());
        if (need !== undefined) expect.push(need);
      }
    };
    for (const [key, entry] of Object.entries(index.images)) {
      if (!this.specs.has(key) || this.layerOfTile.has(key)) continue;
      // v1.8b (D-062): which delivered images this manifest loads (a hunt never waits for a file
      // the index doesn't have: with no or a partial delivery its placeholder draws).
      if (groupForBiome(entry.group, o.biome)) this.listedImages.add(key);
      queue(
        entry.group,
        () =>
          // v1.7e (review R12): a late or Ver image gets LAZY_TIMEOUT_MUL × the timeout: on a
          // slow connection it may land mid-hunt (TellView, FruitView, FaunaView poll for it);
          // dropped at 15 s it was lost for the session's hunts.
          loadImage(
            entry.file.path,
            o.timeoutMs * (backgroundGroup(entry.group) ? LAZY_TIMEOUT_MUL : 1),
          ).then((img) => {
            if (img === null) return;
            this.finalImages.set(key, { img, entry });
            this.mark(key, entry.origin);
          }),
        { key, path: entry.file.path, done: () => this.finalImages.has(key) },
      );
    }
    for (const [id, entry] of Object.entries(index.layers)) {
      if (!this.layerArt.has(id)) continue;
      queue(
        entry.group,
        () =>
          Promise.all(entry.tiles.map((t) => loadImage(t.path, o.timeoutMs))).then((imgs) => {
            // A layer is all or nothing: half a delivered panorama would show a seam.
            if (imgs.some((i) => i === null)) return;
            const keys = sharedTileKeys(`final:layer/${id}`, entry.tiles);
            const tiles = imgs.map((img, i) => ({
              key: keys[i] ?? `final:layer/${id}/${i}`,
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
                ...(entry.solid === undefined ? {} : { solid: entry.solid }),
              },
            });
          }),
        {
          key: id,
          path: entry.tiles.map((t) => t.path).join(', '),
          done: () => this.finalLayers.has(id),
        },
      );
    }
    for (const [creature, planes] of Object.entries(index.birds)) {
      for (const [plane, entry] of Object.entries(planes) as [PlaneId, BirdPlaneEntry][]) {
        // Only birds this biome can show (it has placeholder frames for them).
        if (!this.specs.has(birdKey(creature, plane, 'stand'))) continue;
        const use2x = o.atlasScale === 2 && entry.x2 !== undefined;
        const atlas = use2x && entry.x2 !== undefined ? entry.x2 : entry.x1;
        queue(
          entry.group,
          () =>
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
          {
            key: `bird/${creature}/${plane}`,
            path: atlas.pages.map((pg) => pg.image.path).join(', '),
            done: () => this.finalBirds.has(`${creature}/${plane}`),
          },
        );
      }
    }
    for (const [id, entry] of Object.entries(index.guns)) {
      if (!this.specs.has(gunKey(id))) continue;
      const use2x = o.atlasScale === 2 && entry.x2 !== undefined;
      const atlas = use2x && entry.x2 !== undefined ? entry.x2 : entry.x1;
      queue(
        entry.group,
        () =>
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
        {
          key: gunKey(id),
          path: atlas.pages.map((pg) => pg.image.path).join(', '),
          done: () => this.finalGuns.has(id),
        },
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
    this.missingFinal = expect.filter((e) => !e.done()).map((e) => ({ key: e.key, path: e.path }));
    for (const m of this.missingFinal)
      console.warn(`[assets] ${m.key}: delivered file failed to load (${m.path})`);
    this.lateDone = false;
    this.missingLate = [];
    this.lateLoaded = Promise.all(late.map((job) => job())).then(() => {
      this.missingLate = expectLate
        .filter((e) => !e.done())
        .map((e) => ({ key: e.key, path: e.path, group: e.group }));
      this.lateDone = true;
    });
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
    this.parked = false;
    for (const [key, { img }] of this.finalImages)
      if (!textures.exists(key)) {
        // D-053: straight to the HD file when HD is chosen and it is in.
        const hd = this.hdWanted ? this.hdImages.get(key) : undefined;
        if (hd === undefined) {
          textures.addImage(key, img);
          // D-053: the standard file draws at its own scale again (an HD scale left from an
          // earlier visit would show it at half size).
          hdUnderKey.delete(key);
        } else this.addHdImage(textures, key, hd);
      }
    for (const [id, { tiles }] of this.finalLayers) {
      // D-053: a layer drawn from its HD tiles doesn't upload its standard ones as well (on the
      // GPU they were most of an HD hunt's overshoot on phones: 270 MB > 256).
      if (this.hdWanted && this.hdLayers.has(id)) continue;
      for (const t of tiles) if (!textures.exists(t.key)) textures.addImage(t.key, t.img);
    }
    if (this.hdWanted) this.installHdTiles(textures);
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
      canvas.width = spec.empty === true ? 1 : Math.max(1, Math.ceil(spec.width));
      canvas.height = spec.empty === true ? 1 : Math.max(1, Math.ceil(spec.height));
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('2D canvas unavailable');
      spec.draw(ctx);
      textures.addCanvas(spec.key, canvas);
      this.drawn.add(spec.key);
    }
    return complete;
  }

  /**
   * v1.6 (D-042): swaps placeholders drawn earlier (by any manifest) for delivered images that
   * arrived since (keys starting with `prefix`). Views pick up the delivered image when they next
   * set the key (the sight pictures at every hunt start; v1.7b's power-up icons when
   * powerupIconEpoch() changes). Returns the swapped keys.
   */
  upgrade(textures: Phaser.Textures.TextureManager, prefix: string): string[] {
    const out: string[] = [];
    for (const [key, { img }] of this.finalImages) {
      if (!key.startsWith(prefix) || !textures.exists(key)) continue;
      // A placeholder may have been drawn by another biome's manifest (the title's): it is a
      // canvas texture, delivered art an image.
      const src = textures.get(key).getSourceImage();
      if (!this.drawn.has(key) && !(src instanceof HTMLCanvasElement)) continue;
      // Already the delivered file, or its HD twin while HD is wanted: nothing to swap.
      if (src === img || (this.hdWanted && src === this.hdImages.get(key)?.img)) continue;
      // Rename the placeholder instead of removing it: objects still drawing it (a HUD chip, a
      // crate tag, the pickup card) keep a live texture until their view sets the key again.
      // Removing it under them froze the hunt with a null frame when the late group landed
      // mid-hunt (v1.7b, D-046). The renamed canvas is a few KB and stays. D-054: an HD file
      // under the key (Standard chosen since) is retired instead, freed once nothing draws it.
      const isImage = !(src instanceof HTMLCanvasElement);
      const renamed = isImage
        ? `${key}#retired-${++retiredPlaceholders}`
        : `${key}#placeholder-${++retiredPlaceholders}`;
      textures.renameTexture(key, renamed);
      if (isImage) retiredTextures.add(renamed);
      textures.addImage(key, img);
      // The standard file draws at its own scale (an HD scale left under the key would halve it).
      hdUnderKey.delete(key);
      this.drawn.delete(key);
      out.push(key);
    }
    return out;
  }

  /** D-051: true once `key`'s delivered image is the texture under that key (not a placeholder). */
  delivered(textures: Phaser.Textures.TextureManager, key: string): boolean {
    const f = this.finalImages.get(key);
    if (f === undefined || !textures.exists(key)) return false;
    const src = textures.get(key).getSourceImage();
    return src === f.img || src === this.hdImages.get(key)?.img;
  }

  /** Every texture key this manifest puts in the texture manager (placeholders, final files). */
  textureKeys(): Set<string> {
    const out = new Set<string>(this.specs.keys());
    for (const key of this.finalImages.keys()) out.add(key);
    for (const { tiles } of this.finalLayers.values()) for (const t of tiles) out.add(t.key);
    for (const { tiles } of this.hdLayers.values()) for (const t of tiles) out.add(t.key);
    return out;
  }

  /**
   * D-031 (low-tier memory): removes the textures this manifest installed that `next` doesn't
   * use: the old biome's layers, props and biome-only placeholders, and every bird atlas `next`
   * won't prewarm at hunt start (bosses, late variants, biome creatures). Shared keys (UI, FX,
   * first-download birds) stay. Decoded images stay cached here, so install() / ensureBird()
   * re-add them when needed. With `anims`, the removed atlases' animations go too (they hold
   * frames of the removed textures; BirdView recreates them on first use). Gun atlases are kept
   * here; releaseGuns() drops the ones not equipped when a hunt ends.
   * Call it only once nothing draws the old biome's objects. Returns the removed keys.
   */
  release(
    textures: Phaser.Textures.TextureManager,
    next: AssetManifest,
    anims?: Phaser.Animations.AnimationManager,
  ): string[] {
    if (next === this) return [];
    this.parked = true;
    const keep = next.textureKeys();
    for (const b of next.finalBirds.values())
      if (b.entry.group !== LATE_GROUP) keep.add(b.atlasKey);
    const removed: string[] = [];
    for (const key of this.textureKeys()) {
      if (keep.has(key) || !textures.exists(key)) continue;
      textures.remove(key);
      removed.push(key);
    }
    // D-053: what was removed carries no HD state any more: no HD scale under its key, and a
    // layer whose HD tiles went is installed again on the next visit (install/applyHd).
    for (const key of removed) hdUnderKey.delete(key);
    for (const [id, l] of this.hdLayers)
      if (l.tiles.some((t) => !textures.exists(t.key))) this.hdTilesIn.delete(id);
    for (const b of next.hdBirds.values()) if (b.entry.group !== LATE_GROUP) keep.add(b.atlasKey);
    for (const [id, b] of [...this.finalBirds, ...this.hdBirds]) {
      if (keep.has(b.atlasKey) || !textures.exists(b.atlasKey)) continue;
      textures.remove(b.atlasKey);
      removed.push(b.atlasKey);
      // `id` is `${creature}/${plane}`: BirdView's animation keys are `final:${id}/${clip}`
      // (D-053: `final:${id}@hd/${clip}` for the HD atlas).
      for (const clip of Object.keys(b.entry.clips)) {
        const key = birdAnimKey(id, b, clip);
        if (anims?.exists(key) === true) anims.remove(key);
      }
    }
    return removed;
  }

  /**
   * v1.3 (low-tier memory): removes every delivered gun atlas except the guns in `keep` (the
   * equipped one), with the animations made from it (WeaponView keys them `${atlasKey}/${clip}`).
   * Call it when leaving a hunt, once nothing draws those guns. The decoded pages stay cached
   * here, so ensureGun() uploads a gun again the next time it is shown. Returns the removed keys.
   */
  releaseGuns(
    textures: Phaser.Textures.TextureManager,
    keep: ReadonlySet<string>,
    anims?: Phaser.Animations.AnimationManager,
  ): string[] {
    const removed: string[] = [];
    for (const [id, g] of [...this.finalGuns, ...this.hdGuns]) {
      if (keep.has(id) || !textures.exists(g.atlasKey)) continue;
      for (const clip of Object.keys(g.entry.clips)) {
        const key = `${g.atlasKey}/${clip}`;
        if (anims?.exists(key) === true) anims.remove(key);
      }
      textures.remove(g.atlasKey);
      removed.push(g.atlasKey);
    }
    return removed;
  }

  // --- D-053: the HD pack ------------------------------------------------------------------

  /** True while this manifest draws its HD art where it has it (the player chose HD). */
  get hd(): boolean {
    return this.hdWanted;
  }

  /** The player's choice; install() and applyHd() put the matching textures in. */
  setHd(on: boolean): void {
    this.hdWanted = on;
  }

  /** How far the HD files before the hunt have come (0 / 0 before loadHd). */
  hdProgress(): HdProgress {
    return { ...this.hdBytes };
  }

  /** True once loadHd's files before the hunt have settled. */
  get hdReady(): boolean {
    return this.hdBytes.settled;
  }

  /** @internal D-053 (hdRuntime.ts, install). */
  addHdImage(
    textures: Phaser.Textures.TextureManager,
    key: string,
    hd: { img: HTMLImageElement; entry: HdImage; std: number },
  ): void {
    const tex = textures.addImage(key, hd.img);
    if (this.specs.get(key)?.viewScaled === true) hdUnderKey.set(key, hd.entry.scale);
    // Every other view draws it at the standard texture's size (hdTexture.ts).
    // Safe cast: a Phaser Texture has the source and frames TextureLike names.
    else if (tex !== null) halveTexture(tex as unknown as TextureLike, hd.std / hd.entry.scale);
  }

  /** @internal D-053 (hdRuntime.ts, install). */
  installHdTiles(textures: Phaser.Textures.TextureManager): boolean {
    // A released area's tiles come back with its own install(), not another area's sync.
    if (this.parked) return false;
    let changed = false;
    for (const [id, { tiles }] of this.hdLayers) {
      // Tiles another manifest's release() removed are added again.
      if (this.hdTilesIn.has(id) && tiles.every((t) => textures.exists(t.key))) continue;
      for (const t of tiles) {
        if (!textures.exists(t.key)) textures.addImage(t.key, t.img);
        retiredTextures.delete(t.key);
      }
      this.hdTilesIn.add(id);
      changed = true;
    }
    return changed;
  }

  /** Keys not yet in the texture manager (0 once install() has completed). */
  missing(textures: Phaser.Textures.TextureManager): string[] {
    // Bird and gun atlases are installed on demand; until then their placeholders draw.
    // D-053: a layer on its HD tiles needs no standard tiles.
    const finals = [...this.finalLayers]
      .filter(([id]) => !(this.hdWanted && this.hdTilesIn.has(id)))
      .flatMap(([, l]) => l.tiles.map((t) => t.key));
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
/** v1.5 (D-041): one line of a voice language's pack (voice/<lang>/<bark key>). */
export function voiceKey(lang: string, barkKey: string): string {
  return `voice/${lang}/${barkKey}`;
}

/**
 * BirdView's animation key for a delivered clip of `${creature}/${plane}` (`id`): the HD atlas's
 * clips are keyed apart (D-053), so both sets can be alive while HD swaps in.
 */
export function birdAnimKey(id: string, bird: { readonly hd?: boolean }, clip: string): string {
  return `final:${id}${bird.hd === true ? '@hd' : ''}/${clip}`;
}

export function birdKey(creature: string, plane: PlaneId, frame: BirdFrame): string {
  return `bird/${creature}/${plane}/${frame}`;
}

/** Fixed keys for UI and FX textures. */
export const TEX = {
  stone: 'fx/stone',
  glare: 'omen/glare',
  // v1.4 B (D-039): a soft bright strip of the Namibië mirage (WorldView).
  mirage: 'omen/mirage',
  water: 'biome/water',
  rain: 'omen/rain',
  rainbow: 'omen/rainbow',
  splash: 'fx/splash',
  badgeNo: 'ui/badge_no',
  feather: 'fx/feather',
  flash: 'fx/flash',
  bubble: 'fx/bubble',
  puff: 'fx/puff',
  grassTuft: 'fx/grass_tuft',
  gun: 'gun/dubbelloop',
  // M4: secrets, crates, omen, boss, helpers, crate weapons.
  rotor: 'secret/rotor',
  /** v1.6 (D-042): the windpomp's turning head (gearbox, tail boom, vane); WindpompView. */
  windpompVane: 'fx/windpomp_vane',
  /** v1.6 (D-042): soft cloud sprites (shown at 2×, tinted per biome; src/game/view/clouds.ts). */
  cloudCumulus: 'sky/cloud_cumulus',
  cloudWide: 'sky/cloud_wide',
  cloudCirrus: 'sky/cloud_cirrus',
  cloudTower: 'sky/cloud_tower',
  mark: 'secret/mark',
  markHit: 'secret/mark_hit',
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
  // v1.6b (D-043): reload power-up icons (HUD chips, the Oupa Laai belt mark) and the belt glint.
  puBlitslaai: 'ui/pu_blitslaai',
  puOupaLaai: 'ui/pu_oupa_laai',
  // v1.7b (D-046): the other power-ups' and the crate guns' icons (powerupIcon()).
  puChilliBiltong: 'ui/pu_chilli_biltong',
  puBoeretroos: 'ui/pu_boeretroos',
  puBushBuckshot: 'ui/pu_bush_buckshot',
  puMeerkatSpotter: 'ui/pu_meerkat_spotter',
  puVoorlaaier: 'ui/pu_voorlaaier',
  puMielieMasjien: 'ui/pu_mielie_masjien',
  // 1.9.2 (D-055): the Rooikol (red dot sight) power-up.
  puRooikol: 'ui/pu_rooikol',
  bolt: 'fx/bolt',
  // v1.4 B (D-039): angry sociable weavers (WeaverView), shared by every biome with a nest.
  weaverUp: 'fx/weaver_up',
  weaverDown: 'fx/weaver_down',
  // v1.3 (D-036): rifle sight pictures (SightView).
  sightIronRear: 'sight/iron_rear',
  sightIronFront: 'sight/iron_front',
  sightPeep: 'sight/peep',
  sightScope: 'sight/scope',
} as const;

/** First-person art for a weapon id (crate weapons get their own; unknown ids use the shotgun). */
export function gunKey(weaponId: string): string {
  return `gun/${weaponId}`;
}
