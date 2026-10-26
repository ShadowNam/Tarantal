// v1.2x admin page (D-034): what an admin [Play] turns into at boot. The admin page stores the
// chosen entry and options, then reloads with `?admin=1&play=1`; main.ts applies this setup the
// way the e2e URL parameters are applied (content, biome, map, seed, gun, length, omen, date), so
// the hunt runs through the normal code paths. Pure.
import type { ContentBundle } from '../../content/schemas';
import type { AdminEntry, AdminOptions } from '../../meta/admin';
import { parseDayKey } from '../../meta/dailyCalendar';
import { withForcedEvent, withQuotaMul, withTestCrate } from '../devContent';

export interface AdminHuntSetup {
  readonly entry: AdminEntry;
  readonly options: AdminOptions;
  /** The content the hunt (and the run) uses: quotas × quotaMul, the forced event. */
  readonly content: ContentBundle;
  readonly mode: 'classic' | 'daily' | 'seasonHunt';
  readonly classicBiome: string | undefined;
  /** 'none' = the plain biome; undefined = today's layout (bonus maps). */
  readonly classicLayout: string | undefined;
  readonly classicBonus: string | undefined;
  /** A primary gun (Classic, Daily, the run's). A crate gun comes in the first crate (Classic,
   *  Daily) or as the run's rental. */
  readonly weapon: string | undefined;
  /** v1.3: a rifle's sight (any sight that fits it, locked or not). */
  readonly sight: string | undefined;
  readonly runRental: string | undefined;
  readonly seed: number | undefined;
  readonly huntSeconds: number | undefined;
  readonly omen: boolean | undefined;
  /** UTC day number the Daily plays (undefined = today). */
  readonly today: number | undefined;
  /** D-048: the special day the Daily plays (undefined = the date decides). */
  readonly feesdag: string | undefined;
  /** Season Run: the run's hunt index to jump to. */
  readonly huntIndex: number | undefined;
}

export function adminHuntSetup(
  entry: AdminEntry,
  options: AdminOptions,
  bundle: ContentBundle,
): AdminHuntSetup {
  let content = bundle;
  if (options.quotaMul !== 1) content = withQuotaMul(content, options.quotaMul);
  if (options.event !== null) content = withForcedEvent(content, options.event);
  const gun = content.weapons.weapons.find((w) => w.id === options.weapon);
  const season = entry.kind === 'season';
  // A crate gun is never a primary: Classic and Daily drop it in the first crate, early.
  if (!season && gun?.kind === 'crate') content = withTestCrate(content, gun.id);
  return {
    entry,
    options,
    content,
    mode: season ? 'seasonHunt' : entry.kind,
    classicBiome: entry.kind === 'classic' ? (entry.biome ?? undefined) : undefined,
    classicLayout: entry.kind === 'classic' ? (entry.layout ?? undefined) : undefined,
    classicBonus: entry.kind === 'classic' ? (entry.bonus ?? undefined) : undefined,
    weapon: gun === undefined || gun.kind === 'crate' ? undefined : gun.id,
    sight: options.sight ?? undefined,
    runRental: season && gun?.kind === 'crate' ? gun.id : undefined,
    seed: options.seed ?? undefined,
    huntSeconds: options.huntSeconds ?? undefined,
    omen: options.omen === 'default' ? undefined : options.omen === 'on',
    today:
      entry.kind === 'daily' && options.date !== null
        ? (parseDayKey(options.date) ?? undefined)
        : undefined,
    huntIndex: entry.huntIndex ?? undefined,
    feesdag: entry.feesdag ?? undefined,
  };
}
