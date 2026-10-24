// M8 placeholder art for the launch arsenal (GDD §10.1, art bible §1): first-person Windbuks,
// Kettie and Plaas-Pomp, barrels up like Oupa's shotgun (same 420 × 520 box and origin, so the
// WeaponView kick, lean and muzzle position work unchanged), plus the Kettie's stone.
import { gunKey, TEX, type CanvasSpec } from '../assets/AssetManifest';
import { ellipse, inked, INK } from './draw';
import type { AmmoType } from '../../content/schemas';
import { ammoKeys } from '../ui/gunLook';

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
    // v1.3 Twee-Twee (.22 bolt-action): a slim barrel, round receiver with the bolt knob on the
    // right, a small magazine, a walnut stock.
    gun('twee_twee', (ctx) => {
      poly(ctx, [
        [-7, -505],
        [7, -505],
        [14, -250],
        [-14, -250],
      ]);
      inked(ctx, STEEL, 5);
      poly(ctx, [
        [-22, -252],
        [22, -252],
        [24, -140],
        [-24, -140],
      ]);
      inked(ctx, STEEL, 5);
      ellipse(ctx, 52, -168, 9, 8);
      inked(ctx, STEEL_LIGHT, 4);
      poly(ctx, [
        [-14, -222],
        [10, -222],
        [9, -176],
        [-13, -176],
      ]);
      inked(ctx, STEEL, 4);
      poly(ctx, [
        [-34, -140],
        [34, -140],
        [96, 0],
        [-70, 0],
      ]);
      inked(ctx, WOOD, 6);
    }),
    // v1.4 Langloop: a heavy barrel, a long scope tube on top, the bolt knob, a walnut stock.
    gun('langloop', (ctx) => {
      poly(ctx, [
        [-10, -505],
        [10, -505],
        [17, -250],
        [-17, -250],
      ]);
      inked(ctx, STEEL, 5);
      poly(ctx, [
        [-24, -262],
        [24, -262],
        [26, -136],
        [-26, -136],
      ]);
      inked(ctx, STEEL, 5);
      poly(ctx, [
        [-27, -346],
        [27, -346],
        [17, -296],
        [16, -140],
        [-16, -140],
        [-17, -296],
      ]);
      inked(ctx, STEEL, 5);
      ellipse(ctx, 60, -160, 10, 10);
      inked(ctx, STEEL_LIGHT, 4);
      poly(ctx, [
        [-36, -136],
        [36, -136],
        [98, 0],
        [-72, 0],
      ]);
      inked(ctx, WOOD, 6);
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

/**
 * v1.1 (D-032): runtime placeholders for every ammo type in feel.json `guns.ammo` (full and
 * spent), drawn from the type's size and two colours until its interim or final art loads. Data
 * only: a new ammo type gets its placeholder without code.
 */
export function ammoSpecs(types: Readonly<Record<string, AmmoType>>): CanvasSpec[] {
  const out: CanvasSpec[] = [];
  for (const [id, t] of Object.entries(types)) {
    const keys = ammoKeys(id);
    const spec = (key: string, spent: boolean): CanvasSpec => ({
      key,
      width: t.width,
      height: t.height,
      originX: t.width / 2,
      originY: t.height / 2,
      draw(ctx) {
        const w = t.width - 6;
        const h = t.height - 6;
        ctx.translate(3, 3);
        ctx.globalAlpha = spent ? 0.45 : 1;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h * 0.75, Math.min(w, h) * 0.2);
        inked(ctx, t.body, 2);
        ctx.beginPath();
        ctx.roundRect(0, h * 0.72, w, h * 0.28, 2);
        inked(ctx, t.base, 2);
      },
    });
    out.push(spec(keys.full, false));
    if (t.spent === 'sprite') out.push(spec(keys.spent, true));
  }
  return out;
}
