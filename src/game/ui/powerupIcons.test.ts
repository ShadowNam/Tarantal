import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { powerupIcon, powerupIconEpoch, upgradePowerupIcons } from './powerupIcons';

describe('power-up icons (D-046)', () => {
  it('every power-up and crate gun has its key', () => {
    expect(powerupIcon('boeretroos')).toBe('ui/pu_boeretroos');
    expect(powerupIcon('voorlaaier')).toBe('ui/pu_voorlaaier');
  });

  it('a late swap of the placeholders bumps the epoch views watch; nothing swapped, no bump', () => {
    const textures = {} as Phaser.Textures.TextureManager;
    const asked: string[] = [];
    const none = { upgrade: (_t: unknown, prefix: string) => (asked.push(prefix), []) };
    const some = { upgrade: () => ['ui/pu_boeretroos', 'ui/pu_voorlaaier'] };
    const e0 = powerupIconEpoch();
    expect(upgradePowerupIcons(none, textures)).toBe(0);
    expect(asked).toEqual(['ui/pu_']);
    expect(powerupIconEpoch()).toBe(e0);
    expect(upgradePowerupIcons(some, textures)).toBe(2);
    expect(powerupIconEpoch()).toBe(e0 + 1);
  });
});
