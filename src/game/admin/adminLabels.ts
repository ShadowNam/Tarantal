// v1.2x (D-034): how the admin page names its entries, modes and guns (i18n; en is enough).
import type { ContentBundle } from '../../content/schemas';
import { fill, tOr } from '../../i18n/i18n';
import { at, atOr } from './adminI18n';
import type { AdminEntry, AdminOptions, EntryFacts } from '../../meta/admin';
import { bonusSlug } from '../../meta/bonusMaps';

function biomeName(content: ContentBundle, id: string | null): string {
  const b = content.biomes.find((x) => x.id === id);
  return b === undefined ? (id ?? '') : tOr(b.nameKey, b.id);
}

/** "Karoo · Friday", "Okavango · Plain", "Season Run · Winter · Hunt 3 (boss)", "Daily Hunt". */
export function entryLabel(e: AdminEntry, content: ContentBundle): string {
  if (e.kind === 'daily' && e.feesdag !== null) {
    const f = content.feesdae.specials.find((x) => x.id === e.feesdag);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const date = f === undefined ? '' : `${pad(f.date.day)}/${pad(f.date.month)}`;
    return fill(at('admin.feesdag_date'), { name: tOr(f?.nameKey ?? '', e.feesdag), date });
  }
  if (e.kind === 'daily') return at('admin.daily');
  if (e.kind === 'season')
    return `${tOr(`season.${e.season ?? ''}`, e.season ?? '')} · ${atOr(
      `admin.stage_${e.stage ?? ''}`,
      e.stage ?? '',
    )}`;
  const where =
    e.bonus !== null
      ? tOr(`map.${bonusSlug(e.bonus)}`, e.bonus)
      : e.layout === 'none' || e.layout === null
        ? at('admin.plain')
        : tOr(`map.day.${e.layout}`, e.layout);
  return `${biomeName(content, e.biome)} · ${where}`;
}

/** The entry's group heading in the list. */
export function groupLabel(e: AdminEntry, content: ContentBundle): string {
  if (e.kind === 'daily' && e.feesdag !== null) return at('admin.group_feesdae');
  if (e.kind === 'daily') return at('admin.group_daily');
  if (e.kind === 'season') return at('admin.group_season');
  return biomeName(content, e.biome);
}

export function gunLabel(content: ContentBundle, id: string): string {
  const w = content.weapons.weapons.find((x) => x.id === id);
  const name = tOr(`weapon.${id}`, id);
  return w?.kind === 'crate' ? `${name} ${at('admin.crate_tag')}` : name;
}

export function modeOf(e: AdminEntry): string {
  return e.kind === 'season' ? 'seasonHunt' : e.kind;
}

/** The report/issue facts of an entry: the last admin hunt's seed and gun, else the options. */
export function entryFacts(
  e: AdminEntry,
  content: ContentBundle,
  options: AdminOptions,
  played: { seed: number; gun: string } | undefined,
): EntryFacts {
  const gun = played?.gun ?? options.weapon;
  const seed = played?.seed ?? options.seed;
  return {
    id: e.id,
    label: entryLabel(e, content),
    mode: modeOf(e),
    gun: gun === null ? 'default' : gun,
    seed: seed === null ? 'random' : String(seed),
  };
}
