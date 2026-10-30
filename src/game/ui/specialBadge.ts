// D-048: the badge on the title's Daily on a special day ("Spookjag tonight!"): a pumpkin-
// orange pill behind the Daily's status line. Drawn in code (no art in the first download). The tally's special frame (drawSlateFrame) uses the special's own sheet.
import * as Phaser from 'phaser';
import { HALLOWEEN_SHEET, SHEET_MASTER } from '../feesdae/feesdaeAssets';
import { CHRISTMAS_SHEET, OUPA_DRAWN, XMAS_MASTER } from '../feesdae/christmasKeys';
import type { Rect } from './hudLayout';

const FILL = 0xf28c28;
const EDGE = 0x3b1d4a;
const TEXT = '#2A1033';
/** D-064: Christmas's badge — a Christmas-red pill with a green edge and cream text. */
const XMAS = { fill: 0xc8202a, edge: 0x1e5e36, text: '#FFF8E8', stroke: '#5A0A10' } as const;

/**
 * The badge is a pumpkin-orange pill behind the Daily's status line on a special day
 * ("Spookjag tonight! · New hunt today"): it takes the status line's own reserved row above the
 * button, so it can't cover the button, the hint line under the buttons or the lines above.
 * Returns the pill's rect (design px). The caller draws the status text over it (depth 6).
 */
export function drawSpecialBadge(
  scene: Phaser.Scene,
  text: { x: number; y: number; width: number; height: number },
  special = 'halloween',
): Rect {
  const xmas = special === 'christmas';
  const padX = 14;
  const padY = 3;
  const w = text.width + padX * 2;
  const h = text.height + padY * 2;
  const x = text.x - padX;
  const y = text.y - padY;
  const g = scene.add.graphics().setDepth(5);
  g.fillStyle(xmas ? XMAS.edge : EDGE, 1).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 12);
  g.fillStyle(xmas ? XMAS.fill : FILL, 1).fillRoundedRect(x, y, w, h, 10);
  return { x: x - 3, y: y - 3, w: w + 6, h: h + 6 };
}

/** The status line's style on a special day: dark text on the orange badge (D-064: cream text
 *  on Christmas's red one). */
export const SPECIAL_STATUS_STYLE = { color: TEXT, stroke: '#FFD9A0', strokeThickness: 2 } as const;

export function specialStatusStyle(special: string): {
  color: string;
  stroke: string;
  strokeThickness: number;
} {
  return special === 'christmas'
    ? { color: XMAS.text, stroke: XMAS.stroke, strokeThickness: 3 }
    : { ...SPECIAL_STATUS_STYLE };
}

/** D-064: the Christmas sheet's key: delivered, else the hunt's stand-in (KersfeesView). */
function xmasKey(scene: Phaser.Scene): string | null {
  if (scene.textures.exists(CHRISTMAS_SHEET)) return CHRISTMAS_SHEET;
  const standin = `${CHRISTMAS_SHEET}#standin`;
  return scene.textures.exists(standin) ? standin : null;
}

/** D-064: Oupa in his Santa hat and shorts, waving beside the title's badge (feet on the badge's
 *  baseline, left of it). Null until Christmas's sheet is in. */
export function drawBadgeOupa(scene: Phaser.Scene, badge: Rect): Rect | null {
  const key = xmasKey(scene);
  if (key === null) return null;
  const s = 0.36 / OUPA_DRAWN;
  const img = scene.add
    .image(badge.x - 8, badge.y + badge.h, key, 'oupa')
    .setOrigin(55 / 120, 206 / 210)
    .setScale(s / XMAS_MASTER)
    .setDepth(6);
  const b = img.getBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/** The Halloween sheet's key: delivered, else the hunt's stand-in (both from FeesdagView). */
function sheetKey(scene: Phaser.Scene): string | null {
  if (scene.textures.exists(HALLOWEEN_SHEET)) return HALLOWEEN_SHEET;
  const standin = `${HALLOWEEN_SHEET}#standin`;
  return scene.textures.exists(standin) ? standin : null;
}

/**
 * D-048: a special day's frame round the tally slate (Halloween: a purple edge, the moon, bats
 * and a pumpkin lantern). Drawn from the special's sheet, which its hunt has just loaded.
 */
export function drawSlateFrame(scene: Phaser.Scene, frame: string, slate: Rect): Rect | null {
  if (frame === 'christmas') return drawXmasFrame(scene, slate);
  if (frame !== 'halloween') return null;
  const g = scene.add.graphics();
  g.lineStyle(6, 0x6a3d8f, 1).strokeRoundedRect(
    slate.x - 4,
    slate.y - 4,
    slate.w + 8,
    slate.h + 8,
    20,
  );
  const key = sheetKey(scene);
  if (key === null) return null;
  const m = SHEET_MASTER;
  // The moon and bats sit on and above the slate's top edge, clear of the tag (top left), the
  // title and [Share] (top right).
  const moon = scene.add.image(slate.x - 36, slate.y - 40, key, 'moon').setScale(0.46 / m);
  const bats: [number, number, number, string][] = [
    [slate.x + 96, slate.y - 34, 0.36, 'bat_0'],
    [slate.x + 150, slate.y - 62, 0.28, 'bat_2'],
    [slate.x + slate.w - 330, slate.y - 36, 0.32, 'bat_1'],
  ];
  for (const [x, y, s, f] of bats) scene.add.image(x, y, key, f).setScale(s / m);
  scene.add
    .image(slate.x + slate.w - 26, slate.y + slate.h - 60, key, 'glow')
    .setScale(0.8 / m)
    .setAlpha(0.45)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.add
    .image(slate.x + slate.w - 26, slate.y + slate.h - 52, key, 'lantern_rock_lit')
    .setScale(0.7 / m);
  // The moon's disc (its frame has a soft halo round it).
  const r = 118 * moon.scaleY;
  return { x: moon.x - r, y: moon.y - r, w: r * 2, h: r * 2 };
}

/**
 * D-064: Christmas's frame round the tally slate: a red and green edge, tinsel along the top,
 * Oupa's head in his Santa hat on the top-left corner (where Halloween's moon sits), and a
 * present at the bottom right. Returns Oupa's rect (the tally hook keeps it as its corner piece).
 */
function drawXmasFrame(scene: Phaser.Scene, slate: Rect): Rect | null {
  const g = scene.add.graphics();
  g.lineStyle(8, XMAS.edge, 1).strokeRoundedRect(
    slate.x - 5,
    slate.y - 5,
    slate.w + 10,
    slate.h + 10,
    20,
  );
  g.lineStyle(3, XMAS.fill, 1).strokeRoundedRect(
    slate.x - 1,
    slate.y - 1,
    slate.w + 2,
    slate.h + 2,
    18,
  );
  const key = xmasKey(scene);
  if (key === null) return null;
  const m = XMAS_MASTER;
  // Tinsel along the top edge, clear of the tag (top left) and [Share] (top right).
  const garlands: [number, number, string][] = [
    [slate.x + 150, slate.y - 4, 'garland_silver'],
    [slate.x + slate.w - 470, slate.y - 4, 'garland_red'],
  ];
  for (const [x, y, f] of garlands)
    scene.add
      .image(x, y, key, f)
      .setOrigin(160 / 320, 14 / 90)
      .setScale(0.7 / m);
  scene.add
    .image(slate.x + slate.w - 40, slate.y + slate.h - 18, key, 'present_a_shut')
    .setOrigin(70 / 140, 180 / 182)
    .setScale(0.55 / m);
  const head = scene.add
    .image(slate.x - 30, slate.y - 26, key, 'oupa_head')
    .setOrigin(31 / 66, 68 / 100)
    .setScale(0.62 / OUPA_DRAWN / m);
  const b = head.getBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
