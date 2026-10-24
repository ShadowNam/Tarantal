// v1.4 B (D-039) Namibië placeholder art: Etosha & Namib. A hot pale sky, orange-red Namib dunes
// on the horizon, the far edge of the pan with a waterhole (Ver strip), the white salt pan with a
// bright mirage band, a calcrete pan edge, the red dune edge in front, blonde grass; camelthorns
// (one with the sociable-weaver family nest), quiver trees (one with an ostrich-egg flask) and
// grass mounds. The mirage shimmer itself is drawn by the game. Rendering only.
import { verBand, type Band, type BiomeArt } from '../biomeArt';
import { ellipse, ground, inked, INK, tuft } from '../draw';

const C = {
  skyTop: '#8DBCE0',
  skyBottom: '#F3EEE2',
  duneFar: '#E08A5A',
  duneLee: '#C45A36',
  salt: '#EDEBE3',
  saltDark: '#D8D3C6',
  mirage: '#FBFAF5',
  calcrete: '#DCD3C0',
  sand: '#D9774A',
  sandDark: '#C2532F',
  water: '#9FB7C2',
  grass: '#D9C27A',
  grassDark: '#A8925A',
  camel: '#7E8E4A',
  bark: '#5E4636',
  nest: '#C9A66A',
  nestDark: '#9C7E48',
  quiverBark: '#D3B56E',
  quiverLeaf: '#8FA3A6',
  egg: '#F1E8D2',
  strap: '#7A4E2C',
} as const;

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

const VER = verBand({ ground: '#E6E1D4', haze: 'rgba(236,232,222,0.9)', scrub: '#9A9A80' });

const BANDS: Readonly<Record<string, Band>> = {
  ver_veld: {
    ...VER,
    draw(ctx, width, rnd) {
      VER.draw(ctx, width, rnd);
      // The waterhole (u ≈ 0.42–0.58 of the core width; the bleed is small next to it).
      ctx.globalAlpha = 0.8;
      ellipse(ctx, width * 0.5, 556, width * 0.05, 3);
      ctx.fillStyle = C.water;
      ctx.fill();
      ctx.globalAlpha = 1;
      for (const f of [0.44, 0.47, 0.53, 0.56]) camelthorn(ctx, width * f, 554, 0.16, 0);
    },
  },
  sky: {
    top: 0,
    bottom: 1080,
    scale: 4,
    draw(ctx, width) {
      const g = ctx.createLinearGradient(0, 0, 0, 600);
      g.addColorStop(0, C.skyTop);
      g.addColorStop(1, C.skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, 1080);
    },
  },
  far_ridge: {
    top: 440,
    bottom: 620,
    scale: 1,
    draw(ctx, width, rnd) {
      // Low orange Namib dunes on the horizon, slip faces in shadow.
      ctx.translate(0, -440);
      for (let x = -200; x < width;) {
        const w = 360 + rnd() * 380;
        const h = 50 + rnd() * 60;
        const cx = x + w * 0.62;
        ctx.beginPath();
        ctx.moveTo(x, 600);
        ctx.quadraticCurveTo(x + w * 0.35, 600 - h * 0.9, cx, 600 - h);
        ctx.lineTo(x + w, 600);
        ctx.closePath();
        ctx.fillStyle = C.duneFar;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, 600 - h);
        ctx.lineTo(x + w, 600);
        ctx.lineTo(cx - w * 0.05, 600);
        ctx.closePath();
        ctx.fillStyle = C.duneLee;
        ctx.fill();
        x += w * (0.55 + rnd() * 0.25);
      }
    },
  },
  far_veld: {
    top: 548,
    bottom: 780,
    scale: 1,
    draw(ctx, width, rnd) {
      // The white salt pan with faint cracks and a bright mirage band at the horizon.
      ctx.translate(0, -548);
      ground(ctx, width, 572, 780, 4, C.salt, 0, rnd);
      ctx.fillStyle = C.mirage;
      ctx.fillRect(0, 574, width, 10);
      ctx.strokeStyle = C.saltDark;
      ctx.lineWidth = 1;
      for (let k = 0; k < width / 40; k++) {
        const x = rnd() * width;
        const y = 590 + rnd() * 180;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 20 + rnd() * 30, y + (rnd() - 0.5) * 6);
        ctx.stroke();
      }
      for (let x = 200; x < width; x += 400 + rnd() * 700)
        camelthorn(ctx, x, 590 + rnd() * 20, 0.35, 1);
    },
  },
  mid: {
    top: 630,
    bottom: 910,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -630);
      ground(ctx, width, 668, 910, 14, C.calcrete, 3, rnd);
      for (let x = 0; x < width; x += 80 + rnd() * 160)
        tuft(ctx, x, 700 + rnd() * 160, 22 + rnd() * 16, rnd() < 0.5 ? C.grass : C.grassDark, 2);
    },
  },
  near: {
    top: 820,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -820);
      ground(ctx, width, 850, 1080, 26, C.sandDark, 6, rnd);
      for (let x = 0; x < width; x += 60 + rnd() * 120)
        tuft(ctx, x, 880 + rnd() * 190, 40 + rnd() * 40, rnd() < 0.5 ? C.grass : C.grassDark, 3);
    },
  },
  foreground: {
    top: 900,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -900);
      for (let x = 0; x < width; x += 500 + rnd() * 700)
        for (let k = 0; k < 4; k++)
          tuft(ctx, x + k * 50, 1085, 110 + rnd() * 60, k % 2 === 0 ? C.grassDark : C.grass, 6);
    },
  },
};

/** A flat camelthorn with its foot at (0, foot): trunk, umbrella crown `cw` wide at `top`. */
function tree(ctx: CanvasRenderingContext2D, foot: number, top: number, cw: number, line: number) {
  const tw = Math.max(6, cw * 0.12);
  ctx.beginPath();
  ctx.moveTo(-tw / 2, foot);
  ctx.lineTo(-tw * 0.3, top + (foot - top) * 0.35);
  ctx.lineTo(tw * 0.3, top + (foot - top) * 0.35);
  ctx.lineTo(tw / 2, foot);
  ctx.closePath();
  inked(ctx, C.bark, line);
  const depth = (foot - top) * 0.24;
  ellipse(ctx, 0, top + depth, cw, depth);
  inked(ctx, C.camel, line);
  ellipse(ctx, -cw * 0.3, top + depth * 0.7, cw * 0.4, depth * 0.45);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
}

/** A quiver tree with its foot at (0, foot), `h` tall; returns nothing. */
function quiver(ctx: CanvasRenderingContext2D, foot: number, h: number, line: number) {
  const top = foot - h;
  ctx.beginPath();
  ctx.moveTo(-14, foot);
  ctx.lineTo(-8, top + h * 0.45);
  ctx.lineTo(8, top + h * 0.45);
  ctx.lineTo(14, foot);
  ctx.closePath();
  inked(ctx, C.quiverBark, line);
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  const tips: readonly (readonly [number, number])[] = [
    [-52, top + 22],
    [-20, top + 4],
    [18, top + 8],
    [50, top + 26],
  ];
  for (const [x, y] of tips) {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, top + h * 0.45);
    ctx.quadraticCurveTo(x * 0.4, top + h * 0.3, x, y + 6);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.quiverBark;
    ctx.stroke();
  }
  for (const [x, y] of tips) {
    ellipse(ctx, x, y, 18, 10);
    inked(ctx, C.quiverLeaf, line);
  }
}

function drawProp(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void {
  switch (id) {
    case 'nest_camelthorn': {
      // Foot at the occluder's bottom (h / 2); the nest part sits 338 px above the box centre.
      tree(ctx, h / 2, -h / 2 - 380, 430, 6);
      ctx.beginPath();
      ctx.ellipse(0, -338, 270, 83, 0, 0, Math.PI * 2);
      inked(ctx, C.nest, 6);
      ctx.strokeStyle = C.nestDark;
      ctx.lineWidth = 3;
      for (let x = -230; x <= 230; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, -390);
        ctx.lineTo(x + 8, -280);
        ctx.stroke();
      }
      for (const x of [-160, -60, 70, 170]) {
        ellipse(ctx, x, -268, 12, 8);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      return;
    }
    case 'camelthorn_mature':
      tree(ctx, h / 2, h / 2 - 215, 160, 3);
      return;
    case 'camelthorn_old':
      tree(ctx, h / 2, h / 2 - 205, 145, 3);
      return;
    case 'camelthorn_young':
      // No occluder: the default box is centred on the prop's foot.
      tree(ctx, 0, -144, 66, 3);
      return;
    case 'quiver_tree':
      quiver(ctx, h / 2, 200, 3);
      return;
    case 'quiver_egg': {
      quiver(ctx, h / 2, 185, 3);
      // The ostrich-egg flask: the secret part at (38, −118) from the foot = (38, −63) here.
      ctx.strokeStyle = C.strap;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(38, -100);
      ctx.lineTo(38, -83);
      ctx.stroke();
      ellipse(ctx, 38, -63, 16, 20);
      inked(ctx, C.egg, 3);
      ctx.fillStyle = C.strap;
      ctx.fillRect(22, -66, 32, 4);
      return;
    }
    case 'pan_grass_a':
    case 'pan_grass_b':
      ellipse(ctx, 0, h / 2, w / 2, 26);
      inked(ctx, C.calcrete, 4);
      for (let k = -3; k <= 3; k++)
        tuft(ctx, k * 34, h / 2, 140, k % 2 === 0 ? C.grassDark : C.grass, 5);
      return;
    default:
      return;
  }
}

export const NAMIBIE_ART: BiomeArt = {
  bands: BANDS,
  drawProp,
  propPad: {
    nest_camelthorn: { top: 420, side: 468 },
    camelthorn_mature: { top: 160, side: 200 },
    camelthorn_old: { top: 160, side: 190 },
    camelthorn_young: { top: 120, side: 40 },
    quiver_tree: { top: 110, side: 85 },
    quiver_egg: { top: 120, side: 85 },
    pan_grass_a: { top: 120, side: 40 },
    pan_grass_b: { top: 120, side: 40 },
  },
};
