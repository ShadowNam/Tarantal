// D-064: the code-drawn stand-in for the Christmas sheet (christmasAssets.ts layout), shown only
// until the delivered sheet arrives (or on a build without an asset index). Simple flat shapes in
// the sheet's frame boxes and origins, so the view and the hit circles line up the same.
import { OUPA_DRAWN, PRESENT_GROUND_PX, xmasFrames, type XmasRect } from './christmasAssets';

type G = CanvasRenderingContext2D;

const PAPER: Record<string, readonly [string, string]> = {
  a: ['#C8202A', '#E6B23A'],
  b: ['#226B3E', '#D6262E'],
  c: ['#3C88C8', '#D8DEE6'],
};

function ell(g: G, x: number, y: number, rx: number, ry: number, fill: string): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function lid(g: G, x: number, y: number, wrap: string): void {
  const [paper, ribbon] = PAPER[wrap] ?? ['#C8202A', '#E6B23A'];
  g.fillStyle = paper;
  g.fillRect(x - 66, y - 22, 132, 22);
  g.fillStyle = ribbon;
  g.fillRect(x - 12, y - 22, 24, 22);
  ell(g, x - 22, y - 36, 22, 12, ribbon);
  ell(g, x + 22, y - 36, 22, 12, ribbon);
}

function present(g: G, x: number, y: number, wrap: string, open: boolean): void {
  const [paper, ribbon] = PAPER[wrap] ?? ['#C8202A', '#E6B23A'];
  const foot = y + PRESENT_GROUND_PX;
  g.fillStyle = paper;
  g.fillRect(x - 60, foot - 100, 120, 100);
  g.fillStyle = ribbon;
  g.fillRect(x - 12, foot - 100, 24, 100);
  g.fillRect(x - 60, foot - 58, 120, 18);
  if (open) {
    g.fillStyle = '#3A2418';
    g.fillRect(x - 56, foot - 100, 112, 10);
    ell(g, x, foot - 104, 50, 12, '#FFF4D8');
  } else lid(g, x, foot - 100, wrap);
}

function hat(g: G, x: number, y: number, k: number): void {
  g.fillStyle = '#C8202A';
  g.beginPath();
  g.moveTo(x - 30 * k, y - 4 * k);
  g.lineTo(x + 26 * k, y - 90 * k);
  g.lineTo(x + 24 * k, y - 4 * k);
  g.closePath();
  g.fill();
  ell(g, x, y - 4 * k, 40 * k, 12 * k, '#F4EEE4');
  ell(g, x + 30 * k, y - 84 * k, 11 * k, 11 * k, '#F4EEE4');
}

function draw(g: G, f: XmasRect): void {
  const { ox: x, oy: y } = f;
  const [kind, a, b] = f.name.split('_');
  switch (kind) {
    case 'present':
      present(g, x, y, a ?? 'a', b === 'open');
      return;
    case 'lid':
      lid(g, x, y, a ?? 'a');
      return;
    case 'garland': {
      g.strokeStyle = a === 'red' ? '#D6262E' : '#D8DEE6';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(x - 150, y);
      g.quadraticCurveTo(x, y + 112, x + 150, y);
      g.stroke();
      return;
    }
    case 'bauble':
      ell(g, x, y + 23, 12, 12, a === 'red' ? '#D6262E' : a === 'gold' ? '#E6B23A' : '#D8DEE6');
      return;
    case 'glint':
      ell(g, x, y, 8, 8, 'rgba(255,255,255,0.8)');
      return;
    case 'confetti':
      for (let i = 0; i < 18; i++) {
        g.fillStyle = ['#D6262E', '#E6B23A', '#3C88C8', '#4FA26A'][i % 4] ?? '#FFFFFF';
        g.fillRect(x - 50 + ((i * 37) % 100), y - 50 + ((i * 53) % 100), 7, 5);
      }
      return;
    case 'hat':
      hat(g, x, y, a === 'l' ? 1 : a === 'm' ? 0.54 : 0.28);
      return;
    case 'oupa':
      // Drawn at half size, like the sheet's (OUPA_DRAWN).
      g.translate(x, y);
      g.scale(OUPA_DRAWN, OUPA_DRAWN);
      g.translate(-x, -y);
      if (a === 'head') {
        ell(g, x, y, 30, 34, '#D69A72');
        ell(g, x, y + 30, 26, 24, '#F2F0EA');
        hat(g, x - 2, y - 26, 0.92);
        return;
      }
      g.fillStyle = '#C4A872';
      g.fillRect(x - 40, y - 268, 80, 150);
      g.fillStyle = '#D69A72';
      g.fillRect(x - 28, y - 120, 18, 100);
      g.fillRect(x + 10, y - 120, 18, 100);
      g.fillStyle = '#7A5432';
      g.fillRect(x - 32, y - 22, 26, 22);
      g.fillRect(x + 6, y - 22, 26, 22);
      ell(g, x, y - 290, 26, 28, '#D69A72');
      ell(g, x, y - 266, 22, 20, '#F2F0EA');
      hat(g, x - 2, y - 312, 0.8);
      return;
    default:
      return;
  }
}

/** Draws every frame into `g` (texture px = design px × `master`). */
export function drawChristmasStandin(g: G, master: number): void {
  g.save();
  g.scale(master, master);
  for (const f of xmasFrames()) {
    g.save();
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    g.translate(f.x, f.y);
    draw(g, f);
    g.restore();
  }
  g.restore();
}
