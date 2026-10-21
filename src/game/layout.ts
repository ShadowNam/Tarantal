// Screen layout maths for the Phaser layer (Tech §3.3 and §5). Pure functions, unit-tested.
// The sim never sees any of this: it works in the fixed 1920-reference world.

/** Design height of the visible space, in design px. */
export const DESIGN_HEIGHT = 1080;
/** Narrowest visible design width (4:3 tablets). Narrower screens are letterboxed. */
export const MIN_DESIGN_WIDTH = 1440;
/** Widest visible design width (21:9 phones). Wider screens are pillarboxed. */
export const MAX_DESIGN_WIDTH = 2520;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Visible design size for a viewport: height is always 1080, width follows the aspect ratio
 * between 1440 (4:3) and 2520 (21:9). Rounded to an even number so the centre is a whole pixel.
 */
export function designSizeFor(viewportWidth: number, viewportHeight: number): Size {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { width: 1920, height: DESIGN_HEIGHT };
  }
  const ideal = (DESIGN_HEIGHT * viewportWidth) / viewportHeight;
  const clamped = Math.min(MAX_DESIGN_WIDTH, Math.max(MIN_DESIGN_WIDTH, ideal));
  return { width: Math.round(clamped / 2) * 2, height: DESIGN_HEIGHT };
}

export function isPortrait(viewportWidth: number, viewportHeight: number): boolean {
  return viewportHeight > viewportWidth;
}

/**
 * Converts CSS safe-area insets (CSS px from the viewport edges) into design px inside the
 * game canvas, which FIT-scales the design size into the viewport and centres it. Bars outside
 * the canvas (letterbox/pillarbox) already absorb part of an inset.
 */
export function safeAreaInDesignPx(cssInsets: Insets, viewport: Size, design: Size): Insets {
  const scale = Math.min(viewport.width / design.width, viewport.height / design.height);
  if (!(scale > 0)) return { top: 0, right: 0, bottom: 0, left: 0 };
  const barX = (viewport.width - design.width * scale) / 2;
  const barY = (viewport.height - design.height * scale) / 2;
  const toDesign = (inset: number, bar: number): number => Math.max(0, inset - bar) / scale;
  return {
    top: toDesign(cssInsets.top, barY),
    right: toDesign(cssInsets.right, barX),
    bottom: toDesign(cssInsets.bottom, barY),
    left: toDesign(cssInsets.left, barX),
  };
}

/**
 * M9 render scale (Tech §5 quality tiers): scenes always lay out in design px (`designSize()`),
 * while the canvas is design × renderScale and every camera zooms by it (`fitCamera`). Set by
 * main.ts on resize and when the tier changes.
 */
const view = { width: 1920, height: DESIGN_HEIGHT, renderScale: 1 };

export function setView(design: Size, renderScale: number): void {
  view.width = design.width;
  view.height = design.height;
  view.renderScale = renderScale;
}

/** The visible design size (1080 tall) the scenes lay out in. */
export function designSize(): Size {
  return view;
}

export function renderScale(): number {
  return view.renderScale;
}

/** Canvas size for a design size at a render scale (whole pixels). */
export function renderSizeFor(design: Size, scale: number): Size {
  return { width: Math.round(design.width * scale), height: Math.round(design.height * scale) };
}
