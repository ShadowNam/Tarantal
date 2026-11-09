// v1.17b (D-080): the far herds load lazily, maybe after a dim was set: tintOf gives them the
// tint their layer is going to.
import { describe, expect, it } from 'vitest';
import { LayerDimmer } from './layerDimmer';

describe('LayerDimmer.tintOf (D-080)', () => {
  it('is the layer’s base, then its dimmed tint once set; unknown layers have none', () => {
    const d = new LayerDimmer([
      { id: 'far_veld', base: 0xffffff, images: () => [], fauna: () => [] },
    ]);
    expect(d.tintOf('far_veld')).toBe(0xffffff);
    d.set(new Map([['far_veld', 0x808080]]));
    expect(d.tintOf('far_veld')).toBe(0x808080);
    expect(d.tintOf('mid')).toBeUndefined();
  });
});
