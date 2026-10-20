// Skiet-Skuur (GDD §13.7): the hub — equip the Classic weapon, the Bird Book v0 (creatures and
// Karoo secrets seen), Oupa se Notaboek v0 (challenge progress and what each unlocks), and the
// way to Settings. It is not a shop: everything here is unlocked by playing (GDD §13.6).
import * as Phaser from 'phaser';
import type { Weapon } from '../../content/schemas';
import { fill, t, tOr } from '../../i18n/i18n';
import { isWeaponEquippable, isWeaponUnlocked, secretKey } from '../../meta/progress';
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
    const tab = data.tab ?? 'loadout';
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
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
    if (this.ctx.hook) this.ctx.hook.menu = `shed.${tab}`;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.ctx.hook?.menu?.startsWith('shed') === true) this.ctx.hook.menu = null;
    });
  }

  private focusAfterEquip = 'shed.loadout';

  /** One card per primary weapon: equipped, equip, locked (with how to unlock) or "later". */
  private loadout(body: Rect, items: MenuItem[], rebuild: () => void): void {
    const save = this.ctx.save.data;
    const weapons = this.ctx.content.weapons.weapons.filter(
      (w): w is PrimaryWeapon => w.kind === 'primary',
    );
    const cols = 2;
    const cardW = (body.w - 30) / cols;
    const cardH = Math.min(150, (body.h - 30) / Math.ceil(weapons.length / cols));
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
      const name = this.add.text(
        r.x + 28,
        r.y + 22,
        tOr(`weapon.${w.id}`, w.id),
        textStyle(40, dark),
      );
      fitText(name, r.w - 56);
      const sub = this.add
        .text(r.x + 28, r.y + r.h - 22, status, textStyle(28, dark))
        .setOrigin(0, 1);
      fitText(sub, r.w - 56);
      items.push({
        id: `shed.weapon.${w.id}`,
        rect: () => r,
        enabled: () => equippable && !equipped,
        press: () => {
          this.ctx.save.update((d) => ({ ...d, loadout: { weapon: w.id } }));
          this.focusAfterEquip = `shed.weapon.${w.id}`;
          rebuild();
        },
      });
    });
  }

  private unlockHint(w: PrimaryWeapon): string {
    const u = w.unlock;
    if (u.type === 'rank') return fill(t('shed.unlock_rank'), { rank: tOr(`rank.${u.id}`, u.id) });
    if (u.type === 'challenge') {
      const c = this.ctx.notaboek.challenges.find((x) => x.id === u.id);
      const goal = c === undefined ? u.id : fill(tOr(`notaboek.${c.id}`, c.id), { n: c.target });
      return `🔒 ${goal}`;
    }
    return '';
  }

  /** Creatures from birds.json and this biome's secrets: names once seen, "???" until then. */
  private birdBook(body: Rect): void {
    const book = this.ctx.save.data.birdBook;
    const entries: { label: string; seen: boolean }[] = [
      ...this.ctx.content.birds.creatures.map((c) => ({
        label: tOr(`creature.${c.id}`, c.id),
        seen: book.creatures.includes(c.id),
      })),
      ...this.ctx.biome.props
        .filter((p) => p.secret !== undefined)
        .map((p) => ({
          label: `★ ${tOr(`secret.${p.id}`, p.id)}`,
          seen: book.secrets.includes(secretKey(this.ctx.biome.id, p.id)),
        })),
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
      const goal = this.add
        .text(
          body.x,
          y + rowH / 2,
          `${done ? '☑' : '☐'} ${fill(tOr(`notaboek.${c.id}`, c.id), { n: c.target })}`,
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
