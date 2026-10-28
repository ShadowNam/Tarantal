// 1.9.4 (D-057, art bible §4.2c) The baobab residents' sheet (src/game/view/tree/residentSheet.ts):
// a lesser bushbaby peeking from its hole, a tree squirrel, a barn owl in its cavity and in
// flight, a yellow-billed hornbill (flying, clinging, feeding) and the female's beak tip in the
// sealed slit, a red-billed buffalo weaver and a bee. Each frame is drawn round its origin, in
// prop px; light from the upper left. Frames at a hole are cut off at the hole's lower rim (the
// rest of the animal is inside the tree), so the view needs no mask.
import { HOLLOWS, type Hollow } from '../../src/game/view/tree/baobabShape';
import {
  RESIDENT_SHEET_H,
  RESIDENT_SHEET_W,
  residentFrames,
  type ResidentFrame,
} from '../../src/game/view/tree/residentSheet';
import type { Rgba } from '../assets/image';
import { renderSvg } from './raster';
import { mix, nextId, shade } from './scenery';
import { el, ellipseD, g, r2, svgDoc } from './svg';

const INK = '#2A1E18';

const fill = (d: string, f: string, extra: Record<string, string | number> = {}): string =>
  el('path', { d, fill: f, ...extra });
const inked = (d: string, f: string, w = 0.8): string =>
  el('path', { d, fill: f, stroke: INK, 'stroke-width': w, 'stroke-linejoin': 'round' });
const stroke = (
  d: string,
  c: string,
  w: number,
  extra: Record<string, string | number> = {},
): string =>
  el('path', {
    d,
    fill: 'none',
    stroke: c,
    'stroke-width': w,
    'stroke-linecap': 'round',
    ...extra,
  });

/** Shows only what is out of the hole: inside its opening, or above its centre line. */
function outOfHole(h: Hollow, w: number, body: string): string {
  const id = nextId();
  return g(
    {},
    el(
      'clipPath',
      { id },
      el('path', { d: ellipseD(0, 0, h.rx - 0.4, h.ry - 0.4) }),
      el('rect', { x: -w, y: -w * 2, width: w * 2, height: w * 2 }),
    ),
    g({ 'clip-path': `url(#${id})` }, body),
  );
}

// --- the lesser bushbaby (Galago moholi) -----------------------------------------------------

function galagoHead(cy: number, turn: number, paws: boolean): string {
  const fur = '#A49282';
  const furDark = '#7A6A5C';
  const cx = turn * 1.5;
  const ear = (sx: number): string =>
    g(
      {},
      inked(ellipseD(cx + sx * 5.2, cy - 6.2, 3.3, 4.6), mix(fur, '#C9A49A', 0.3), 0.6),
      fill(ellipseD(cx + sx * 5.2, cy - 5.8, 2, 3.2), '#D9AFA4'),
    );
  const eye = (sx: number): string =>
    g(
      {},
      fill(ellipseD(cx + sx * 2.6 + turn, cy + 0.2, 2.6, 2.7), '#1A120E'),
      fill(ellipseD(cx + sx * 2.6 + turn, cy + 0.2, 1.7, 1.8), '#5A3418'),
      fill(ellipseD(cx + sx * 2.6 + turn, cy + 0.2, 1, 1.1), '#0A0605'),
      fill(ellipseD(cx + sx * 2.6 + turn - 0.7, cy - 0.6, 0.6, 0.6), '#FFFFFF'),
    );
  return g(
    {},
    paws
      ? g(
          {},
          inked(ellipseD(-4.6, 1.4, 2.2, 1.6), '#C8B8A6', 0.5),
          inked(ellipseD(4.6, 1.4, 2.2, 1.6), '#C8B8A6', 0.5),
        )
      : '',
    ear(-1),
    ear(1),
    inked(ellipseD(cx, cy, 6.2, 5.8), fur, 0.7),
    fill(ellipseD(cx - 2, cy - 2.2, 3.6, 2.6), shade(fur, 0.18), { opacity: 0.8 }),
    fill(ellipseD(cx + 2.6, cy + 2.4, 3.4, 2.6), furDark, { opacity: 0.5 }),
    // The pale stripe down the nose, the dark eye rings, the eyes.
    fill(ellipseD(cx + turn * 1.2, cy + 0.6, 0.9, 3.6), '#E2D6C8'),
    eye(-1),
    eye(1),
    fill(ellipseD(cx + turn * 2.2, cy + 3.7, 1, 0.7), '#3A2A24'),
  );
}

function galago(frame: ResidentFrame): string {
  // Review R1: 1.6× bigger (the eyes read as eyes), and masked by its hole: only what is inside
  // the opening shows, plus the ears above its upper rim; the lower rim hides the chin and body.
  const h = HOLLOWS.galago;
  const k = 1.6;
  const cy = frame === 'galago_ears' ? 13 : frame === 'galago_eyes' ? 8 : 4;
  const turn = frame === 'galago_look' ? 1 : 0;
  const paws = frame === 'galago_out' || frame === 'galago_look';
  const id = nextId();
  return g(
    {},
    el(
      'clipPath',
      { id },
      el('path', { d: ellipseD(0, 0, h.rx - 0.6, h.ry - 0.6) }),
      el('rect', {
        x: -h.rx * 1.6,
        y: -h.ry * 2.4,
        width: h.rx * 3.2,
        height: h.ry * 2.4 - h.ry * 0.45,
      }),
    ),
    g(
      { 'clip-path': `url(#${id})` },
      g({ transform: `translate(0 ${cy}) scale(${k})` }, galagoHead(0, turn, false)),
    ),
    // Little hands on the lower rim.
    paws
      ? g(
          {},
          inked(ellipseD(-6.5, h.ry * 0.78, 2.8, 2), '#C8B8A6', 0.6),
          inked(ellipseD(6.5, h.ry * 0.78, 2.8, 2), '#C8B8A6', 0.6),
        )
      : '',
  );
}

// --- the tree squirrel (Paraxerus cepapi) ----------------------------------------------------

const SQ_FUR = '#9A8064';
const SQ_DARK = '#6C5640';
const SQ_PALE = '#D8C8A8';

function squirrelHead(x: number, y: number, s = 1): string {
  return g(
    {},
    inked(ellipseD(x - 1.6 * s, y - 4 * s, 1.5 * s, 2 * s), SQ_FUR, 0.5),
    inked(
      `M${r2(x - 4 * s)} ${r2(y - 1 * s)}Q${r2(x - 3 * s)} ${r2(y - 4.5 * s)} ${r2(x + 1 * s)} ${r2(y - 3.5 * s)}Q${r2(x + 5.5 * s)} ${r2(y - 1.5 * s)} ${r2(x + 5 * s)} ${r2(y + 0.5 * s)}Q${r2(x + 2 * s)} ${r2(y + 2.6 * s)} ${r2(x - 3 * s)} ${r2(y + 2 * s)}Z`,
      SQ_FUR,
      0.6,
    ),
    fill(ellipseD(x + 1 * s, y - 0.8 * s, 1.5 * s, 1.3 * s), SQ_PALE),
    fill(ellipseD(x + 1.2 * s, y - 0.8 * s, 0.85 * s, 0.85 * s), '#140C08'),
    fill(ellipseD(x + 0.9 * s, y - 1.1 * s, 0.3 * s, 0.3 * s), '#FFFFFF'),
    fill(ellipseD(x + 4.9 * s, y + 0.1 * s, 0.6 * s, 0.5 * s), '#2A1C14'),
  );
}

function squirrelTail(d: string): string {
  return g(
    {},
    stroke(d, INK, 7.4),
    stroke(d, SQ_DARK, 6.2),
    stroke(d, SQ_FUR, 3.6, { opacity: 0.9 }),
    stroke(d, SQ_PALE, 1, { opacity: 0.6, 'stroke-dasharray': '1.2 1.6' }),
  );
}

function squirrel(frame: ResidentFrame): string {
  if (frame === 'squirrel_peek') return outOfHole(HOLLOWS.squirrel, 16, squirrelHead(-1, 0, 1.5));
  // Review R2: 1.5× (a solid grey-brown squirrel, not a faint outline), feet at the origin.
  if (frame === 'squirrel_sit')
    return g(
      { transform: 'scale(1.5)' },
      squirrelTail('M-6 -2Q-14 -10 -10 -20Q-6 -27 -1 -24'),
      inked('M-5 0Q-7 -9 -1 -13Q5 -14 6 -7Q7 -1 4 0Z', SQ_FUR, 0.7),
      fill('M1 -11Q5 -10 5 -5Q4 -1 2 -1Z', SQ_PALE),
      inked(ellipseD(3, -9, 1.6, 1.2), SQ_PALE, 0.4),
      squirrelHead(3.5, -15, 0.95),
    );
  // Running: body stretched (a) or gathered (b), the tail streaming behind.
  const a = frame === 'squirrel_run_a';
  return g(
    { transform: 'scale(1.5)' },
    squirrelTail(
      a ? 'M-8 -6Q-16 -6 -19 -11Q-21 -16 -17 -18' : 'M-6 -7Q-14 -10 -17 -15Q-18 -19 -14 -20',
    ),
    inked(
      a
        ? 'M-9 -5Q-8 -11 0 -11Q8 -11 11 -6Q8 -2 -1 -2Q-7 -2 -9 -5Z'
        : 'M-7 -5Q-7 -13 0 -13Q6 -12 9 -7Q6 -2 -1 -2Q-6 -2 -7 -5Z',
      SQ_FUR,
      0.7,
    ),
    fill(a ? ellipseD(0, -9.2, 5, 1.3) : ellipseD(0, -11, 4, 1.3), shade(SQ_FUR, 0.2), {
      opacity: 0.8,
    }),
    // The pale side stripe of a tree squirrel.
    stroke(a ? 'M-6 -6Q0 -8 7 -6' : 'M-5 -7Q0 -9 6 -7', SQ_PALE, 0.8, { opacity: 0.8 }),
    // Legs.
    stroke(a ? 'M-7 -3L-11 0M7 -4L11 0' : 'M-4 -3L-1 0M5 -4L2 0', INK, 1.8),
    stroke(a ? 'M-7 -3L-11 0M7 -4L11 0' : 'M-4 -3L-1 0M5 -4L2 0', SQ_DARK, 1),
    squirrelHead(a ? 13 : 11, a ? -8 : -10),
  );
}

// --- the barn owl (Tyto alba) ----------------------------------------------------------------

const OWL_BUFF = '#C89A5A';
const OWL_GREY = '#9C9488';

function owlFace(dx: number, narrow: number, blink: boolean): string {
  const disc = `M${r2(dx)} ${r2(-12)}C${r2(dx - 4 * narrow)} ${r2(-16)} ${r2(dx - 12 * narrow)} ${r2(-13)} ${r2(dx - 11 * narrow)} ${r2(-4)}C${r2(dx - 10 * narrow)} ${r2(4)} ${r2(dx - 3)} ${r2(8)} ${r2(dx)} ${r2(9)}C${r2(dx + 3)} ${r2(8)} ${r2(dx + 10 * narrow)} ${r2(4)} ${r2(dx + 11 * narrow)} ${r2(-4)}C${r2(dx + 12 * narrow)} ${r2(-13)} ${r2(dx + 4 * narrow)} ${r2(-16)} ${r2(dx)} ${r2(-12)}Z`;
  const eye = (sx: number): string =>
    blink
      ? stroke(`M${r2(dx + sx * 4.6 * narrow - 2)} ${r2(-3)}q2 1.4 4 0`, '#3A2A20', 1.1)
      : g(
          {},
          fill(ellipseD(dx + sx * 4.6 * narrow, -3, 2.2, 2.4), '#120A08'),
          fill(ellipseD(dx + sx * 4.6 * narrow - 0.7, -3.8, 0.6, 0.6), '#FFFFFF'),
        );
  return g(
    {},
    // The buff rim of the disc and the white face.
    inked(disc, '#F2E8DA', 0.9),
    stroke(disc, OWL_BUFF, 1.4, { opacity: 0.85 }),
    fill(
      `M${r2(dx)} ${r2(-10)}C${r2(dx - 1.6)} ${r2(-4)} ${r2(dx - 1.4)} ${r2(1)} ${r2(dx)} ${r2(3)}C${r2(dx + 1.4)} ${r2(1)} ${r2(dx + 1.6)} ${r2(-4)} ${r2(dx)} ${r2(-10)}Z`,
      '#E2D2BE',
    ),
    eye(-1),
    eye(1),
    fill(`M${r2(dx - 1)} ${r2(1)}L${r2(dx + 1)} ${r2(1)}L${r2(dx)} ${r2(4.4)}Z`, '#D8B898'),
  );
}

function owlInCavity(frame: ResidentFrame): string {
  const h = HOLLOWS.owl;
  const id = nextId();
  const turn = frame === 'owl_left' ? -1 : 0;
  return g(
    {},
    el('clipPath', { id }, el('path', { d: ellipseD(0, 0, h.rx - 0.6, h.ry - 0.6) })),
    g(
      { 'clip-path': `url(#${id})` },
      // Shoulders and back: golden buff with grey vermiculation, a pale breast.
      inked('M-17 26Q-17 4 -10 -2L10 -2Q17 4 17 26Z', OWL_BUFF, 0.8),
      fill('M-10 26Q-9 10 0 6Q9 10 10 26Z', '#F4ECE0'),
      fill(ellipseD(-11, 10, 3, 6), OWL_GREY, { opacity: 0.6 }),
      fill(ellipseD(11, 10, 3, 6), OWL_GREY, { opacity: 0.6 }),
      // Head (golden crown) behind the face.
      inked(ellipseD(turn * 2.5, -4, 12.5, 13), OWL_BUFF, 0.8),
      fill(ellipseD(turn * 2.5 - 4, -12, 4, 2.4), shade(OWL_BUFF, 0.25), { opacity: 0.7 }),
      owlFace(turn * 6, turn === 0 ? 1 : 0.68, frame === 'owl_blink'),
      // The cavity's own shadow over its upper part.
      fill(ellipseD(0, -h.ry * 0.8, h.rx * 1.1, h.ry * 0.42), '#000000', { opacity: 0.3 }),
    ),
  );
}

function owlFlying(up: boolean): string {
  const wing = up
    ? 'M-4 -2Q-14 -18 -34 -16Q-24 -8 -20 0Q-12 2 -4 2Z'
    : 'M-4 -1Q-16 6 -34 12Q-22 14 -12 8Q-6 5 -2 2Z';
  const wingR = up
    ? 'M4 -2Q14 -18 34 -16Q24 -8 20 0Q12 2 4 2Z'
    : 'M4 -1Q16 6 34 12Q22 14 12 8Q6 5 2 2Z';
  return g(
    {},
    inked(wing, '#F2EAE0', 0.8),
    inked(wingR, '#F2EAE0', 0.8),
    fill(up ? 'M-6 -3Q-14 -14 -28 -14Q-18 -9 -10 -2Z' : 'M-6 0Q-14 4 -26 9Q-16 8 -8 3Z', OWL_BUFF, {
      opacity: 0.7,
    }),
    fill(up ? 'M6 -3Q14 -14 28 -14Q18 -9 10 -2Z' : 'M6 0Q14 4 26 9Q16 8 8 3Z', OWL_BUFF, {
      opacity: 0.7,
    }),
    inked(ellipseD(0, 2, 5.5, 8), '#F4ECE0', 0.8),
    inked(ellipseD(9, -2, 5, 5), OWL_BUFF, 0.7),
    fill(ellipseD(10, -1.6, 3.6, 3.8), '#F2E8DA'),
    fill(ellipseD(11.2, -2.4, 0.9, 0.9), '#120A08'),
  );
}

// --- the yellow-billed hornbill (Tockus leucomelas) -------------------------------------------

const HB_BILL = '#E8B82E';
const HB_BLACK = '#2E2824';

function hornbillBill(x: number, y: number, ang: number, len: number): string {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (u: number, v: number): string => `${r2(x + c * u - s * v)} ${r2(y + s * u + c * v)}`;
  return g(
    {},
    inked(
      `M${P(0, -2.6)}Q${P(len * 0.6, -3.2)} ${P(len, 1.4)}Q${P(len * 0.55, 1.6)} ${P(0, 2.6)}Z`,
      HB_BILL,
      0.7,
    ),
    stroke(
      `M${P(len * 0.15, 0.3)}Q${P(len * 0.55, 0.4)} ${P(len * 0.95, 1.2)}`,
      shade(HB_BILL, -0.35),
      0.5,
    ),
  );
}

function hornbillHead(x: number, y: number, ang: number, bill: number): string {
  return g(
    {},
    inked(ellipseD(x, y, 4.6, 4.2), '#F0ECE4', 0.7),
    fill(ellipseD(x - 1, y - 2.4, 3.6, 1.6), '#B8B2A8'),
    fill(ellipseD(x + 1.6, y - 0.6, 1.6, 1.5), '#E09A84'),
    fill(ellipseD(x + 1.6, y - 0.6, 0.8, 0.8), '#1A1210'),
    hornbillBill(x + 3.2, y + 0.4, ang, bill),
  );
}

function spots(d: string): string {
  return el('path', {
    d,
    fill: 'none',
    stroke: '#F4F0EA',
    'stroke-width': 1.1,
    'stroke-dasharray': '0.4 2.2',
    'stroke-linecap': 'round',
  });
}

function hornbillFlying(up: boolean): string {
  const wing = up ? 'M-4 -2Q-6 -14 4 -16Q10 -10 8 -2Z' : 'M-4 0Q-4 10 6 14Q10 8 8 0Z';
  return g(
    {},
    // Long tail behind.
    inked('M-10 -1L-28 -3L-29 3L-10 3Z', HB_BLACK, 0.7),
    stroke('M-26 -2L-26 2', '#F4F0EA', 1),
    inked(ellipseD(-2, 1, 10, 5), '#F0ECE4', 0.8),
    inked(wing, HB_BLACK, 0.7),
    spots(up ? 'M-2 -6Q2 -10 6 -10' : 'M-2 4Q2 8 6 10'),
    hornbillHead(10, -1, 0.35, 15),
  );
}

function hornbillClinging(feed: boolean): string {
  // Upright on the bark, feet at (0, 0), facing right (the view mirrors it toward the slit).
  return g(
    {},
    inked('M-3 2L-6 12L-2 12L1 2Z', HB_BLACK, 0.7),
    stroke('M-5 10L-2 10', '#F4F0EA', 1),
    inked(ellipseD(-1, -13, 6.5, 12), '#F0ECE4', 0.8),
    inked('M-7 -22Q-10 -10 -6 2Q-2 -2 -1 -12Q-2 -20 -7 -22Z', HB_BLACK, 0.7),
    spots('M-6 -16Q-7 -8 -5 -2'),
    stroke('M-1 -1L2 1M1 -1L4 0', '#6A5A48', 1.1),
    // Feeding, the bill reaches the slit at (14, −22) from the feet (HORNBILL_CLING).
    feed ? hornbillHead(-2, -27, 0.45, 14) : hornbillHead(1, -32, -0.2, 14),
  );
}

// --- the red-billed buffalo weaver (Bubalornis niger) -----------------------------------------

function buffaloWeaver(frame: ResidentFrame): string {
  const black = '#1E1A18';
  if (frame === 'buffalo_perch')
    return g(
      {},
      inked('M-6 -6L-9 1L-6 1L-3 -4Z', black, 0.5),
      inked(ellipseD(0, -7, 5.2, 4.6), black, 0.6),
      fill(ellipseD(-1.4, -6.4, 2.2, 1.2), '#E8E4DC', { opacity: 0.85 }),
      inked(ellipseD(3.8, -11, 3, 2.8), black, 0.5),
      inked('M6 -11.8L9.4 -10.6L6 -9.6Z', '#D8402E', 0.4),
      fill(ellipseD(4.6, -11.6, 0.6, 0.6), '#F0E8D8'),
      stroke('M-1 -2.6L-1 0M1 -2.6L1.6 0', '#6A5040', 0.8),
    );
  const up = frame === 'buffalo_fly_a';
  return g(
    {},
    inked('M-6 -1L-11 -2L-11 2L-6 1Z', black, 0.5),
    inked(ellipseD(0, 0, 6, 3.2), black, 0.6),
    inked(up ? 'M-2 -1Q-1 -8 4 -8Q4 -4 2 -1Z' : 'M-2 1Q-1 7 4 7Q4 4 2 1Z', black, 0.5),
    fill(up ? ellipseD(1, -4, 1.6, 0.9) : ellipseD(1, 4, 1.6, 0.9), '#E8E4DC'),
    inked(ellipseD(6, -1, 2.6, 2.4), black, 0.5),
    inked('M8 -1.8L11 -0.8L8 0.2Z', '#D8402E', 0.4),
  );
}

function bee(): string {
  // Review R3: amber, so a dozen of them read as a little cloud at the crack.
  return g(
    {},
    fill(ellipseD(0, 0.3, 1.6, 1.15), '#D89A2A'),
    fill(ellipseD(0.2, 0.4, 0.45, 1.1), '#3A2610'),
    fill(ellipseD(-0.2, -0.9, 1.1, 0.7), '#F4F0E4', { opacity: 0.85 }),
  );
}

function drawFrame(name: ResidentFrame): string {
  if (name.startsWith('galago_')) return galago(name);
  if (name.startsWith('squirrel_')) return squirrel(name);
  if (name === 'owl_fly_a' || name === 'owl_fly_b') return owlFlying(name === 'owl_fly_a');
  if (name.startsWith('owl_')) return owlInCavity(name);
  if (name === 'hornbill_fly_a' || name === 'hornbill_fly_b')
    return hornbillFlying(name === 'hornbill_fly_a');
  if (name === 'hornbill_cling' || name === 'hornbill_feed')
    return hornbillClinging(name === 'hornbill_feed');
  if (name === 'beak_tip')
    return g({}, fill(ellipseD(0, 0, 2.6, 6.4), '#120B08'), hornbillBill(-0.6, -1.5, 1.25, 6.2));
  if (name.startsWith('buffalo_')) return buffaloWeaver(name);
  return bee();
}

/** The sheet at `k` texture px per prop px (1 Standard, 2 HD). */
export function renderResidentSheet(k: number): Rgba {
  const cells = residentFrames().map((f) => {
    const id = nextId();
    return g(
      {},
      el('clipPath', { id }, el('rect', { x: f.x, y: f.y, width: f.w, height: f.h })),
      g(
        { 'clip-path': `url(#${id})` },
        g({ transform: `translate(${r2(f.x + f.ox)} ${r2(f.y + f.oy)})` }, drawFrame(f.name)),
      ),
    );
  });
  return renderSvg(
    svgDoc(
      RESIDENT_SHEET_W * k,
      RESIDENT_SHEET_H * k,
      [0, 0, RESIDENT_SHEET_W, RESIDENT_SHEET_H],
      '',
      g({}, ...cells),
    ),
  );
}
