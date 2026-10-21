// Fits a scene camera to the canvas at the quality tier's render scale (M9): the viewport is the
// whole canvas and the zoom maps design px onto it, so scenes keep laying out in design px.
import type * as Phaser from 'phaser';
import { designSize, renderScale, renderSizeFor } from '../layout';

export function fitCamera(cam: Phaser.Cameras.Scene2D.Camera): void {
  const s = renderScale();
  const r = renderSizeFor(designSize(), s);
  cam.setViewport(0, 0, r.width, r.height);
  cam.setOrigin(0, 0);
  cam.setZoom(s);
}
