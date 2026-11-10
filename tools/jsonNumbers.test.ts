import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeNumbers } from './jsonNumbers';

describe('numbers written in place (D-086)', () => {
  it('changes only the numbers that differ, keeping the layout', () => {
    const text = '{\n  "a": { "rx": 10, "ry": 2.5 },\n  "b": [1, 2],\n  "s": "x: 1" \n}\n';
    const out = writeNumbers(text, { a: { rx: 12, ry: 2.5 }, b: [1, 3], s: 'x: 1' });
    expect(out).toBe('{\n  "a": { "rx": 12, "ry": 2.5 },\n  "b": [1, 3],\n  "s": "x: 1" \n}\n');
  });

  it('a content file with nothing changed comes back byte for byte', () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'content', 'birds.json'), 'utf8');
    expect(writeNumbers(text, JSON.parse(text))).toBe(text);
  });

  it('refuses a change that is not a number', () => {
    expect(() => writeNumbers('{"a":1}', { a: 'x' })).toThrow(/not a number/);
    expect(() => writeNumbers('{"a":1}', { a: 1, b: 2 })).toThrow(/keys changed/);
    expect(() => writeNumbers('{"a":[1]}', { a: [1, 2] })).toThrow(/array changed/);
  });
});
