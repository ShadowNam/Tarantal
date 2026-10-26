// D-048: the small badge on the title's Daily button on a special day ("Spookjag tonight!"):
// a tilted pumpkin-orange tag at the button's top-right corner. Drawn in code (no art in the
// first download). The tally's special frame (drawSlateFrame) uses the special's own sheet.
import * as Phaser from 'phaser';
import { HALLOWEEN_SHEET, SHEET_MASTER } from '../feesdae/feesdaeAssets';
import type { Rect } from './hudLayout';
import { fitText, textStyle } from './menu';

const FILL = 0xf28c28;
const EDGE = 0x3b1d4a;
const TEXT = '#2A1033';

/**
 * The badge hangs from the button's lower edge, under its label and clear of the status line
 * above the button; returns its rect (design px, before the small tilt).
 */
export function drawSpecialBadge(scene: Phaser.Scene, button: Rect, label: string): Rect {
  const w = Math.max(200, button.w * 0.74);
  const h = 40;
  const x = button.x + button.w / 2;
  const y = button.y + button.h + h / 2 - 6;
  const g = scene.add.graphics().setDepth(5);
  g.fillStyle(EDGE, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 14);
  g.fillStyle(FILL, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 11);
  g.setPosition(x, y).setAngle(-3);
  const text = scene.add
    .text(x, y, label, { ...textStyle(24, TEXT), stroke: '#FFD9A0', strokeThickness: 2 })
    .setOrigin(0.5)
    .setAngle(-3)
    .setDepth(6);
  fitText(text, w - 20);
  return { x: x - w / 2 - 4, y: y - h / 2 - 4, w: w + 8, h: h + 8 };
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
