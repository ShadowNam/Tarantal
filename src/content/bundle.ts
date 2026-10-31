// Parses raw JSON (already read from disk or fetched) into a validated ContentBundle.
// Pure: no I/O. Reading files is done by loadNode.ts (Node) or the game's loader (browser).
import type { z } from 'zod';
import { BiomeSchema, CONTENT_FILES, type Biome, type ContentBundle } from './schemas';

export interface ContentIssue {
  /** File path relative to content/, e.g. "biomes/karoo-autumn.json". */
  readonly file: string;
  readonly message: string;
}

export interface RawContent {
  /** Top-level files keyed by file name ("scoring.json", …). */
  readonly files: Readonly<Record<string, unknown>>;
  /** Biome files keyed by path relative to content/ ("biomes/karoo-autumn.json"). */
  readonly biomes: Readonly<Record<string, unknown>>;
}

export type ParseResult =
  | { readonly ok: true; readonly bundle: ContentBundle; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly ContentIssue[] };

function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${where}: ${issue.message}`;
  });
}

function parseFile<S extends z.ZodType>(
  schema: S,
  file: string,
  raw: unknown,
  errors: ContentIssue[],
): z.infer<S> | undefined {
  if (raw === undefined) {
    errors.push({ file, message: 'file is missing' });
    return undefined;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const message of formatZodError(result.error)) errors.push({ file, message });
    return undefined;
  }
  return result.data;
}

export function parseContent(raw: RawContent): ParseResult {
  const errors: ContentIssue[] = [];
  const f = raw.files;
  const scoring = parseFile(CONTENT_FILES['scoring.json'], 'scoring.json', f['scoring.json'], errors);
  const birds = parseFile(CONTENT_FILES['birds.json'], 'birds.json', f['birds.json'], errors);
  const weapons = parseFile(CONTENT_FILES['weapons.json'], 'weapons.json', f['weapons.json'], errors);
  const powerups = parseFile(
    CONTENT_FILES['powerups.json'],
    'powerups.json',
    f['powerups.json'],
    errors,
  );
  const charms = parseFile(CONTENT_FILES['charms.json'], 'charms.json', f['charms.json'], errors);
  const run = parseFile(CONTENT_FILES['run.json'], 'run.json', f['run.json'], errors);
  const modes = parseFile(CONTENT_FILES['modes.json'], 'modes.json', f['modes.json'], errors);
  const feesdae = parseFile(
    CONTENT_FILES['feesdae.json'],
    'feesdae.json',
    f['feesdae.json'],
    errors,
  );

  const reenbui = parseFile(
    CONTENT_FILES['reenbui.json'],
    'reenbui.json',
    f['reenbui.json'],
    errors,
  );

  for (const name of Object.keys(f)) {
    if (!(name in CONTENT_FILES)) errors.push({ file: name, message: 'unknown content file' });
  }

  const biomes: Biome[] = [];
  // Locale-free order: the biome order feeds contentHash, which must match in Node and browsers.
  const biomeEntries = Object.entries(raw.biomes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [file, value] of biomeEntries) {
    const biome = parseFile(BiomeSchema, file, value, errors);
    if (biome === undefined) continue;
    const expected = `biomes/${biome.id}.json`;
    if (file !== expected) errors.push({ file, message: `biome id "${biome.id}" must live in ${expected}` });
    biomes.push(biome);
  }

  if (
    errors.length > 0 ||
    scoring === undefined ||
    birds === undefined ||
    weapons === undefined ||
    powerups === undefined ||
    charms === undefined ||
    run === undefined ||
    modes === undefined ||
    feesdae === undefined ||
    reenbui === undefined
  ) {
    return { ok: false, errors };
  }
  return { ok: true, bundle: { scoring, birds, weapons, powerups, charms, run, modes, feesdae, reenbui, biomes }, errors: [] };
}
