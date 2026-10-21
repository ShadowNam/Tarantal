// Every texture the game draws comes through here (art bible / Tech §10). Today all entries are
// procedural placeholders from ProceduralAssetFactory; when real atlases land (M10), entries are
// swapped for file sources without touching the views, which only ask for keys.
import type * as Phaser from 'phaser';
import type { PlaneId } from '../../sim/types';

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

export type BirdFrame = 'up' | 'down' | 'stand';

export const MAX_TILE_WIDTH = 2048;

export class AssetManifest {
  private readonly specs = new Map<string, CanvasSpec>();
  private readonly layerArt = new Map<string, LayerArt>();

  addTexture(spec: CanvasSpec): void {
    this.specs.set(spec.key, spec);
  }

  addLayer(assetId: string, art: LayerArt, tiles: readonly CanvasSpec[]): void {
    for (const t of tiles) this.addTexture(t);
    this.layerArt.set(assetId, art);
  }

  addBird(creature: string, plane: PlaneId, frame: BirdFrame, spec: CanvasSpec): void {
    this.addTexture({ ...spec, key: birdKey(creature, plane, frame) });
  }

  layer(assetId: string): LayerArt | undefined {
    return this.layerArt.get(assetId);
  }

  has(key: string): boolean {
    return this.specs.has(key);
  }

  /** Texture key for a bird; creatures without art yet fall back to the plain tarentaal. */
  bird(creature: string, plane: PlaneId, frame: BirdFrame): string {
    const key = birdKey(creature, plane, frame);
    return this.specs.has(key) ? key : birdKey('tarentaal', plane, frame);
  }

  /** Origin as fractions (for setOrigin). */
  origin(key: string): { x: number; y: number } {
    const s = this.specs.get(key);
    return s ? { x: s.originX / s.width, y: s.originY / s.height } : { x: 0.5, y: 0.5 };
  }

  /**
   * Draws textures into the texture manager (each once per game). With `filter`, only matching
   * keys; with `budgetMs`, stops after that much time so the rest can follow on later frames.
   * Returns true only when every texture in the manifest is drawn (filtered-out ones count as
   * still missing), so callers know whether more work is left.
   */
  install(
    textures: Phaser.Textures.TextureManager,
    filter: (key: string) => boolean = () => true,
    budgetMs = Infinity,
  ): boolean {
    const start = performance.now();
    let complete = true;
    for (const spec of this.specs.values()) {
      if (textures.exists(spec.key)) continue;
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
    return [...this.specs.keys()].filter((k) => !textures.exists(k));
  }
}

/** Textures the start card needs; birds can be drawn while the card is showing. */
export function neededBeforeStart(key: string): boolean {
  return !key.startsWith('bird/');
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
