// Skiet-Skuur (GDD §13.7): the hub — equip the Classic weapon, the Bird Book v0 (creatures and
// Karoo secrets seen), Oupa se Notaboek v0 (challenge progress and what each unlocks), and the
// way to Settings. It is not a shop: everything here is unlocked by playing (GDD §13.6).
import { designSize } from '../layout';
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
import type { GameContext } from '../GameContext';
import type { Rect } from '../ui/hudLayout';
import { drawButton, fitText, Menu, textStyle, UI, type MenuItem } from '../ui/menu';
import type { OverlayData } from './SettingsScene';

type PrimaryWeapon = Extract<Weapon, { kind: 'primary' }>;
type Tab = 'loadout' | 'birdbook' | 'notaboek';
const TABS: readonly Tab[] = ['loadout', 'birdbook', 'notaboek'];

export interface ShedData extends OverlayData {
  readonly tab?: Tab;
}

export class ShedScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Shed' });
    this.ctx = ctx;
  }

  create(data: ShedData): void {
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
    // Tabs + Settings along the top.
    const tabW = Math.min(360, (panelW - 100) / 4);
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
    if (tab === 'loadout')
      this.loadout(body, items, () => {
        rebuild({ tab, focus: this.focusAfterEquip });
      });
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
  /** The data this scene was last started with (the late refresh restarts with it). */
  private shown: ShedData | null = null;

  /** One card per primary weapon: equipped, equip, locked (with how to unlock) or "later". */
  private loadout(body: Rect, items: MenuItem[], rebuild: () => void): void {
    if (this.ctx.hook) this.ctx.hook.shedIcons = [];
    const save = this.ctx.save.data;
    const weapons = this.ctx.content.weapons.weapons.filter(
      (w): w is PrimaryWeapon => w.kind === 'primary',
    );
    const cols = 2;
    const cardW = (body.w - 30) / cols;
    const cardH = Math.min(150, (body.h - 30) / Math.ceil(weapons.length / cols));
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
      y += 120;
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
      ...this.ctx.content.biomes
        .filter((b) => this.ctx.playableBiomes.includes(b.id))
        .flatMap((b) =>
          b.props
            .filter((p) => p.secret !== undefined)
            .map((p) => ({
              label: `★ ${tOr(`secret.${p.id}`, p.id)}`,
              seen: book.secrets.includes(secretKey(b.id, p.id)),
            })),
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
