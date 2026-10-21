import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip';

describe('zip writer (M10 release)', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('writes local headers, a central directory and data that inflates back', () => {
    const data = new TextEncoder().encode('kek-kek-kek '.repeat(50));
    const z = zip([
      { name: 'index.html', data },
      { name: 'assets/a.txt', data: new Uint8Array([1, 2, 3]) },
    ]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    const end = z.length - 22;
    expect(z.readUInt32LE(end)).toBe(0x06054b50);
    expect(z.readUInt16LE(end + 10)).toBe(2);
    // Sorted: assets/a.txt first (stored, too small to deflate), then index.html (deflated).
    const n1 = z.readUInt16LE(26);
    expect(z.subarray(30, 30 + n1).toString()).toBe('assets/a.txt');
    const second = 30 + n1 + z.readUInt32LE(18);
    expect(z.readUInt16LE(second + 8)).toBe(8);
    const n2 = z.readUInt16LE(second + 26);
    const body = z.subarray(second + 30 + n2, second + 30 + n2 + z.readUInt32LE(second + 18));
    expect(new TextDecoder().decode(inflateRawSync(body))).toBe('kek-kek-kek '.repeat(50));
    expect(zip([{ name: 'x', data }]).equals(zip([{ name: 'x', data }]))).toBe(true);
  });
});
