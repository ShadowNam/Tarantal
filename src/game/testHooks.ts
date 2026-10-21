// When the e2e/dev test hooks (window.__TM__, ?huntSeconds, ?today, ?quotaMul …) are on, and
// which save they use (M9, closes the D-024 known limit). Portal builds never carry them unless
// built with VITE_TEST_HOOKS=1 (the CI e2e builds of the portals); in any build, `?e2e` runs
// keep their own save under `tm.e2e.*`, so a test link can't bend a player's streak or bests.
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
