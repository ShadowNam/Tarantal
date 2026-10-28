// Skiet-Skuur (GDD §13.7): the hub — equip the Classic weapon, the Bird Book v0 (creatures and
// Karoo secrets seen), Oupa se Notaboek v0 (challenge progress and what each unlocks), and the
// way to Settings. It is not a shop: everything here is unlocked by playing (GDD §13.6).
import { unlockedBiomes } from '../../meta/areas';
import { FAMILIEFOTO_SECRET, hasColonies } from '../../sim/meerkats/colony';
import { BLIKKIESDANS_SECRET } from '../../sim/cans/cans';
import { MAKALANI_SECRET } from '../../sim/nuts/makalani';
import { designSize, renderScale } from '../layout';
import { fitCamera } from '../view/fitCamera';
import * as Phaser from 'phaser';
import { textureBytes } from '../assets/textureBytes';
import type { Weapon } from '../../content/schemas';
import { fill, t, tOr } from '../../i18n/i18n';
import {
  fittedSight,
  isSightUnlocked,
  isWeaponEquippable,
  isWeaponUnlocked,
  secretKey,
} from '../../meta/progress';
import type { GameContext, TestHook } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu, textStyle, UI, type MenuItem } from '../ui/menu';
import { getLanguage, translator } from '../../i18n/i18n';
import { clientToDesign } from '../input/screenButtons';
import { guideLoaded, guideString, loadGuide } from '../ui/guideI18n';
import { guideCards } from '../ui/powerupGuide';
import { upgradePowerupIcons } from '../ui/powerupIcons';
import type { OverlayData } from './SettingsScene';

type PrimaryWeapon = Extract<Weapon, { kind: 'primary' }>;
type Tab = 'loadout' | 'powerups' | 'birdbook' | 'notaboek';
const TABS: readonly Tab[] = ['loadout', 'powerups', 'birdbook', 'notaboek'];

export interface ShedData extends OverlayData {
  readonly tab?: Tab;
}

/** v1.4: one rifle's sight row under the gun cards (chips, then a hint line). */
const SIGHT_ROW_H = 120;

export class ShedScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Shed' });
    this.ctx = ctx;
  }

  create(data: ShedData): void {
    // 1.9.2 (D-055): the Power-ups tab's sentences (lazy) start loading as the Shed opens.
    void loadGuide();
    this.shown = data;
    const tab = data.tab ?? 'loadout';
    const { width, height } = designSize();
    fitCamera(this.cameras.main);
    const safe = this.ctx.safeArea();
    const panelW = Math.min(1700, width - safe.left - safe.right - 60);
    const panelH = Math.min(960, height - safe.top - safe.bottom - 40);
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    this.add.rectangle(0, 0, width, height, UI.ink, 0.6).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(UI.wood, 1).fillRoundedRect(px - 12, py - 12, panelW + 24, panelH + 24, 26);
    g.fillStyle(UI.slate, 1).fillRoundedRect(px, py, panelW, panelH, 18);

    const items: MenuItem[] = [];
    const rebuild = (patch: Partial<ShedData>): void => {
      this.time.delayedCall(0, () => this.scene.restart({ ...data, ...patch }));
    };
    // Tabs + Settings along the top (v1.7b: a fourth tab, Power-ups, next to the guns).
    const tabW = Math.min(320, (panelW - 60 - 14 * TABS.length) / (TABS.length + 1));
    TABS.forEach((id, i) => {
      const r: Rect = { x: px + 30 + i * (tabW + 14), y: py + 28, w: tabW, h: 84 };
      drawButton(this, r, t(`shed.tab.${id}`), id === tab ? 'selected' : 'secondary', 34);
      items.push({
        id: `shed.${id}`,
        rect: () => r,
        press: () => {
          rebuild({ tab: id, focus: `shed.${id}` });
        },
      });
    });
    const settingsR: Rect = { x: px + panelW - 30 - tabW, y: py + 28, w: tabW, h: 84 };
    drawButton(this, settingsR, t('title.settings'), 'secondary', 34);
    items.push({
      id: 'shed.settings',
      rect: () => settingsR,
      press: () => {
        this.scene.launch('Settings', {
          close: () => {
            this.scene.stop('Settings');
            rebuild({ focus: 'shed.settings' });
          },
        });
        this.scene.bringToTop('Settings');
        menu.setActive(false);
      },
    });

    const body: Rect = { x: px + 30, y: py + 140, w: panelW - 60, h: panelH - 280 };
    /** v1.7b: the Power-ups tab finishes its scrolling list once the menu exists. */
    let afterMenu: ((menu: Menu) => void) | null = null;
    if (tab === 'loadout')
      this.loadout(body, items, () => {
        rebuild({ tab, focus: this.focusAfterEquip });
      });
    else if (tab === 'powerups') afterMenu = this.powerupsTab(body, items);
    else if (tab === 'birdbook') this.birdBook(body);
    else this.notaboekTab(body);

    const back: Rect = { x: px + panelW / 2 - 220, y: py + panelH - 120, w: 440, h: 96 };
    drawButton(this, back, t('ui.back'), 'primary', 44);
    items.push({
      id: 'shed.back',
      rect: () => back,
      press: () => {
        data.close();
      },
    });

    const menu = new Menu(this, items, {
      onBack: () => {
        data.close();
      },
      focus: data.focus ?? `shed.${tab}`,
      hook: this.ctx.hook,
      showFocus: data.focus !== undefined,
    });
    afterMenu?.(menu);
    if (this.ctx.hook) {
      this.ctx.hook.menu = `shed.${tab}`;
      // D-035 review: texture memory with the shed open (its gun icons included).
      this.ctx.hook.textureBytes = textureBytes(this.textures);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.ctx.hook?.menu?.startsWith('shed') === true) this.ctx.hook.menu = null;
    });
  }

  private focusAfterEquip = 'shed.loadout';
  /** D-035 review: the late group has settled (its gun pictures are in, or never will be). */
  private lateSettled = false;
  private lateWaiting = false;
  /** v1.7b: the Power-ups tab has asked for the delivered icons (once per scene object). */
  private iconsSettled = false;
  /** The data this scene was last started with (the late refresh restarts with it). */
  private shown: ShedData | null = null;

  /** One card per primary weapon: equipped, equip, locked (with how to unlock) or "later". */
  private loadout(body: Rect, items: MenuItem[], rebuild: () => void): void {
    if (this.ctx.hook) {
      this.ctx.hook.shedIcons = [];
      this.ctx.hook.shedNames = [];
    }
    const save = this.ctx.save.data;
    const weapons = this.ctx.content.weapons.weapons.filter(
      (w): w is PrimaryWeapon => w.kind === 'primary',
    );
    const cols = 2;
    const cardW = (body.w - 30) / cols;
    // v1.4: leave room under the cards for each unlocked rifle's sight row (the Twee-Twee and the
    // Langloop), so the last one stays clear of the Back button.
    const sightRows = weapons.filter(
      (w) => w.aim !== undefined && isWeaponUnlocked(w, save, this.ctx.content),
    ).length;
    const cardRows = Math.ceil(weapons.length / cols);
    const cardH = Math.min(150, (body.h - sightRows * SIGHT_ROW_H) / cardRows - 20);
    // D-035 review: the guns other than the Dubbelloop arrive with the late group (D-029); if it
    // is still downloading, rebuild this tab once it lands so their pictures appear.
    if (
      !this.lateSettled &&
      !this.lateWaiting &&
      weapons.some((w) => this.ctx.manifest.gunIdleImage(w.id) === null)
    ) {
      this.lateWaiting = true;
      void this.ctx.manifest.lateLoaded.then(() => {
        this.lateSettled = true;
        this.lateWaiting = false;
        // Only the Guns tab that is on screen now (the player may have switched tabs or left).
        if (
          this.sys.isActive() &&
          this.shown !== null &&
          (this.shown.tab ?? 'loadout') === 'loadout'
        )
          this.scene.restart(this.shown);
      });
    }
    weapons.forEach((w, i) => {
      const r: Rect = {
        x: body.x + (i % cols) * (cardW + 30),
        y: body.y + Math.floor(i / cols) * (cardH + 20),
        w: cardW,
        h: cardH,
      };
      const unlocked = isWeaponUnlocked(w, save, this.ctx.content);
      const equippable = isWeaponEquippable(w, save, this.ctx.content);
      const equipped = save.loadout.weapon === w.id;
      const status = equipped
        ? t('shed.equipped')
        : equippable
          ? t('shed.equip')
          : unlocked
            ? t('shed.arrives_later')
            : this.unlockHint(w);
      drawButton(this, r, '', equipped ? 'selected' : equippable ? 'secondary' : 'locked', 30);
      const dark = equipped ? '#1B1410' : '#F3EAD3';
      // D-035: the gun itself on its card (its first-person idle frame, when its art is in).
      const icon = this.gunIcon(w.id, r, !unlocked);
      const name = this.add.text(
        r.x + 28,
        r.y + 22,
        tOr(`weapon.${w.id}`, w.id),
        textStyle(40, dark),
      );
      fitText(name, r.w - 56 - icon);
      this.ctx.hook?.shedNames?.push(name.text);
      const sub = this.add
        .text(r.x + 28, r.y + r.h - 22, status, textStyle(28, dark))
        .setOrigin(0, 1);
      fitText(sub, r.w - 56 - icon);
      items.push({
        id: `shed.weapon.${w.id}`,
        rect: () => r,
        enabled: () => equippable && !equipped,
        press: () => {
          this.ctx.save.update((d) => ({ ...d, loadout: { ...d.loadout, weapon: w.id } }));
          this.focusAfterEquip = `shed.weapon.${w.id}`;
          rebuild();
        },
      });
    });
    const rows = Math.ceil(weapons.length / cols);
    this.sights(body.y + rows * (cardH + 20), body, items, rebuild);
  }

  /**
   * v1.3 (D-036): under the gun cards, each unlocked rifle's sights — the fitted one, the ones
   * you can fit, and the locked ones with what earns them (a Notaboek challenge or a rank).
   */
  private sights(top: number, body: Rect, items: MenuItem[], rebuild: () => void): void {
    const save = this.ctx.save.data;
    const rifles = this.ctx.content.weapons.weapons.filter(
      (w): w is PrimaryWeapon =>
        w.kind === 'primary' && w.aim !== undefined && isWeaponUnlocked(w, save, this.ctx.content),
    );
    let y = top;
    for (const w of rifles) {
      if (w.aim === undefined) continue;
      const label = this.add
        .text(
          body.x,
          y + 36,
          fill(t('shed.sight'), { weapon: tOr(`weapon.${w.id}`, w.id) }),
          textStyle(30, '#FFD25A'),
        )
        .setOrigin(0, 0.5);
      fitText(label, body.w * 0.3);
      const fitted = fittedSight(w.id, save, this.ctx.content);
      const chipW = Math.min(
        300,
        (body.w * 0.7 - 20 * (w.aim.sights.length - 1)) / w.aim.sights.length,
      );
      let hint: string | null = null;
      for (const [i, id] of w.aim.sights.entries()) {
        const sight = this.ctx.content.weapons.sights.find((x) => x.id === id);
        if (sight === undefined) continue;
        const open = isSightUnlocked(sight, save, this.ctx.content);
        const on = fitted === id;
        const r: Rect = { x: body.x + body.w * 0.3 + i * (chipW + 20), y, w: chipW, h: 72 };
        const name = tOr(sight.nameKey, id);
        drawButton(
          this,
          r,
          open ? name : `🔒 ${name}`,
          on ? 'selected' : open ? 'secondary' : 'locked',
          28,
        );
        if (!open && hint === null) hint = `${name}: ${this.unlockHint(sight)}`;
        items.push({
          id: `shed.sight.${w.id}.${id}`,
          rect: () => r,
          enabled: () => open && !on,
          press: () => {
            this.ctx.save.update((d) => ({
              ...d,
              loadout: { ...d.loadout, sights: { ...d.loadout.sights, [w.id]: id } },
            }));
            this.focusAfterEquip = `shed.sight.${w.id}.${id}`;
            rebuild();
          },
        });
      }
      if (hint !== null) {
        const h = this.add
          .text(body.x + body.w * 0.3, y + 86, hint, textStyle(24, '#D9CBB0'))
          .setOrigin(0, 0);
        fitText(h, body.w * 0.7);
      }
      if (this.ctx.hook) this.ctx.hook.shedSights = { weapon: w.id, fitted: fitted ?? null };
      y += SIGHT_ROW_H;
    }
  }

  /**
   * The gun's idle frame at the right of its card; returns the width it takes (0 = none).
   * D-035 review: the frame is cropped from the decoded atlas page onto a small canvas about the
   * card's height (≈ 0.1–0.3 MB on the GPU) — the gun's atlas itself is never uploaded here — and
   * the canvas leaves with the scene.
   */
  private gunIcon(weaponId: string, r: Rect, locked: boolean): number {
    const src = this.ctx.manifest.gunIdleImage(weaponId);
    if (src === null) return 0;
    const { img, region } = src;
    const fw = region.rotated ? region.h : region.w;
    const fh = region.rotated ? region.w : region.h;
    const h = r.h - 12;
    const scale = this.ctx.prefs.renderScale;
    const ch = Math.max(1, Math.round(h * scale));
    const cw = Math.max(1, Math.round((fw / fh) * ch));
    const key = `shed/gun/${weaponId}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, cw, ch);
    if (tex === null) return 0;
    const c = tex.getContext();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    if (region.rotated) {
      // TexturePacker turned it 90° clockwise in the page: turn it back.
      c.translate(0, ch);
      c.rotate(-Math.PI / 2);
      c.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, ch, cw);
    } else c.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, cw, ch);
    tex.refresh();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.textures.exists(key)) this.textures.remove(key);
    });
    const icon = this.add.image(r.x + r.w - 16, r.y + r.h / 2, key).setOrigin(1, 0.5);
    icon.setDisplaySize(cw / scale, h);
    if (locked) icon.setAlpha(0.45);
    this.ctx.hook?.shedIcons?.push(weaponId);
    return icon.displayWidth + 16;
  }

  /**
   * v1.7b (D-046, GDD §13.7): one card per power-up and crate gun: the big icon, its name, one
   * sentence of what it does (numbers from content), how you get it and a tip. Ones not picked
   * up yet are darker and say "Not found yet", but explain themselves all the same (no secrets).
   * The list scrolls by drag, wheel or ↑/↓ through the cards. It is drawn by a second camera
   * whose viewport is the list's window, so cards scrolled out of it are clipped on any renderer.
   * Returns what to finish once the menu exists.
   */
  private powerupsTab(body: Rect, items: MenuItem[]): (menu: Menu) => void {
    const lang = getLanguage();
    const tr = translator(lang);
    const seen = this.ctx.save.data.powerups.seen;
    const cards = guideCards(this.ctx.content, seen, tr, lang);
    // 1.9.2 (D-055): the cards' sentences come from the lazy guide tables: drawn again once in.
    if (!guideLoaded())
      void loadGuide().then(() => {
        if (this.sys.isActive() && this.shown !== null && this.shown.tab === 'powerups')
          this.scene.restart(this.shown);
      });
    // v1.7b (D-046): the icons come with the late group: until it lands the cards show the
    // placeholders; then the delivered icons are swapped in and this tab is drawn again.
    if (!this.iconsSettled) {
      this.iconsSettled = true;
      void this.ctx.manifest.lateLoaded.then(() => {
        const swapped = upgradePowerupIcons(this.ctx.manifest, this.textures);
        if (
          swapped > 0 &&
          this.sys.isActive() &&
          this.shown !== null &&
          this.shown.tab === 'powerups'
        )
          this.scene.restart(this.shown);
      });
    }
    const head = this.add.text(
      body.x,
      body.y - 8,
      tr.text('guide.head').replace('{stall}', tr.text('run.padstal')),
      textStyle(28, '#FFD25A'),
    );
    fitText(head, body.w);
    const view: Rect = { x: body.x, y: body.y + 44, w: body.w, h: body.h - 30 };
    const list = this.add.container(0, 0);
    const pad = 22;
    const iconBox = 176;
    const textX = view.x + pad + iconBox + 30;
    const textW = view.x + view.w - pad - textX;
    const gap = 18;
    const cardRects: Rect[] = [];
    let y = view.y;
    const hookCards: NonNullable<TestHook['shedPowerups']>['cards'] = [];
    for (const c of cards) {
      const dim = !c.found;
      const g = this.add.graphics();
      list.add(g);
      const name = this.add.text(
        textX,
        y + pad - 4,
        c.name,
        textStyle(42, dim ? '#E3D7BC' : '#FFD25A'),
      );
      list.add(name);
      let nameRoom = textW;
      if (dim) {
        const tag = this.add
          .text(
            view.x + view.w - pad,
            y + pad + 4,
            tr.text('guide.not_found'),
            textStyle(28, '#B9B09A'),
          )
          .setOrigin(1, 0);
        list.add(tag);
        nameRoom -= tag.displayWidth + 24;
      }
      fitText(name, nameRoom);
      const para = (text: string, top: number, size: number, color: string): number => {
        const tx = this.add.text(textX, top, text, {
          ...textStyle(size, color),
          wordWrap: { width: textW, useAdvancedWrap: true },
        });
        list.add(tx);
        return top + tx.displayHeight;
      };
      let ty = para(c.effect, y + pad + 54, 32, '#F3EAD3') + 10;
      ty = para(c.how.map((h) => `• ${h}`).join('\n'), ty, 26, '#D9CBB0') + 8;
      if (c.tip !== '')
        ty = para(tr.text('guide.tip_label').replace('{tip}', c.tip), ty, 26, '#FFD25A');
      const h = Math.max(iconBox + 2 * pad, ty - y + pad);
      g.fillStyle(UI.ink, 1).fillRoundedRect(view.x, y, view.w, h, 20);
      g.fillStyle(dim ? 0x1f2722 : 0x3e5146, 1).fillRoundedRect(
        view.x + 3,
        y + 3,
        view.w - 6,
        h - 6,
        18,
      );
      const cx = view.x + pad + iconBox / 2;
      const cy = y + h / 2;
      g.fillStyle(dim ? 0x4a4a42 : UI.enamel, 1).fillCircle(cx, cy, iconBox / 2);
      g.lineStyle(4, UI.ink, 1).strokeCircle(cx, cy, iconBox / 2);
      const hasIcon = this.textures.exists(c.icon);
      if (hasIcon) {
        const icon = this.add.image(cx, cy, c.icon).setDisplaySize(iconBox - 28, iconBox - 28);
        if (dim) icon.setAlpha(0.75);
        list.add(icon);
      }
      cardRects.push({ x: view.x, y, w: view.w, h });
      hookCards.push({ id: c.id, name: c.name, effect: c.effect, found: c.found, icon: hasIcon });
      y += h + gap;
    }
    const maxScroll = Math.max(0, y - gap - (view.y + view.h));
    let scroll = 0;
    const s = renderScale();
    const cam = this.cameras.add(view.x * s, view.y * s, view.w * s, view.h * s);
    cam.setOrigin(0, 0).setZoom(s);
    const publish = (): void => {
      if (this.ctx.hook) this.ctx.hook.shedPowerups = { cards: hookCards, scroll, maxScroll };
    };
    let menuRef: Menu | null = null;
    const setScroll = (v: number): void => {
      scroll = Math.round(Math.min(maxScroll, Math.max(0, v)));
      cam.setScroll(view.x, view.y + scroll);
      menuRef?.refresh();
      publish();
    };
    // Each card is a menu item (keyboard focus walks the list); its rect is the part on screen.
    cards.forEach((c, i) => {
      items.push({
        id: `shed.powerup.${c.id}`,
        rect: () => {
          const r = cardRects[i] ?? view;
          const top = Math.max(view.y, r.y - scroll);
          const bottom = Math.min(view.y + view.h, r.y - scroll + r.h);
          return { x: r.x, y: top, w: r.w, h: Math.max(0, bottom - top) };
        },
        press: () => undefined,
      });
    });
    // Drag (touch or mouse) and the wheel scroll the list.
    const canvas = this.game.canvas;
    let drag: { id: number; y: number; from: number } | null = null;
    const designY = (e: PointerEvent | WheelEvent): { x: number; y: number } =>
      clientToDesign(canvas, e.clientX, e.clientY, designSize());
    const inView = (p: { x: number; y: number }): boolean =>
      p.x >= view.x && p.x <= view.x + view.w && p.y >= view.y && p.y <= view.y + view.h;
    // Not while Settings (opened from here) covers the shed.
    const covered = (): boolean => this.scene.isActive('Settings');
    const onDown = (e: PointerEvent): void => {
      const p = designY(e);
      if (inView(p) && !covered()) drag = { id: e.pointerId, y: p.y, from: scroll };
    };
    const onMove = (e: PointerEvent): void => {
      if (drag === null || drag.id !== e.pointerId) return;
      setScroll(drag.from - (designY(e).y - drag.y));
    };
    const onUp = (e: PointerEvent): void => {
      if (drag?.id === e.pointerId) drag = null;
    };
    const onWheel = (e: WheelEvent): void => {
      if (!inView(designY(e)) || covered()) return;
      e.preventDefault();
      setScroll(scroll + e.deltaY);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      if (this.ctx.hook) delete this.ctx.hook.shedPowerups;
    });
    return (menu) => {
      menuRef = menu;
      // The list camera draws only the list; the main camera everything else.
      this.cameras.main.ignore(list);
      cam.ignore(this.children.list.filter((o) => o !== list));
      // ↑/↓ (the menu moves its focus first): bring the focused card into view.
      // The menu's focus ring is drawn by the main camera, under the list: a card's own ring is
      // drawn in the list.
      const ring = this.add.graphics();
      list.add(ring);
      const onKey = (): void => {
        const i = cards.findIndex((c) => menu.focusedId === `shed.powerup.${c.id}`);
        const r = cardRects[i];
        ring.clear();
        if (r === undefined) return;
        ring.lineStyle(6, UI.focus, 1).strokeRoundedRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 18);
        if (r.y - scroll < view.y) setScroll(r.y - view.y);
        else if (r.y + r.h - scroll > view.y + view.h) setScroll(r.y + r.h - view.y - view.h);
      };
      window.addEventListener('keydown', onKey);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        window.removeEventListener('keydown', onKey);
      });
      setScroll(0);
    };
  }

  private unlockHint(w: { readonly unlock: PrimaryWeapon['unlock'] }): string {
    const u = w.unlock;
    if (u.type === 'rank') return fill(t('shed.unlock_rank'), { rank: tOr(`rank.${u.id}`, u.id) });
    if (u.type === 'challenge') {
      const c = this.ctx.notaboek.challenges.find((x) => x.id === u.id);
      const goal = c === undefined ? u.id : fill(tOr(`notaboek.${c.id}`, c.id), { n: c.target });
      return fill(t('shed.locked'), { goal });
    }
    return '';
  }

  /** Creatures from birds.json and every playable biome's secrets (M8): names once seen, "???"
   *  until then. */
  private birdBook(body: Rect): void {
    const book = this.ctx.save.data.birdBook;
    const entries: { label: string; seen: boolean }[] = [
      ...this.ctx.content.birds.creatures.map((c) => ({
        label: tOr(`creature.${c.id}`, c.id),
        seen: book.creatures.includes(c.id),
      })),
      // v1.4 B: a locked area pack keeps its secrets to itself until it is unlocked.
      ...this.ctx.content.biomes
        .filter((b) =>
          unlockedBiomes(
            this.ctx.content,
            this.ctx.save.data,
            this.ctx.playableBiomes,
            this.ctx.notaboek,
          ).includes(b.id),
        )
        .flatMap((b) =>
          b.props
            .filter((p) => p.secret !== undefined)
            .map((p) => ({
              label: `★ ${tOr(`secret.${p.id}`, p.id)}`,
              seen: book.secrets.includes(secretKey(b.id, p.id)),
            }))
            // v1.7 (D-044): a biome with meerkat colonies has the Familiefoto too.
            .concat(
              hasColonies(b)
                ? [
                    {
                      label: `★ ${t('secret.familiefoto')}`,
                      seen: book.secrets.includes(secretKey(b.id, FAMILIEFOTO_SECRET)),
                    },
                  ]
                : [],
            )
            // v1.8 (D-050): a biome with a Blikkies fence on some day has the Blikkiesdans.
            .concat(
              b.layouts.some((l) => l.fence !== undefined)
                ? [
                    {
                      label: `★ ${t('secret.blikkiesdans')}`,
                      seen: book.secrets.includes(secretKey(b.id, BLIKKIESDANS_SECRET)),
                    },
                  ]
                : [],
            )
            // 1.9.3 (D-056): a biome with makalani palms has "Hard soos 'n makalani" (lazy
            // strings: the guide tables, loaded with the Shed).
            .concat(
              b.layouts.some((l) => (l.palms?.length ?? 0) > 0)
                ? [
                    {
                      label: `★ ${guideString(getLanguage(), 'secret.makalani') ?? ''}`,
                      seen: book.secrets.includes(secretKey(b.id, MAKALANI_SECRET)),
                    },
                  ]
                : [],
            ),
        ),
    ];
    const seen = entries.filter((e) => e.seen).length;
    const page = this.ctx.save.data.notaboek.done.some((id) => {
      const c = this.ctx.notaboek.challenges.find((x) => x.id === id);
      return c?.reward.type === 'birdBookPage' && c.reward.biome === this.ctx.biome.id;
    });
    const head = this.add.text(
      body.x,
      body.y,
      `${fill(t('shed.birdbook_count'), { n: seen, total: entries.length })}${page ? `  ·  ${t('shed.page_complete')}` : ''}`,
      textStyle(32, '#FFD25A'),
    );
    fitText(head, body.w);
    const cols = 4;
    const cellW = (body.w - (cols - 1) * 16) / cols;
    const rows = Math.ceil(entries.length / cols);
    const cellH = Math.min(84, (body.h - 60 - (rows - 1) * 12) / rows);
    const g = this.add.graphics();
    entries.forEach((e, i) => {
      const x = body.x + (i % cols) * (cellW + 16);
      const y = body.y + 60 + Math.floor(i / cols) * (cellH + 12);
      g.fillStyle(e.seen ? UI.enamel : UI.ink, e.seen ? 1 : 0.7).fillRoundedRect(
        x,
        y,
        cellW,
        cellH,
        12,
      );
      const txt = this.add
        .text(
          x + cellW / 2,
          y + cellH / 2,
          e.seen ? e.label : t('shed.unknown'),
          textStyle(26, e.seen ? '#1B1410' : '#9A9A8A'),
        )
        .setOrigin(0.5);
      fitText(txt, cellW - 20);
    });
  }

  /** Each challenge: tick, goal text, progress bar and its reward. */
  private notaboekTab(body: Rect): void {
    const nb = this.ctx.save.data.notaboek;
    const list = this.ctx.notaboek.challenges;
    const rowH = Math.min(80, body.h / list.length);
    const g = this.add.graphics();
    list.forEach((c, i) => {
      const y = body.y + i * rowH;
      const done = nb.done.includes(c.id);
      const progress = done ? c.target : Math.min(c.target, nb.progress[c.id] ?? 0);
      const goalText = fill(tOr(`notaboek.${c.id}`, c.id), { n: c.target });
      const goal = this.add
        .text(
          body.x,
          y + rowH / 2,
          `${done ? '☑' : '☐'} ${goalText}`,
          textStyle(30, done ? '#FFD25A' : '#F3EAD3'),
        )
        .setOrigin(0, 0.5);
      fitText(goal, body.w * 0.45);
      const barX = body.x + body.w * 0.47;
      const barW = body.w * 0.2;
      g.fillStyle(UI.ink, 0.9).fillRoundedRect(barX, y + rowH / 2 - 10, barW, 20, 10);
      g.fillStyle(UI.gold, 1).fillRoundedRect(
        barX,
        y + rowH / 2 - 10,
        Math.max(8, (barW * progress) / c.target),
        20,
        10,
      );
      this.add
        .text(barX + barW + 16, y + rowH / 2, `${progress}/${c.target}`, textStyle(26))
        .setOrigin(0, 0.5);
      const reward =
        c.reward.type === 'weapon'
          ? fill(t('shed.reward_weapon'), { weapon: tOr(`weapon.${c.reward.id}`, c.reward.id) })
          : c.reward.type === 'birdBookPage'
            ? t('shed.reward_page')
            : c.reward.type === 'sight'
              ? fill(t('shed.reward_sight'), { sight: tOr(`sight.${c.reward.id}`, c.reward.id) })
              : '';
      if (reward !== '') {
        const r = this.add
          .text(body.x + body.w, y + rowH / 2, reward, textStyle(26, '#FFD25A'))
          .setOrigin(1, 0.5);
        fitText(r, body.w * 0.2);
      }
    });
  }
}
