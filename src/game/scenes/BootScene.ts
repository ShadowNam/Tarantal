// M0 boot scene: proves Phaser 4 boots at design height 1080 with flexible width and
// safe-area-aware layout. Replaced by the real Boot → Preload → Title flow in M2/M5.
import * as Phaser from 'phaser';
import { t } from '../../i18n/i18n';
import type { Insets } from '../layout';

/** Palette from docs/03-ART-AUDIO-BIBLE.md (Karoo sky, veld, ink, enamel cream). */
const COLOURS = {
  skyTop: 0x8db8d8,
  skyBottom: 0xf2d8a7,
  veld: 0xe3a23b,
  ink: 0x1b1410,
  cream: '#f3ead3',
  inkCss: '#1b1410',
} as const;

export interface BootSceneHost {
  /** Current safe-area insets in design px. */
  safeArea(): Insets;
  /** Show the frame and size readout (?debug=1). */
  readonly debug: boolean;
  /** Called once the scene has drawn its first layout. */
  onReady(): void;
}

export class BootScene extends Phaser.Scene {
  private host: BootSceneHost;
  private background: Phaser.GameObjects.Graphics | undefined;
  private title: Phaser.GameObjects.Text | undefined;
  private subtitle: Phaser.GameObjects.Text | undefined;
  private debugText: Phaser.GameObjects.Text | undefined;

  constructor(host: BootSceneHost) {
    super({ key: 'Boot' });
    this.host = host;
  }

  create(): void {
    this.background = this.add.graphics();
    this.title = this.add
      .text(0, 0, t('app.title'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '128px',
        fontStyle: 'bold',
        color: COLOURS.cream,
        stroke: COLOURS.inkCss,
        strokeThickness: 14,
      })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(0, 0, t('app.milestone'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '56px',
        color: COLOURS.inkCss,
      })
      .setOrigin(0.5);
    if (this.host.debug) {
      this.debugText = this.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: COLOURS.inkCss,
      });
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
    });
    this.layout();
    this.host.onReady();
  }

  /** Lays everything out from the current design width and the safe area. */
  layout(): void {
    const { width, height } = this.scale.gameSize;
    const safe = this.host.safeArea();
    this.cameras.main.setSize(width, height);

    const bg = this.background;
    if (bg) {
      bg.clear();
      bg.fillGradientStyle(COLOURS.skyTop, COLOURS.skyTop, COLOURS.skyBottom, COLOURS.skyBottom, 1);
      bg.fillRect(0, 0, width, height * 0.72);
      bg.fillStyle(COLOURS.veld, 1);
      bg.fillRect(0, height * 0.72, width, height * 0.28);
      if (this.host.debug) {
        // Safe-area frame: HUD must stay inside it.
        bg.lineStyle(4, COLOURS.ink, 0.6);
        bg.strokeRect(
          safe.left + 2,
          safe.top + 2,
          width - safe.left - safe.right - 4,
          height - safe.top - safe.bottom - 4,
        );
      }
    }
    this.title?.setPosition(width / 2, height * 0.42);
    this.subtitle?.setPosition(width / 2, height * 0.58);
    this.debugText
      ?.setPosition(safe.left + 24, safe.top + 20)
      .setText(
        `design ${width}×${height}  safe T${safe.top.toFixed(0)} R${safe.right.toFixed(0)} B${safe.bottom.toFixed(0)} L${safe.left.toFixed(0)}`,
      );
  }
}
