import { describe, expect, it } from 'vitest';
import { buildIdOf, shouldOfferUpdate } from './swUpdate';

describe('update bar decision (v1.6, D-042 review)', () => {
  const running = buildIdOf('1219b9d', '2026-10-25T08:40');

  it('names a build by its commit and build time', () => {
    expect(running).toBe('1219b9d@2026-10-25T08:40');
    expect(buildIdOf('1219b9d', '2026-10-25T09:10')).not.toBe(running);
  });

  it('offers a reload only when the worker now in charge serves another build', () => {
    expect(shouldOfferUpdate(true, running, buildIdOf('89ec664', '2026-10-25T10:00'))).toBe(true);
    // The page loaded the new build already (navigations are network first): nothing to reload.
    expect(shouldOfferUpdate(true, running, running)).toBe(false);
  });

  it('never on the first install, nor when the worker gives no answer', () => {
    expect(shouldOfferUpdate(false, running, 'other@2026-10-25T10:00')).toBe(false);
    expect(shouldOfferUpdate(true, running, null)).toBe(false);
  });
});
