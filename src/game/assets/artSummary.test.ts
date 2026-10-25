import { describe, expect, it } from 'vitest';
import { artSummary } from './artSummary';

describe('artSummary (v1.6, D-042)', () => {
  it('names the art kind and counts placeholder keys', () => {
    expect(
      artSummary([
        { key: 'a', kind: 'texture', status: 'interim' },
        { key: 'b', kind: 'layer', status: 'final' },
        { key: 'c', kind: 'texture', status: 'placeholder' },
      ]),
    ).toBe('art: interim · 1 placeholder');
    expect(artSummary([{ key: 'b', kind: 'layer', status: 'final' }])).toBe(
      'art: final · 0 placeholder',
    );
    expect(artSummary([])).toBe('art: placeholder · 0 placeholder');
  });
});
