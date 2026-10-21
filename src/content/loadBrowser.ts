// Browser: bundles content/ into the build with Vite's eager glob and validates it at boot.
// Same parse path as Node (bundle.ts), so the contentHash matches tools and replays.
import { parseContent, type RawContent } from './bundle';
import { parseFeel } from './feel';
import { parseDailyMeta } from './daily';
import { parseNotaboek } from './notaboek';
import type { ContentBundle, DailyMeta, Feel, Notaboek } from './schemas';

const topLevel = import.meta.glob<unknown>('../../content/*.json', { eager: true, import: 'default' });
const biomeFiles = import.meta.glob<unknown>('../../content/biomes/*.json', {
  eager: true,
  import: 'default',
});
const feelFiles = import.meta.glob<unknown>('../../content/client/feel.json', {
  eager: true,
  import: 'default',
});

const notaboekFiles = import.meta.glob<unknown>('../../content/meta/notaboek.json', {
  eager: true,
  import: 'default',
});

const dailyFiles = import.meta.glob<unknown>('../../content/meta/daily.json', {
  eager: true,
  import: 'default',
});

/** "../../content/biomes/x.json" → "biomes/x.json"; "../../content/a.json" → "a.json". */
function contentPath(globKey: string): string {
  return globKey.replace(/^.*\/content\//, '');
}

export function rawContentFromBuild(): RawContent {
  const files: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(topLevel)) files[contentPath(k)] = v;
  const biomes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(biomeFiles)) biomes[contentPath(k)] = v;
  return { files, biomes };
}

export interface GameContent {
  readonly bundle: ContentBundle;
  readonly feel: Feel;
  readonly notaboek: Notaboek;
  readonly daily: DailyMeta;
}

/** Validated content for the game; throws with every problem listed if content is broken. */
export function loadGameContent(): GameContent {
  const parsed = parseContent(rawContentFromBuild());
  if (!parsed.ok) {
    throw new Error(`content invalid: ${parsed.errors.map((e) => `${e.file}: ${e.message}`).join('; ')}`);
  }
  const feelRaw = Object.values(feelFiles)[0];
  const feel = parseFeel(feelRaw);
  if (!feel.ok) throw new Error(`content/client/feel.json invalid: ${feel.errors.join('; ')}`);
  const nb = parseNotaboek(Object.values(notaboekFiles)[0]);
  if (!nb.ok) throw new Error(`content/meta/notaboek.json invalid: ${nb.errors.join('; ')}`);
  const daily = parseDailyMeta(Object.values(dailyFiles)[0]);
  if (!daily.ok) throw new Error(`content/meta/daily.json invalid: ${daily.errors.join('; ')}`);
  return { bundle: parsed.bundle, feel: feel.feel, notaboek: nb.notaboek, daily: daily.value };
}
