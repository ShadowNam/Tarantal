// `npm run build:android`, after the capacitor web build (dist-android/, D-058): writes
// android/app/version.properties (versionName = package.json version, versionCode from it) and
// copies the build into the Android project with `npx cap sync android` (no Android SDK needed).
// Gradle (assembleRelease) then runs in CI: .github/workflows/android.yml.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { versionCode } from '../src/platform/androidVersion';

const root = join(import.meta.dirname, '..');
const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;

if (!existsSync(join(root, 'dist-android', 'index.html'))) {
  console.error('android-sync: dist-android/ is missing — run `npm run build:android`.');
  process.exit(1);
}
const code = versionCode(version);
writeFileSync(
  join(root, 'android', 'app', 'version.properties'),
  `# Written by tools/android-sync.ts (D-058); not committed.\nversionName=${version}\nversionCode=${String(code)}\n`,
);
console.log(`android-sync: versionName ${version}, versionCode ${String(code)}`);
if (!process.argv.includes('--no-sync'))
  execSync('npx cap sync android', { cwd: root, stdio: 'inherit' });
