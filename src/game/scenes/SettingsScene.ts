// Settings (GDD §18.3, M5): audio sliders, screen shake, reduce flashes, aim assist, left-handed,
// language and quality tier. Opened from the title, the Skiet-Skuur and the pause menu. Every
// change is written to the save at once (SaveStore → storage.ts) and reaches the game through
// ctx.prefs / the AudioDirector (main.ts listens to the save); aim assist goes into the next
// hunt's SimConfig (recorded in its replay). A language change rebuilds this screen.
import * as Phaser from 'phaser';
import { t, type I18nKey } from '../../i18n/i18n';
import type { Settings } from '../../meta/saveSchema';
import type { GameContext } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import {
  drawButton,
  drawSlider,
  fitText,
  Menu,
  sliderValueAt,
  textStyle,
  UI,
  type MenuItem,
} from '../ui/menu';

export interface OverlayData {
  readonly close: () => void;
  /** Item to focus when the screen opens (kept across a language rebuild). */
  readonly focus?: string;
}

type Choice<K extends keyof Settings> = {
  key: K;
  values: readonly Settings[K][];
  label: (v: Settings[K]) => I18nKey;
};

const AIM: Choice<'aimAssist'> = {
  key: 'aimAssist',
  values: ['off', 'low', 'standard'],
  label: (v) => `settings.aim.${v}`,
};
const LANG: Choice<'language'> = {
  key: 'language',
  values: ['auto', 'en', 'af'],
  label: (v) => `settings.lang.${v}`,
};
const QUALITY: Choice<'quality'> = {
  key: 'quality',
  values: ['auto', 'low', 'medium', 'high'],
  label: (v) => `settings.quality.${v}`,
};

const ROW_H = 96;
const ROW_GAP = 18;

export class SettingsScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Settings' });
    this.ctx = ctx;
  }

  create(data: OverlayData): void {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
    const safe = this.ctx.safeArea();
    const panelW = Math.min(1700, width - safe.left - safe.right - 60);
    const panelH = Math.min(940, height - safe.top - safe.bottom - 40);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    this.add.rectangle(0, 0, width, height, UI.ink, 0.6).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(UI.wood, 1).fillRoundedRect(px - 12, py - 12, panelW + 24, panelH + 24, 26);
    g.fillStyle(UI.slate, 1).fillRoundedRect(px, py, panelW, panelH, 18);
    this.add
      .text(px + panelW / 2, py + 60, t('settings.title'), textStyle(60, '#FFD25A'))
      .setOrigin(0.5);

    const s = (): Settings => this.ctx.save.data.settings;
    const set = (patch: Partial<Settings>): void => {
      this.ctx.save.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
    };
    const colW = (panelW - 120) / 2;
    const ctrlW = Math.min(360, colW * 0.5);
    const items: MenuItem[] = [];
    const row = (col: 0 | 1, i: number, labelKey: I18nKey): Rect => {
      const x = px + 40 + col * (colW + 40);
      const y = py + 130 + i * (ROW_H + ROW_GAP);
      const label = this.add.text(x, y + ROW_H / 2, t(labelKey), textStyle(36)).setOrigin(0, 0.5);
      fitText(label, colW - ctrlW - 30);
      return { x: x + colW - ctrlW, y, w: ctrlW, h: ROW_H };
    };

    const slider = (
      col: 0 | 1,
      i: number,
      labelKey: I18nKey,
      key: 'masterVolume' | 'sfxVolume' | 'musicVolume',
    ): void => {
      const rect = row(col, i, labelKey);
      const track: Rect = { x: rect.x + 30, y: rect.y, w: rect.w - 60, h: rect.h };
      const sl = drawSlider(this, track);
      sl.draw(s()[key]);
      const setV = (v: number): void => {
        const value = Math.round(Math.min(1, Math.max(0, v)) * 20) / 20;
        if (value !== s()[key]) set({ [key]: value });
        sl.draw(value);
      };
      items.push({
        id: `settings.${key}`,
        rect: () => rect,
        press: () => undefined,
        drag: (x) => {
          setV(sliderValueAt(track, x));
        },
        adjust: (dir) => {
          setV(s()[key] + dir * 0.1);
        },
      });
    };

    const button = (
      id: string,
      rect: Rect,
      text: () => string,
      onPress: () => void,
      adjust?: (d: -1 | 1) => void,
    ): void => {
      let b = drawButton(this, rect, text(), 'secondary', 34);
      const redraw = (): void => {
        b.g.destroy();
        b.text.destroy();
        b = drawButton(this, rect, text(), 'secondary', 34);
      };
      items.push({
        id,
        rect: () => rect,
        press: () => {
          onPress();
          redraw();
        },
        ...(adjust
          ? {
              adjust: (d: -1 | 1) => {
                adjust(d);
                redraw();
              },
            }
          : {}),
      });
    };

    const toggle = (
      col: 0 | 1,
      i: number,
      labelKey: I18nKey,
      get: () => boolean,
      put: (on: boolean) => void,
    ): void => {
      const rect = row(col, i, labelKey);
      const flip = (): void => {
        put(!get());
      };
      button(
        `settings.${labelKey.split('.')[1] ?? labelKey}`,
        rect,
        () => t(get() ? 'settings.on' : 'settings.off'),
        flip,
        flip,
      );
    };

    const choice = <K extends 'aimAssist' | 'language' | 'quality'>(
      col: 0 | 1,
      i: number,
      labelKey: I18nKey,
      c: Choice<K>,
      after?: () => void,
    ): void => {
      const rect = row(col, i, labelKey);
      const step = (d: -1 | 1): void => {
        const cur = c.values.indexOf(s()[c.key]);
        const next = c.values[(cur + d + c.values.length) % c.values.length];
        if (next !== undefined) set({ [c.key]: next });
        after?.();
      };
      button(
        `settings.${c.key}`,
        rect,
        () => `◀ ${t(c.label(s()[c.key]))} ▶`,
        () => {
          step(1);
        },
        step,
      );
    };

    slider(0, 0, 'settings.master', 'masterVolume');
    slider(0, 1, 'settings.sfx', 'sfxVolume');
    slider(0, 2, 'settings.music', 'musicVolume');
    toggle(
      0,
      3,
      'settings.shake',
      () => this.ctx.prefs.shake,
      (on) => {
        set({ screenShake: on });
      },
    );
    toggle(
      0,
      4,
      'settings.flashes',
      () => s().reduceFlashes,
      (on) => {
        set({ reduceFlashes: on });
      },
    );
    choice(1, 0, 'settings.aim', AIM);
    toggle(
      1,
      1,
      'settings.left_handed',
      () => s().leftHanded,
      (on) => {
        set({ leftHanded: on });
      },
    );
    choice(1, 2, 'settings.language', LANG, () => {
      this.ctx.applyLanguage();
      // Every label changes: rebuild with the language row still focused.
      this.time.delayedCall(0, () => this.scene.restart({ ...data, focus: 'settings.language' }));
    });
    choice(1, 3, 'settings.quality', QUALITY);

    const back: Rect = { x: px + panelW / 2 - 220, y: py + panelH - 120, w: 440, h: 96 };
    drawButton(this, back, t('ui.back'), 'primary', 44);
    items.push({
      id: 'settings.back',
      rect: () => back,
      press: () => {
        data.close();
      },
    });

    new Menu(this, items, {
      onBack: () => {
        data.close();
      },
      focus: data.focus ?? 'settings.back',
      hook: this.ctx.hook,
      showFocus: data.focus !== undefined,
    });
    if (this.ctx.hook) this.ctx.hook.menu = 'settings';
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.ctx.hook?.menu === 'settings') this.ctx.hook.menu = null;
    });
  }
}
