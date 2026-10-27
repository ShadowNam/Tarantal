// D-029 GPU texture memory estimate: RGBA bytes of every texture source in the texture manager.
// Shared by the hunt (test hook, per second) and the Skiet-Skuur (D-035 review: the shed's gun
// icons must not grow the low-tier budget).
import type * as Phaser from 'phaser';

/** D-053 (test hook): the `n` largest textures by RGBA bytes, in MB (one decimal). */
export function largestTextures(
  textures: Phaser.Textures.TextureManager,
  n: number,
): { key: string; mb: number }[] {
  return textures
    .getTextureKeys()
    .map((key) => ({
      key,
      bytes: textures.get(key).source.reduce((a, s) => a + s.width * s.height * 4, 0),
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, n)
    .map(({ key, bytes }) => ({ key, mb: Math.round(bytes / 104_857.6) / 10 }));
}

export function textureBytes(textures: Phaser.Textures.TextureManager): number {
  let n = 0;
  for (const key of textures.getTextureKeys())
    for (const src of textures.get(key).source) n += src.width * src.height * 4;
  return n;
}
