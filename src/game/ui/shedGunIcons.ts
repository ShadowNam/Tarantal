// v1.19 (D-084): the Gun Shed's side-view gun pictures (a lazy chunk: ShedScene imports it when the
// Guns tab first opens). Fetches the `shed` sheet on demand (never a texture) and hands ShedScene a
// region per gun to crop onto its small card canvas, plus the desaturation for locked guns.
import type { AssetManifest } from '../assets/AssetManifest';
import type { AtlasRegion } from '../assets/atlasCheck';
import { SHED_GUN_SHEET, SHED_GUN_SHEET_W, shedGunCell } from './shedGunSheet';

export interface ShedPictures {
  /** The gun's side view in the decoded sheet, or null for a gun without one. */
  picture(weaponId: string): { img: HTMLImageElement; region: AtlasRegion } | null;
  /** Greys a card canvas in place (a locked gun: the same picture, desaturated). */
  desaturate(ctx: CanvasRenderingContext2D, w: number, h: number): void;
}

/** Null while there is no delivered sheet (no index, or the file failed: try again later). */
export async function loadShedPictures(
  manifest: Pick<AssetManifest, 'loadOnDemand'>,
): Promise<ShedPictures | null> {
  const img = await manifest.loadOnDemand(SHED_GUN_SHEET);
  if (img === null) return null;
  // A delivery may come at another scale than the interim 2×: cells follow the file's width.
  const master = img.naturalWidth / SHED_GUN_SHEET_W;
  return {
    picture(weaponId) {
      const c = shedGunCell(weaponId, master);
      if (c === null) return null;
      return {
        img,
        region: {
          page: 0,
          x: Math.round(c.x),
          y: Math.round(c.y),
          w: Math.round(c.w),
          h: Math.round(c.h),
          rotated: false,
        },
      };
    },
    desaturate,
  };
}

/** Luma grey, a little lifted, so a locked gun still reads on the dark card. */
export function desaturate(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.3 * (d[i] ?? 0) + 0.59 * (d[i + 1] ?? 0) + 0.11 * (d[i + 2] ?? 0);
    const v = Math.min(255, 40 + y * 0.85);
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
}
