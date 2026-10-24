// v1.2x (D-034) playtest admin page, opened instead of the title by `?admin=1` on builds whose
// PlatformAdapter allows it (web only). The page itself is a DOM panel (AdminPanel) over the live
// panorama; this scene only owns its lifetime.
import * as Phaser from 'phaser';
import { AdminPanel } from '../admin/AdminPanel';
import type { GameContext } from '../GameContext';

export type AdminData =
  /** `range` opens the Skietbaan (D-037). */
  | { readonly view: 'list'; readonly range?: () => void }
  | { readonly view: 'play'; readonly start: (pointerType: string) => void };

export class AdminScene extends Phaser.Scene {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    super({ key: 'Admin' });
    this.ctx = ctx;
  }

  create(data: AdminData): void {
    const admin = this.ctx.admin;
    if (admin === null) return;
    const hook = this.ctx.hook;
    const panel = new AdminPanel(
      admin,
      this.ctx.content,
      () => ({
        build: admin.build,
        device: navigator.userAgent,
        viewport: `${String(window.innerWidth)}×${String(window.innerHeight)} @${String(
          Math.round(window.devicePixelRatio * 100) / 100,
        )}x · ${this.ctx.prefs.tier} tier`,
      }),
      {
        ...(data.view === 'list' && data.range !== undefined ? { onRange: data.range } : {}),
        onView: (view, selected) => {
          if (hook) {
            hook.scene = 'admin';
            hook.admin = { view, selected, entries: admin.entries.length };
          }
        },
      },
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      panel.destroy();
    });
    const entry = admin.setup?.entry;
    if (data.view === 'play' && entry !== undefined) {
      const start = data.start;
      panel.showPlay(entry, (pointerType) => {
        this.scene.stop();
        start(pointerType);
      });
    } else panel.showList();
  }
}
