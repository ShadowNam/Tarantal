// Parses content/meta/daily.json (Daily Hunt meta, outside the sim bundle). Pure: no I/O.
import { parseMetaFile, type MetaParseResult } from './metaFile';
import { DailyMetaSchema, type DailyMeta } from './schemas';

export function parseDailyMeta(raw: unknown): MetaParseResult<DailyMeta> {
  return parseMetaFile(DailyMetaSchema, raw);
}
