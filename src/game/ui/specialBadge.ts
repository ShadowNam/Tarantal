// D-048: the small badge on the title's Daily button on a special day ("Spookjag tonight!"):
// a tilted pumpkin-orange tag at the button's top-right corner. Drawn in code (no art in the
// first download).
import type * as Phaser from 'phaser';
import type { Rect } from './hudLayout';
import { fitText, textStyle } from './menu';

const FILL = 0xf28c28;
const EDGE = 0x3b1d4a;
const TEXT = '#2A1033';

export function drawSpecialBadge(scene: Phaser.Scene, button: Rect, label: string): void {
  const w = Math.max(220, button.w * 0.78);
  const h = 46;
  const x = button.x + button.w - w * 0.42;
  const y = button.y - 8;
  const g = scene.add.graphics().setDepth(5);
  g.fillStyle(EDGE, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 16);
  g.fillStyle(FILL, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 13);
  g.setPosition(x, y).setAngle(-6);
  const text = scene.add
    .text(x, y, label, { ...textStyle(26, TEXT), stroke: '#FFD9A0', strokeThickness: 2 })
    .setOrigin(0.5)
    .setAngle(-6)
    .setDepth(6);
  fitText(text, w - 20);
}
