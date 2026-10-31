// Loads and validates the real content/ once for tests and tools (Node only).
import { join } from 'node:path';
import { parseContent } from '../src/content/bundle';
import { contentHash } from '../src/content/hash';
import { readContentDir } from '../src/content/loadNode';
import { readFileSync } from 'node:fs';
import { parseDailyMeta } from '../src/content/daily';
import { parseFeel } from '../src/content/feel';
import { parseNotaboek } from '../src/content/notaboek';
import type { ContentBundle, DailyMeta, Feel, Notaboek, Soundscape } from '../src/content/schemas';
import { parseSoundscape } from '../src/content/soundscape';
// v1.8b (D-062): hunts here may need the lazy sim systems (baboons, ostriches).
import '../src/sim/lazySystemsRegister';

const root = join(import.meta.dirname, '..');

let cached: { bundle: ContentBundle; hash: string } | undefined;

function load(): { bundle: ContentBundle; hash: string } {
  if (cached) return cached;
  const parsed = parseContent(readContentDir(join(root, 'content')));
  if (!parsed.ok) {
    throw new Error(
      `content/ is invalid: ${parsed.errors.map((e) => `${e.file}: ${e.message}`).join('; ')}`,
    );
  }
  cached = { bundle: parsed.bundle, hash: contentHash(parsed.bundle) };
  return cached;
}

/** The validated content bundle from content/. */
export function loadContent(): ContentBundle {
  return load().bundle;
}

/** contentHash of content/ (Tech §4). */
export function loadContentHash(): string {
  return load().hash;
}

/** content/meta/notaboek.json, validated (meta-only, not in the bundle). */
export function loadNotaboek(): Notaboek {
  const r = parseNotaboek(
    JSON.parse(readFileSync(join(root, 'content/meta/notaboek.json'), 'utf8')),
  );
  if (!r.ok) throw new Error(`meta/notaboek.json is invalid: ${r.errors.join('; ')}`);
  return r.notaboek;
}

/** content/meta/daily.json, validated (meta-only, not in the bundle). */
export function loadDailyMeta(): DailyMeta {
  const r = parseDailyMeta(JSON.parse(readFileSync(join(root, 'content/meta/daily.json'), 'utf8')));
  if (!r.ok) throw new Error(`meta/daily.json is invalid: ${r.errors.join('; ')}`);
  return r.value;
}

/** content/client/feel.json, validated (Phaser-layer tuning, not in the bundle). */
export function loadFeel(): Feel {
  const r = parseFeel(JSON.parse(readFileSync(join(root, 'content/client/feel.json'), 'utf8')));
  if (!r.ok) throw new Error(`client/feel.json is invalid: ${r.errors.join('; ')}`);
  return r.feel;
}

/** v1.9 (D-066): content/client/soundscape.json, validated (presentation only, not in the bundle). */
export function loadSoundscape(): Soundscape {
  const r = parseSoundscape(
    JSON.parse(readFileSync(join(root, 'content/client/soundscape.json'), 'utf8')),
  );
  if (!r.ok) throw new Error(`client/soundscape.json is invalid: ${r.errors.join('; ')}`);
  return r.soundscape;
}
