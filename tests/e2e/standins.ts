// M10: serves the stand-in delivery (tools/make-standins.ts → tests/fixtures/standin-assets/) in
// place of the build's assets/, as if it had been packed into public/assets/. Never in a build.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const STANDIN = join(import.meta.dirname, '..', 'fixtures', 'standin-assets');

/** Routes assets/** to the stand-ins where a file exists; `broken` paths answer 404. Returns the
 *  list of stand-in paths served (filled as the page loads them). */
/** Rewrites a served JSON file (atlas data) before the game sees it. */
export type JsonEdit = { readonly match: RegExp; readonly edit: (json: unknown) => unknown };

export async function serveStandins(
  page: Page,
  broken: RegExp | null = null,
  jsonEdit: JsonEdit | null = null,
): Promise<string[]> {
  const served: string[] = [];
  await page.route('**/assets/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const rel = path.slice(path.indexOf('/assets/') + 1);
    const file = join(STANDIN, rel);
    if (!existsSync(file)) return route.fallback();
    if (broken?.test(rel)) return route.fulfill({ status: 404, body: '' });
    served.push(rel);
    if (jsonEdit?.match.test(rel)) {
      const body = JSON.stringify(jsonEdit.edit(JSON.parse(readFileSync(file, 'utf8'))));
      return route.fulfill({ body, contentType: 'application/json' });
    }
    return route.fulfill({ path: file });
  });
  return served;
}
