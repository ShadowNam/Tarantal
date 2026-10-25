// v1.7 (D-044): the procedural stand-in for the meerkat sheet (desertAssets.ts layout), shown only
// without delivered art (`?art=placeholder`, dev builds without an asset index). Simple shapes in
// the right places: a tan body with a cream belly, a dark eye patch, a black-tipped tail, and a
// mound with a hole. The interim art (tools/art/meerkats.ts) is what players see. Imported by the
// two desert biome chunks only.
import type { CanvasSpec } from '../assets/AssetManifest';
import {
  MEERKAT_SHEET,
  RIM_FRAMES,
  SHEET_H,
  SHEET_W,
  sheetFrames,
  type MeerkatFrame,
} from '../assets/desertAssets';

const FUR = '#B8936A';
const BELLY = '#EAD9B8';
const DARK = '#2A1E16';
const SAND = '#C7774A';
const HOLE = '#2B160D';

function blob(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

/** One meerkat: upright (lean 0) or low (lean 1), at the frame's feet (0, 0), facing right. */
function meerkat(c: CanvasRenderingContext2D, name: MeerkatFrame): void {
  const pup = name.startsWith('pup_');
  const k = pup ? 0.6 : 1;
  c.save();
  c.scale(k, k);
  const low = /sit|dig|run|sunbathe|tumble|pup_/.test(name) && name !== 'sunbathe';
  if (name === 'tumble') c.rotate(1.2);
  if (name === 'flick') {
    for (let i = 0; i < 6; i++) blob(c, i * 9 - 20, -10 - (i % 3) * 8, 4, 3, SAND);
    c.restore();
    return;
  }
  if (low) {
    blob(c, -44, -14, 22, 3, DARK); // tail
    blob(c, -4, -26, 38, 22, FUR);
    blob(c, 0, -18, 26, 10, BELLY);
    blob(c, 34, -46, 14, 13, FUR);
    blob(c, 40, -48, 4, 4, DARK);
  } else {
    blob(c, -14, -6, 6, 22, DARK); // tail
    blob(c, 0, -52, 19, 46, FUR);
    blob(c, 4, -50, 11, 36, BELLY);
    const look = name.endsWith('_l') ? -6 : name.endsWith('_r') ? 6 : 0;
    blob(c, look, -110, 15, 16, FUR);
    blob(c, look + (look >= 0 ? 6 : -6), -112, 4, 4, DARK);
    if (name === 'scold' || name === 'bark') blob(c, look + 4, -100, 5, 3, DARK);
  }
  c.restore();
}

function mound(c: CanvasRenderingContext2D, w: number): void {
  blob(c, 0, 18, w, 30, SAND);
  blob(c, 0, 2, 30, 10, HOLE);
}

/** The whole sheet as one placeholder texture. */
export function meerkatSpecs(): CanvasSpec[] {
  return [
    {
      key: MEERKAT_SHEET,
      width: SHEET_W,
      height: SHEET_H,
      originX: 0,
      originY: 0,
      draw(ctx) {
        for (const f of sheetFrames()) {
          if (f.mirror === true) continue;
          ctx.save();
          ctx.beginPath();
          ctx.rect(f.x, f.y, f.w, f.h);
          ctx.clip();
          ctx.translate(f.x + f.ox, f.y + f.oy);
          if (f.name.startsWith('mound_')) mound(ctx, f.name === 'mound_b' ? 80 : 96);
          else {
            const name = f.name as MeerkatFrame;
            // Rim frames: only what is above the hole shows.
            if (RIM_FRAMES.has(name)) {
              ctx.beginPath();
              ctx.rect(-f.ox, -f.oy, f.w, f.oy);
              ctx.clip();
              ctx.translate(0, name === 'peek_l' || name === 'peek_r' ? 82 : 40);
            }
            meerkat(ctx, name);
          }
          ctx.restore();
        }
      },
    },
  ];
}
