// When the e2e/dev test hooks (window.__TM__, ?huntSeconds, ?today, ?quotaMul …) are on, and
// which save they use (M9, closes the D-024 known limit). Portal builds never carry them unless
// built with VITE_TEST_HOOKS=1 (the CI e2e builds of the portals); in any build, `?e2e` runs
// keep their own save under `tm.e2e.*`, so a test link can't bend a player's streak or bests.
// v1.0.1: only VITE_TEST_HOOKS=1 builds (CI e2e) record official results under `?e2e`.
import type { PlatformId } from '../platform/PlatformAdapter';

export interface HookPolicyInput {
  readonly dev: boolean;
  /** Vite mode ('production', 'development', 'test'). */
  readonly mode: string;
  readonly platform: PlatformId;
  /** VITE_TEST_HOOKS=1 at build time. */
  readonly testHooksFlag: boolean;
  /** The page URL has ?e2e. */
  readonly e2eParam: boolean;
}

export interface HookPolicy {
  readonly enabled: boolean;
  /** Storage namespace for this page (`e2e.` → keys under `tm.e2e.`), or null for the real save. */
  readonly namespace: string | null;
}

export const E2E_NAMESPACE = 'e2e.';

export function testHookPolicy(i: HookPolicyInput): HookPolicy {
  const allowed = i.platform === 'web' || i.testHooksFlag;
  const enabled = allowed && (i.dev || i.mode === 'test' || i.e2eParam);
  return { enabled, namespace: enabled && i.e2eParam ? E2E_NAMESPACE : null };
}

/**
 * v1.0.1 (D-028 §1): may a hook-enabled page record an official Daily (attempt, streak, best) and
 * offer [Share] / challenge links? Yes on the dev server, in Vitest, and in builds made with
 * VITE_TEST_HOOKS=1 (the CI e2e builds). A public build (Pages, portal releases) opened with
 * `?e2e` — which gets a fresh `tm.e2e.*` save every time — plays every hunt unranked, like
 * capture mode: Dailies are practice, and no tally offers a share or a challenge link.
 */
export function officialResultsAllowed(i: HookPolicyInput): boolean {
  return !i.e2eParam || i.dev || i.mode === 'test' || i.testHooksFlag;
}

/**
 * D-048: the special day a page's Daily is forced to play — `?feesdag=<id|none>` on hook-enabled
 * pages, or the web admin page's choice — or null (the real date decides). Never on a Poki,
 * CrazyGames or Android app build, whatever the page or the build flags.
 */
export function feesdagOverride(i: {
  /** The build's platform (VITE_PLATFORM; undefined = web). */
  readonly buildPlatform: string | undefined;
  readonly testHooks: boolean;
  /** The admin page's stored hunt, if it plays one (its special or none). */
  readonly admin: { readonly feesdag?: string | undefined } | null;
  /** The page's ?feesdag value. */
  readonly param: string | null;
}): string | null {
  if (
    i.buildPlatform === 'poki' ||
    i.buildPlatform === 'crazygames' ||
    i.buildPlatform === 'capacitor'
  )
    return null;
  if (i.admin !== null) return i.admin.feesdag ?? null;
  return i.testHooks ? i.param : null;
}
