// v1.7b (D-046, GDD §10.4): what each power-up and crate gun does, in words built from content.
// The Gun Shed's Power-ups tab, the pickup card, the Padstal offer and the captions all use these
// texts, so every number the player reads comes from powerups.json / weapons.json / run.json.
// Pure: a Translator and the content in, strings out.
import type { ContentBundle } from '../../content/schemas';
import { isI18nKey, type Language, type Translator } from '../../i18n/i18n';
import { guideString } from './guideI18n';
import { powerupIcon } from './powerupIcons';

export type GuideKind = 'powerup' | 'weapon';

export interface GuideCard {
  readonly id: string;
  readonly kind: GuideKind;
  readonly icon: string;
  readonly name: string;
  /** One plain sentence of what it does, with its numbers. */
  readonly effect: string;
  /** The short line on the pickup card ("Everything at half speed · 10 s"). */
  readonly short: string;
  /** How to get it (one line each). */
  readonly how: readonly string[];
  readonly tip: string;
  /** Picked up at least once on this save. */
  readonly found: boolean;
}

/** 0.6 → "0.6" (en) or "0,6" (af, de, nl); whole numbers stay whole. At most one decimal. */
export function formatNumber(v: number, lang: Language): string {
  const r = Math.round(v * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return lang === 'en' ? s : s.replace('.', ',');
}

/** The numbers a power-up's or crate gun's sentences use (`{s}`, `{n}`, `{x}`, …). */
export function guideValues(
  content: ContentBundle,
  id: string,
  tr: Translator,
  lang: Language,
): Record<string, string> {
  const num = (v: number): string => formatNumber(v, lang);
  const out: Record<string, string> = {};
  const pu = content.powerups.powerups.find((p) => p.id === id);
  if (pu !== undefined) {
    const e = pu.effect;
    if (pu.durationMs !== undefined) out['s'] = num(pu.durationMs / 1000);
    if (pu.durationShells !== undefined) out['n'] = num(pu.durationShells);
    if (e.spreadMul !== undefined) out['x'] = num(e.spreadMul);
    const factor = e.creatureTimeScale ?? e.reloadTimeMul;
    if (factor !== undefined) {
      const pct = Math.round(factor * 100);
      out['pct'] = String(pct);
      out['speed'] = pct === 50 ? tr.text('guide.half') : `${pct} %`;
    }
    if (e.idleTopUpMs !== undefined) out['idle'] = num(e.idleTopUpMs / 1000);
    // 1.9.2 (D-055) Rooikol: the time between shots as a share of normal.
    if (e.fireCooldownMul !== undefined) out['pct'] = String(Math.round(e.fireCooldownMul * 100));
    return pu.padstalPrice === undefined ? out : { ...out, ...shopValues(tr, pu.padstalPrice) };
  }
  const w = content.weapons.weapons.find((x) => x.id === id && x.kind === 'crate');
  if (w !== undefined && w.kind === 'crate') {
    if (w.durationMs !== undefined) out['s'] = num(w.durationMs / 1000);
    if (w.shots !== undefined) out['n'] = num(w.shots);
    if (w.pellets > 1) out['p'] = num(w.pellets);
    if (w.reloadMs !== undefined) out['r'] = num(w.reloadMs / 1000);
    return { ...out, ...shopValues(tr, content.run.padstal.weaponRentalPrice) };
  }
  return out;
}

/** `{stall}`, `{run}` and `{price}` for the "how you get it" lines (names follow the toggle). */
function shopValues(tr: Translator, price: number): Record<string, string> {
  return {
    stall: tr.text('run.padstal'),
    run: tr.text('title.season_run'),
    price: tr.text('run.doppies').replace('{n}', String(price)),
  };
}

/** A string with its `{…}` values: from the main tables, or (1.9.2, D-055) the lazy guide
 *  tables (guideI18n.ts; empty until they are in). */
function filled(
  tr: Translator,
  lang: Language,
  key: string,
  values: Readonly<Record<string, string>>,
): string {
  const text = isI18nKey(key) ? tr.text(key) : (guideString(lang, key) ?? '');
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/** The full sentence of what `id` does (Gun Shed card, first pickup, Padstal offer). */
export function effectText(
  content: ContentBundle,
  id: string,
  tr: Translator,
  lang: Language,
): string {
  return filled(tr, lang, `guide.effect.${id}`, guideValues(content, id, tr, lang));
}

/** The pickup card's short line, with its length. */
export function shortText(
  content: ContentBundle,
  id: string,
  tr: Translator,
  lang: Language,
): string {
  return filled(tr, lang, `pickup.${id}`, guideValues(content, id, tr, lang));
}

/** Every power-up (powerups.json order) and then every crate gun (weapons.json order). */
export function guideIds(content: ContentBundle): { id: string; kind: GuideKind }[] {
  return [
    ...content.powerups.powerups.map((p) => ({ id: p.id, kind: 'powerup' as const })),
    ...content.weapons.weapons
      .filter((w) => w.kind === 'crate')
      .map((w) => ({ id: w.id, kind: 'weapon' as const })),
  ];
}

/** The Gun Shed's power-up cards. `seen`: ids picked up on this save (first-pickup memory). */
export function guideCards(
  content: ContentBundle,
  seen: readonly string[],
  tr: Translator,
  lang: Language,
): GuideCard[] {
  const inCrates = new Set(content.powerups.crates.table.map((e) => e.id));
  const fromSecret = new Set(
    content.biomes.flatMap((b) =>
      b.props.flatMap((p) =>
        p.secret?.reward.powerup !== undefined ? [p.secret.reward.powerup] : [],
      ),
    ),
  );
  return guideIds(content).map(({ id, kind }) => {
    const values = guideValues(content, id, tr, lang);
    const how: string[] = [];
    // 1.9.2 (D-055): a rifle-only power-up drops only while a rifle is in hand, never sold.
    const rifle = content.powerups.powerups.some((p) => p.id === id && p.needsSight === true);
    if (inCrates.has(id))
      how.push(filled(tr, lang, rifle ? 'guide.how.crate_rifle' : 'guide.how.crate', values));
    if (kind === 'weapon' || values['price'] !== undefined)
      how.push(
        filled(tr, lang, kind === 'weapon' ? 'guide.how.rent' : 'guide.how.padstal', values),
      );
    if (fromSecret.has(id)) how.push(filled(tr, lang, 'guide.how.secret', values));
    return {
      id,
      kind,
      icon: powerupIcon(id),
      name: tr.or(`item.${id}`, id),
      effect: filled(tr, lang, `guide.effect.${id}`, values),
      short: filled(tr, lang, `pickup.${id}`, values),
      how,
      tip: guideString(lang, `guide.tip.${id}`) ?? '',
      found: seen.includes(id),
    };
  });
}
