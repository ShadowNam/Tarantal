// v1.11 (D-068): the braai tally's tap rule — only the buttons drawn block a skip (lesson 39).
import { describe, expect, it } from 'vitest';
import { classifyTap, recordTap, TAPS_KEPT, type BraaiTap } from './braaiTap';

const again = { x: 700, y: 900, w: 420, h: 96 };
const menu = { x: 1300, y: 912, w: 300, h: 76 };
const free = { blocked: false, done: false };

describe('braai tap rule', () => {
  it('a button keeps its tap; anywhere else skips', () => {
    expect(classifyTap({ x: 900, y: 950 }, [again, menu], free)).toBe('button');
    expect(classifyTap({ x: 1400, y: 950 }, [again, menu], free)).toBe('button');
    expect(classifyTap({ x: 120, y: 30 }, [again, menu], free)).toBe('skip');
    // A rect not drawn (no share button on this slate) doesn't block a skip.
    expect(classifyTap({ x: 1500, y: 140 }, [again, menu], free)).toBe('skip');
  });

  it('says why a skip was ignored', () => {
    expect(classifyTap({ x: 10, y: 10 }, [], { blocked: true, done: false })).toBe(
      'skip-ignored:blocked',
    );
    expect(classifyTap({ x: 10, y: 10 }, [], { blocked: false, done: true })).toBe(
      'skip-ignored:done',
    );
  });

  it('keeps the last taps, rounded', () => {
    const taps: BraaiTap[] = [];
    for (let i = 0; i < 10; i++) recordTap(taps, { x: i + 0.4, y: 2.6, outcome: 'skip' });
    expect(taps).toHaveLength(TAPS_KEPT);
    expect(taps.at(-1)).toEqual({ x: 9, y: 3, outcome: 'skip' });
  });
});
