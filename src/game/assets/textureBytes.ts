// D-029 GPU texture memory estimate: RGBA bytes of every texture source in the texture manager.
// Shared by the hunt (test hook, per second) and the Skiet-Skuur (D-035 review: the shed's gun
// icons must not grow the low-tier budget).
import type * as Phaser from 'phaser';

export function textureBytes(textures: Phaser.Textures.TextureManager): number {
  let n = 0;
  for (const key of textures.getTextureKeys())
    for (const src of textures.get(key).source) n += src.width * src.height * 4;
  return n;
}
