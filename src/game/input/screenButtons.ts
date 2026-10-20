// Tiny DOM-level button handling for menus drawn in Phaser (Phaser's own input is off; all input
// is Pointer Events on the canvas). Buttons are rects in design px.
import type { Rect } from '../ui/hudLayout';
import { rectContains } from '../ui/hudLayout';

export interface ScreenButton {
  readonly rect: () => Rect;
  readonly onPress: (pointerType: string, pointerId: number) => void;
}

export function clientToDesign(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  design: { width: number; height: number },
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / Math.max(1, r.width)) * design.width,
    y: ((clientY - r.top) / Math.max(1, r.height)) * design.height,
  };
}

/** Listens for presses (pointerup) on the given buttons; returns a function that removes it. */
export function bindButtons(
  canvas: HTMLCanvasElement,
  design: () => { width: number; height: number },
  buttons: readonly ScreenButton[],
): () => void {
  const onUp = (e: PointerEvent): void => {
    const p = clientToDesign(canvas, e.clientX, e.clientY, design());
    for (const b of buttons) {
      if (rectContains(b.rect(), p.x, p.y)) {
        b.onPress(e.pointerType, e.pointerId);
        return;
      }
    }
  };
  canvas.addEventListener('pointerup', onUp);
  return () => {
    canvas.removeEventListener('pointerup', onUp);
  };
}
