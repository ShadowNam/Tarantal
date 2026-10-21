// M8 placeholder art for the launch arsenal (GDD §10.1, art bible §1): first-person Windbuks,
// Kettie and Plaas-Pomp, barrels up like Oupa's shotgun (same 420 × 520 box and origin, so the
// WeaponView kick, lean and muzzle position work unchanged), plus the Kettie's stone.
import { gunKey, TEX, type CanvasSpec } from '../assets/AssetManifest';
import { ellipse, inked, INK } from './draw';

const WOOD = '#8B5A2B';
const WOOD_DARK = '#6B3F1F';
const STEEL = '#3B3F45';
const STEEL_LIGHT = '#6E777C';

function gun(id: string, draw: (ctx: CanvasRenderingContext2D) => void): CanvasSpec {
  return {
    key: gunKey(id),
    width: 420,
    height: 520,
    originX: 210,
    originY: 520,
    draw(ctx) {
      ctx.translate(210, 520);
      draw(ctx);
    },
  };
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

export function arsenalSpecs(): CanvasSpec[] {
  return [
    // Windbuks: one slim barrel, break-barrel hinge, long light stock.
    gun('windbuks', (ctx) => {
      poly(ctx, [
        [-12, -505],
        [12, -505],
        [20, -250],
        [-20, -250],
      ]);
      inked(ctx, STEEL, 5);
      ellipse(ctx, 0, -250, 26, 14);
      inked(ctx, STEEL_LIGHT, 4);
      poly(ctx, [
        [-34, -240],
        [34, -240],
        [96, 0],
        [-70, 0],
      ]);
      inked(ctx, '#A86B34', 6);
      // Front sight.
      poly(ctx, [
        [-6, -520],
        [6, -520],
        [6, -500],
        [-6, -500],
      ]);
      inked(ctx, INK, 0);
    }),
    // Kettie: forked stick held up, two rubber bands to a leather pouch with a stone.
    gun('kettie', (ctx) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -230);
      ctx.moveTo(0, -230);
      ctx.lineTo(-90, -430);
      ctx.moveTo(0, -230);
      ctx.lineTo(90, -430);
      ctx.stroke();
      ctx.strokeStyle = WOOD;
      ctx.lineWidth = 24;
      ctx.stroke();
      ctx.strokeStyle = '#C8302A';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-90, -430);
      ctx.lineTo(0, -330);
      ctx.lineTo(90, -430);
      ctx.stroke();
      ellipse(ctx, 0, -330, 34, 22);
      inked(ctx, WOOD_DARK, 4);
      ellipse(ctx, 0, -334, 16, 13);
      inked(ctx, '#9A9187', 3);
    }),
    // Plaas-Pomp: one barrel over a tube magazine, a ribbed pump fore-end, dark stock.
    gun('pomp', (ctx) => {
      poly(ctx, [
        [-22, -505],
        [22, -505],
        [30, -230],
        [-30, -230],
      ]);
      inked(ctx, STEEL, 6);
      poly(ctx, [
        [-16, -470],
        [16, -470],
        [24, -260],
        [-24, -260],
      ]);
      inked(ctx, STEEL_LIGHT, 4);
      // Pump fore-end with ribs.
      poly(ctx, [
        [-34, -400],
        [34, -400],
        [38, -300],
        [-38, -300],
      ]);
      inked(ctx, WOOD_DARK, 5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      for (let y = -385; y < -305; y += 16) {
        ctx.beginPath();
        ctx.moveTo(-32, y);
        ctx.lineTo(32, y);
        ctx.stroke();
      }
      poly(ctx, [
        [-56, -235],
        [56, -235],
        [116, 0],
        [-86, 0],
      ]);
      inked(ctx, WOOD, 6);
    }),
    // The Kettie's stone (flies to the aim point, shrinking with distance).
    {
      key: TEX.stone,
      width: 32,
      height: 28,
      originX: 16,
      originY: 14,
      draw(ctx) {
        ellipse(ctx, 16, 14, 13, 10);
        inked(ctx, '#9A9187', 3);
        ellipse(ctx, 12, 10, 4, 3);
        ctx.fillStyle = '#C9C1B6';
        ctx.fill();
      },
    },
  ];
}
