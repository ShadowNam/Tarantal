import { describe, expect, it } from 'vitest';
import {
  feesdagOverride,
  officialResultsAllowed,
  testHookPolicy,
  type HookPolicyInput,
} from './testHooks';

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

describe('officialResultsAllowed (v1.0.1, D-028: ?e2e Daily gate)', () => {
  it('the public build (Pages, portal releases) refuses official results under ?e2e', () => {
    for (const platform of ['web', 'poki', 'crazygames'] as const) {
      expect(officialResultsAllowed({ ...prod, platform, e2eParam: true })).toBe(false);
    }
  });

  it('a CI e2e build (VITE_TEST_HOOKS=1) keeps official Dailies under ?e2e', () => {
    for (const platform of ['web', 'poki', 'crazygames'] as const) {
      expect(
        officialResultsAllowed({ ...prod, platform, e2eParam: true, testHooksFlag: true }),
      ).toBe(true);
    }
  });

  it('players without ?e2e, the dev server and Vitest are unaffected', () => {
    expect(officialResultsAllowed(prod)).toBe(true);
    expect(
      officialResultsAllowed({ ...prod, dev: true, mode: 'development', e2eParam: true }),
    ).toBe(true);
    expect(officialResultsAllowed({ ...prod, mode: 'test', e2eParam: true })).toBe(true);
  });
});

describe('feesdagOverride (D-048)', () => {
  const page = { testHooks: true, admin: null, param: 'halloween' };
  it('is ignored on Poki and CrazyGames builds, even with hooks, the admin page or a param', () => {
    for (const buildPlatform of ['poki', 'crazygames']) {
      expect(feesdagOverride({ ...page, buildPlatform })).toBeNull();
      expect(
        feesdagOverride({ ...page, buildPlatform, admin: { feesdag: 'halloween' } }),
      ).toBeNull();
    }
  });

  it('works on web and dev builds with the hooks, or from the admin page', () => {
    expect(feesdagOverride({ ...page, buildPlatform: undefined })).toBe('halloween');
    expect(feesdagOverride({ ...page, buildPlatform: 'web' })).toBe('halloween');
    expect(feesdagOverride({ ...page, buildPlatform: 'web', param: 'none' })).toBe('none');
    expect(
      feesdagOverride({
        ...page,
        buildPlatform: 'web',
        testHooks: false,
        admin: { feesdag: 'halloween' },
      }),
    ).toBe('halloween');
  });

  it('never on a public page without the hooks (players get the real date)', () => {
    expect(feesdagOverride({ ...page, buildPlatform: 'web', testHooks: false })).toBeNull();
    expect(feesdagOverride({ ...page, buildPlatform: undefined, testHooks: false })).toBeNull();
  });
});
