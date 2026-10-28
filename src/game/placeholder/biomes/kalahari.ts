// Somer · Kalahari placeholder art (art bible §4.2): hot pale sky, red dune ridges, gemsbok on
// the crest, camelthorn trees — one carrying a sociable-weaver mega-nest (a huge communal
// haystack in the canopy, not hanging balls), a dead camelthorn with a dry branch, a windpomp
// with its sign, and dune grass. The storm sky is an overlay drawn by WorldView. Rendering only.
import { verBand, type Band, type BiomeArt } from '../biomeArt';
import { ellipse, ground, inked, INK, tuft } from '../draw';
import { desertSpecs } from '../treeLifeArt';

const C = {
  skyTop: '#7FAFD6',
  skyBottom: '#F4D9A8',
  duneFar: '#D9825A',
  dune: '#E0703A',
  duneDark: '#C8452B',
  sand: '#E59A5C',
  sandDark: '#C8743E',
  grass: '#C9B56A',
  grassDark: '#9E8C48',
  camel: '#7B8F3A',
  camelDark: '#5C6B2A',
  bark: '#6B4A33',
  nest: '#C9A55A',
  nestDark: '#A07F3C',
  dead: '#8A7A6A',
  metal: '#6E777C',
  sign: '#E9C23B',
  gemsbok: 'rgba(70,45,30,0.55)',
} as const;

function gemsbok(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = C.gemsbok;
  ctx.beginPath();
  ctx.ellipse(x, y - 16, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 12, y - 30, 4, 14);
  // The long straight horns.
  ctx.fillRect(x + 13, y - 48, 1.5, 18);
  ctx.fillRect(x + 16, y - 48, 1.5, 18);
  for (const lx of [-10, -5, 6, 11]) ctx.fillRect(x + lx, y - 10, 2, 10);
}

function camelthorn(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, line: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 34 * s);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, line);
  ctx.stroke();
  ellipse(ctx, x, y - 44 * s, 46 * s, 14 * s);
  inked(ctx, C.camel, line);
}

const BANDS: Readonly<Record<string, Band>> = {
  // v1.3: the Ver plane's strip (shown only on maps that open it).
  ver_veld: verBand({ ground: '#E7A46A', haze: 'rgba(226,190,160,0.9)', scrub: '#8D7A52' }),
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
    top: 380,
    bottom: 660,
    scale: 1,
    draw(ctx, width, rnd) {
      // Long red dune ridges.
      ctx.translate(0, -380);
      ctx.beginPath();
      ctx.moveTo(0, 660);
      let y = 560;
      for (let x = 0; x <= width; x += 80) {
        y = Math.max(510, Math.min(600, y + (rnd() - 0.5) * 40));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, 660);
      ctx.closePath();
      inked(ctx, C.duneFar, 2);
      for (let x = 300; x < width; x += 800 + rnd() * 900) gemsbok(ctx, x, 560);
    },
  },
  far_veld: {
    top: 548,
    bottom: 780,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -548);
      ground(ctx, width, 568, 780, 12, C.dune, 2, rnd);
      for (let x = 0; x < width; x += 120 + rnd() * 260)
        camelthorn(ctx, x, 605 + rnd() * 30, 0.5, 1);
    },
  },
  mid: {
    top: 630,
    bottom: 910,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -630);
      ground(ctx, width, 655, 910, 20, C.sand, 4, rnd);
      for (let x = 0; x < width; x += 70 + rnd() * 140) {
        tuft(ctx, x, 700 + rnd() * 160, 26 + rnd() * 18, rnd() < 0.5 ? C.grass : C.grassDark, 2);
      }
    },
  },
  near: {
    top: 820,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -820);
      ground(ctx, width, 845, 1080, 26, C.sandDark, 6, rnd);
      for (let x = 0; x < width; x += 60 + rnd() * 120) {
        tuft(ctx, x, 880 + rnd() * 190, 40 + rnd() * 40, rnd() < 0.5 ? C.grass : C.grassDark, 3);
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
          tuft(ctx, x + k * 50, 1085, 110 + rnd() * 60, k % 2 === 0 ? C.grassDark : C.grass, 6);
        }
      }
    },
  },
};

function canopy(ctx: CanvasRenderingContext2D, w: number, top: number): void {
  ctx.beginPath();
  ctx.ellipse(0, top, w, 52, 0, 0, Math.PI * 2);
  inked(ctx, C.camel, 4);
  ellipse(ctx, -w * 0.3, top - 10, w * 0.4, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
}

function drawProp(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void {
  switch (id) {
    case 'weaver_camelthorn': {
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      inked(ctx, C.bark, 4);
      canopy(ctx, 230, -h / 2 - 40);
      // The mega-nest: a big thatched haystack slung under the canopy (part at (0, −78) from the
      // prop = (0, −188) from this centre).
      ctx.beginPath();
      ctx.moveTo(-160, -h / 2 - 50);
      ctx.quadraticCurveTo(0, -h / 2 - 90, 160, -h / 2 - 50);
      ctx.quadraticCurveTo(140, -h / 2 + 10, 0, -h / 2 + 12);
      ctx.quadraticCurveTo(-140, -h / 2 + 10, -160, -h / 2 - 50);
      ctx.closePath();
      inked(ctx, C.nest, 4);
      ctx.strokeStyle = C.nestDark;
      ctx.lineWidth = 2;
      for (let x = -130; x <= 130; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, -h / 2 - 50);
        ctx.lineTo(x + 6, -h / 2 + 4);
        ctx.stroke();
      }
      // Entrance holes underneath.
      for (const x of [-90, -30, 40, 100]) {
        ellipse(ctx, x, -h / 2 + 2, 7, 5);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      return;
    }
    case 'dead_camelthorn': {
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      inked(ctx, C.dead, 4);
      ctx.strokeStyle = INK;
      ctx.lineCap = 'round';
      // The dry branch (part at (−90, −60) from the prop = (−90, −150) from this centre).
      for (const [x2, y2, lw] of [
        [-130, -170, 14],
        [100, -200, 12],
        [30, -260, 10],
      ] as const) {
        ctx.lineWidth = lw + 4;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2 + 10);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = C.dead;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.strokeStyle = INK;
      }
      return;
    }
    case 'windpomp_sign': {
      // A small windpomp tower with a sign board (part at (0, −90)).
      ctx.beginPath();
      ctx.moveTo(-w * 2, h / 2);
      ctx.lineTo(0, -h / 2);
      ctx.lineTo(w * 2, h / 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-45, -113, 90, 46);
      inked(ctx, C.sign, 4);
      ctx.beginPath();
      ctx.arc(0, -h / 2, 40, 0, Math.PI * 2);
      ctx.strokeStyle = C.metal;
      ctx.lineWidth = 6;
      ctx.stroke();
      return;
    }
    case 'dune_grass_a':
    case 'dune_grass_b':
      for (let k = -3; k <= 3; k++)
        tuft(ctx, k * 34, h / 2, 140, k % 2 === 0 ? C.grassDark : C.grass, 5);
      return;
    default:
      return;
  }
}

export const KALAHARI_ART: BiomeArt = {
  bands: BANDS,
  drawProp,
  // v1.7 (D-044): the meerkat colonies' sheet (shared with the other desert map).
  extraTextures: desertSpecs,
  propPad: {
    weaver_camelthorn: { top: 220, side: 220 },
    dead_camelthorn: { top: 220, side: 170 },
    windpomp_sign: { top: 80, side: 90 },
    dune_grass_a: { top: 120, side: 40 },
    dune_grass_b: { top: 120, side: 40 },
  },
};
