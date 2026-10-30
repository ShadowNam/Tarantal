// v1.8c (D-063) Die Oes placeholder art: the Harvest's farm field in late summer. A warm sky, a
// rocky koppie behind the farm (the baboon troop's ridge), the farmhouse and a tractor on the far
// veld, rows of ripe mielies on the mid plane with the fence along their back (an open gap at
// u 0.5: the game draws the repair and the workers there), a pumpkin patch on the near plane and
// sunflower clumps in the foreground. Rendering only.
import type { Band, BiomeArt } from '../biomeArt';
import { ellipse, ground, inked, INK, tuft } from '../draw';

const C = {
  skyTop: '#6FA3CF',
  skyBottom: '#F2D9A6',
  koppie: '#9A7E6A',
  veld: '#C9A24A',
  soil: '#9A5E36',
  soilDark: '#7A4528',
  mielie: '#8C9A3E',
  mielieDark: '#5E6E2C',
  tassel: '#E2C46A',
  pumpkin: '#E07A26',
  vine: '#5E8A3A',
  sunflower: '#F2BE22',
  disc: '#5A3A1E',
  wall: '#F4EDE0',
  roof: '#8E969C',
  red: '#B8322A',
  tyre: '#2E2A28',
  post: '#8B5A2B',
} as const;

/** The gap in the mid fence (content oes.json harvest.gap: u 0.5, half-width 170). */
const GAP_U = 0.5;
const GAP_HALF = 170;

function mielie(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  ctx.fillStyle = C.mielie;
  ctx.fillRect(x - 2, y - h, 4, h);
  ctx.fillStyle = C.mielieDark;
  for (let k = 0; k < 3; k++) ctx.fillRect(x - 10 + (k % 2) * 12, y - h * (0.3 + k * 0.2), 10, 3);
  ctx.fillStyle = C.tassel;
  ctx.fillRect(x - 1, y - h - 8, 3, 8);
}

const BANDS: Readonly<Record<string, Band>> = {
  sky: {
    top: 0,
    bottom: 1080,
    scale: 4,
    draw(ctx, width) {
      const g = ctx.createLinearGradient(0, 0, 0, 640);
      g.addColorStop(0, C.skyTop);
      g.addColorStop(1, C.skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, 1080);
    },
  },
  far_ridge: {
    top: 420,
    bottom: 660,
    scale: 1,
    draw(ctx, width) {
      ctx.translate(0, -420);
      ctx.beginPath();
      ctx.moveTo(0, 660);
      for (let x = 0; x <= width; x += 40) {
        const t = x / width;
        ctx.lineTo(x, 600 - 80 * Math.exp(-(((t - 0.2) / 0.08) ** 2)) - 20 * Math.sin(t * 9));
      }
      ctx.lineTo(width, 660);
      ctx.closePath();
      inked(ctx, C.koppie, 2);
    },
  },
  far_veld: {
    top: 560,
    bottom: 780,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -560);
      ground(ctx, width, 590, 780, 8, C.veld, 2, rnd);
    },
  },
  mid: {
    top: 600,
    bottom: 910,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -600);
      ground(ctx, width, 690, 910, 10, C.soil, 4, rnd);
      const gap = width * GAP_U;
      for (let x = 10; x < width; x += 26) {
        // Keep the gap and the workers' stretch (right of it) clear of tall plants.
        if (x > gap - GAP_HALF - 40 && x < gap + GAP_HALF + 520) continue;
        mielie(ctx, x, 712 + rnd() * 20, 120 + rnd() * 30);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (let x = 0; x < width; x += 90) {
        if (Math.abs(x - gap) < GAP_HALF) continue;
        ctx.fillStyle = C.post;
        ctx.fillRect(x - 3, 650, 6, 52);
      }
      ctx.beginPath();
      ctx.moveTo(0, 662);
      ctx.lineTo(gap - GAP_HALF, 662);
      ctx.moveTo(gap + GAP_HALF, 662);
      ctx.lineTo(width, 662);
      ctx.stroke();
    },
  },
  near: {
    top: 860,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -860);
      ground(ctx, width, 890, 1080, 20, C.soilDark, 6, rnd);
      for (let x = 30; x < width; x += 150 + rnd() * 120) {
        ellipse(ctx, x, 960 + rnd() * 90, 36, 26);
        inked(ctx, C.pumpkin, 4);
        tuft(ctx, x + 40, 990 + rnd() * 60, 40, C.vine, 3);
      }
    },
  },
  foreground: {
    top: 900,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -900);
      for (let x = 0; x < width; x += 700 + rnd() * 600) {
        for (let k = 0; k < 3; k++) tuft(ctx, x + k * 50, 1085, 120 + rnd() * 60, C.mielie, 6);
      }
    },
  },
};

function sunflower(ctx: CanvasRenderingContext2D, x: number, top: number, foot: number): void {
  ctx.fillStyle = C.mielieDark;
  ctx.fillRect(x - 4, top, 8, foot - top);
  ellipse(ctx, x, top, 34, 34);
  inked(ctx, C.sunflower, 4);
  ellipse(ctx, x, top, 15, 15);
  ctx.fillStyle = C.disc;
  ctx.fill();
}

function drawProp(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void {
  switch (id) {
    case 'farmhouse':
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2 + h * 0.35, w, h * 0.65);
      inked(ctx, C.wall, 2);
      ctx.beginPath();
      ctx.moveTo(-w / 2 - 8, -h / 2 + h * 0.38);
      ctx.lineTo(0, -h / 2);
      ctx.lineTo(w / 2 + 8, -h / 2 + h * 0.38);
      ctx.closePath();
      inked(ctx, C.roof, 2);
      return;
    case 'tractor':
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w * 0.7, h * 0.6);
      inked(ctx, C.red, 2);
      ellipse(ctx, w * 0.25, h * 0.15, h * 0.35, h * 0.35);
      inked(ctx, C.tyre, 2);
      ellipse(ctx, -w * 0.3, h * 0.3, h * 0.2, h * 0.2);
      inked(ctx, C.tyre, 2);
      return;
    case 'sunflowers_a':
    case 'sunflowers_b':
      for (let k = -2; k <= 2; k++) sunflower(ctx, k * 40, -h / 2 - 60 + Math.abs(k) * 30, h / 2);
      return;
    default:
      return;
  }
}

export const OES_ART: BiomeArt = {
  bands: BANDS,
  drawProp,
  propPad: {
    sunflowers_a: { top: 160, side: 60 },
    sunflowers_b: { top: 160, side: 60 },
  },
};
