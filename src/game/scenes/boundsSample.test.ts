import { describe, expect, it } from 'vitest';
import { sampleBounds, type BoundsBox } from './boundsSample';

describe('sampleBounds (D-053 test hook)', () => {
  it('returns no boxes before the views exist (the create-time sample must not crash)', () => {
    expect(sampleBounds(null)).toEqual([]);
  });

  it('returns the view boxes once they exist', () => {
    const box: BoundsBox = { key: 'layer:sky', x: 0, y: 0, w: 1920, h: 1080 };
    expect(sampleBounds({ boundsSample: () => [box] })).toEqual([box]);
  });
});
