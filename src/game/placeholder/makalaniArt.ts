// 1.9.3 (D-056): procedural stand-ins for the makalani trunk, crown and nut sheet
// (makalaniSheet.ts layout), shown only without delivered art (`?art=placeholder`, dev builds
// without an asset index): plain shapes in the right places. The interim art
// (tools/art/makalani.ts) is what players see.
import type { CanvasSpec } from '../assets/AssetManifest';
import {
  NUT_SHEET,
  NUT_SHEET_H,
  NUT_SHEET_W,
  PALM_ART_PLANES,
  nutFrames,
  palmCrownKey,
  palmFrames,
  palmTrunkKey,
} from '../view/palms/makalaniSheet';

const NUT: Readonly<Record<string, string>> = {
  brown: '#4A2A16',
  orange: '#C7782A',
  green: '#6F8A3A',
};

export function makalaniSpecs(): CanvasSpec[] {
  const out: CanvasSpec[] = [];
  for (const plane of PALM_ART_PLANES) {
    const f = palmFrames(plane);
    out.push({
      key: palmTrunkKey(plane),
      width: f.trunk.w,
      height: f.trunk.h,
      originX: f.trunk.ox / f.trunk.w,
      originY: f.trunk.oy / f.trunk.h,
      viewScaled: true,
      draw(ctx) {
        ctx.fillStyle = '#8C8A80';
        ctx.fillRect(f.trunk.w * 0.25, 0, f.trunk.w * 0.5, f.trunk.oy);
      },
    });
    out.push({
      key: palmCrownKey(plane),
      width: f.crown.w,
      height: f.crown.h,
      originX: f.crown.ox / f.crown.w,
      originY: f.crown.oy / f.crown.h,
      viewScaled: true,
      draw(ctx) {
        ctx.fillStyle = '#7D9466';
        ctx.beginPath();
        ctx.ellipse(
          f.crown.ox,
          f.crown.oy * 0.6,
          f.crown.w * 0.45,
          f.crown.oy * 0.55,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = '#8A6A44';
        ctx.fillRect(
          f.crown.ox - f.crown.w * 0.15,
          f.crown.oy,
          f.crown.w * 0.3,
          f.crown.h - f.crown.oy,
        );
      },
    });
  }
  out.push({
    key: NUT_SHEET,
    width: NUT_SHEET_W,
    height: NUT_SHEET_H,
    originX: 0,
    originY: 0,
    draw(ctx) {
      for (const f of nutFrames()) {
        ctx.save();
        ctx.translate(f.x, f.y);
        if (f.name.startsWith('nut_')) {
          ctx.globalAlpha = f.name.endsWith('_blur') ? 0.6 : 1;
          ctx.fillStyle = NUT[f.name.split('_')[1] ?? 'brown'] ?? '#4A2A16';
          ctx.beginPath();
          ctx.arc(f.ox, f.oy, f.w / 2 - 1, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = f.name === 'chip' ? '#EFE6D2' : '#8A6236';
          ctx.fillRect(0, 0, f.w, f.h);
        }
        ctx.restore();
      }
    },
  });
  return out;
}
