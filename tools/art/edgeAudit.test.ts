import { describe, expect, it } from 'vitest';
import { edgeProblems } from './edgeAudit';

describe('interim art edges (D-035)', () => {
  it('no layer or scenery prop is cut off by its texture edge', () => {
    expect(edgeProblems()).toEqual([]);
  });
});
