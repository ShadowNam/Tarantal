// D-045: `?admin=1&project=1` opens the admin page's Project overview directly (a bookmark). The
// page keeps the parameter in the address while the overview is open, so a reload lands back on
// it, and drops it on Back. Pure (unit-tested); the overview itself is a lazy chunk.

/** The query parameter that opens the Project overview. */
export const PROJECT_PARAM = 'project';

export function projectRequested(search: string): boolean {
  return new URLSearchParams(search).get(PROJECT_PARAM) === '1';
}

/** The page's URL with `project=1` set (open) or removed; every other parameter stays. */
export function projectHref(href: string, open: boolean): string {
  const url = new URL(href);
  if (open) url.searchParams.set(PROJECT_PARAM, '1');
  else url.searchParams.delete(PROJECT_PARAM);
  return url.href;
}
