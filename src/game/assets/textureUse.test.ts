// D-053: a texture a live particle (or an emitter's frames) still draws is "in use", so the HD
// switch never frees it under them (the freeze: Phaser read frame.source of a destroyed frame).
import type * as Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { purgeRetired } from './hdRuntime';
import { retiredTextures } from './AssetManifest';
import { texturesInUse } from './textureUse';

const frame = (key: string) => ({ texture: { key } });

function gameWith(list: unknown[]): Phaser.Game {
  // Safe cast: texturesInUse reads game.scene.scenes[].children.list only.
  return { scene: { scenes: [{ children: { list } }] } } as unknown as Phaser.Game;
}

describe('texturesInUse with particles (D-053)', () => {
  // An emitter moved to the Standard key, its frames and one live puff still on the HD texture.
  const emitter = {
    texture: { key: 'fx/puff' },
    frames: [frame('fx/puff#retired-7')],
    alive: [{ frame: frame('fx/puff#retired-7') }],
  };
  const rain = {
    texture: { key: 'omen/rain' },
    frames: [],
    alive: [{ frame: frame('omen/rain#retired-8') }],
  };

  it('counts each emitter’s frames and live particles', () => {
    const used = texturesInUse(gameWith([{ list: [emitter] }, rain]));
    expect(used.has('fx/puff#retired-7')).toBe(true);
    expect(used.has('omen/rain#retired-8')).toBe(true);
  });

  it('purgeRetired keeps a retired texture live particles draw', () => {
    retiredTextures.add('omen/rain#retired-8');
    const remove = vi.fn();
    // Safe cast: purgeRetired calls exists() and remove() only (no anims passed).
    const textures = { exists: () => true, remove } as unknown as Phaser.Textures.TextureManager;
    purgeRetired(textures, texturesInUse(gameWith([rain])));
    expect(remove).not.toHaveBeenCalled();
    // Once the last drop is gone it goes.
    purgeRetired(textures, texturesInUse(gameWith([{ ...rain, alive: [] }])));
    expect(remove).toHaveBeenCalledWith('omen/rain#retired-8');
  });
});
