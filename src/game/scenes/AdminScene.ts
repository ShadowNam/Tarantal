// v1.2x (D-034) playtest admin page, opened instead of the title by `?admin=1` on builds whose
// PlatformAdapter allows it (web only). The page itself is a DOM panel (AdminPanel) over the live
// panorama; this scene only owns its lifetime, and (D-045) that of the Project overview over it.
import * as Phaser from 'phaser';
import { t } from '../../i18n/i18n';
import { freshLoadShown } from '../../platform/freshLoad';
import type { AdminPanel } from '../admin/AdminPanel';
import { projectHref, projectRequested } from '../admin/adminProject';
import type { GameContext } from '../GameContext';
import type { ProjectOverviewHandle } from '../project/ProjectOverview';

export type AdminData =
  /** `range` opens the Skietbaan (D-037). */
  | { readonly view: 'list'; readonly range?: () => void }
  | { readonly view: 'play'; readonly start: (pointerType: string) => void };

/** Keeps `project=1` in the address while the overview is open (a reload lands back on it). */
function setProjectParam(open: boolean): void {
  try {
    window.history.replaceState(window.history.state, '', projectHref(window.location.href, open));
  } catch {
    // A sandboxed frame may refuse: only the bookmark is lost.
  }
}

export class AdminScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  /** D-045: the open Project overview, and whether its chunk is loading (one at a time). */
  private project: ProjectOverviewHandle | null = null;
  private projectLoading = false;
  /** Bumped on every create: a chunk that arrives for an earlier page is dropped. */
  private visit = 0;

  constructor(ctx: GameContext) {
    super({ key: 'Admin' });
    this.ctx = ctx;
  }

  create(data: AdminData): void {
    const admin = this.ctx.admin;
    if (admin === null) return;
    this.visit++;
    this.project = null;
    this.projectLoading = false;
    const hook = this.ctx.hook;
    // D-045: the Project overview is where the Skietbaan's Fresh load is: the web build's admin
    // page (dev server, GitHub Pages), on the list page; never in a portal build.
    const projectOn = data.view === 'list' && freshLoadShown(this.ctx.platform);
    // 1.9.3 (D-056): the panel is its own lazy chunk (playtest builds only open it), so the
    // first download doesn't carry it.
    const visit = this.visit;
    let shown: AdminPanel | null = null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.project?.destroy();
      this.project = null;
      shown?.destroy();
      shown = null;
    });
    const open = (): void => {
      import('../admin/AdminPanel').then(
        (m) => {
          if (visit !== this.visit || !this.sys.isActive()) return;
          const panel = new m.AdminPanel(
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
              ...(projectOn
                ? {
                    onProject: () => {
                      this.openProject(panel);
                    },
                  }
                : {}),
              onView: (view, selected) => {
                if (hook) {
                  hook.scene = 'admin';
                  hook.admin = { view, selected, entries: admin.entries.length };
                }
              },
            },
          );
          const entry = admin.setup?.entry;
          if (data.view === 'play' && entry !== undefined) {
            const start = data.start;
            panel.showPlay(entry, (pointerType) => {
              this.scene.stop();
              start(pointerType);
            });
          } else {
            panel.showList();
            // `?admin=1&project=1`: straight to the overview (a bookmark).
            if (projectOn && projectRequested(window.location.search)) this.openProject(panel);
          }
          shown = panel;
        },
        () => {
          // Review M7: the chunk didn't arrive (offline): say so, with a Retry.
          if (visit === this.visit && this.sys.isActive()) this.chunkFailed(open);
        },
      );
    };
    open();
  }

  /** Review M7: the admin panel's chunk failed to load: a line and a Retry over the page. */
  private chunkFailed(retry: () => void): void {
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;inset:auto 0 40% 0;margin:auto;width:min(90vw,560px);padding:20px;' +
      'background:#2b2622;color:#f2ead8;font:600 18px sans-serif;text-align:center;' +
      'border-radius:12px;z-index:20';
    box.textContent = t('privacy.load_failed');
    const btn = document.createElement('button');
    btn.textContent = t('ui.retry');
    btn.style.cssText = 'display:block;margin:14px auto 0;padding:10px 28px;font:inherit';
    btn.addEventListener('click', () => {
      box.remove();
      retry();
    });
    box.appendChild(btn);
    document.body.appendChild(box);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      box.remove();
    });
  }

  /** D-045: the Project overview, from its lazy chunk (admin page builds only). */
  private openProject(panel: AdminPanel): void {
    // Builds with the admin page only (the PlatformAdapter's adminPage: web). Compared against
    // the raw flag (a literal after Vite's replacement) so a portal build drops this import()
    // and its chunk altogether, like the Skietbaan's (D-037).
    const flag = import.meta.env.VITE_PLATFORM;
    if (flag === 'poki' || flag === 'crazygames' || flag === 'capacitor') return;
    if (this.project !== null || this.projectLoading) return;
    this.projectLoading = true;
    const visit = this.visit;
    import('../project/ProjectOverview').then(
      (m) => {
        if (visit !== this.visit || !this.sys.isActive()) return;
        this.projectLoading = false;
        panel.setHidden(true);
        setProjectParam(true);
        this.project = m.openProjectOverview({
          back: () => {
            this.project = null;
            setProjectParam(false);
            panel.setHidden(false);
          },
        });
      },
      (err: unknown) => {
        // The chunk didn't load (offline, a new deploy): stay on the admin list.
        if (visit === this.visit) this.projectLoading = false;
        console.warn('[project] could not load', err);
      },
    );
  }
}
