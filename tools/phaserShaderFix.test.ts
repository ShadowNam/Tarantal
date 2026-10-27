import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchPhaserShaders, PHASER_UNIT_FIXES } from './phaserShaderFix';

const ESM = join(import.meta.dirname, '..', 'node_modules', 'phaser', 'dist', 'phaser.esm.js');

describe('Phaser 4.2.1 texture-unit shader fix (D-054)', () => {
  it('patches every exact texture-unit compare in the shipped bundle', () => {
    const code = readFileSync(ESM, 'utf8');
    // The bug is there before the fix (if an upgrade fixed it, this test says so).
    expect(code).toContain('outTexDatum == ');
    const out = patchPhaserShaders(code, ESM);
    expect(out).not.toBeNull();
    expect(out).not.toContain('outTexDatum == ');
    expect(out).not.toContain('texId == float(i)');
    for (const [, to] of PHASER_UNIT_FIXES) expect(out).toContain(to);
  });

  it('leaves other modules alone', () => {
    expect(patchPhaserShaders('const a = 1;', '/src/main.ts')).toBeNull();
    expect(patchPhaserShaders('outTexDatum == 1.0', '/src/main.ts')).toBeNull();
  });

  it('fails loudly when an upgrade changes the shader text', () => {
    expect(() =>
      patchPhaserShaders('if (outTexDatum == 7.0) {}', '/node_modules/phaser/x.js'),
    ).toThrow(/phaser shader changed/);
  });
});
