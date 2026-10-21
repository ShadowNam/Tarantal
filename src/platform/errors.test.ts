import { describe, expect, it } from 'vitest';
import {
  installErrorHook,
  stackFrames,
  stripUrls,
  toErrorReport,
  type ErrorTarget,
} from './errors';

const limits = { maxReports: 3, stackFrames: 2, messageChars: 40 };

describe('error reports carry no personal data (M9, Tech §17)', () => {
  it('URLs lose origin, path, query and hash (challenge links, portal session ids)', () => {
    expect(stripUrls('at https://poki.test/a/b/index-1.js?sid=123&c=xyz:3:9')).toBe(
      'at index-1.js:3:9',
    );
    expect(stripUrls('fetch https://x.test/?c=eyJzZWVkIjo0Mn0#frag failed')).toBe(
      'fetch <url> failed',
    );
  });

  it('keeps the top frames only', () => {
    const stack = [
      'TypeError: x is undefined',
      '    at foo (https://h.test/assets/index-a.js:1:200)',
      '    at bar (https://h.test/assets/index-a.js:1:300)',
      '    at baz (https://h.test/assets/index-a.js:1:400)',
    ].join('\n');
    expect(stackFrames(stack, 2)).toEqual(['foo (index-a.js:1:200)', 'bar (index-a.js:1:300)']);
  });

  it('trims long messages and accepts non-Error rejections', () => {
    const r = toErrorReport('rejection', 'x'.repeat(100), limits);
    expect(r.message).toHaveLength(40);
    expect(toErrorReport('rejection', { code: 7 }, limits).message).toBe('{"code":7}');
  });

  it('the hook caps reports per page and drops repeats', () => {
    const fns: Record<string, (e: never) => void> = {};
    const target = {
      addEventListener: (type: string, fn: (e: never) => void) => {
        fns[type] = fn;
      },
    } as ErrorTarget;
    const sent: string[] = [];
    const throttle = installErrorHook(target, limits, (r) => sent.push(r.message));
    const fire = (msg: string): void => {
      fns['error']?.({ error: new Error(msg), message: msg } as never);
    };
    fire('a');
    fire('a');
    fire('b');
    fns['unhandledrejection']?.({ reason: new Error('c') } as never);
    fire('d');
    expect(sent).toEqual(['Error: a', 'Error: b', 'Error: c']);
    expect(throttle.dropped).toBe(2);
  });
});
