// v1.8 (D-050): the procedural stand-in for the tin-can sheet (canSheet.ts layout), shown only
// without delivered art (`?art=placeholder`, dev builds without an asset index): plain shapes in
// the right places — a can body with a lid rim, a post, a shadow, a dent and a hole. The interim
// art (tools/art/blikkies.ts) is what players see.
import type { CanvasSpec } from '../assets/AssetManifest';
import { CAN_SHEET, CAN_SHEET_H, CAN_SHEET_W, canFrames } from '../view/cans/canSheet';

const BODY: Readonly<Record<string, string>> = {
  food: '#C9C2B4',
  paint: '#A8ADB0',
  bully: '#9A5A32',
  cooldrink: '#C4302A',
};

export function canSpecs(): CanvasSpec[] {
  return [
    {
      key: CAN_SHEET,
      width: CAN_SHEET_W,
      height: CAN_SHEET_H,
      originX: 0,
      originY: 0,
      draw(ctx) {
        for (const f of canFrames()) {
          ctx.save();
          ctx.translate(f.x, f.y);
          if (f.name.startsWith('can_')) {
            const type = f.name.split('_')[1] ?? 'food';
            ctx.globalAlpha = f.name.endsWith('_blur') ? 0.6 : 1;
            ctx.fillStyle = BODY[type] ?? '#BBBBBB';
            ctx.fillRect(2, 3, f.w - 4, f.h - 6);
            ctx.fillStyle = '#E8E6DE';
            ctx.fillRect(2, 2, f.w - 4, 3);
            ctx.fillRect(2, f.h - 5, f.w - 4, 3);
            if (type === 'food') {
              ctx.fillStyle = '#D9A13A';
              ctx.fillRect(2, f.h * 0.3, f.w - 4, f.h * 0.4);
            }
          } else if (f.name.startsWith('post_')) {
            ctx.fillStyle = f.name === 'post_dropper' ? '#4A4E50' : '#6E5236';
            ctx.fillRect(f.w * 0.2, 0, f.w * 0.6, f.h);
          } else if (f.name === 'shadow') {
            ctx.fillStyle = 'rgba(30,20,10,0.5)';
            ctx.beginPath();
            ctx.ellipse(f.ox, f.oy, f.w / 2 - 1, f.h / 2 - 1, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = f.name === 'hole' ? '#1A1410' : 'rgba(40,40,40,0.6)';
            ctx.beginPath();
            ctx.arc(f.ox, f.oy, f.w / 2 - 1, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      },
    },
  ];
}
