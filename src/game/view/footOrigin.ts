// Where a sprite's origin goes so its feet (the frame's pivot) stay put when it is mirrored.
//
// Phaser 4.2.1 (node_modules/phaser/src/renderer/webgl/renderNodes/transformer/
// TransformerImage.js, run(), ~lines 126–140): a flipped image is shifted back round the frame's
// centre ONLY when its frame has no custom pivot (`!frame.customPivot`). A frame with a custom
// pivot is mirrored round the image's origin itself. So for our sheets' frames (customPivot set to
// the feet) the origin stays at (pivotX, pivotY) flipped or not; mirroring the origin as well
// (1 − pivotX) puts the feet (1 − 2·pivotX) × the frame's width off (v1.8c review round 3: the
// Harvest's workers and warthogs, the baboon raiders, tells, the colony and tree residents and the
// ostriches were drawn off their hit shapes when facing left).

/** The origin x for a frame with pivot `pivotX` (0…1), mirrored or not. */
export function footOriginX(pivotX: number, flip: boolean, customPivot: boolean): number {
  return customPivot || !flip ? pivotX : 1 - pivotX;
}

interface Pivoted {
  readonly frame: {
    readonly pivotX: number;
    readonly pivotY: number;
    readonly customPivot: boolean;
  };
  readonly originX: number;
  readonly originY: number;
  setOrigin(x: number, y: number): unknown;
}

/** Puts an image's origin at its frame's feet for this flip (set only when it changes). */
export function setFootOrigin(img: Pivoted, flip: boolean): void {
  const f = img.frame;
  const x = footOriginX(f.pivotX, flip, f.customPivot);
  if (img.originX !== x || img.originY !== f.pivotY) img.setOrigin(x, f.pivotY);
}
