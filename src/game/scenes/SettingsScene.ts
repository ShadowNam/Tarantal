// Settings (GDD §18.3, M5): audio sliders, screen shake, reduce flashes, aim assist, left-handed,
// text and voice language (v1.5), Afrikaans names and quality tier. Opened from the title, the Skiet-Skuur and the pause menu. Every
// change is written to the save at once (SaveStore → storage.ts) and reaches the game through
// ctx.prefs / the AudioDirector (main.ts listens to the save); aim assist goes into the next
// hunt's SimConfig (recorded in its replay). A language change rebuilds this screen.
import { designSize } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import { t, type I18nKey } from '../../i18n/i18n';
import type { Settings } from '../../meta/saveSchema';
import type { GameContext } from '../GameContext';
import type { PrivacyData } from './PrivacyScene';
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
  /** M9: Settings page (0 sound & game, 1 display & access). */
  readonly page?: number;
}

const TEXT: Choice<'textSize'> = {
  key: 'textSize',
  values: ['normal', 'large'],
  label: (v) => `settings.text.${v}`,
};

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
  values: ['auto', 'en', 'af', 'de', 'nl'],
  label: (v) => `settings.lang.${v}`,
};
/** v1.5 (D-041): Oupa's voice, separate from the text (captions follow the text). */
const VOICE: Choice<'voiceLanguage'> = {
  key: 'voiceLanguage',
  values: ['same', 'en', 'af', 'de'],
  label: (v) => `settings.voice.${v}`,
};
const QUALITY: Choice<'quality'> = {
  key: 'quality',
  values: ['auto', 'low', 'medium', 'high'],
  label: (v) => `settings.quality.${v}`,
};

const ROW_H = 96;
const ROW_GAP = 18;
/** v1.5: Sound & game has six rows per column (voice language, Afrikaans names). */
const ROW_H_TIGHT = 80;
const ROW_GAP_TIGHT = 8;
/**
 * v1.5 review: a hint is its own line under its row, across the whole column, at HINT_PX and
 * never scaled below HINT_MIN_PX (24, the smallest text elsewhere); too long even then, it
 * wraps. Both columns leave the band after the same rows (HINT_ROWS), so they stay aligned.
 */
const HINT_PX = 26;
const HINT_MIN_PX = 24;
const HINT_BAND = 40;
const HINT_ROWS: readonly number[] = [1, 4];

/** Fits a hint into `maxW`: scaled down to at most HINT_MIN_PX / HINT_PX, then wrapped. */
function fitHint(text: Phaser.GameObjects.Text, maxW: number): void {
  text.setScale(1);
  if (text.width <= maxW) return;
  const floor = HINT_MIN_PX / HINT_PX;
  const scale = Math.max(floor, maxW / text.width);
  text.setScale(scale);
  if (text.width > maxW) text.setWordWrapWidth(maxW / scale, true);
}

function hintRect(text: Phaser.GameObjects.Text): Rect {
  return { x: text.x, y: text.y, w: text.displayWidth, h: text.displayHeight };
}

export class SettingsScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Settings' });
    this.ctx = ctx;
  }

  create(data: OverlayData): void {
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
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
    const page = data.page === 1 ? 1 : 0;
    const rowH = page === 0 ? ROW_H_TIGHT : ROW_H;
    const rowGap = page === 0 ? ROW_GAP_TIGHT : ROW_GAP;
    /** Design px of the hint bands above row `i` (page 0 only). */
    const bands = (i: number): number =>
      page === 0 ? HINT_ROWS.filter((r) => r < i).length * HINT_BAND : 0;
    /** A row's label (and an optional hint line under it); returns the control's rect. */
    const row = (col: 0 | 1, i: number, labelKey: I18nKey, hintKey?: I18nKey): Rect => {
      const x = px + 40 + col * (colW + 40);
      const y = py + 210 + i * (rowH + rowGap) + bands(i);
      const label = this.add.text(x, y + rowH / 2, t(labelKey), textStyle(36)).setOrigin(0, 0.5);
      fitText(label, colW - ctrlW - 30);
      if (hintKey !== undefined) {
        const hint = this.add
          .text(x, y + rowH + 2, t(hintKey), textStyle(HINT_PX, '#E3E9DF'))
          .setOrigin(0, 0);
        fitHint(hint, colW);
        if (this.ctx.hook) this.ctx.hook.rects[`hint.${hintKey}`] = hintRect(hint);
      }
      return { x: x + colW - ctrlW, y, w: ctrlW, h: rowH };
    };

    const slider = (
      col: 0 | 1,
      i: number,
      labelKey: I18nKey,
      key: 'masterVolume' | 'sfxVolume' | 'musicVolume' | 'voiceVolume',
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
      hintKey?: I18nKey,
    ): void => {
      const rect = row(col, i, labelKey, hintKey);
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

    const choice = <K extends 'aimAssist' | 'language' | 'voiceLanguage' | 'quality' | 'textSize'>(
      col: 0 | 1,
      i: number,
      labelKey: I18nKey,
      c: Choice<K>,
      after?: () => void,
      hintKey?: I18nKey,
    ): void => {
      const rect = row(col, i, labelKey, hintKey);
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

    // M9: two pages (GDD §18.3 adds text size, contrast, captions, colour-blind aids and hold
    // to fire): tabs at the top, ←/→ or a tap switches.
    const tabW = Math.min(520, (panelW - 120) / 2);
    const tabs: Rect[] = [0, 1].map((i) => ({
      x: px + panelW / 2 + (i === 0 ? -tabW - 10 : 10),
      y: py + 104,
      w: tabW,
      h: 80,
    }));
    const tabKeys: I18nKey[] = ['settings.page.game', 'settings.page.access'];
    tabs.forEach((r, i) => {
      drawButton(
        this,
        r,
        t(tabKeys[i] ?? 'settings.page.game'),
        i === page ? 'selected' : 'secondary',
        32,
      );
      items.push({
        id: `settings.page.${i}`,
        rect: () => r,
        press: () => {
          if (i !== page) this.goPage(data, i);
        },
        adjust: (d) => {
          const next = page + d;
          if (next === 0 || next === 1) this.goPage(data, next);
        },
      });
    });
    const flag = (
      col: 0 | 1,
      i: number,
      labelKey: I18nKey,
      key:
        | 'reduceFlashes'
        | 'leftHanded'
        | 'highContrast'
        | 'captions'
        | 'colourBlind'
        | 'holdToFire'
        | 'offsetCrosshair'
        | 'afrikaansNames',
      after?: () => void,
      hintKey?: I18nKey,
    ): void => {
      toggle(
        col,
        i,
        labelKey,
        () => s()[key],
        (on) => {
          set({ [key]: on });
          after?.();
        },
        hintKey,
      );
    };
    // Text size and contrast restyle every text: rebuild this screen with the row still focused.
    const restyle = (focus: string) => (): void => {
      this.time.delayedCall(0, () => this.scene.restart({ ...data, page, focus }));
    };

    if (page === 0) {
      slider(0, 0, 'settings.master', 'masterVolume');
      slider(0, 1, 'settings.sfx', 'sfxVolume');
      slider(0, 2, 'settings.music', 'musicVolume');
      slider(0, 3, 'settings.voice', 'voiceVolume');
      // v1.5 (D-041): Oupa's voice language; "same as text" with Dutch text is Afrikaans.
      choice(0, 4, 'settings.voice_language', VOICE, undefined, 'settings.voice_hint');
      // M9: the privacy screen (what is stored, what is sent, clear my data).
      const privacy = row(0, 5, 'settings.privacy');
      drawButton(this, privacy, t('settings.privacy_open'), 'secondary', 34);
      items.push({
        id: 'settings.privacy',
        rect: () => privacy,
        press: () => {
          menu.setActive(false);
          this.scene.launch('Privacy', {
            close: () => {
              this.scene.stop('Privacy');
              menu.setActive(true);
            },
            restart: () => {
              this.ctx.restartPage();
            },
          } satisfies PrivacyData);
          this.scene.bringToTop('Privacy');
        },
      });
      choice(1, 0, 'settings.language', LANG, () => {
        this.ctx.applyLanguage();
        // Every label changes: rebuild with the language row still focused.
        restyle('settings.language')();
      });
      // v1.5 (D-041): the Afrikaans flavour names in any text language (names change: rebuild).
      flag(
        1,
        1,
        'settings.af_names',
        'afrikaansNames',
        () => {
          this.ctx.applyLanguage();
          restyle('settings.af_names')();
        },
        'settings.af_names_hint',
      );
      choice(1, 2, 'settings.aim', AIM);
      flag(1, 3, 'settings.left_handed', 'leftHanded');
      flag(1, 4, 'settings.hold_to_fire', 'holdToFire');
      // v1.1 (GDD §18.2): touch only — the crosshair sits above the finger.
      flag(1, 5, 'settings.offset_crosshair', 'offsetCrosshair');
    } else {
      toggle(
        0,
        0,
        'settings.shake',
        () => this.ctx.prefs.shake,
        (on) => {
          set({ screenShake: on });
        },
      );
      flag(0, 1, 'settings.flashes', 'reduceFlashes');
      choice(0, 2, 'settings.quality', QUALITY);
      choice(0, 3, 'settings.text_size', TEXT, restyle('settings.textSize'));
      flag(1, 0, 'settings.contrast', 'highContrast', restyle('settings.contrast'));
      flag(1, 1, 'settings.captions', 'captions');
      flag(1, 2, 'settings.colour_blind', 'colourBlind');
    }

    const back: Rect = { x: px + panelW / 2 - 220, y: py + panelH - 120, w: 440, h: 96 };
    drawButton(this, back, t('ui.back'), 'primary', 44);
    items.push({
      id: 'settings.back',
      rect: () => back,
      press: () => {
        data.close();
      },
    });

    const menu = new Menu(this, items, {
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

  /** Shows the other Settings page (focus on its tab, so ←/→ keeps paging). */
  private goPage(data: OverlayData, page: number): void {
    this.time.delayedCall(0, () =>
      this.scene.restart({ ...data, page, focus: `settings.page.${page}` }),
    );
  }
}
