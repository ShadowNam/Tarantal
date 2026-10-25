import { describe, expect, it } from 'vitest';
import { ABSENT, absentIndexAccepted } from './finalLoader';

describe('absentIndexAccepted (v1.6, D-042 review)', () => {
  const absent = `${ABSENT} (HTTP 404, text/html)`;
  const prod = { placeholderArt: false, testBuild: false };

  it('a production build ships its index: an absent one is a failure', () => {
    expect(absentIndexAccepted(absent, prod)).toBe(false);
    expect(absentIndexAccepted(`${ABSENT} (HTTP 200, text/html)`, prod)).toBe(false);
  });

  it('?art=placeholder is the one intentional opt-in', () => {
    expect(
      absentIndexAccepted(`${ABSENT} (?art=placeholder)`, { ...prod, placeholderArt: true }),
    ).toBe(true);
  });

  it('dev, Vitest and the CI e2e builds may run without one', () => {
    expect(absentIndexAccepted(absent, { ...prod, testBuild: true })).toBe(true);
  });

  it('other index problems are never accepted', () => {
    const any = { placeholderArt: true, testBuild: true };
    expect(absentIndexAccepted('index timed out', any)).toBe(false);
    expect(absentIndexAccepted('index HTTP 500', any)).toBe(false);
    expect(absentIndexAccepted(null, any)).toBe(false);
  });
});
