// D-045 Project overview: a full-screen DOM page over the admin page (`#tm-project`) that shows
// the project log the supervisor publishes on the `project-log` branch: what needs the product
// owner, what is being built and when, the roadmap, the history with its pictures, requests and
// ideas. Its code and strings are this lazy chunk (AdminScene imports it on the web build's admin
// page only). The last log that loaded is kept on the device (src/meta/storage.ts) and shown,
// marked as an offline copy, when a load fails. Times are Namibia time.
import {
  CACHE_KEY,
  decodeCache,
  encodeCache,
  formatNamibia,
  openNeeds,
  parseProjectLog,
  projectDataUrl,
  withCacheBuster,
  type ProjectLog,
} from '../../meta/projectLog';
import { readText, writeText } from '../../meta/storage';
import { Lightbox } from './Lightbox';
import { button, el } from './projectDom';
import { pf, pt } from './projectI18n';
import { PROJECT_CSS } from './projectStyle';
import { renderTab, TAB_KEYS, TABS, type TabId } from './projectTabs';

const STYLE_ID = 'tm-project-style';
/** A load that has not answered by then counts as failed (the offline copy shows instead). */
const FETCH_TIMEOUT_MS = 15_000;

export interface ProjectOverviewOptions {
  /** Back to the admin page (the overview has already removed itself). */
  readonly back: () => void;
}

export interface ProjectOverviewHandle {
  /** Removes the page (the admin scene shut down). */
  destroy(): void;
}

/** The log on screen: fresh from the network, or an older copy after a failed load. */
interface Shown {
  readonly log: ProjectLog;
  readonly fresh: boolean;
  /** When this copy loaded (ISO). */
  readonly savedAt: string;
}

/** Why the last load failed: no answer / an HTTP error, or a file that is not a valid log. */
interface Failure {
  readonly kind: 'load' | 'read';
  readonly detail: string;
}

type LoadResult =
  { readonly ok: true; readonly log: ProjectLog } | ({ readonly ok: false } & Failure);

async function fetchLog(url: string): Promise<LoadResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => {
    ctrl.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(withCacheBuster(url, Date.now()), {
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, kind: 'load', detail: `HTTP ${String(res.status)}` };
    const r = parseProjectLog(await res.text());
    return r.ok ? r : { ok: false, kind: 'read', detail: r.issue };
  } catch (e) {
    return { ok: false, kind: 'load', detail: e instanceof Error ? e.message : String(e) };
  } finally {
    window.clearTimeout(timer);
  }
}

export function openProjectOverview(opts: ProjectOverviewOptions): ProjectOverviewHandle {
  const page = new ProjectOverview(opts);
  void page.load();
  return page;
}

class ProjectOverview implements ProjectOverviewHandle {
  private readonly root: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly body: HTMLElement;
  private readonly refresh: HTMLButtonElement;
  private readonly tabs = new Map<TabId, HTMLButtonElement>();
  private readonly lightbox: Lightbox;
  private readonly url = projectDataUrl(window.location.search);
  private tab: TabId = 'overview';
  private shown: Shown | null = null;
  private failure: Failure | null = null;
  private loading = false;
  private destroyed = false;

  constructor(private readonly opts: ProjectOverviewOptions) {
    if (document.getElementById(STYLE_ID) === null)
      document.head.appendChild(el('style', { id: STYLE_ID, textContent: PROJECT_CSS }));
    this.root = el('div', { id: 'tm-project', tabIndex: -1 });
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', pt('project.title'));
    this.root.addEventListener('keydown', (e) => {
      // Keys here are not game keys (the admin page does the same).
      e.stopPropagation();
      if (this.lightbox.handleKey(e)) e.preventDefault();
    });

    this.meta = el('span', { className: 'meta', dataset: { role: 'meta' } });
    this.refresh = button(this.labels('project.refresh', '↻'), 'refresh', () => {
      void this.load();
    });
    this.refresh.setAttribute('aria-label', pt('project.refresh'));
    const back = button(
      this.labels('project.back', `‹ ${pt('project.back_short')}`),
      'back',
      () => {
        this.destroy();
        this.opts.back();
      },
    );
    back.setAttribute('aria-label', pt('project.back'));
    this.nav = el('nav', { className: 'tabs' });
    this.nav.setAttribute('role', 'tablist');
    this.nav.addEventListener('keydown', (e) => {
      this.tabKey(e);
    });
    for (const id of TABS) {
      const b = button(
        pt(TAB_KEYS[id]),
        'tab',
        () => {
          this.select(id);
        },
        'tab',
      );
      b.dataset['tab'] = id;
      b.id = `tm-project-tab-${id}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'tm-project-body');
      this.tabs.set(id, b);
      this.nav.append(b);
    }
    this.body = el('div', { className: 'body', id: 'tm-project-body', dataset: { role: 'body' } });
    this.body.setAttribute('role', 'tabpanel');
    this.root.append(
      el(
        'div',
        { className: 'top' },
        el('div', { className: 'ttl' }, el('h1', { textContent: pt('project.title') }), this.meta),
        this.nav,
        el('div', { className: 'acts' }, this.refresh, back),
      ),
      this.body,
    );
    this.lightbox = new Lightbox(this.root);
    document.body.appendChild(this.root);
    this.root.focus({ preventScroll: true });
    this.render(true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lightbox.close();
    this.root.remove();
  }

  private isGone(): boolean {
    return this.destroyed;
  }

  /** A button label with a long form and a short one for phones (CSS picks). */
  private labels(key: 'project.refresh' | 'project.back', short: string): Node[] {
    return [
      el('span', { className: 'long', textContent: pt(key) }),
      el('span', { className: 'short', textContent: short }),
    ];
  }

  async load(): Promise<void> {
    if (this.loading || this.destroyed) return;
    this.loading = true;
    this.render(false);
    const r = await fetchLog(this.url);
    this.loading = false;
    // Back may have been pressed while the log was loading.
    if (this.isGone()) return;
    const now = new Date().toISOString();
    if (r.ok) {
      this.shown = { log: r.log, fresh: true, savedAt: now };
      this.failure = null;
      writeText(CACHE_KEY, encodeCache(now, r.log));
    } else {
      this.failure = { kind: r.kind, detail: r.detail };
      if (this.shown !== null) this.shown = { ...this.shown, fresh: false };
      else {
        const copy = decodeCache(readText(CACHE_KEY));
        if (copy !== null) this.shown = { log: copy.log, fresh: false, savedAt: copy.savedAt };
      }
      console.warn('[project] the project log did not load:', r.detail);
    }
    this.render(false);
  }

  private select(tab: TabId): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.render(true);
    this.tabs.get(tab)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Left/Right/Home/End move between tabs (ARIA tabs pattern). */
  private tabKey(e: KeyboardEvent): void {
    const i = TABS.indexOf(this.tab);
    const to =
      e.key === 'ArrowRight'
        ? TABS[(i + 1) % TABS.length]
        : e.key === 'ArrowLeft'
          ? TABS[(i - 1 + TABS.length) % TABS.length]
          : e.key === 'Home'
            ? TABS[0]
            : e.key === 'End'
              ? TABS[TABS.length - 1]
              : undefined;
    if (to === undefined) return;
    e.preventDefault();
    this.select(to);
    this.tabs.get(to)?.focus();
  }

  /** Redraws the header and the body (`top`: also scroll the body back to the top). */
  private render(top: boolean): void {
    const shown = this.shown;
    this.root.dataset['state'] = this.loading
      ? 'loading'
      : this.failure !== null
        ? 'error'
        : 'ready';
    this.root.dataset['offline'] = shown !== null && !shown.fresh ? '1' : '0';
    this.root.dataset['tab'] = this.tab;
    this.refresh.disabled = this.loading;

    // Header: when the log was written, and what the test build runs.
    if (shown === null) this.meta.textContent = this.loading ? pt('project.loading') : '';
    else {
      const { log } = shown;
      this.meta.replaceChildren(
        el('b', { textContent: pf('project.updated', { when: formatNamibia(log.updated) }) }),
        el('span', { className: 'sep', textContent: ' · ' }),
        el('span', {
          className: 'bld',
          textContent: pf('project.build', {
            version: log.current.version,
            commit: log.current.commit,
          }),
        }),
      );
    }
    this.nav.hidden = shown === null;
    const open = shown === null ? 0 : openNeeds(shown.log).length;
    for (const [id, b] of this.tabs) {
      b.setAttribute('aria-selected', String(id === this.tab));
      b.tabIndex = id === this.tab ? 0 : -1;
      b.textContent = pt(TAB_KEYS[id]);
      if (id === 'overview' && open > 0) {
        const badge = el('span', { className: 'badge', textContent: String(open) });
        badge.setAttribute('aria-label', pf('project.needs_open', { n: open }));
        b.append(badge);
      }
    }
    this.body.setAttribute('aria-labelledby', `tm-project-tab-${this.tab}`);

    const wrap = el('div', { className: 'wrap' });
    if (this.failure !== null) wrap.append(this.alert(this.failure, shown));
    if (shown !== null)
      wrap.append(
        renderTab(this.tab, {
          log: shown.log,
          show: (images, index, from) => {
            this.lightbox.open(images, index, from);
          },
        }),
      );
    else if (this.loading)
      wrap.append(
        el(
          'div',
          { className: 'loading', dataset: { role: 'loading' } },
          el('span', { className: 'spin' }),
          pt('project.loading'),
        ),
      );
    const scroll = this.body.scrollTop;
    this.body.replaceChildren(wrap);
    this.body.scrollTop = top ? 0 : scroll;
  }

  /** The failed load: what went wrong, the offline copy's age, and Retry. */
  private alert(f: Failure, shown: Shown | null): HTMLElement {
    const box = el(
      'div',
      { className: 'alert', dataset: { role: 'error', kind: f.kind } },
      el('strong', {
        textContent: pt(f.kind === 'read' ? 'project.read_failed' : 'project.load_failed'),
      }),
      el('code', { textContent: f.detail }),
    );
    box.setAttribute('role', 'alert');
    const row = el('div', { className: 'row' });
    if (shown !== null)
      row.append(
        el('span', {
          className: 'offline',
          textContent: pf('project.offline', { when: formatNamibia(shown.savedAt) }),
          dataset: { role: 'offline' },
        }),
      );
    const retry = button(pt('project.retry'), 'retry', () => {
      void this.load();
    });
    retry.disabled = this.loading;
    row.append(retry);
    box.append(row);
    return box;
  }
}
