// D-048: the code-drawn stand-in for the Halloween sheet (feesdaeAssets.ts layout), shown only
// until the delivered sheet arrives (or on a build without an asset index). Simple flat shapes
// with the sheet's frame boxes and origins, so the view and the hit circles line up the same.
import {
  LANTERN_BARE_GROUND_PX,
  LANTERN_GROUND_PX,
  sheetFrames,
  type SheetRect,
} from './feesdaeAssets';

type G = CanvasRenderingContext2D;

function ell(g: G, x: number, y: number, rx: number, ry: number, fill: string): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function wing(g: G, cx: number, cy: number, span: number, lift: number, fill: string): void {
  g.fillStyle = fill;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.quadraticCurveTo(cx + side * span * 0.5, cy - lift - 10, cx + side * span, cy - lift * 0.6);
    g.lineTo(cx + side * span * 0.7, cy + 6);
    g.lineTo(cx + side * span * 0.45, cy - 2);
    g.lineTo(cx + side * span * 0.25, cy + 8);
    g.closePath();
    g.fill();
  }
}

function pumpkin(g: G, x: number, y: number, lit: boolean): void {
  ell(g, x, y, 40, 34, lit ? '#E8741E' : '#7A4A2A');
  ell(g, x - 16, y + 2, 14, 30, lit ? '#F28C28' : '#6B4026');
  ell(g, x + 16, y + 2, 14, 30, lit ? '#F28C28' : '#6B4026');
  g.fillStyle = '#4E6B2A';
  g.fillRect(x - 4, y - 44, 8, 14);
  g.fillStyle = lit ? '#FFE27A' : '#2A1A10';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + s * 8, y - 6);
    g.lineTo(x + s * 22, y - 14);
    g.lineTo(x + s * 18, y);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.moveTo(x - 22, y + 10);
  g.lineTo(x + 22, y + 10);
  g.lineTo(x + 12, y + 22);
  g.lineTo(x - 12, y + 22);
  g.closePath();
  g.fill();
}

function draw(g: G, f: SheetRect): void {
  const { ox: x, oy: y } = f;
  switch (f.name) {
    case 'moon':
      ell(g, x, y, 130, 130, '#F4EBC8');
      ell(g, x - 40, y - 30, 22, 18, '#E2D6A8');
      ell(g, x + 36, y + 30, 30, 24, '#E2D6A8');
      return;
    case 'glow': {
      const r = g.createRadialGradient(x, y, 4, x, y, 108);
      r.addColorStop(0, 'rgba(255,190,90,0.9)');
      r.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, f.w, f.h);
      return;
    }
    case 'cobweb':
      g.strokeStyle = 'rgba(235,235,245,0.8)';
      g.lineWidth = 2;
      for (let a = 0; a <= 4; a++) {
        g.beginPath();
        g.moveTo(0, 0);
        const t = (a / 4) * (Math.PI / 2);
        g.lineTo(Math.cos(t) * 210, Math.sin(t) * 210);
        g.stroke();
      }
      for (let r = 40; r <= 200; r += 40) {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI / 2);
        g.stroke();
      }
      return;
    case 'puff':
      ell(g, x, y, 40, 34, 'rgba(90,80,90,0.7)');
      ell(g, x - 22, y + 10, 24, 20, 'rgba(110,100,110,0.6)');
      ell(g, x + 24, y - 8, 22, 18, 'rgba(110,100,110,0.6)');
      return;
    case 'hat_l':
    case 'hat_m':
    case 'hat_s': {
      const k = f.w / 130;
      g.fillStyle = '#2B1838';
      g.beginPath();
      g.ellipse(x, y, 62 * k, 12 * k, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(x - 32 * k, y - 4 * k);
      g.lineTo(x + 30 * k, y - 4 * k);
      g.lineTo(x + 18 * k, y - 96 * k);
      g.closePath();
      g.fill();
      g.fillStyle = '#E8741E';
      g.fillRect(x - 31 * k, y - 20 * k, 60 * k, 10 * k);
      return;
    }
    default:
      break;
  }
  if (f.name.startsWith('bat_') || f.name.startsWith('skybat_')) {
    const k = f.w / 170;
    const lift = f.name.endsWith('_0') ? 30 : f.name.endsWith('_1') ? 0 : -26;
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    wing(g, 0, 0, 80, lift, '#1E1424');
    ell(g, 0, 4, 14, 18, '#2A1C30');
    ell(g, 0, -14, 10, 9, '#2A1C30');
    g.restore();
    return;
  }
  if (f.name.startsWith('owl_')) {
    const lift = f.name === 'owl_0' ? 40 : f.name === 'owl_1' ? 4 : -30;
    wing(g, x, y, 160, lift, '#8C6A48');
    ell(g, x + 10, y, 52, 34, '#A6825A');
    ell(g, x + 62, y - 14, 26, 24, '#A6825A');
    ell(g, x + 70, y - 18, 6, 6, '#F2B01E');
    return;
  }
  if (f.name.startsWith('lantern_')) {
    const lit = f.name.includes('_lit');
    g.save();
    g.translate(x, y);
    // Distant lanterns (_s) are drawn at half size, like the sheet's.
    if (f.name.endsWith('_s')) g.scale(0.5, 0.5);
    if (f.name.includes('post')) {
      g.fillStyle = '#6E5638';
      g.fillRect(-14, 26, 28, LANTERN_GROUND_PX - 26 + 8);
    } else if (f.name.includes('rock')) ell(g, 0, LANTERN_GROUND_PX - 6, 50, 22, '#7C7468');
    else ell(g, 0, LANTERN_BARE_GROUND_PX - 2, 34, 5, 'rgba(0,0,0,0.3)');
    pumpkin(g, 0, 0, lit);
    g.restore();
  }
}

/** Draws every frame into a canvas of the sheet's size × master. */
export function drawStandin(g: G, master: number): void {
  for (const f of sheetFrames()) {
    g.save();
    g.scale(master, master);
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    g.translate(f.x, f.y);
    draw(g, f);
    g.restore();
  }
}
