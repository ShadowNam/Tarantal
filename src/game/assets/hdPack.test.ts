// D-053: HD group naming and the HD texture's half-size frames.
import { describe, expect, it } from 'vitest';
import { baseGroupOf, hdAllowed, hdGroupOf, isHdGroup } from './hdPack';
import { halveTexture, type FrameLike } from './hdTexture';

describe('HD groups', () => {
  it('every group has an -hd twin', () => {
    expect(hdGroupOf('common')).toBe('common-hd');
    expect(hdGroupOf('bushveld-winter')).toBe('bushveld-winter-hd');
    expect(isHdGroup('late-hd')).toBe(true);
    expect(isHdGroup('late')).toBe(false);
    expect(isHdGroup('voice-af')).toBe(false);
    expect(baseGroupOf('okavango-spring-hd')).toBe('okavango-spring');
    expect(baseGroupOf('ver')).toBe('ver');
  });

  it('cropped sprites drawn without a view scale stay Standard', () => {
    expect(hdAllowed('ui/ammo/shell')).toBe(false);
    expect(hdAllowed('helper/meerkat')).toBe(false);
    expect(hdAllowed('biome/water')).toBe(false);
    expect(hdAllowed('fx/feather')).toBe(true);
  });
});

describe('halveTexture', () => {
  const frame = (w: number, h: number): FrameLike => ({
    width: w,
    height: h,
    halfWidth: w / 2,
    halfHeight: h / 2,
    centerX: w / 2,
    centerY: h / 2,
    x: 0,
    y: 0,
    cutWidth: w,
    cutHeight: h,
    data: {
      sourceSize: { w, h },
      spriteSourceSize: { x: 0, y: 0, w, h, r: w, b: h },
      radius: Math.hypot(w, h) / 2,
    },
  });

  it('a 2× texture reports and draws the standard bounds', () => {
    const std = frame(120, 80);
    const hd = frame(240, 160);
    const tex = { source: [{ resolution: 1 }], frames: { __BASE: hd } };
    halveTexture(tex, 2);
    // What Phaser sizes an image by (realWidth = sourceSize) and what particles draw (width).
    expect(hd.data.sourceSize).toEqual(std.data.sourceSize);
    expect([hd.width, hd.height, hd.halfWidth, hd.halfHeight]).toEqual([
      std.width,
      std.height,
      std.halfWidth,
      std.halfHeight,
    ]);
    expect(hd.data.spriteSourceSize).toEqual(std.data.spriteSourceSize);
    expect(hd.data.radius).toBeCloseTo(std.data.radius);
    // The UVs still cut the whole 2× image; the quad is cut / resolution = the standard size.
    expect(hd.cutWidth / (tex.source[0]?.resolution ?? 1)).toBe(std.width);
    expect(hd.cutHeight / (tex.source[0]?.resolution ?? 1)).toBe(std.height);
  });

  it('k = 1 changes nothing', () => {
    const f = frame(10, 10);
    const tex = { source: [{ resolution: 1 }], frames: { a: f } };
    halveTexture(tex, 1);
    expect(f.width).toBe(10);
    expect(tex.source[0]?.resolution).toBe(1);
  });
});
