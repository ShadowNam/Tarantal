// Runtime placeholder art (Tech §10) in the "inked Bosveld comic" palette (art bible §1, §3, §4):
// warm-black ink outlines with line weight by depth, flat fills with one shadow and one highlight,
// birds dark and cool against a warm veld. Everything is drawn onto canvases and registered in the
// AssetManifest, so real art can replace any key later. Rendering-only code: Math.random would be
// allowed here, but a tiny seeded PRNG keeps the panorama identical between runs and screenshots.
import { canSpecs } from './canArt';
import { makalaniSpecs } from './makalaniArt';
import type { AmmoType, Biome, ContentBundle } from '../../content/schemas';
import type { ArtPlaneId as PlaneId } from '../assets/artPlane';
import { coreWidth, LAYER_BLEED_PX } from '../../sim/world';
import {
  AssetManifest,
  gunKey,
  MAX_TILE_WIDTH,
  ambienceKey,
  musicKey,
  sfxKey,
  TEX,
  type BirdFrame,
  type CanvasSpec,
} from '../assets/AssetManifest';
import { STEMS } from '../audio/music';
import { SFX_IDS } from '../audio/synth';
import { ammoSpecs, arsenalSpecs } from './arsenalArt';
import { omenSpecs } from './omenArt';
import { verBand, type Band, type BiomeArt } from './biomeArt';
import { sightSpecs } from './sightArt';
import { ellipse, ground, inked, INK, prng, tuft } from './draw';
import { sheetHerds } from '../view/faunaHerds';
import { FRUIT_SHEET, fruitSheetKey } from '../view/fruit/fruitTypes';
import { hasColonies } from '../../sim/meerkats/colony';
import { MEERKAT_SOUNDS } from '../assets/desertAssets';
import { HD_PARTS, hdKeyOf, POTJIE_LID, POTJIE_LID_SIZE } from '../assets/hdProps';

const KAROO = {
  skyTop: '#8DB8D8',
  skyBottom: '#F2D8A7',
  veld: '#E3A23B',
  veldLight: '#EDC277',
  veldDark: '#C9862C',
  soil: '#B8562C',
  koppie: '#8E7FA6',
  koppieDark: '#76688F',
  aloe: '#5E8C61',
  aloeDark: '#3F6B47',
  aloeFlower: '#E2552C',
  bush: '#7D8B4A',
  bushDark: '#5E6B36',
  rust: '#9A4B2A',
  metal: '#9AA3A8',
  metalDark: '#6E777C',
} as const;

interface BirdPalette {
  readonly plumage: string;
  readonly shadow: string;
  readonly dots: string;
  readonly face: string;
  readonly faceHi: string;
}

const TARENTAAL: BirdPalette = {
  plumage: '#2E2F45',
  shadow: '#1F2033',
  dots: '#F4F1E8',
  face: '#2F7DE1',
  faceHi: '#6FB3FF',
};
const PALETTES: Readonly<Record<string, BirdPalette>> = {
  tarentaal: TARENTAAL,
  tarentaal_wit: {
    plumage: '#F1EEE6',
    shadow: '#CFCAC0',
    dots: '#A9A49C',
    face: '#E7A3B4',
    faceHi: '#F6CCD6',
  },
  tarentaal_lavendel: {
    plumage: '#8F86A8',
    shadow: '#6F6789',
    dots: '#F4F1E8',
    face: '#2F7DE1',
    faceHi: '#6FB3FF',
  },
  // Ou Grys (art bible §3.2): faded grey plumage; the eye patch is drawn on top.
  ou_grys: {
    plumage: '#6F7378',
    shadow: '#55595E',
    dots: '#C9CCCF',
    face: '#7FA3C9',
    faceHi: '#A9C3DD',
  },
  kuifkop: {
    plumage: '#1E1F2A',
    shadow: '#121219',
    dots: '#BFD4F2',
    face: '#2F7DE1',
    faceHi: '#6FB3FF',
  },
};
const WATTLE = '#D7263D';
const CASQUE = '#C68B59';
const CASQUE_HI = '#E2C08F';
const BEAK = '#E9A23B';
const LEGS = '#6B5B4B';

// ---------------------------------------------------------------------------------------------
// Birds

interface PlaneLook {
  readonly scale: number;
  /** Ink line in screen px (art bible §1 rule 4). */
  readonly line: number;
  /** Atmospheric tint toward the sky (far plane 15–25 %). */
  readonly tint: number;
}

/** Local-unit bounding box every bird is drawn inside (scale 1, facing right). */
const BIRD_BOX = { left: -310, right: 310, top: -230, bottom: 170 };

function birdSpec(
  draw: (ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number) => void,
  look: PlaneLook,
  frame: BirdFrame,
): CanvasSpec {
  const pad = look.line + 2;
  const w = (BIRD_BOX.right - BIRD_BOX.left) * look.scale + pad * 2;
  const h = (BIRD_BOX.bottom - BIRD_BOX.top) * look.scale + pad * 2;
  const ox = -BIRD_BOX.left * look.scale + pad;
  const oy = -BIRD_BOX.top * look.scale + pad;
  return {
    key: '',
    width: w,
    height: h,
    originX: ox,
    originY: oy,
    draw(ctx) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(look.scale, look.scale);
      // Line widths are given in screen px, so divide by the scale inside the scaled context.
      draw(ctx, frame, look.line / look.scale);
      ctx.restore();
      if (look.tint > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = look.tint;
        ctx.fillStyle = KAROO.skyBottom;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    },
  };
}

function wing(
  ctx: CanvasRenderingContext2D,
  frame: BirdFrame,
  fill: string,
  line: number,
  span = 1,
): void {
  if (frame === 'stand') return;
  ctx.beginPath();
  if (frame === 'up') {
    ctx.moveTo(-40, -30);
    ctx.quadraticCurveTo(-90 * span, -200 * span, -10, -210 * span);
    ctx.quadraticCurveTo(30, -120, 50, -40);
  } else {
    ctx.moveTo(-40, 20);
    ctx.quadraticCurveTo(-110 * span, 130 * span, -20, 150 * span);
    ctx.quadraticCurveTo(40, 100, 50, 30);
  }
  ctx.closePath();
  inked(ctx, fill, line);
}

/** The helmeted guineafowl: bowling ball with a tail, small head on a neck, casque (art bible §3.1). */
function drawGuineafowl(p: BirdPalette, dotsForFar: boolean, crest: boolean) {
  return (ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number): void => {
    // Legs (standing pop-ups only; flying birds tuck them).
    if (frame === 'stand') {
      ctx.strokeStyle = LEGS;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-25, 80);
      ctx.lineTo(-30, 150);
      ctx.moveTo(25, 80);
      ctx.lineTo(30, 150);
      ctx.stroke();
    }
    // Tail stub.
    ctx.beginPath();
    ctx.moveTo(-95, -20);
    ctx.quadraticCurveTo(-150, -10, -130, 40);
    ctx.quadraticCurveTo(-110, 50, -90, 40);
    ctx.closePath();
    inked(ctx, p.shadow, line);
    // Body (matches the hitbox: rx 110, ry 85 at (0, 10)).
    ellipse(ctx, 0, 10, 110, 85);
    inked(ctx, p.plumage, line);
    ctx.save();
    ellipse(ctx, 0, 10, 110, 85);
    ctx.clip();
    ellipse(ctx, 10, 70, 110, 45);
    ctx.fillStyle = p.shadow;
    ctx.fill();
    // Dot field: many small dots up close, a few larger dots far away (legible at 0.22).
    const rnd = prng(17);
    const n = dotsForFar ? 14 : 70;
    const r = dotsForFar ? 11 : 5;
    ctx.fillStyle = p.dots;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd());
      ellipse(ctx, Math.cos(a) * 95 * d, 10 + Math.sin(a) * 72 * d, r, r);
      ctx.fill();
    }
    ctx.restore();
    ellipse(ctx, 0, 10, 110, 85);
    ctx.strokeStyle = INK;
    ctx.lineWidth = line;
    ctx.stroke();
    wing(ctx, frame, p.shadow, line);
    // Neck.
    ctx.beginPath();
    ctx.moveTo(55, -45);
    ctx.quadraticCurveTo(95, -60, 100, -95);
    ctx.lineTo(132, -75);
    ctx.quadraticCurveTo(115, -30, 85, -5);
    ctx.closePath();
    inked(ctx, p.face, line);
    // Head (hitbox circle r 38 at (120, −70)).
    ellipse(ctx, 120, -70, 38, 38);
    inked(ctx, p.face, line);
    ellipse(ctx, 110, -82, 14, 10);
    ctx.fillStyle = p.faceHi;
    ctx.fill();
    if (crest) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) ellipse(ctx, 100 + i * 12, -112 - (i % 2) * 8, 13, 13);
      inked(ctx, p.plumage, line);
    } else {
      // Casque: bony, slightly bent horn.
      ctx.beginPath();
      ctx.moveTo(100, -100);
      ctx.quadraticCurveTo(108, -160, 92, -170);
      ctx.quadraticCurveTo(128, -150, 134, -102);
      ctx.closePath();
      inked(ctx, CASQUE, line);
      ctx.beginPath();
      ctx.moveTo(104, -110);
      ctx.quadraticCurveTo(108, -140, 100, -155);
      ctx.strokeStyle = CASQUE_HI;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    // Beak and red wattles.
    ctx.beginPath();
    ctx.moveTo(152, -78);
    ctx.lineTo(182, -66);
    ctx.lineTo(152, -58);
    ctx.closePath();
    inked(ctx, BEAK, line);
    ellipse(ctx, 142, -42, 10, 16);
    inked(ctx, WATTLE, line);
    // Huge white eye, small pupil (panic reads instantly).
    ellipse(ctx, 128, -78, 13, 13);
    inked(ctx, '#FFFFFF', line * 0.6);
    ellipse(ctx, 132, -78, 4, 4);
    ctx.fillStyle = INK;
    ctx.fill();
  };
}

function drawHadeda(ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number): void {
  wing(ctx, frame === 'stand' ? 'down' : frame, '#5F5A4E', line, 1.25);
  ellipse(ctx, 0, 0, 120, 60);
  inked(ctx, '#7A7466', line);
  ellipse(ctx, 150, -10, 30, 28);
  inked(ctx, '#6C6659', line);
  // Long down-curved bill: the silhouette tell.
  ctx.beginPath();
  ctx.moveTo(172, -16);
  ctx.quadraticCurveTo(250, -10, 270, 60);
  ctx.quadraticCurveTo(240, 10, 172, 0);
  ctx.closePath();
  inked(ctx, '#3A3530', line);
  ellipse(ctx, 160, -16, 6, 6);
  ctx.fillStyle = '#F4F1E8';
  ctx.fill();
}

function drawKwevoel(ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number): void {
  // Slim, upright, long tail, pointed crest, all grey.
  ctx.beginPath();
  ctx.moveTo(-20, 60);
  ctx.lineTo(-60, 165);
  ctx.lineTo(-25, 165);
  ctx.lineTo(10, 70);
  ctx.closePath();
  inked(ctx, '#8C8F8E', line);
  wing(ctx, frame, '#7E8180', line, 0.7);
  ellipse(ctx, 0, 0, 60, 90);
  inked(ctx, '#A4A7A6', line);
  ellipse(ctx, 20, -110, 30, 30);
  inked(ctx, '#A4A7A6', line);
  ctx.beginPath();
  ctx.moveTo(5, -132);
  ctx.lineTo(-10, -200);
  ctx.lineTo(35, -136);
  ctx.closePath();
  inked(ctx, '#8C8F8E', line);
  ctx.beginPath();
  ctx.moveTo(48, -112);
  ctx.lineTo(70, -104);
  ctx.lineTo(48, -98);
  ctx.closePath();
  inked(ctx, '#2C2C2C', line);
}

function drawEagle(ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number): void {
  wing(ctx, frame === 'stand' ? 'up' : frame, '#3B2A20', line, 1.4);
  ellipse(ctx, 0, 0, 160, 70);
  inked(ctx, '#7B3F22', line);
  ellipse(ctx, 120, -20, 34, 32);
  inked(ctx, '#F4F1E8', line);
  ctx.beginPath();
  ctx.moveTo(150, -26);
  ctx.quadraticCurveTo(180, -20, 170, 0);
  ctx.lineTo(150, -8);
  ctx.closePath();
  inked(ctx, '#E9C23B', line);
}

/** Die Stormvoël (art bible §3.2): a giant storm-dark silhouette; only the eyes glow. */
function drawStormvoel(ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number): void {
  const dark = '#1C2030';
  // Broad ragged wings, up or down.
  const up = frame !== 'down';
  ctx.beginPath();
  ctx.moveTo(-60, -20);
  ctx.lineTo(-260, up ? -210 : 150);
  ctx.lineTo(-180, up ? -160 : 110);
  ctx.lineTo(-210, up ? -120 : 160);
  ctx.lineTo(-120, up ? -90 : 90);
  ctx.lineTo(40, -10);
  ctx.closePath();
  inked(ctx, dark, line);
  ellipse(ctx, 0, 0, 200, 140);
  inked(ctx, dark, line);
  ellipse(ctx, 230, -120, 66, 62);
  inked(ctx, dark, line);
  // Casque and the glowing eyes.
  ctx.beginPath();
  ctx.moveTo(205, -170);
  ctx.lineTo(225, -215);
  ctx.lineTo(250, -172);
  ctx.closePath();
  inked(ctx, dark, line);
  for (const [x, r] of [
    [250, 16],
    [222, 11],
  ] as const) {
    ellipse(ctx, x, -128, r, r * 0.7);
    inked(ctx, '#FFE066', 0);
  }
}

function drawSprayer(ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number): void {
  // Fictional yellow biplane (no brand marks) trailing a mist.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#E8F1E0';
  for (let i = 0; i < 6; i++) {
    ellipse(ctx, -270 + i * 10, 40 + i * 6, 30 + i * 8, 18 + i * 4);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-260, -10);
  ctx.lineTo(220, -35);
  ctx.quadraticCurveTo(260, 0, 220, 35);
  ctx.lineTo(-260, 15);
  ctx.closePath();
  inked(ctx, '#F2C230', line);
  ctx.beginPath();
  ctx.rect(-40, -70, 120, 22);
  ctx.rect(-50, 30, 140, 22);
  inked(ctx, '#E0A920', line);
  ctx.beginPath();
  ctx.rect(-260, -60, 40, 50);
  inked(ctx, '#E0A920', line);
  ctx.beginPath();
  ctx.moveTo(255, frame === 'up' ? -60 : -20);
  ctx.lineTo(255, frame === 'up' ? 60 : 20);
  ctx.strokeStyle = INK;
  ctx.lineWidth = line * 1.5;
  ctx.stroke();
  ellipse(ctx, 60, -45, 26, 18);
  inked(ctx, '#BFE0F2', line);
}

type BirdDraw = (ctx: CanvasRenderingContext2D, frame: BirdFrame, line: number) => void;

function birdDrawFor(creature: string, plane: PlaneId): BirdDraw | null {
  const far = plane === 'far';
  if (creature === 'hadeda') return drawHadeda;
  if (creature === 'kwevoel') return drawKwevoel;
  if (creature === 'visarend') return drawEagle;
  if (creature === 'sproeier') return drawSprayer;
  if (creature === 'stormvoel') return drawStormvoel;
  if (creature === 'generaal') {
    // A big old cock; his enamel pot is a separate sprite so it can fly off (fx/pot).
    const body = drawGuineafowl(TARENTAAL, far, false);
    return (ctx, frame, line) => {
      ctx.save();
      ctx.scale(1.1, 1.1);
      body(ctx, frame, line / 1.1);
      ctx.restore();
    };
  }
  if (creature === 'ou_grys') {
    // A grizzled veteran: grey, a bit bigger, a black eye patch on a strap.
    const body = drawGuineafowl(PALETTES['ou_grys'] ?? TARENTAAL, far, false);
    return (ctx, frame, line) => {
      ctx.save();
      ctx.scale(1.08, 1.08);
      body(ctx, frame, line / 1.08);
      ctx.beginPath();
      ctx.moveTo(98, -104);
      ctx.lineTo(152, -60);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.stroke();
      ellipse(ctx, 128, -78, 16, 15);
      inked(ctx, INK, 0);
      ctx.restore();
    };
  }
  if (creature === 'kuifkop_koning') {
    // Art bible §3.2: a kuifkop with a bottle-cap crown wedged in his crest.
    const body = drawGuineafowl(PALETTES['kuifkop'] ?? TARENTAAL, far, true);
    return (ctx, frame, line) => {
      ctx.save();
      ctx.scale(1.12, 1.12);
      body(ctx, frame, line / 1.12);
      ctx.beginPath();
      ctx.moveTo(92, -130);
      for (let k = 0; k <= 6; k++) ctx.lineTo(92 + k * 8, k % 2 === 0 ? -150 : -136);
      ctx.lineTo(140, -122);
      ctx.lineTo(92, -122);
      ctx.closePath();
      inked(ctx, '#E9C23B', line / 1.12);
      ctx.restore();
    };
  }
  if (creature === 'kuifkop') {
    return drawGuineafowl(PALETTES['kuifkop'] ?? TARENTAAL, far, true);
  }
  const palette = PALETTES[creature];
  if (palette !== undefined) return drawGuineafowl(palette, far, false);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Parallax layers (art bible §4.1: sky, far ridge, far veld, mid, near, foreground)

function bush(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, line: number): void {
  for (let i = 0; i < 3; i++) {
    ellipse(ctx, x + (i - 1) * 18 * s, y - (i === 1 ? 14 : 6) * s, 22 * s, 16 * s);
    inked(ctx, i === 1 ? KAROO.bush : KAROO.bushDark, line);
  }
}

const BANDS: Readonly<Record<string, Band>> = {
  // v1.3: the Ver plane's strip (shown only on maps that open it).
  ver_veld: verBand({ ground: '#E2BE80', haze: 'rgba(214,196,170,0.9)', scrub: '#8C8A62' }),
  sky: {
    top: 0,
    bottom: 1080,
    scale: 4,
    draw(ctx, width, rnd) {
      const g = ctx.createLinearGradient(0, 0, 0, 640);
      g.addColorStop(0, KAROO.skyTop);
      g.addColorStop(1, KAROO.skyBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, 1080);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < width / 260; i++) {
        const x = rnd() * width;
        const y = 70 + rnd() * 240;
        for (let k = 0; k < 4; k++) {
          ellipse(ctx, x + k * 40, y - (k % 2) * 16, 60, 26);
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
      // Flat-topped dolerite koppies.
      ctx.translate(0, -380);
      for (let x = -100; x < width; x += 260 + rnd() * 300) {
        const w = 220 + rnd() * 360;
        const top = 430 + rnd() * 90;
        ctx.beginPath();
        ctx.moveTo(x, 660);
        ctx.lineTo(x + w * 0.22, top);
        ctx.lineTo(x + w * 0.78, top);
        ctx.lineTo(x + w, 660);
        ctx.closePath();
        inked(ctx, rnd() < 0.5 ? KAROO.koppie : KAROO.koppieDark, 2);
      }
    },
  },
  far_veld: {
    top: 548,
    bottom: 780,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -548);
      ground(ctx, width, 568, 780, 10, KAROO.veldLight, 2, rnd);
      for (let x = 0; x < width; x += 40 + rnd() * 140) bush(ctx, x, 600 + rnd() * 60, 0.45, 1);
      // A distant wire fence.
      ctx.strokeStyle = 'rgba(27,20,16,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 626);
      ctx.lineTo(width, 622);
      ctx.stroke();
      for (let x = 0; x < width; x += 70) {
        ctx.beginPath();
        ctx.moveTo(x, 610);
        ctx.lineTo(x, 632);
        ctx.stroke();
      }
    },
  },
  mid: {
    top: 630,
    bottom: 910,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -630);
      ground(ctx, width, 655, 910, 18, KAROO.veld, 4, rnd);
      for (let i = 0; i < width / 180; i++) {
        ellipse(ctx, rnd() * width, 720 + rnd() * 150, 60 + rnd() * 80, 10 + rnd() * 8);
        ctx.fillStyle = 'rgba(184,86,44,0.45)';
        ctx.fill();
      }
      for (let x = 0; x < width; x += 90 + rnd() * 220) bush(ctx, x, 690 + rnd() * 150, 1, 3);
    },
  },
  near: {
    top: 820,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      ctx.translate(0, -820);
      ground(ctx, width, 845, 1080, 26, KAROO.veldDark, 6, rnd);
      for (let x = 0; x < width; x += 40 + rnd() * 90) {
        tuft(
          ctx,
          x,
          880 + rnd() * 190,
          40 + rnd() * 50,
          rnd() < 0.5 ? KAROO.veld : KAROO.veldLight,
          3,
        );
      }
    },
  },
  foreground: {
    top: 900,
    bottom: 1080,
    scale: 1,
    draw(ctx, width, rnd) {
      // Sparse framing grass only: the bottom of the screen stays mostly open (art bible §4.1).
      ctx.translate(0, -900);
      for (let x = 0; x < width; x += 500 + rnd() * 700) {
        for (let k = 0; k < 4; k++) {
          tuft(
            ctx,
            x + k * 50,
            1085,
            110 + rnd() * 70,
            k % 2 === 0 ? KAROO.veldDark : KAROO.veld,
            6,
          );
        }
      }
    },
  },
};

function layerTiles(assetId: string, band: Band, scrollFactor: number, seed: number) {
  const fullWidth = coreWidth(scrollFactor) + LAYER_BLEED_PX * 2;
  const texW = Math.ceil(fullWidth / band.scale);
  const texH = Math.ceil((band.bottom - band.top) / band.scale);
  const count = Math.ceil(texW / MAX_TILE_WIDTH);
  const tileTexW = Math.ceil(texW / count);
  let source: HTMLCanvasElement | null = null;
  const sourceCanvas = (): HTMLCanvasElement => {
    if (source) return source;
    source = document.createElement('canvas');
    source.width = texW;
    source.height = texH;
    const ctx = source.getContext('2d');
    if (ctx === null) throw new Error('2D canvas unavailable');
    ctx.scale(1 / band.scale, 1 / band.scale);
    band.draw(ctx, fullWidth, prng(seed));
    return source;
  };
  const tiles: CanvasSpec[] = [];
  for (let i = 0; i < count; i++) {
    tiles.push({
      key: `${assetId}#${i}`,
      width: tileTexW,
      height: texH,
      originX: 0,
      originY: 0,
      draw(ctx) {
        ctx.drawImage(sourceCanvas(), -i * tileTexW, 0);
      },
    });
  }
  return {
    art: {
      tiles: tiles.map((t) => t.key),
      tileWidth: tileTexW * band.scale,
      left: -LAYER_BLEED_PX,
      top: band.top,
      scale: band.scale,
    },
    tiles,
  };
}

// ---------------------------------------------------------------------------------------------
// Props (sized to their occluder so what you see is what blocks pellets — D-018)

type Prop = Biome['props'][number];

function propSpec(prop: Prop, art: BiomeArt): CanvasSpec {
  const o = prop.occluder;
  const ow = o === undefined ? 140 : o.type === 'rect' ? o.w : o.rx * 2;
  const oh = o === undefined ? 140 : o.type === 'rect' ? o.h : o.ry * 2;
  const ox = o?.ox ?? 0;
  const oy = o?.oy ?? 0;
  // Extra room above for the windpomp rotor and other bits that stick out of the occluder.
  const custom = art.propPad?.[prop.id];
  const padTop = custom?.top ?? (prop.id === 'windpomp' ? 140 : 60);
  const pad = custom?.side ?? 40;
  const w = ow + pad * 2;
  const h = oh + padTop + pad;
  // Texture origin = the prop's (x, y); the occluder centre sits at (ox, oy) from it.
  const cx = pad + ow / 2;
  const cy = padTop + oh / 2;
  return {
    key: prop.asset,
    width: w,
    height: h,
    originX: cx - ox,
    originY: cy - oy,
    draw(ctx) {
      ctx.translate(cx, cy);
      art.drawProp(ctx, prop.id, ow, oh);
    },
  };
}

/**
 * D-051: the potjie's loose lid. Its placeholder is empty (a 1×1 canvas, `empty`): views only show
 * the lid once its HD file has landed (the first-download pot has one painted on).
 */
const POTJIE_LID_SPEC: CanvasSpec = {
  key: POTJIE_LID,
  ...POTJIE_LID_SIZE,
  empty: true,
  draw() {},
};

function drawKarooProp(ctx: CanvasRenderingContext2D, id: string, w: number, h: number): void {
  const line = 4;
  if (id === 'windpomp') {
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-8, -h / 2);
    ctx.lineTo(8, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = line;
    ctx.stroke();
    for (let k = 1; k < 5; k++) {
      const y = -h / 2 + (k * h) / 5;
      const half = 8 + ((w / 2 - 8) * k) / 5;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }
    // Tail vane (the turning rotor is the secret's own sprite, secret/rotor).
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(-150, -h / 2 + 4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-190, -h / 2 - 30, 50, 60);
    inked(ctx, KAROO.metalDark, 3);
    return;
  }
  if (id === 'reservoir') {
    ellipse(ctx, 0, 0, w / 2, h / 2);
    inked(ctx, KAROO.metal, line);
    ctx.strokeStyle = KAROO.metalDark;
    ctx.lineWidth = 3;
    for (let x = -w / 2 + 20; x < w / 2; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, -h / 2 + 12);
      ctx.lineTo(x, h / 2 - 12);
      ctx.stroke();
    }
    return;
  }
  if (id === 'bakkie') {
    // Rusty fictional pickup (no badge).
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2 - 50);
    ctx.lineTo(-w / 2, -10);
    ctx.lineTo(-20, -10);
    ctx.lineTo(10, -h / 2);
    ctx.lineTo(w / 2 - 70, -h / 2);
    ctx.lineTo(w / 2, -10);
    ctx.lineTo(w / 2, h / 2 - 50);
    ctx.closePath();
    inked(ctx, KAROO.rust, line);
    ctx.beginPath();
    ctx.rect(30, -h / 2 + 15, w / 2 - 110, 60);
    inked(ctx, '#BFE0F2', line);
    for (const x of [-w / 2 + 80, w / 2 - 80]) {
      ellipse(ctx, x, h / 2 - 50, 42, 42);
      inked(ctx, '#2A2522', line);
      ellipse(ctx, x, h / 2 - 50, 16, 16);
      inked(ctx, KAROO.metal, 2);
    }
    // Spare wheel on the back (secret in M4).
    ellipse(ctx, -w / 2 + 30, -40, 26, 30);
    inked(ctx, '#2A2522', line);
    return;
  }
  if (id === 'potjie') {
    for (let k = 0; k < 3; k++) {
      tuft(ctx, -30 + k * 30, 70, 50, k === 1 ? '#F2A33A' : '#E2552C', 2);
    }
    ellipse(ctx, 0, 10, 60, 50);
    inked(ctx, '#2A2522', line);
    ctx.beginPath();
    ctx.rect(-48, -46, 96, 12);
    inked(ctx, '#3A3530', line);
    return;
  }
  if (id === 'fence_bell') {
    ctx.beginPath();
    ctx.rect(-8, -60, 16, 130);
    inked(ctx, '#8B5A2B', line);
    ctx.beginPath();
    ctx.moveTo(-20, -20);
    ctx.quadraticCurveTo(0, -60, 20, -20);
    ctx.lineTo(24, 0);
    ctx.lineTo(-24, 0);
    ctx.closePath();
    inked(ctx, '#D8A73A', line);
    return;
  }
  // Aloes (and any unknown prop): spiky rosette with orange flower spikes.
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(-30 + k * 30, -h / 2 + 10);
    ctx.lineTo(-24 + k * 30, -h / 2 - 50);
    ctx.lineTo(-18 + k * 30, -h / 2 + 10);
    ctx.closePath();
    inked(ctx, KAROO.aloeFlower, 3);
  }
  for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(-20, h / 2);
    ctx.lineTo(Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * h * 0.9);
    ctx.lineTo(20, h / 2);
    ctx.closePath();
    inked(ctx, k % 2 === 0 ? KAROO.aloe : KAROO.aloeDark, 4);
  }
}

// ---------------------------------------------------------------------------------------------
// UI and FX

function uiSpecs(): CanvasSpec[] {
  // v1.1 (D-032): the shell belt and the reticle moved to per-gun ammo (arsenalArt ammoSpecs) and
  // shape-built crosshairs (view/CrosshairView.ts).
  return [
    {
      key: TEX.badgeNo,
      width: 64,
      height: 64,
      originX: 32,
      originY: 32,
      draw(ctx) {
        // ⛔: shape + colour, so penalty creatures never rely on colour alone (GDD §18.3).
        ctx.translate(32, 32);
        ellipse(ctx, 0, 0, 27, 27);
        inked(ctx, '#C8302A', 4);
        ctx.beginPath();
        ctx.rect(-16, -5, 32, 10);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      },
    },
    {
      key: TEX.feather,
      width: 24,
      height: 48,
      originX: 12,
      originY: 24,
      draw(ctx) {
        ctx.translate(12, 24);
        ellipse(ctx, 0, 0, 8, 20);
        inked(ctx, TARENTAAL.plumage, 2);
        ellipse(ctx, 0, -6, 2.5, 2.5);
        ctx.fillStyle = TARENTAAL.dots;
        ctx.fill();
        ellipse(ctx, 0, 6, 2.5, 2.5);
        ctx.fill();
      },
    },
    {
      key: TEX.flash,
      width: 200,
      height: 200,
      originX: 100,
      originY: 100,
      draw(ctx) {
        ctx.translate(100, 100);
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const r = k % 2 === 0 ? 96 : 40;
          const a = (k / 16) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        inked(ctx, '#FFD25A', 4);
        ellipse(ctx, 0, 0, 34, 34);
        ctx.fillStyle = '#FFF6D5';
        ctx.fill();
      },
    },
    {
      key: TEX.bubble,
      width: 260,
      height: 170,
      originX: 130,
      originY: 85,
      draw(ctx) {
        ctx.translate(130, 85);
        ctx.beginPath();
        for (let k = 0; k < 22; k++) {
          const a = (k / 22) * Math.PI * 2;
          const r = k % 2 === 0 ? 1 : 0.8;
          ctx.lineTo(Math.cos(a) * 120 * r, Math.sin(a) * 76 * r);
        }
        ctx.closePath();
        inked(ctx, '#F3EAD3', 5);
      },
    },
    {
      key: TEX.puff,
      width: 64,
      height: 64,
      originX: 32,
      originY: 32,
      draw(ctx) {
        ctx.translate(32, 32);
        for (let k = 0; k < 4; k++) {
          ellipse(ctx, (k - 1.5) * 10, (k % 2) * -8, 16, 14);
          ctx.fillStyle = 'rgba(232,206,160,0.85)';
          ctx.fill();
        }
      },
    },
    {
      key: TEX.grassTuft,
      width: 260,
      height: 110,
      originX: 130,
      originY: 30,
      draw(ctx) {
        // Covers a pop-up's grass line: origin sits on the line, blades rise 30 px above it.
        ctx.translate(130, 30);
        ctx.beginPath();
        ctx.rect(-126, 4, 252, 80);
        ctx.fillStyle = KAROO.veldDark;
        ctx.fill();
        for (let k = 0; k < 6; k++)
          tuft(ctx, -105 + k * 42, 30, 64, k % 2 === 0 ? KAROO.veld : KAROO.veldLight, 4);
      },
    },
    {
      key: TEX.gun,
      width: 420,
      height: 520,
      originX: 210,
      originY: 520,
      draw(ctx) {
        // First-person side-by-side shotgun, barrels pointing up into the scene.
        ctx.translate(210, 520);
        ctx.beginPath();
        ctx.moveTo(-30, -500);
        ctx.lineTo(30, -500);
        ctx.lineTo(48, -230);
        ctx.lineTo(-48, -230);
        ctx.closePath();
        inked(ctx, '#3B3F45', 6);
        ctx.beginPath();
        ctx.moveTo(0, -500);
        ctx.lineTo(0, -232);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-60, -240);
        ctx.lineTo(60, -240);
        ctx.lineTo(120, 0);
        ctx.lineTo(-90, 0);
        ctx.closePath();
        inked(ctx, '#8B5A2B', 6);
        ctx.beginPath();
        ctx.moveTo(-40, -200);
        ctx.lineTo(40, -200);
        ctx.lineTo(46, -150);
        ctx.lineTo(-46, -150);
        ctx.closePath();
        inked(ctx, '#6E777C', 4);
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// M4: secrets, crates, omen, boss, helper and crate-weapon art

function star(ctx: CanvasRenderingContext2D, points: number, outer: number, inner: number): void {
  ctx.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const r = k % 2 === 0 ? outer : inner;
    const a = (k / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

/**
 * A sociable weaver in flight (rendering only; the interim art in tools/art redraws it): a
 * sparrow-sized brown bird with a black chin and face and a scaly, pale-edged back.
 */
function weaver(ctx: CanvasRenderingContext2D, up: boolean): void {
  const wing = (dir: number): void => {
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(-14, dir * 24, -34, dir * 26);
    ctx.quadraticCurveTo(-18, dir * 10, 8, -2);
    ctx.closePath();
    inked(ctx, '#8A6A48', 2);
  };
  if (up) wing(-1);
  // Tail, body and the pale-edged scaly back.
  ctx.beginPath();
  ctx.moveTo(-22, -2);
  ctx.lineTo(-38, -6);
  ctx.lineTo(-36, 4);
  ctx.closePath();
  inked(ctx, '#6E5238', 2);
  ellipse(ctx, -4, 0, 22, 11);
  inked(ctx, '#B39470', 2);
  ctx.strokeStyle = '#EEE3CC';
  ctx.lineWidth = 1.4;
  for (const x of [-16, -9, -2, 5])
    for (const y of [-6, -1]) {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
  // Head with the black face and chin, pale bill.
  ellipse(ctx, 20, -3, 9, 8);
  inked(ctx, '#9C7B57', 2);
  ellipse(ctx, 23, 1, 6, 5);
  ctx.fillStyle = '#1B1410';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(28, -3);
  ctx.lineTo(36, -1);
  ctx.lineTo(28, 2);
  ctx.closePath();
  ctx.fillStyle = '#C9C2B2';
  ctx.fill();
  if (!up) wing(1);
}

/** v1.6b: a red shell standing up, brass head down, centred on (x, y). */
function placeholderShell(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const w = h * 0.36;
  ctx.fillStyle = '#C8302A';
  ctx.fillRect(x - w / 2, y - h / 2, w, h * 0.7);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h * 0.7);
  ctx.fillStyle = '#C9A13B';
  ctx.fillRect(x - w / 2 - 2, y + h * 0.2, w + 4, h * 0.3);
  ctx.strokeRect(x - w / 2 - 2, y + h * 0.2, w + 4, h * 0.3);
}

/** v1.6b: a yellow zig-zag lightning bolt centred on (x, y). */
function placeholderBolt(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const k = h / 56;
  const pts = [
    [6, -28],
    [-12, 4],
    [-1, 4],
    [-8, 28],
    [13, -6],
    [2, -6],
    [10, -28],
  ];
  ctx.beginPath();
  pts.forEach(([px = 0, py = 0], i) => {
    if (i === 0) ctx.moveTo(x + px * k, y + py * k);
    else ctx.lineTo(x + px * k, y + py * k);
  });
  ctx.closePath();
  inked(ctx, '#FFD25A', 3);
}

function centred(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): CanvasSpec {
  return {
    key,
    width: w,
    height: h,
    originX: w / 2,
    originY: h / 2,
    draw(ctx) {
      ctx.translate(w / 2, h / 2);
      draw(ctx);
    },
  };
}

function m4Specs(): CanvasSpec[] {
  return [
    // Windpomp rotor: 12 vanes around a hub, radius ~105 (secret parts sit at 72).
    centred(TEX.rotor, 240, 240, (ctx) => {
      for (let b = 0; b < 12; b++) {
        ctx.save();
        ctx.rotate((b * Math.PI) / 6);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-13, -108);
        ctx.lineTo(13, -108);
        ctx.closePath();
        inked(ctx, b % 2 === 0 ? KAROO.metal : KAROO.metalDark, 2);
        ctx.restore();
      }
      ellipse(ctx, 0, 0, 14, 14);
      inked(ctx, KAROO.rust, 4);
    }),
    // v1.6 (D-042): the windpomp head: gearbox, tail boom and vane, trailing left of the pivot.
    {
      key: TEX.windpompVane,
      width: 320,
      height: 140,
      originX: 290,
      originY: 70,
      draw(ctx) {
        ctx.translate(290, 70);
        ctx.beginPath();
        ctx.moveTo(-6, -3);
        ctx.lineTo(-206, 7);
        ctx.lineWidth = 5;
        ctx.strokeStyle = KAROO.metalDark;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-262, -40);
        ctx.lineTo(-196, -30);
        ctx.lineTo(-194, 44);
        ctx.lineTo(-262, 56);
        ctx.closePath();
        inked(ctx, KAROO.metal, 3);
        ctx.beginPath();
        ctx.rect(-22, -22, 44, 36);
        inked(ctx, KAROO.metalDark, 3);
      },
    },
    // v1.6 (D-042): soft clouds (shown at 2×): white lobes with a grey flat base.
    ...(
      [
        [TEX.cloudCumulus, 200, 96],
        [TEX.cloudWide, 260, 96],
        [TEX.cloudCirrus, 300, 56],
        [TEX.cloudTower, 200, 150],
      ] as const
    ).map(([key, w, h]) =>
      centred(key, w, h, (ctx) => {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const [x, y, r] of [
          [-w * 0.22, h * 0.1, h * 0.28],
          [0, -h * 0.05, h * 0.36],
          [w * 0.22, h * 0.1, h * 0.26],
        ] as const) {
          ellipse(ctx, x, y, r * 1.3, r);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(180,192,204,0.7)';
        ellipse(ctx, 0, h * 0.3, w * 0.38, h * 0.08);
        ctx.fill();
      }),
    ),
    // A painted red target mark on a shootable secret part; grey cross once hit.
    centred(TEX.mark, 64, 64, (ctx) => {
      ellipse(ctx, 0, 0, 24, 24);
      inked(ctx, '#C8302A', 4);
      ellipse(ctx, 0, 0, 10, 10);
      inked(ctx, '#F3EAD3', 3);
    }),
    centred(TEX.markHit, 64, 64, (ctx) => {
      ellipse(ctx, 0, 0, 22, 22);
      inked(ctx, '#55605A', 3);
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 12);
      ctx.moveTo(12, -12);
      ctx.lineTo(-12, 12);
      ctx.strokeStyle = '#F3EAD3';
      ctx.lineWidth = 5;
      ctx.stroke();
    }),
    // Hint glint: a four-point sparkle.
    centred(TEX.glint, 96, 96, (ctx) => {
      star(ctx, 4, 44, 8);
      ctx.fillStyle = '#FFF6D5';
      ctx.fill();
      star(ctx, 4, 22, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }),
    // Meerkat Spotter reveal ring (shape, not colour alone: dashed).
    centred(TEX.ring, 200, 200, (ctx) => {
      ctx.setLineDash([18, 10]);
      ellipse(ctx, 0, 0, 90, 90);
      ctx.strokeStyle = '#1B1410';
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.strokeStyle = '#7CF2A0';
      ctx.lineWidth = 6;
      ctx.stroke();
    }),
    centred(TEX.spark, 80, 80, (ctx) => {
      star(ctx, 6, 36, 12);
      inked(ctx, '#FFD25A', 3);
    }),
    // Supply crate under a parachute (origin = crate centre) and on the ground.
    {
      key: TEX.crateChute,
      width: 260,
      height: 360,
      originX: 130,
      originY: 290,
      draw(ctx) {
        ctx.translate(130, 290);
        ctx.beginPath();
        ctx.moveTo(-120, -200);
        ctx.quadraticCurveTo(0, -310, 120, -200);
        ctx.quadraticCurveTo(0, -230, -120, -200);
        ctx.closePath();
        inked(ctx, '#F3EAD3', 4);
        ctx.beginPath();
        for (const x of [-110, -40, 40, 110]) {
          ctx.moveTo(x, -205);
          ctx.lineTo(x * 0.4, -60);
        }
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.stroke();
        crateBox(ctx);
      },
    },
    centred(TEX.crateBox, 160, 160, crateBox),
    // Dust devil: a leaning swirl column (origin at its base).
    {
      key: TEX.dustDevil,
      width: 300,
      height: 520,
      originX: 150,
      originY: 500,
      draw(ctx) {
        ctx.translate(150, 500);
        for (let k = 0; k < 9; k++) {
          const y = -k * 55;
          const r = 30 + k * 13;
          ellipse(ctx, Math.sin(k * 0.9) * 18, y, r, 18 + k * 2);
          ctx.fillStyle = k % 2 === 0 ? 'rgba(201,134,44,0.55)' : 'rgba(237,194,119,0.5)';
          ctx.fill();
        }
      },
    },
    centred(TEX.leaf, 28, 16, (ctx) => {
      ellipse(ctx, 0, 0, 12, 6);
      inked(ctx, '#C9862C', 2);
    }),
    centred(TEX.dust, 40, 40, (ctx) => {
      ellipse(ctx, 0, 0, 18, 14);
      ctx.fillStyle = 'rgba(232,206,160,0.6)';
      ctx.fill();
    }),
    centred(TEX.smoke, 140, 140, (ctx) => {
      for (let k = 0; k < 5; k++) {
        ellipse(ctx, Math.cos(k * 1.3) * 30, Math.sin(k * 1.3) * 26, 40, 36);
        ctx.fillStyle = 'rgba(214,208,196,0.8)';
        ctx.fill();
      }
    }),
    // The Generaal's rusty enamel pot (helmet), origin at its rim centre.
    {
      key: TEX.pot,
      width: 140,
      height: 110,
      originX: 70,
      originY: 90,
      draw(ctx) {
        ctx.translate(70, 90);
        ctx.beginPath();
        ctx.moveTo(-48, 0);
        ctx.lineTo(-40, -62);
        ctx.quadraticCurveTo(0, -78, 40, -62);
        ctx.lineTo(48, 0);
        ctx.closePath();
        inked(ctx, '#E8E2D0', 4);
        ctx.beginPath();
        ctx.rect(-56, -6, 112, 12);
        inked(ctx, '#2D5DA8', 3);
        ellipse(ctx, 18, -36, 10, 8);
        ctx.fillStyle = KAROO.rust;
        ctx.fill();
      },
    },
    // Meerkat helper standing up (Meerkat Spotter).
    {
      key: TEX.meerkat,
      width: 120,
      height: 220,
      originX: 60,
      originY: 210,
      draw(ctx) {
        ctx.translate(60, 210);
        ellipse(ctx, 0, -80, 30, 75);
        inked(ctx, '#C9A16B', 4);
        ellipse(ctx, 0, -170, 24, 26);
        inked(ctx, '#C9A16B', 4);
        for (const x of [-9, 9]) {
          ellipse(ctx, x, -174, 6, 6);
          ctx.fillStyle = INK;
          ctx.fill();
        }
        ellipse(ctx, 0, -158, 5, 4);
        ctx.fill();
      },
    },
    // v1.4 B (D-039): an angry sociable weaver in flight, wings up and down (facing right).
    centred(TEX.weaverUp, 96, 64, (ctx) => {
      weaver(ctx, true);
    }),
    centred(TEX.weaverDown, 96, 64, (ctx) => {
      weaver(ctx, false);
    }),
    // v1.6b (D-043) reload power-up icons: a shell with a bolt (Blitslaai); a hand holding shells
    // (Oupa Laai); and the small bolt glint on the belt.
    // v1.7b (D-046): every icon is a 128 px texture drawn in a 64-unit box (scaled 2×).
    centred(TEX.puBlitslaai, 128, 128, (ctx) => {
      ctx.scale(2, 2);
      placeholderShell(ctx, -6, 2, 48);
      placeholderBolt(ctx, 9, -2, 46);
    }),
    centred(TEX.puOupaLaai, 128, 128, (ctx) => {
      ctx.scale(2, 2);
      placeholderShell(ctx, -9, -6, 32);
      placeholderShell(ctx, 3, -9, 32);
      ellipse(ctx, 6, 14, 18, 11);
      inked(ctx, '#C98E62', 3);
      ctx.fillStyle = '#A08A55';
      ctx.fillRect(20, 10, 10, 18);
    }),
    // v1.7b placeholders: one plain shape in the icon's main colour each.
    ...(
      [
        [TEX.puChilliBiltong, '#7A2E22', 'strip'],
        [TEX.puBoeretroos, '#2D5DA8', 'mug'],
        [TEX.puBushBuckshot, '#C8302A', 'shell'],
        [TEX.puMeerkatSpotter, '#C9A16B', 'disc'],
        [TEX.puVoorlaaier, '#8B5A2B', 'gun'],
        [TEX.puMielieMasjien, '#5E7A3A', 'gun'],
        [TEX.puRooikol, '#E8241A', 'disc'],
      ] as const
    ).map(([key, colour, shape]) =>
      centred(key, 128, 128, (ctx) => {
        ctx.scale(2, 2);
        if (shape === 'shell') {
          placeholderShell(ctx, -12, 0, 44);
          return;
        }
        ctx.beginPath();
        if (shape === 'strip') ctx.rect(-26, -8, 52, 16);
        else if (shape === 'mug') ctx.rect(-16, -14, 30, 34);
        else if (shape === 'gun') ctx.rect(-30, -5, 60, 10);
        else ctx.arc(0, 0, 24, 0, Math.PI * 2);
        inked(ctx, colour, 3);
      }),
    ),
    centred(TEX.bolt, 40, 56, (ctx) => {
      placeholderBolt(ctx, 0, 0, 48);
    }),
    // Wind sock (HUD): a striped cone, origin at the pole top; rotated/stretched by the HUD.
    {
      key: TEX.windsock,
      width: 150,
      height: 60,
      originX: 6,
      originY: 30,
      draw(ctx) {
        ctx.translate(6, 30);
        for (let k = 0; k < 4; k++) {
          const x0 = k * 34;
          const h0 = 22 - k * 4;
          const h1 = 22 - (k + 1) * 4;
          ctx.beginPath();
          ctx.moveTo(x0, -h0);
          ctx.lineTo(x0 + 34, -h1);
          ctx.lineTo(x0 + 34, h1);
          ctx.lineTo(x0, h0);
          ctx.closePath();
          inked(ctx, k % 2 === 0 ? '#E2552C' : '#F3EAD3', 3);
        }
      },
    },
    // Crate weapons (first person, barrels up like the shotgun).
    {
      key: gunKey('voorlaaier'),
      width: 420,
      height: 520,
      originX: 210,
      originY: 520,
      draw(ctx) {
        ctx.translate(210, 520);
        ctx.beginPath();
        ctx.moveTo(-70, -500);
        ctx.lineTo(70, -500);
        ctx.lineTo(36, -230);
        ctx.lineTo(-36, -230);
        ctx.closePath();
        inked(ctx, '#B08D3A', 6);
        ctx.beginPath();
        ctx.moveTo(-50, -240);
        ctx.lineTo(50, -240);
        ctx.lineTo(110, 0);
        ctx.lineTo(-80, 0);
        ctx.closePath();
        inked(ctx, '#6B3F1F', 6);
      },
    },
    {
      key: gunKey('mielie_masjien'),
      width: 420,
      height: 520,
      originX: 210,
      originY: 520,
      draw(ctx) {
        ctx.translate(210, 520);
        for (const x of [-36, 0, 36]) {
          ctx.beginPath();
          ctx.rect(x - 14, -500, 28, 280);
          inked(ctx, '#6E777C', 5);
        }
        ellipse(ctx, 0, -220, 70, 40);
        inked(ctx, '#E9C23B', 5);
        ctx.beginPath();
        ctx.moveTo(-60, -200);
        ctx.lineTo(60, -200);
        ctx.lineTo(100, 0);
        ctx.lineTo(-80, 0);
        ctx.closePath();
        inked(ctx, '#8B5A2B', 6);
        // Crank handle.
        ctx.beginPath();
        ctx.moveTo(70, -220);
        ctx.lineTo(140, -260);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 8;
        ctx.stroke();
      },
    },
  ];
}

function crateBox(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.rect(-62, -62, 124, 124);
  inked(ctx, '#8B5A2B', 5);
  ctx.beginPath();
  ctx.moveTo(-62, -62);
  ctx.lineTo(62, 62);
  ctx.moveTo(62, -62);
  ctx.lineTo(-62, 62);
  ctx.strokeStyle = '#5E3A1A';
  ctx.lineWidth = 8;
  ctx.stroke();
  ellipse(ctx, 0, 0, 30, 30);
  inked(ctx, '#F3EAD3', 4);
  ctx.beginPath();
  ctx.rect(-6, -18, 12, 36);
  ctx.rect(-18, -6, 36, 12);
  ctx.fillStyle = '#C8302A';
  ctx.fill();
}

const PLANE_LOOK_LINE: Readonly<Record<PlaneId, number>> = { near: 6, mid: 4, far: 2 };

/** Builds the placeholder manifest for the creatures, biome and UI the hunt needs. */
const KAROO_ART: BiomeArt = { bands: BANDS, drawProp: drawKarooProp };

/**
 * Placeholder art per biome id (M8). A biome is playable only once it has an entry here. M9: the
 * home biome (Karoo) is in the initial download; the others are separate chunks loaded on first
 * use (lazy biome bundles, Tech §8 budget) — `loadBiomeArt` before `createPlaceholderManifest`.
 */
const LAZY_ART: Readonly<Record<string, () => Promise<BiomeArt>>> = {
  'bushveld-winter': () => import('./biomes/bushveld').then((m) => m.BUSHVELD_ART),
  'okavango-spring': () => import('./biomes/okavango').then((m) => m.OKAVANGO_ART),
  'kalahari-summer': () => import('./biomes/kalahari').then((m) => m.KALAHARI_ART),
  namibie: () => import('./biomes/namibie').then((m) => m.NAMIBIE_ART),
};
const loadedArt = new Map<string, BiomeArt>([['karoo-autumn', KAROO_ART]]);
const loadingArt = new Map<string, Promise<boolean>>();

/** Biome ids this build can draw (the Daily rotation, challenges and the run use only these). */
export function placeholderBiomes(): readonly string[] {
  return ['karoo-autumn', ...Object.keys(LAZY_ART)];
}

/** The biome's art is in memory (createPlaceholderManifest can run now). */
export function biomeArtReady(id: string): boolean {
  return loadedArt.has(id);
}

/**
 * Loads a biome's art chunk once (later calls share the first). False if it failed (offline
 * without the chunk cached, a CDN hiccup): the caller stays on what it has, and may retry.
 */
export function loadBiomeArt(id: string): Promise<boolean> {
  if (loadedArt.has(id)) return Promise.resolve(true);
  const load = LAZY_ART[id];
  if (load === undefined) return Promise.resolve(false);
  let p = loadingArt.get(id);
  if (p === undefined) {
    p = load().then(
      (art) => {
        loadedArt.set(id, art);
        loadingArt.delete(id);
        return true;
      },
      () => {
        loadingArt.delete(id);
        return false;
      },
    );
    loadingArt.set(id, p);
  }
  return p;
}

/**
 * A biome's textures and sounds. v1.5 (D-041): Oupa's voice lines are not here: each voice
 * language is its own lazy pack (src/game/audio/voicePack.ts), whatever the biome.
 */
export function createPlaceholderManifest(
  content: ContentBundle,
  biome: Biome,
  /** v1.1 (D-032): feel.json guns.ammo — a placeholder per ammo type (full and spent). */
  ammoTypes: Readonly<Record<string, AmmoType>> = {},
): AssetManifest {
  const m = new AssetManifest();
  const art = loadedArt.get(biome.id);
  if (art === undefined) throw new Error(`biome art ${biome.id} not loaded (loadBiomeArt first)`);
  const planes: PlaneId[] = ['near', 'mid', 'far'];
  for (const c of content.birds.creatures) {
    if (c.kind === 'helper') continue;
    // Only what this biome can show: the creature's planes, and its biome list if it has one.
    if (c.biomes !== undefined && !c.biomes.includes(biome.id)) continue;
    for (const plane of planes) {
      if (!c.planes.includes(plane) && c.id !== 'tarentaal') continue;
      const draw = birdDrawFor(c.id, plane);
      if (draw === null) continue;
      const p = content.scoring.planes[plane];
      const look: PlaneLook = {
        scale: p.scale,
        line: p.lineWeightPx > 0 ? p.lineWeightPx : PLANE_LOOK_LINE[plane],
        tint: plane === 'far' ? 0.2 : 0,
      };
      for (const frame of ['up', 'down', 'stand'] as const) {
        m.addBird(c.id, plane, frame, birdSpec(draw, look, frame));
      }
    }
  }
  biome.layers.forEach((layer, i) => {
    const band = art.bands[layer.id];
    if (band === undefined) return;
    const { art: layerArt, tiles } = layerTiles(layer.asset, band, layer.scrollFactor, 1000 + i);
    m.addLayer(layer.asset, layerArt, tiles);
  });
  for (const prop of biome.props) {
    // D-053: ParallaxView scales props by displayScale() (an HD texture keeps its own size).
    m.addTexture({ ...propSpec(prop, art), viewScaled: true });
    // D-051: the prop's HD texture (late group) has the same size and origin. Its placeholder is
    // never shown (the prop swaps over only once the HD file is there): empty, 1×1.
    const hd = hdKeyOf(prop.asset);
    if (hd !== undefined && !m.has(hd)) {
      m.addTexture({ ...propSpec(prop, art), key: hd, empty: true, viewScaled: true, draw() {} });
      for (const part of HD_PARTS[prop.asset] ?? [])
        if (part === POTJIE_LID) m.addTexture(POTJIE_LID_SPEC);
    }
  }
  // D-054: the far animals' herd sheets (drawn art only: the placeholder is empty, and FaunaView
  // shows no herd until its sheet and frame table are in).
  for (const f of sheetHerds(biome.id))
    m.addTexture({
      key: f.key,
      width: 2,
      height: 2,
      originX: 0,
      originY: 0,
      viewScaled: true,
      draw() {
        // Nothing: without delivered art there are no far animals.
      },
    });
  // v1.7c (D-047): the biome's fruit sheet (drawn art only: the placeholder is empty).
  m.addTexture({
    key: fruitSheetKey(biome.id),
    width: FRUIT_SHEET.width,
    height: FRUIT_SHEET.height,
    originX: 0,
    originY: 0,
    draw() {
      // Nothing: without delivered art the fruit stay baked out and FruitView shows none.
    },
  });
  for (const s of art.extraTextures?.() ?? []) m.addTexture(s);
  // v1.8 (D-050): the tin cans' sheet (common: the home Karoo has a fence).
  for (const s of canSpecs()) m.addTexture(s);
  // 1.9.3 (D-056): a biome with makalani palms on some day has their art (its own group).
  if (biome.layouts.some((l) => (l.palms?.length ?? 0) > 0))
    for (const s of makalaniSpecs()) m.addTexture(s);
  // v1.7 (D-044): a map with meerkat colonies plays their sounds (the desert group).
  if (hasColonies(biome)) for (const key of Object.values(MEERKAT_SOUNDS)) m.addSound(key);
  for (const s of uiSpecs()) m.addTexture(s);
  for (const s of m4Specs()) m.addTexture(s);
  for (const s of arsenalSpecs()) m.addTexture(s);
  // v1.3: rifle sight pictures (D-036).
  for (const s of sightSpecs()) m.addTexture(s);
  for (const s of ammoSpecs(ammoTypes)) m.addTexture(s);
  for (const s of omenSpecs()) m.addTexture(s);
  // v1.7d (D-059): the weavers' scolding is heard only at the desert maps' weaver nests: it loads
  // with them (the desert group), not in the first download (elsewhere its synth stands in).
  for (const id of SFX_IDS) if (id !== 'weavers' || hasColonies(biome)) m.addSound(sfxKey(id));
  // M10: music and ambience are silent placeholders until recordings are delivered.
  for (const stem of STEMS) m.addSound(musicKey(biome.id, stem));
  m.addSound(ambienceKey(biome.id));
  return m;
}
