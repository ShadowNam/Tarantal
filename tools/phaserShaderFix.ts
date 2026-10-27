// D-054: a build workaround for a Phaser 4.2.1 shader bug (used by vite.config.ts for the build
// and for `npm run dev`'s pre-bundled Phaser; tested in phaserShaderFix.test.ts).
/**
 * Phaser 4.2.1's batch shaders pick a quad's texture unit with `outTexDatum == float(i)` (and
 * `texId == float(i)`): an exact compare on an interpolated varying, where a miss draws nothing.
 * Interpolation need not return the vertices' whole number exactly (SwiftShader misses on
 * rotated quads; mobile GPUs at mediump may too), so a turned elephant head on a high texture
 * unit lost triangles that changed every frame (D-054). Compare with the nearest unit instead.
 * Throws if a Phaser upgrade changes the shader text, so the fix is never silently lost.
 */
export const PHASER_UNIT_FIXES: readonly (readonly [string, string])[] = [
  ['if (outTexDatum == 0.0)', 'if (outTexDatum < 0.5)'],
  ['if (outTexDatum == float(INDEX))', 'if (abs(outTexDatum - float(INDEX)) < 0.5)'],
  ['if (texId == float(i))', 'if (abs(texId - float(i)) < 0.5)'],
];
export function patchPhaserShaders(code: string, id: string): string | null {
  if (!id.includes('phaser') || !code.includes('outTexDatum == ')) return null;
  let out = code;
  for (const [from, to] of PHASER_UNIT_FIXES) {
    if (!out.includes(from)) throw new Error(`phaser shader changed: "${from}" not found (${id})`);
    out = out.split(from).join(to);
  }
  return out;
}
