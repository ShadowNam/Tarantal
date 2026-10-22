// Build flags (M9). Read with dot access so Vite replaces them with literals at build time and
// the minifier drops the code paths of other platforms.
interface ImportMetaEnv {
  /** web (default) | poki | crazygames — picks the PlatformAdapter (Tech §8). */
  readonly VITE_PLATFORM?: string;
  /** '1': keep the e2e test hooks in a portal build (CI e2e builds only). */
  readonly VITE_TEST_HOOKS?: string;
}

/** M10: package.json version, replaced at build time (vite.config.ts `define`). */
declare const __APP_VERSION__: string;
