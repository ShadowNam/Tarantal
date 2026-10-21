import { describe, expect, it } from 'vitest';
import { testHookPolicy, type HookPolicyInput } from './testHooks';

const prod: HookPolicyInput = {
  dev: false,
  mode: 'production',
  platform: 'web',
  testHooksFlag: false,
  e2eParam: false,
};

describe('testHookPolicy (M9, D-024 known limit)', () => {
  it('web production: off without ?e2e, on with it, in its own save namespace', () => {
    expect(testHookPolicy(prod)).toEqual({ enabled: false, namespace: null });
    expect(testHookPolicy({ ...prod, e2eParam: true })).toEqual({
      enabled: true,
      namespace: 'e2e.',
    });
  });

  it('portal builds ignore ?e2e unless built with VITE_TEST_HOOKS=1', () => {
    for (const platform of ['poki', 'crazygames'] as const) {
      expect(testHookPolicy({ ...prod, platform, e2eParam: true }).enabled).toBe(false);
      expect(testHookPolicy({ ...prod, platform, dev: true }).enabled).toBe(false);
      expect(testHookPolicy({ ...prod, platform, e2eParam: true, testHooksFlag: true })).toEqual({
        enabled: true,
        namespace: 'e2e.',
      });
    }
  });

  it('the dev server keeps hooks on and the real save unless ?e2e', () => {
    expect(testHookPolicy({ ...prod, dev: true, mode: 'development' })).toEqual({
      enabled: true,
      namespace: null,
    });
  });
});
