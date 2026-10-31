// D-045 Project overview on the web build's admin page: [Project overview] loads its lazy chunk
// and the project log (served here from tests/e2e/fixtures/project-log.json with page.route on
// the raw.githubusercontent.com URL; pictures from the repo's own files or a small local PNG, so
// the test never touches the network). The Overview shows the needs-you count and an ETA, every
// tab renders, a Roadmap row expands to its checklist, a History picture opens in the lightbox and
// closes, Back returns to the admin list, `?admin=1&project=1` opens it directly, and a failed
// load shows the error, Retry recovers, and the offline copy shows when the log can't be loaded.
// Mouse on desktop, touch on phones. Screenshots of each tab go to
// docs/art-preview/compare/project-overview-<tab>-<device>.png.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors, isTouchProject } from './helpers';

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';
const ROOT = resolve(import.meta.dirname, '..', '..');
const FIXTURE = readFileSync(join(import.meta.dirname, 'fixtures', 'project-log.json'), 'utf8');
const SMALL_PNG = readFileSync(join(ROOT, 'public', 'icons', 'icon-192.png'));
const LOG_PATH = '/ShadowNam/Tarantal/project-log/project.json';
const SHOTS_DIR = join(ROOT, 'docs', 'art-preview', 'compare');
const CORS = { 'access-control-allow-origin': '*' };

/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');

// The service worker would hide the page's requests from page.route.
test.use({ serviceWorkers: 'block' });

/** What the fake raw.githubusercontent.com answers for the log. */
interface Server {
  mode: 'ok' | 'fail' | 'bad';
  requests: string[];
}

async function serve(page: Page): Promise<Server> {
  const server: Server = { mode: 'ok', requests: [] };
  const bad = JSON.stringify({
    ...(JSON.parse(FIXTURE) as Record<string, unknown>),
    jobs: [{ id: 'v1', title: 'x', status: 'finished' }],
  });
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === LOG_PATH) {
      server.requests.push(url.href);
      if (server.mode === 'fail')
        return route.fulfill({ status: 500, headers: CORS, body: 'server error' });
      return route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: server.mode === 'bad' ? bad : FIXTURE,
      });
    }
    // Pictures: …/<branch>/<path> from this checkout when it has the file; `missing-*` is a
    // picture that is not there (404); anything else a small PNG.
    if (url.pathname.includes('/missing-')) return route.fulfill({ status: 404, body: '' });
    const m = /^\/ShadowNam\/Tarantal\/[^/]+\/(.+)$/.exec(url.pathname);
    const local = m?.[1] === undefined ? null : resolve(ROOT, decodeURIComponent(m[1]));
    if (local !== null && local.startsWith(ROOT + sep) && existsSync(local))
      return route.fulfill({ path: local });
    return route.fulfill({ status: 200, contentType: 'image/png', body: SMALL_PNG });
  });
  return server;
}

/** Console errors other than the deliberate 404 picture and 500 log. */
function unexpected(errors: readonly string[]): string[] {
  return errors.filter(
    (e) => !/Failed to load resource: the server responded with a status of (404|500)/.test(e),
  );
}

/** Clicks (desktop) or taps (touch). */
async function press(touch: boolean, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  if (touch) await target.tap();
  else await target.click();
}

async function openAdmin(page: Page, query = ''): Promise<void> {
  await page.goto(`/?e2e=1&reenbui=0&admin=1${query}`);
  await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
    timeout: 90_000,
  });
}

/** Waits for the pictures on screen (lazy ones off screen are not asked for). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('#tm-project img')].every((img) => {
        const r = img.getBoundingClientRect();
        const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
        return !onScreen || img.complete;
      }),
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(250);
}

async function shot(page: Page, tab: string, project: string): Promise<void> {
  await settle(page);
  writeFileSync(
    join(SHOTS_DIR, `project-overview-${tab}-${device(project)}.png`),
    await page.screenshot(),
  );
}

/** Every visible button, tab and fold line in the page is at least 44 × 44 CSS px. */
async function expectTapTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '#tm-project button, #tm-project summary, #tm-project a.lnk',
      ),
    ]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ b, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
      .map(
        ({ b, r }) => `${b.dataset['action'] ?? b.tagName} ${String(r.width)}×${String(r.height)}`,
      ),
  );
  expect(small).toEqual([]);
}

async function selectTab(page: Page, touch: boolean, tab: string): Promise<void> {
  await press(touch, page.locator(`#tm-project .tab[data-tab=${tab}]`));
  await expect(page.locator('#tm-project')).toHaveAttribute('data-tab', tab);
}

test.describe('Project overview (D-045)', () => {
  test.skip(PLATFORM !== 'web', 'web build only (portal builds carry no admin page)');

  test('from the admin page: every tab, a roadmap row, the lightbox, and back', async ({
    page,
  }, info) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    const name = info.project.name;
    const server = await serve(page);
    await openAdmin(page);

    // The admin header's button loads the chunk and the log.
    const button = page.locator('#tm-admin [data-action=project]');
    await expect(button).toBeVisible();
    await press(touch, button);
    const root = page.locator('#tm-project');
    await expect(root).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#tm-admin')).toBeHidden();
    expect(page.url()).toContain('project=1');
    expect(server.requests[0]).toMatch(/\/project\.json\?t=\d+$/);

    // Header: the log's time in Namibia (UTC+2) and the test build.
    const meta = root.locator('[data-role=meta]');
    await expect(meta).toContainText('Updated 25 Oct, 20:20 (Namibia time)');
    await expect(meta).toContainText('1.6.0 · 4bd39f1');

    // Overview: two open questions (newest first), the running job's ETA and progress.
    await expect(root.locator('[data-role=needs-count]')).toHaveText('2');
    await expect(root.locator('.tab[data-tab=overview] .badge')).toHaveText('2');
    await expect(root.locator('[data-role=needs] > [data-need]')).toHaveCount(2);
    await expect(root.locator('[data-role=needs] > [data-need]').first()).toHaveAttribute(
      'data-need',
      'n-meerkat-look',
    );
    await expect(root.locator('[data-need=n-blikkies-cans] ol.opts li')).toHaveCount(3);
    await expect(root.locator('[data-need=n-blikkies-cans]')).toContainText(
      'holds up v1.8 · Blikkies',
    );
    const building = root.locator('[data-role=now] [data-job="v1.7c"]');
    await expect(building.locator('[data-role=eta]')).toContainText('expected 25 Oct, ~21:00');
    await expect(building.locator('[data-role=progress]')).toContainText('7 of 9');
    await expect(root.locator('[data-role=now] [data-job]')).toHaveCount(4);
    await expect(root.locator('[data-role=next] [data-job]')).toHaveCount(3);
    await expect(root.locator('[data-role=next] [data-job="v1.7b"]')).toContainText(
      'expected 26 Oct, 02:30–06:00',
    );
    await expect(root.locator('[data-role=done] [data-job]')).toHaveCount(5);
    await expect(root.locator('[data-role=done] [data-job]').first()).toContainText(
      'merged 25 Oct, 18:10',
    );
    await expect(root.locator('[data-role=numbers] .num')).toHaveCount(6);
    await expect(root.locator('[data-role=activity] li')).toHaveCount(7);
    // The link to a host off the allowlist was dropped; every link opens a new tab safely.
    await expect(root.locator('[data-role=links] a')).toHaveCount(5);
    await expect(root.locator('a[href*="example.com"]')).toHaveCount(0);
    const unsafe = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('#tm-project a')]
        .filter((a) => a.target !== '_blank' || a.rel !== 'noopener noreferrer')
        .map((a) => a.href),
    );
    expect(unsafe).toEqual([]);
    await expectTapTargets(page);
    await shot(page, 'overview', name);

    // Roadmap: every job in its group; a row expands to its checklist.
    await selectTab(page, touch, 'roadmap');
    await expect(root.locator('[data-role=group-done] .jrow')).toHaveCount(5);
    await expect(root.locator('[data-role=group-active] .jrow')).toHaveCount(4);
    await expect(root.locator('[data-role=group-planned] .jrow')).toHaveCount(4);
    await expect(root.locator('.jrow[data-job="v1.6"] a[data-pr="70"]')).toHaveAttribute(
      'href',
      'https://github.com/ShadowNam/Tarantal/pull/70',
    );
    const row = root.locator('.jrow[data-job="v1.7c"]');
    await expect(row.locator('[data-role=checklist]')).toBeHidden();
    await press(touch, row.locator('[data-action=expand]'));
    await expect(row.locator('[data-action=expand]')).toHaveAttribute('aria-expanded', 'true');
    await expect(row.locator('[data-role=checklist] li')).toHaveCount(9);
    await expect(row.locator('[data-role=checklist] li.on')).toHaveCount(7);
    await expect(row).toContainText('asked for by Product owner, 25 Oct 19:55');
    await expectTapTargets(page);
    await shot(page, 'roadmap', name);

    // History: newest stage first, with its gallery; a picture opens in the lightbox.
    await selectTab(page, touch, 'history');
    await expect(root.locator('.hstage')).toHaveCount(2);
    await expect(root.locator('.hstage').first()).toContainText('v1.6 Veld art');
    await expect(root.locator('[data-role=evolution] .fig')).toHaveCount(4);
    await shot(page, 'history', name);
    const thumbs = root.locator('.hstage').first().locator('[data-action=image]');
    await expect(thumbs).toHaveCount(4);
    await press(touch, thumbs.first());
    const lb = root.locator('[data-role=lightbox]');
    await expect(lb).toBeVisible();
    await expect(lb.locator('[data-role=lb-caption]')).toHaveText(
      'Before | after on a phone: the Karoo windmill.',
    );
    await expect(lb.locator('[data-role=lb-count]')).toHaveText('1 of 4');
    await expect(root).toHaveClass(/lb-open/);
    expect(await root.locator('.body').evaluate((b) => getComputedStyle(b).overflowY)).toBe(
      'hidden',
    );
    await press(touch, lb.locator('[data-action=lb-next]'));
    await expect(lb.locator('[data-role=lb-count]')).toHaveText('2 of 4');
    await expect(lb.locator('[data-role=lb-caption]')).toHaveText(
      'Before | after: far giraffes through the scope.',
    );
    await expect(lb.locator('img')).toHaveJSProperty('complete', true);
    await shot(page, 'lightbox', name);
    if (touch) await press(touch, lb.locator('[data-action=lb-close]'));
    else await page.keyboard.press('Escape');
    await expect(lb).toBeHidden();
    await expect(root).not.toHaveClass(/lb-open/);
    // A picture that is not on the server shows its caption in a box, not a broken icon.
    const missing = root.locator('.fig', { hasText: 'A picture that is not on the server yet' });
    await missing.scrollIntoViewIfNeeded();
    await expect(missing).toHaveClass(/is-broken/);
    await expect(missing.locator('.broken')).toHaveText(
      'A picture that is not on the server yet (shows this caption instead).',
    );
    // Decisions and the glossary are folded away until asked for.
    const decisions = root.locator('[data-role=decisions]');
    await expect(decisions.locator('dt').first()).toBeHidden();
    await press(touch, decisions.locator('summary'));
    await expect(decisions.locator('dt')).toHaveCount(5);
    await expect(decisions.locator('dt').first()).toBeVisible();

    // Requests: newest first, with the job that answers each.
    await selectTab(page, touch, 'requests');
    await expect(root.locator('.req')).toHaveCount(5);
    await expect(root.locator('.req').first()).toContainText('25 Oct, 19:55');
    await expect(root.locator('.req').first().locator('[data-job="v1.7c"]')).toContainText(
      'Building',
    );
    await shot(page, 'requests', name);

    // Ideas: grouped by status.
    await selectTab(page, touch, 'ideas');
    for (const [status, n] of [
      ['idea', 2],
      ['queued', 1],
      ['done', 1],
      ['declined', 1],
    ] as const)
      await expect(root.locator(`[data-role=ideas-${status}] .idea`)).toHaveCount(n);
    await expect(root.locator('[data-idea=s-night]')).toContainText('from Claude · 25 Oct, 17:00');
    await shot(page, 'ideas', name);

    // Back to the admin list (and the bookmark parameter goes).
    await press(touch, root.locator('[data-action=back]'));
    await expect(page.locator('#tm-project')).toHaveCount(0);
    await expect(page.locator('#tm-admin')).toBeVisible();
    await expect(page.locator('#tm-admin .list [data-entry]').first()).toBeVisible();
    expect(page.url()).not.toContain('project=1');
    expect(unexpected(errors)).toEqual([]);
  });

  test('?admin=1&project=1 opens it directly; errors, Retry and the offline copy', async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    const server = await serve(page);

    // The first load fails: a friendly message, the reason, Retry; no copy on this device yet.
    server.mode = 'fail';
    await openAdmin(page, '&project=1');
    const root = page.locator('#tm-project');
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
    await expect(page.locator('#tm-admin')).toBeHidden();
    const alert = root.locator('[data-role=error]');
    await expect(alert).toContainText('The project log could not be loaded');
    await expect(alert.locator('code')).toHaveText('HTTP 500');
    await expect(root.locator('[data-role=offline]')).toHaveCount(0);
    await expect(root.locator('.tabs')).toBeHidden();

    // Retry recovers.
    server.mode = 'ok';
    await press(touch, alert.locator('[data-action=retry]'));
    await expect(root).toHaveAttribute('data-state', 'ready');
    await expect(root.locator('[data-role=error]')).toHaveCount(0);
    await expect(root.locator('[data-role=needs-count]')).toHaveText('2');

    // A refresh that fails keeps what is on screen, marked as an offline copy.
    server.mode = 'fail';
    await press(touch, root.locator('[data-action=refresh]'));
    await expect(root).toHaveAttribute('data-state', 'error');
    await expect(root).toHaveAttribute('data-offline', '1');
    await expect(root.locator('[data-role=offline]')).toContainText('Offline copy from');
    await expect(root.locator('[data-role=needs-count]')).toHaveText('2');

    // A new visit while the log can't be loaded shows the copy saved on this device.
    await page.reload();
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 90_000,
    });
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
    await expect(root).toHaveAttribute('data-offline', '1');
    await expect(root.locator('[data-role=offline]')).toContainText('Offline copy from');
    await expect(root.locator('[data-job="v1.7c"] [data-role=eta]')).toContainText('~21:00');
    await shot(page, 'offline', info.project.name);

    // A file that breaks the schema: "could not be read" and the first problem, small.
    server.mode = 'bad';
    await press(touch, root.locator('[data-role=error] [data-action=retry]'));
    await expect(root.locator('[data-role=error]')).toContainText(
      'The project log could not be read',
    );
    await expect(root.locator('[data-role=error] code')).toContainText('jobs[0].status');
    await expect(root).toHaveAttribute('data-offline', '1');

    // And back to a good file.
    server.mode = 'ok';
    await press(touch, root.locator('[data-action=refresh]'));
    await expect(root).toHaveAttribute('data-state', 'ready');
    await expect(root).toHaveAttribute('data-offline', '0');
    expect(unexpected(errors)).toEqual([]);
  });
});
