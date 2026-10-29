// Pages workflow (D-058): writes dist/android/index.html (tools/androidPage.ts) and copies the
// test APK next to it as tarantal-madness.apk. Without an APK (the Android build failed) the page
// says so and the game's own deploy goes ahead unchanged.
//   npx tsx tools/android-page.ts [--apk path/to/app.apk] [--out dist/android]
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES } from '../src/i18n/i18n';
import { androidPageHtml, APK_FILE, type AndroidPageTables } from './androidPage';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const root = join(import.meta.dirname, '..');
const out = arg('--out') ?? join(root, 'dist', 'android');
const apk = arg('--apk');
const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;
const tables: AndroidPageTables = Object.fromEntries(
  LANGUAGES.map((l) => [
    l,
    JSON.parse(readFileSync(join(root, 'src', 'i18n', 'android', `${l}.json`), 'utf8')) as Record<
      string,
      string
    >,
  ]),
);

mkdirSync(out, { recursive: true });
let apkBytes: number | null = null;
if (apk !== undefined && existsSync(apk)) {
  copyFileSync(apk, join(out, APK_FILE));
  apkBytes = statSync(apk).size;
}
writeFileSync(join(out, 'index.html'), androidPageHtml({ version, apkBytes, tables }));
console.log(
  `android-page: ${out}/index.html, ${apkBytes === null ? 'no APK' : `${APK_FILE} ${String(apkBytes)} bytes`}`,
);
