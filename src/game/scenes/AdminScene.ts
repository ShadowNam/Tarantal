// v1.2x (D-034) playtest admin page, opened instead of the title by `?admin=1` on builds whose
// PlatformAdapter allows it (web only). The page itself is a DOM panel (AdminPanel) over the live
// panorama; this scene only owns its lifetime, and (D-045) that of the Project overview over it.
import * as Phaser from 'phaser';
import { freshLoadShown } from '../../platform/freshLoad';
import { AdminPanel } from '../admin/AdminPanel';
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.project?.destroy();
      this.project = null;
      panel.destroy();
    });
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
  }

  /** D-045: the Project overview, from its lazy chunk (admin page builds only). */
  private openProject(panel: AdminPanel): void {
    // Builds with the admin page only (the PlatformAdapter's adminPage: web). Compared against
    // the raw flag (a literal after Vite's replacement) so a portal build drops this import()
    // and its chunk altogether, like the Skietbaan's (D-037).
    const flag = import.meta.env.VITE_PLATFORM;
    if (flag === 'poki' || flag === 'crazygames') return;
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
