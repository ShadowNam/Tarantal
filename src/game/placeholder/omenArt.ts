// M8 placeholder art for biome weather and water: the Bushveld low-sun glare, Okavango water,
// rain streaks, a rainbow and a splash. Drawn once and stretched by the views. Rendering only.
import { TEX, type CanvasSpec } from '../assets/AssetManifest';
import { ellipse, inked, INK } from './draw';

export function omenSpecs(): CanvasSpec[] {
  return [
    // v1.4 B: the mirage — a soft, bright, sky-tinted strip that fades out at every edge.
    {
      key: TEX.mirage,
      width: 256,
      height: 32,
      originX: 128,
      originY: 16,
      draw(ctx) {
        ctx.save();
        ctx.scale(8, 1);
        const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, 'rgba(250,252,255,0.95)');
        g.addColorStop(0.5, 'rgba(226,238,252,0.55)');
        g.addColorStop(1, 'rgba(226,238,252,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        ctx.restore();
      },
    },
    // Low winter sun from the right edge: warm white fading to nothing (flipped for the left).
    {
      key: TEX.glare,
      width: 256,
      height: 64,
      originX: 256,
      originY: 0,
      draw(ctx) {
        const g = ctx.createLinearGradient(256, 0, 0, 0);
        g.addColorStop(0, 'rgba(255,248,226,1)');
        g.addColorStop(0.35, 'rgba(255,240,205,0.6)');
        g.addColorStop(1, 'rgba(255,240,205,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 64);
      },
    },
    // A channel of floodplain water with a light rim and ripple lines (stretched to a zone).
    {
      key: TEX.water,
      width: 256,
      height: 64,
      originX: 128,
      originY: 32,
      draw(ctx) {
        ctx.beginPath();
        ctx.roundRect(4, 6, 248, 52, 26);
        inked(ctx, '#6FA8B6', 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        for (const [x, y] of [
          [40, 24],
          [120, 38],
          [190, 22],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 34, y);
          ctx.stroke();
        }
      },
    },
    // One rain streak (many are drawn by a particle emitter while it rains).
    {
      key: TEX.rain,
      width: 6,
      height: 40,
      originX: 3,
      originY: 20,
      draw(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, 40);
        g.addColorStop(0, 'rgba(220,235,255,0)');
        g.addColorStop(1, 'rgba(220,235,255,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(2, 0, 2, 40);
      },
    },
    // A soft rainbow arc for the sun-showers.
    {
      key: TEX.rainbow,
      width: 512,
      height: 256,
      originX: 256,
      originY: 256,
      draw(ctx) {
        const bands = ['#E2552C', '#F2A03B', '#F2D84A', '#7BBF45', '#4A8FD8', '#7E5BB5'];
        bands.forEach((c, i) => {
          ctx.beginPath();
          ctx.arc(256, 256, 240 - i * 12, Math.PI, 0);
          ctx.strokeStyle = c;
          ctx.lineWidth = 12;
          ctx.globalAlpha = 0.6;
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      },
    },
    // A splash: a crown of water drops.
    {
      key: TEX.splash,
      width: 96,
      height: 64,
      originX: 48,
      originY: 56,
      draw(ctx) {
        for (let k = -2; k <= 2; k++) {
          ellipse(ctx, 48 + k * 14, 40 - Math.abs(k) * -4 - (2 - Math.abs(k)) * 12, 6, 10);
          inked(ctx, '#BFE3F0', 2);
        }
        ellipse(ctx, 48, 56, 40, 7);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
      },
    },
  ];
}
