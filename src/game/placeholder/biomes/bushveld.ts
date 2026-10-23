// Winter · Bushveld placeholder art (art bible §4.2): pale blue dawn sky, rounded granite
// koppies, dry pale grass, mopane scrub, giraffe silhouettes on the far veld, a baobab with
// hanging kremetart pods, granite boulders (Ou Grys's cover, one cracked), a dassie on its rock
// and red winter aloes. Rendering only.
import { verBand, type Band, type BiomeArt } from '../biomeArt';
import { ellipse, ground, inked, INK, tuft } from '../draw';

const C = {
  skyTop: '#9EC6E2',
  skyBottom: '#E9EEF0',
  mist: 'rgba(240,244,246,0.55)',
  granite: '#D07A3E',
  graniteDark: '#A85E2E',
  graniteFar: '#B79486',
  grass: '#C9B98F',
  grassLight: '#DDD0AA',
  grassDark: '#A8976B',
  mopane: '#7D8A4A',
  mopaneDark: '#5C6A36',
  bark: '#8D7F74',
  barkDark: '#6E6259',
  pod: '#C9B48A',
  aloe: '#E04A2B',
  aloeLeaf: '#5E7F55',
  giraffe: 'rgba(60,50,40,0.5)',
  dassie: '#7A5A3E',
} as const;

function mopane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  line: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 40 * s);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, line);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ellipse(ctx, x + (i - 1) * 22 * s, y - (48 + (i === 1 ? 12 : 0)) * s, 26 * s, 16 * s);
    inked(ctx, i === 1 ? C.mopane : C.mopaneDark, line);
  }
}

function dome(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.bezierCurveTo(x, base - h * 1.1, x + w, base - h * 1.1, x + w, base);
  ctx.closePath();
}

function giraffe(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = C.giraffe;
  ctx.beginPath();
  ctx.ellipse(x, y - 34 * s, 16 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 8 * s, y - 70 * s, 5 * s, 36 * s);
  ctx.fillRect(x + 8 * s, y - 74 * s, 11 * s, 5 * s);
  for (const lx of [-12, -6, 6, 12]) ctx.fillRect(x + lx * s, y - 30 * s, 3 * s, 30 * s);
}

const BANDS: Readonly<Record<string, Band>> = {
  // v1.3: the Ver plane's strip (shown only on maps that open it).
  ver_veld: verBand({ ground: '#BFB487', haze: 'rgba(196,192,172,0.9)', scrub: '#6E7650' }),
  sky: {
    top: 0,
    bottom: 1080,
    scale: 4,
    draw(ctx, width) {
      const g = ctx.createLinearGradient(0, 0, 0, 660);
      g.addColorStop(0, C.skyTop);
      g.addColorStop(1, C.skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, 1080);
      // Frost mist low over the veld at dawn.
      ctx.fillStyle = C.mist;
      ctx.fillRect(0, 520, width, 160);
    },
  },
  far_ridge: {
    top: 380,
    bottom: 660,
    scale: 1,
    draw(ctx, width, rnd) {
      // Rounded granite koppies.
      ctx.translate(0, -380);
      for (let x = -120; x < width; x += 240 + rnd() * 320) {
        const w = 240 + rnd() * 320;
        dome(ctx, x, 660, w, 90 + rnd() * 110);
        inked(ctx, C.graniteFar, 2);
      }
    },
  },
  far_veld: {
    top: 548,
    bottom: 780,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -548);
      ground(ctx, width, 568, 780, 10, C.grassLight, 2, rnd);
      for (let x = 0; x < width; x += 50 + rnd() * 120) mopane(ctx, x, 600 + rnd() * 50, 0.5, 1);
      for (let x = 200; x < width; x += 700 + rnd() * 900) giraffe(ctx, x, 600, 1.2);
    },
  },
  mid: {
    top: 630,
    bottom: 910,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -630);
      ground(ctx, width, 655, 910, 18, C.grass, 4, rnd);
      for (let x = 0; x < width; x += 110 + rnd() * 240) mopane(ctx, x, 690 + rnd() * 130, 1, 3);
      for (let x = 0; x < width; x += 60 + rnd() * 90) {
        tuft(ctx, x, 720 + rnd() * 170, 30 + rnd() * 20, C.grassLight, 2);
      }
    },
  },
  near: {
    top: 820,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -820);
      ground(ctx, width, 845, 1080, 26, C.grassDark, 6, rnd);
      for (let x = 0; x < width; x += 40 + rnd() * 90) {
        tuft(ctx, x, 880 + rnd() * 190, 40 + rnd() * 50, rnd() < 0.5 ? C.grass : C.grassLight, 3);
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
          tuft(ctx, x + k * 50, 1085, 110 + rnd() * 70, k % 2 === 0 ? C.grassDark : C.grass, 6);
        }
      }
    },
  },
};

function boulder(ctx: CanvasRenderingContext2D, w: number, h: number, cracked: boolean): void {
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  inked(ctx, C.granite, 4);
  ellipse(ctx, -w * 0.15, -h * 0.18, w * 0.22, h * 0.14);
  ctx.fillStyle = 'rgba(255,230,200,0.35)';
  ctx.fill();
  ellipse(ctx, w * 0.1, h * 0.2, w * 0.3, h * 0.16);
  ctx.fillStyle = 'rgba(120,60,20,0.25)';
  ctx.fill();
  if (!cracked) return;
  ctx.beginPath();
  ctx.moveTo(-10, -h / 2 + 4);
  ctx.lineTo(-24, -h * 0.2);
  ctx.lineTo(-6, -h * 0.05);
  ctx.lineTo(-20, h * 0.2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke();
}

function aloe(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 14, h * 0.4);
    ctx.quadraticCurveTo(k * 40, 0, k * 52, -h * 0.15);
    ctx.lineTo(k * 14 + 8, h * 0.4);
    ctx.closePath();
    inked(ctx, C.aloeLeaf, 3);
  }
  // Winter-flowering red candles.
  for (const x of [-w * 0.18, 0, w * 0.2]) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.1);
    ctx.lineTo(x, -h * 0.35);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    ellipse(ctx, x, -h * 0.42, 12, 30);
    inked(ctx, C.aloe, 3);
  }
}

function drawProp(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void {
  switch (id) {
    case 'baobab': {
      // Fat trunk (the occluder) under a sparse crown of stubby branches; pods hang from them.
      ctx.beginPath();
      ctx.moveTo(-w * 0.7, h / 2);
      ctx.bezierCurveTo(-w * 0.55, 0, -w * 0.45, -h * 0.4, -w * 0.4, -h / 2);
      ctx.lineTo(w * 0.4, -h / 2);
      ctx.bezierCurveTo(w * 0.45, -h * 0.4, w * 0.55, 0, w * 0.7, h / 2);
      ctx.closePath();
      inked(ctx, C.bark, 5);
      ctx.strokeStyle = INK;
      ctx.lineCap = 'round';
      for (const [x, y] of [
        [-150, -260],
        [-70, -300],
        [20, -310],
        [110, -280],
        [170, -230],
      ] as const) {
        ctx.lineWidth = 22;
        ctx.beginPath();
        ctx.moveTo(x * 0.3, -h / 2 + 6);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.strokeStyle = C.barkDark;
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.strokeStyle = INK;
      }
      // Pods: the secret one sits at (110, −120) from the prop = (110, −215) from this centre.
      for (const [x, y] of [
        [-120, -230],
        [-40, -270],
        [110, -215],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x, y - 40);
        ctx.lineTo(x, y - 30);
        ctx.lineWidth = 3;
        ctx.stroke();
        ellipse(ctx, x, y, 18, 30);
        inked(ctx, C.pod, 3);
      }
      return;
    }
    case 'dassie_koppie': {
      boulder(ctx, w, h, false);
      ellipse(ctx, w * 0.25, -h * 0.35, w * 0.25, h * 0.4);
      inked(ctx, C.graniteDark, 4);
      // The dassie on top (the secret's part sits at (40, −82) from the prop).
      ellipse(ctx, 40, -92, 30, 20);
      inked(ctx, C.dassie, 3);
      ellipse(ctx, 62, -100, 12, 10);
      inked(ctx, C.dassie, 3);
      ellipse(ctx, 66, -102, 2.5, 2.5);
      ctx.fillStyle = INK;
      ctx.fill();
      return;
    }
    case 'boulder_crack':
      boulder(ctx, w, h, true);
      return;
    case 'boulder_a':
    case 'boulder_b':
      boulder(ctx, w, h, false);
      return;
    case 'aloe_red_a':
    case 'aloe_red_b':
      aloe(ctx, w, h);
      return;
    default:
      return;
  }
}

export const BUSHVELD_ART: BiomeArt = {
  bands: BANDS,
  drawProp,
  propPad: {
    baobab: { top: 380, side: 200 },
    dassie_koppie: { top: 140, side: 40 },
    aloe_red_a: { top: 120, side: 40 },
    aloe_red_b: { top: 120, side: 40 },
  },
};
