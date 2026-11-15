import { describe, expect, it } from 'vitest';
import { defineLazy, LazyEntries } from './lazyHook';

describe('defineLazy', () => {
  it('computes the entry on each read, never before', () => {
    const hook = { bytes: 0, other: 'x' };
    let calls = 0;
    let now = 5;
    defineLazy(hook, 'bytes', () => {
      calls++;
      return now;
    });
    expect(calls).toBe(0);
    expect(hook.bytes).toBe(5);
    now = 7;
    expect(hook.bytes).toBe(7);
    expect(calls).toBe(2);
  });

  it('stays an enumerable field, so a serialised hook carries the value read now', () => {
    const hook = { bytes: 0, other: 'x' };
    defineLazy(hook, 'bytes', () => 42);
    expect(Object.keys(hook)).toEqual(['bytes', 'other']);
    expect(JSON.parse(JSON.stringify(hook))).toEqual({ bytes: 42, other: 'x' });
  });

  it('can be defined again (a later scene run replaces the getter)', () => {
    const hook = { n: 0 };
    defineLazy(hook, 'n', () => 1);
    defineLazy(hook, 'n', () => 2);
    expect(hook.n).toBe(2);
  });
});

describe('LazyEntries', () => {
  function setup(): {
    hook: { spots: number[]; tick: number };
    entries: LazyEntries<{ spots: number[]; tick: number }>;
    calls: () => number;
    set: (v: number) => void;
  } {
    const hook = { spots: [] as number[], tick: 0 };
    const entries = new LazyEntries(hook);
    let calls = 0;
    let v = 1;
    entries.define('spots', () => {
      calls++;
      return [v];
    });
    return {
      hook,
      entries,
      calls: () => calls,
      set: (n) => {
        v = n;
      },
    };
  }

  it('reads the initial value until a frame drew, then works it out once per frame', () => {
    const { hook, entries, calls, set } = setup();
    expect(hook.spots).toEqual([]);
    expect(calls()).toBe(0);
    entries.frame();
    expect(calls()).toBe(0);
    expect(hook.spots).toEqual([1]);
    expect(hook.spots).toEqual([1]);
    expect(calls()).toBe(1);
    set(2);
    entries.frame();
    expect(hook.spots).toEqual([2]);
    expect(calls()).toBe(2);
  });

  it('works nothing out for frames nobody read', () => {
    const { entries, calls } = setup();
    for (let i = 0; i < 10; i++) entries.frame();
    expect(calls()).toBe(0);
  });

  it('keeps the last frame’s value once frozen (the views went)', () => {
    const { hook, entries, set } = setup();
    entries.frame();
    entries.freeze();
    set(9);
    expect(hook.spots).toEqual([1]);
    // The next hunt's first frame reads afresh.
    entries.frame();
    expect(hook.spots).toEqual([9]);
  });

  it('reads an entry whose views are already gone at freeze as before the first frame', () => {
    const hook = { spots: [] as number[] };
    const entries = new LazyEntries(hook);
    let gone = false;
    entries.define('spots', () => {
      if (gone) throw new Error('destroyed');
      return [1];
    });
    entries.frame();
    gone = true;
    entries.freeze();
    expect(hook.spots).toEqual([]);
  });

  it('reads back a write (a reset at a hunt start) until the next frame', () => {
    const { hook, entries } = setup();
    entries.frame();
    hook.spots = [];
    expect(hook.spots).toEqual([]);
    entries.frame();
    expect(hook.spots).toEqual([1]);
  });

  it('serialises like plain fields', () => {
    const { hook, entries } = setup();
    entries.frame();
    expect(JSON.parse(JSON.stringify(hook))).toEqual({ spots: [1], tick: 0 });
  });
});
