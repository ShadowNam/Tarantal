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

  it('a ":" in the query, scheme-less and protocol-relative URLs are stripped too', () => {
    expect(stripUrls('at https://h.test/a/app.js?c=a:b:c#x:1:3:9')).toBe('at app.js:3:9');
    expect(stripUrls('load //cdn.test/p/sdk.js?sid=9 failed')).toBe('load sdk.js failed');
    expect(stripUrls('see poki.com/en/g/tarantal?gdc=abc:def now')).toBe('see tarantal now');
    expect(stripUrls('at https://h.test/?c=eyJzZWVkIjo0Mn0:2:4')).toBe('at <url>:2:4');
    expect(stripUrls('ratio 1:2, file index.js:3:9')).toBe('ratio 1:2, file index.js:3:9');
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
    const r = toErrorReport('error', 'x'.repeat(100), limits);
    expect(r.message).toHaveLength(40);
    // Non-Error rejections may carry anything: only their type is reported.
    expect(toErrorReport('rejection', { code: 7 }, limits).message).toBe(
      'non-Error value (Object)',
    );
    expect(toErrorReport('rejection', 'user@example.com', limits).message).toBe(
      'non-Error value (string)',
    );
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
