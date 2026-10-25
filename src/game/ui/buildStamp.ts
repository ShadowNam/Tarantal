// v1.6 (D-042, product owner 25 Oct: "every level/map had a small version number so I can see
// which build this map is"): the build stamp, e.g. "v1.6.0 · 1219b9d · 25 Oct 08:40 · Karoo
// Farm · Tue · art ok". The version, short commit and UTC build time come from Vite `define`
// (vite.config.ts); the area, weekday and art status from the screen showing it.

export interface BuildInfo {
  readonly version: string;
  readonly sha: string;
  /** UTC, ISO 8601 to the minute ("2026-10-25T08:40"), or '' when unknown. */
  readonly time: string;
}

/** The build's facts (safe outside a Vite build, e.g. in unit tests). */
export function buildInfo(): BuildInfo {
  return {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
    sha: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev',
    time: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-25T08:40" → "25 Oct 08:40" (UTC as built; '' stays ''). */
export function formatBuildTime(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (m === null) return '';
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${String(Number(m[3]))} ${month ?? ''} ${m[4] ?? ''}:${m[5] ?? ''}`;
}

/** The build part: "v1.6.0 · 1219b9d · 25 Oct 08:40". */
export function buildLine(info: BuildInfo): string {
  const time = formatBuildTime(info.time);
  return [`v${info.version}`, info.sha, ...(time === '' ? [] : [time])].join(' · ');
}

/** The whole stamp: the build, then the screen's area, weekday and art status (when given). */
export function stampText(
  info: BuildInfo,
  where: { readonly area?: string; readonly day?: string; readonly art?: string } = {},
): string {
  return [buildLine(info), where.area, where.day, where.art]
    .filter((s): s is string => s !== undefined && s !== '')
    .join(' · ');
}

/** The weekday key (map.day.*) of a UTC day number (day 0 = 1 Jan 1970, a Thursday). */
export function weekdayKey(day: number): string {
  const days = ['thu', 'fri', 'sat', 'sun', 'mon', 'tue', 'wed'];
  return days[((Math.floor(day) % 7) + 7) % 7] ?? 'mon';
}

/** An area's short name: its title without the season ("Karoo Farm — Autumn" → "Karoo Farm"). */
export function shortArea(name: string): string {
  return name.split(' — ')[0]?.trim() ?? name;
}
