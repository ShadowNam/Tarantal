// `npm run fonts:build` (M10, art bible §6, Tech §10): self-hosted, open-licence fonts subset to the
// glyphs the game shows. Baloo 2 (600, 800) is the UI and body face; Bangers is the comic display
// face for onomatopoeia. The subset is every character of the four language files plus the
// Afrikaans and German letters the bible lists (ê ë ô ï û ä ö ü ß and capitals), from the
// @fontsource latin files (SIL OFL 1.1; the licence is copied next to the fonts). Glyphs a font
// lacks (★, ⛔, ▶) fall back to the system font. Output: public/fonts/*.woff2 (committed).
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import subsetFont from 'subset-font';

const root = join(import.meta.dirname, '..');
const out = join(root, 'public', 'fonts');

function strings(v: unknown, acc: Set<string>): void {
  if (typeof v === 'string') for (const ch of v) acc.add(ch);
  else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) strings(x, acc);
}

export function glyphs(): string {
  const set = new Set<string>();
  const dir = join(root, 'src', 'i18n');
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort())
    strings(JSON.parse(readFileSync(join(dir, f), 'utf8')), set);
  // Printable ASCII (numbers, scores, URLs) and the bible §6 letters, even if no string uses them yet.
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  for (const ch of 'êëôïûÊËÔÏÛäöüÄÖÜßéèáóúíÉ×·–—’‘“”„…') set.add(ch);
  return [...set].sort().join('');
}

const FONTS = [
  { pkg: 'baloo-2', file: 'baloo-2-latin-600-normal.woff2', name: 'baloo2-600.woff2' },
  { pkg: 'baloo-2', file: 'baloo-2-latin-800-normal.woff2', name: 'baloo2-800.woff2' },
  { pkg: 'bangers', file: 'bangers-latin-400-normal.woff2', name: 'bangers-400.woff2' },
] as const;

if (process.argv[1]?.endsWith('make-fonts.ts')) {
  mkdirSync(out, { recursive: true });
  const text = glyphs();
  for (const f of FONTS) {
    const src = readFileSync(join(root, 'node_modules', '@fontsource', f.pkg, 'files', f.file));
    const sub = await subsetFont(src, text, { targetFormat: 'woff2' });
    writeFileSync(join(out, f.name), sub);
    console.log(
      `${f.name}: ${(src.length / 1024).toFixed(1)} KB → ${(sub.length / 1024).toFixed(1)} KB`,
    );
  }
  copyFileSync(
    join(root, 'node_modules', '@fontsource', 'baloo-2', 'LICENSE'),
    join(out, 'OFL-Baloo2.txt'),
  );
  copyFileSync(
    join(root, 'node_modules', '@fontsource', 'bangers', 'LICENSE'),
    join(out, 'OFL-Bangers.txt'),
  );
  console.log(`fonts:build — ${Array.from(text).length} glyphs`);
}
