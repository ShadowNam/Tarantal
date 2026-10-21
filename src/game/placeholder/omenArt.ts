// M8 placeholder art for biome weather (omens): the Bushveld low-sun glare. Screen-space
// textures, drawn once and stretched by WorldView. Rendering only.
import { TEX, type CanvasSpec } from '../assets/AssetManifest';

export function omenSpecs(): CanvasSpec[] {
  return [
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
  ];
}
