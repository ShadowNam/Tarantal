// D-053: an HD texture that looks exactly like its standard texture to every view. The image is
// k× the standard's pixels; its frames keep cutting the whole image (the UVs) but report the
// standard size (width, height, realWidth, the trim box), and the source's resolution is k, so
// Phaser 4's image renderer draws the quad at cutWidth / k. Views, origins, hit areas and
// particles see design px exactly as with Standard; the only change is sharper pixels.
//
// Never for an image that is cropped: Phaser 4.2 clamps a crop to the frame's (now halved) size
// and places it at the crop's texture-px offset. Cropped art takes HD through its view's scale
// instead (layers, props, birds) or stays Standard (hdPack.ts HD_SKIP_KEYS).

/** The parts of a Phaser frame this touches (a structural type, so tests can pass plain objects). */
export interface FrameLike {
  width: number;
  height: number;
  halfWidth: number;
  halfHeight: number;
  centerX: number;
  centerY: number;
  x: number;
  y: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
  readonly data: {
    sourceSize: { w: number; h: number };
    spriteSourceSize: { x: number; y: number; w: number; h: number; r: number; b: number };
    radius: number;
  };
}

export interface TextureLike {
  readonly source: readonly { resolution: number }[];
  readonly frames: Readonly<Record<string, FrameLike>>;
}

/** Makes every frame of `tex` report 1/k of its texture size and draw at it (k = HD / standard). */
export function halveTexture(tex: TextureLike, k: number): void {
  if (k === 1) return;
  for (const s of tex.source) s.resolution = k;
  for (const f of Object.values(tex.frames)) scaleFrame(f, 1 / k);
}

function scaleFrame(f: FrameLike, s: number): void {
  f.width *= s;
  f.height *= s;
  f.halfWidth = f.width / 2;
  f.halfHeight = f.height / 2;
  f.centerX = Math.floor(f.width / 2);
  f.centerY = Math.floor(f.height / 2);
  f.x *= s;
  f.y *= s;
  const d = f.data;
  d.sourceSize.w *= s;
  d.sourceSize.h *= s;
  const ss = d.spriteSourceSize;
  ss.x *= s;
  ss.y *= s;
  ss.w *= s;
  ss.h *= s;
  ss.r *= s;
  ss.b *= s;
  d.radius *= s;
}
