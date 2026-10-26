// v1.3x (D-037) Skietbaan: names of the choices and the plain-text lines of the stats (the
// overlay shows them; "Copy report" joins them). Text through i18n keys; pure apart from the
// language the tables are in.
import type { ContentBundle } from '../../content/schemas';
import { fill, t, tOr } from '../../i18n/i18n';
import type { PlaneId, RangeTarget } from '../../sim/types';
import { bodyWidthPx, rangeGuns, type RangeGun } from './rangeGuns';
import { rt } from './rangeI18n';
import {
  groupStats,
  hitRate,
  misses,
  pctOfBody,
  pelletsPerShot,
  type RangeCell,
} from './rangeStats';

const one = (n: number): string => n.toFixed(1);

export function gunName(gun: RangeGun): string {
  const name = gun.crate
    ? tOr(`item.${gun.weapon}`, gun.weapon)
    : tOr(`weapon.${gun.weapon}`, gun.weapon);
  if (gun.sight !== null) return `${name} · ${tOr(`sight.${gun.sight}`, gun.sight)}`;
  return gun.crate ? `${name} ${t('admin.crate_tag')}` : name;
}

export function gunNameById(content: ContentBundle, id: string): string {
  const gun = rangeGuns(content).find((g) => g.id === id);
  return gun === undefined ? id : gunName(gun);
}

export const distName = (plane: PlaneId | 'all'): string => rt(`range.dist_${plane}`);
export const targetName = (target: RangeTarget | 'mixed'): string => rt(`range.target_${target}`);

export function biomeName(content: ContentBundle, id: string): string {
  const b = content.biomes.find((x) => x.id === id);
  return b === undefined ? id : tOr(b.nameKey, b.id);
}

export const dayName = (layout: string): string => tOr(`map.day.${layout}`, layout);

/** "Dubbelloop · Near · Paper target". */
export function cellTitle(content: ContentBundle, c: RangeCell): string {
  return `${gunNameById(content, c.gun)} · ${distName(c.plane)} · ${targetName(c.target)}`;
}

/** What the group's percentages are of: the guineafowl's body width at that distance. */
export function bodyNote(content: ContentBundle, c: RangeCell): string {
  return fill(rt('range.body_note'), { w: one(bodyWidthPx(content, c.plane)) });
}

/** The stats lines of a cell: shots/hits, pellets (shotguns), and the group on paper. */
export function cellLines(content: ContentBundle, c: RangeCell, withNote = true): string[] {
  const lines = [
    fill(rt('range.line_shots'), {
      shots: c.shots,
      hits: c.hits,
      misses: misses(c),
      rate: one(hitRate(c) * 100),
    }),
  ];
  if (c.short > 0) lines.push(fill(rt('range.line_short'), { n: c.short, misses: misses(c) }));
  if (c.pellets > 1)
    lines.push(fill(rt('range.line_pellets'), { n: one(pelletsPerShot(c)), of: c.pellets }));
  // v1.8 (D-050): Blikkies — knock-offs per shot, air-hit accuracy, the longest chain.
  if (c.target === 'cans') {
    const k = c.cans;
    lines.push(
      fill(rt('range.line_cans_knock'), {
        knocks: k.knocks,
        shots: c.shots,
        per: (c.shots === 0 ? 0 : k.knocks / c.shots).toFixed(2),
      }),
      fill(rt('range.line_cans_air'), {
        hits: k.airHits,
        shots: k.airShots,
        rate: one(k.airShots === 0 ? 0 : (Math.min(k.airHits, k.airShots) / k.airShots) * 100),
        chain: k.bestChain,
      }),
    );
  }
  const g = groupStats(c.impacts);
  if (g !== null) {
    const w = bodyWidthPx(content, c.plane);
    lines.push(
      fill(rt('range.line_group'), {
        n: g.n,
        mr: one(g.meanRadius),
        mrp: one(pctOfBody(g.meanRadius, w)),
        es: one(g.extremeSpread),
        esp: one(pctOfBody(g.extremeSpread, w)),
      }),
      fill(rt('range.line_centre'), {
        x: one(Math.abs(g.offsetX)),
        lr: rt(g.offsetX < 0 ? 'range.left' : 'range.right'),
        y: one(Math.abs(g.offsetY)),
        ud: rt(g.offsetY < 0 ? 'range.high' : 'range.low'),
      }),
    );
    if (withNote) lines.push(bodyNote(content, c));
  }
  return lines;
}

/** "12.3 px (11.2 %) · 40.0 px (36.4 %)": mean radius · extreme spread, with % of body width. */
export function groupText(content: ContentBundle, c: RangeCell): string | null {
  const g = groupStats(c.impacts);
  if (g === null) return null;
  const w = bodyWidthPx(content, c.plane);
  const part = (px: number): string => `${one(px)} px (${one(pctOfBody(px, w))} %)`;
  return `${part(g.meanRadius)} · ${part(g.extremeSpread)}`;
}

/** "3.0 px right, 2.0 px high": the group's centre relative to the aim point. */
export function centreText(c: RangeCell): string | null {
  const g = groupStats(c.impacts);
  if (g === null) return null;
  const x = `${one(Math.abs(g.offsetX))} px ${rt(g.offsetX < 0 ? 'range.left' : 'range.right')}`;
  const y = `${one(Math.abs(g.offsetY))} px ${rt(g.offsetY < 0 ? 'range.high' : 'range.low')}`;
  return `${x}, ${y}`;
}

export interface ReportWhere {
  readonly build: string;
  readonly viewport: string;
  readonly device: string;
  readonly biome: string;
  readonly layout: string;
}

/** The plain-text report of every cell of the session (like the admin page's review). */
export function rangeReport(
  content: ContentBundle,
  cells: readonly RangeCell[],
  where: ReportWhere,
): string {
  const lines = [
    rt('range.report_title'),
    fill(rt('range.report_build'), {
      build: where.build,
      viewport: where.viewport,
      device: where.device,
    }),
    fill(rt('range.report_area'), {
      area: biomeName(content, where.biome),
      day: dayName(where.layout),
    }),
    rt('range.report_unranked'),
    '',
  ];
  if (cells.length === 0) lines.push(rt('range.none'));
  for (const c of cells) {
    lines.push(cellTitle(content, c), ...cellLines(content, c).map((l) => `  ${l}`), '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
