// Off-screen culling for views that move sprites every frame (perf): a sprite outside the screen
// is hidden so the renderer skips it (Phaser draws every visible child of a layer, on screen or
// not). Pure.

/** Screen px kept either side of the screen (camera shake, a frame's late move). */
export const VIEW_CULL_MARGIN_PX = 96;

/**
 * Whether something at screen x `x` that reaches `reach` px either side of it shows on a screen
 * `width` px wide (with `margin` px to spare either side).
 */
export function inViewX(x: number, reach: number, width: number, margin: number): boolean {
  return x + reach >= -margin && x - reach <= width + margin;
}
