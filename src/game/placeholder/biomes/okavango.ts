// Lente · Okavango placeholder art (art bible §4.2): soft blue sky, a tree line of ilala palms,
// green floodplain with lechwe, reed and papyrus beds, a mokoro marker pole, a sausage tree, a
// hippo in the channel and a frog on a lily pad. The water channels themselves are drawn by
// WorldView from the biome's splash zones, so the art always matches where shots splash.
// Rendering only.
import type { Band, BiomeArt } from '../biomeArt';
import { ellipse, ground, inked, INK, tuft } from '../draw';

const C = {
  skyTop: '#7FB8E2',
  skyBottom: '#D8EEF6',
  treeLine: '#5D8A5A',
  palm: '#4E7A45',
  trunk: '#7A6046',
  flood: '#9BC75A',
  floodDark: '#6FAE4A',
  bank: '#8DB85A',
  near: '#6E9E45',
  reed: '#6FAE4A',
  reedDark: '#4F8A36',
  reedHead: '#C9B479',
  papyrus: '#9BC75A',
  hippo: '#7D6E78',
  hippoDark: '#5E5159',
  lily: '#4C8C4A',
  lilyFlower: '#E9A1C0',
  frog: '#7BBF45',
  flag: '#C8302A',
  lechwe: 'rgba(120,70,30,0.55)',
  sausage: '#8A6A3C',
} as const;

function palm(ctx: CanvasRenderingContext2D, x: number, base: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + 6, base - h * 0.5, x + 2, base - h);
  ctx.strokeStyle = C.trunk;
  ctx.lineWidth = 5;
  ctx.stroke();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, base - h);
    ctx.quadraticCurveTo(
      x + 2 + Math.cos(a) * 30,
      base - h - 18,
      x + 2 + Math.cos(a) * 46,
      base - h + 12,
    );
    ctx.strokeStyle = C.palm;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

function lechwe(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = C.lechwe;
  ctx.beginPath();
  ctx.ellipse(x, y - 14, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 10, y - 26, 3, 12);
  for (const lx of [-9, -4, 5, 9]) ctx.fillRect(x + lx, y - 10, 2, 10);
}

function reedClump(ctx: CanvasRenderingContext2D, w: number, h: number, line: number): void {
  for (let k = 0; k < 16; k++) {
    const x = -w / 2 + (k + 0.5) * (w / 16);
    const top = -h / 2 - (k % 3) * 14;
    ctx.beginPath();
    ctx.moveTo(x, h / 2);
    ctx.quadraticCurveTo(x + ((k % 2) - 0.5) * 20, 0, x + ((k % 3) - 1) * 12, top);
    ctx.strokeStyle = k % 2 === 0 ? C.reed : C.reedDark;
    ctx.lineWidth = 7;
    ctx.stroke();
    ellipse(ctx, x + ((k % 3) - 1) * 12, top - 6, 5, 14);
    inked(ctx, C.reedHead, line / 2);
  }
  ctx.beginPath();
  ctx.ellipse(0, h / 2 - 6, w / 2, 14, 0, 0, Math.PI * 2);
  inked(ctx, C.reedDark, line);
}

const BANDS: Readonly<Record<string, Band>> = {
  sky: {
    top: 0,
    bottom: 1080,
    scale: 4,
    draw(ctx, width, rnd) {
      const g = ctx.createLinearGradient(0, 0, 0, 640);
      g.addColorStop(0, C.skyTop);
      g.addColorStop(1, C.skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, 1080);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < width / 300; i++) {
        const x = rnd() * width;
        const y = 80 + rnd() * 200;
        for (let k = 0; k < 5; k++) {
          ellipse(ctx, x + k * 36, y - (k % 2) * 18, 54, 28);
          ctx.fill();
        }
      }
    },
  },
  far_ridge: {
    top: 380,
    bottom: 660,
    scale: 1,
    draw(ctx, width, rnd) {
      // A low tree line with ilala palms standing out.
      ctx.translate(0, -380);
      ctx.beginPath();
      ctx.moveTo(0, 660);
      for (let x = 0; x <= width; x += 40) ctx.lineTo(x, 590 - rnd() * 40);
      ctx.lineTo(width, 660);
      ctx.closePath();
      inked(ctx, C.treeLine, 2);
      for (let x = 60; x < width; x += 160 + rnd() * 260) palm(ctx, x, 600, 90 + rnd() * 50);
    },
  },
  far_veld: {
    top: 548,
    bottom: 780,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -548);
      ground(ctx, width, 568, 780, 8, C.flood, 2, rnd);
      for (let x = 100; x < width; x += 260 + rnd() * 400) {
        for (let k = 0; k < 3; k++) lechwe(ctx, x + k * 30, 610 + rnd() * 20);
      }
    },
  },
  mid: {
    top: 630,
    bottom: 910,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -630);
      ground(ctx, width, 655, 910, 14, C.bank, 4, rnd);
      for (let x = 0; x < width; x += 50 + rnd() * 80) {
        tuft(ctx, x, 700 + rnd() * 70, 26 + rnd() * 16, rnd() < 0.5 ? C.floodDark : C.flood, 2);
      }
    },
  },
  near: {
    top: 820,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -820);
      ground(ctx, width, 845, 1080, 22, C.near, 6, rnd);
      for (let x = 0; x < width; x += 40 + rnd() * 90) {
        tuft(ctx, x, 880 + rnd() * 190, 40 + rnd() * 50, rnd() < 0.5 ? C.reed : C.floodDark, 3);
      }
    },
  },
  foreground: {
    top: 900,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -900);
      for (let x = 0; x < width; x += 500 + rnd() * 700) {
        for (let k = 0; k < 4; k++) {
          tuft(ctx, x + k * 50, 1085, 120 + rnd() * 70, k % 2 === 0 ? C.reedDark : C.reed, 6);
        }
      }
    },
  },
};

function drawProp(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void {
  switch (id) {
    case 'reeds_a':
    case 'reeds_b':
    case 'reeds_c':
    case 'reeds_d':
      reedClump(ctx, w, h, 3);
      return;
    case 'papyrus_a':
    case 'papyrus_b':
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(k * 16, h / 2);
        ctx.lineTo(k * 30, -h * 0.35);
        ctx.strokeStyle = C.reedDark;
        ctx.lineWidth = 6;
        ctx.stroke();
        // Papyrus heads: green starbursts.
        for (let r = 0; r < 8; r++) {
          const a = (r / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(k * 30, -h * 0.35);
          ctx.lineTo(k * 30 + Math.cos(a) * 34, -h * 0.35 + Math.sin(a) * 22);
          ctx.strokeStyle = C.papyrus;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      return;
    case 'mokoro_pole':
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      inked(ctx, C.trunk, 3);
      // The flag (the secret's part sits at (30, −112)).
      ctx.beginPath();
      ctx.moveTo(w / 2, -140);
      ctx.lineTo(w / 2 + 58, -126);
      ctx.lineTo(w / 2, -96);
      ctx.closePath();
      inked(ctx, C.flag, 3);
      return;
    case 'sausage_tree':
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      inked(ctx, C.trunk, 4);
      ellipse(ctx, 0, -h / 2 - 60, 190, 110);
      inked(ctx, C.reedDark, 4);
      for (const x of [-110, -40, 50, 120]) {
        ctx.beginPath();
        ctx.moveTo(x, -h / 2 - 10);
        ctx.lineTo(x, -h / 2 + 30);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
        ellipse(ctx, x, -h / 2 + 56, 10, 26);
        inked(ctx, C.sausage, 3);
      }
      return;
    case 'hippo':
      // Back and head just above the water line.
      ctx.beginPath();
      ctx.ellipse(0, 4, w / 2, h / 2, 0, Math.PI, 0);
      ctx.closePath();
      inked(ctx, C.hippo, 4);
      ellipse(ctx, w * 0.42, -h * 0.25, 46, 30);
      inked(ctx, C.hippo, 4);
      for (const ex of [w * 0.36, w * 0.48]) {
        ellipse(ctx, ex, -h * 0.55, 7, 7);
        inked(ctx, C.hippoDark, 2);
      }
      return;
    case 'lily_frog':
      ellipse(ctx, 0, 0, 56, 18);
      inked(ctx, C.lily, 3);
      ellipse(ctx, 30, -6, 10, 7);
      inked(ctx, C.lilyFlower, 2);
      ellipse(ctx, -10, -14, 18, 12);
      inked(ctx, C.frog, 3);
      ellipse(ctx, -4, -22, 4, 4);
      ctx.fillStyle = INK;
      ctx.fill();
      return;
    default:
      return;
  }
}

export const OKAVANGO_ART: BiomeArt = {
  bands: BANDS,
  drawProp,
  propPad: {
    sausage_tree: { top: 300, side: 170 },
    reeds_a: { top: 120, side: 40 },
    reeds_b: { top: 120, side: 40 },
    reeds_c: { top: 120, side: 40 },
    reeds_d: { top: 120, side: 40 },
    mokoro_pole: { top: 60, side: 80 },
    papyrus_a: { top: 140, side: 80 },
    papyrus_b: { top: 140, side: 80 },
    lily_frog: { top: 40, side: 20 },
  },
};
