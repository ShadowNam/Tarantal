import { describe, expect, it } from 'vitest';
import { projectHref, projectRequested } from './adminProject';

describe('Project overview parameter (D-045)', () => {
  it('opens only with project=1', () => {
    expect(projectRequested('?admin=1&project=1')).toBe(true);
    expect(projectRequested('?project=1')).toBe(true);
    expect(projectRequested('?admin=1')).toBe(false);
    expect(projectRequested('?admin=1&project=0')).toBe(false);
    expect(projectRequested('')).toBe(false);
  });

  it('sets and drops the parameter, keeping the others and the hash', () => {
    const base = 'https://shadownam.github.io/Tarantal/?admin=1&e2e=1#x';
    const open = projectHref(base, true);
    expect(open).toBe('https://shadownam.github.io/Tarantal/?admin=1&e2e=1&project=1#x');
    expect(projectHref(open, true)).toBe(open);
    expect(projectHref(open, false)).toBe(base);
    expect(projectHref('http://localhost:4173/?project=1&admin=1', false)).toBe(
      'http://localhost:4173/?admin=1',
    );
  });
});
