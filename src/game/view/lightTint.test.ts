import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeel } from '../../content/feel';
import type { Light } from '../../content/schemas';
import { lightTint, multiplyRgb } from './lightTint';

const feel = parseFeel(
  JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', '..', 'content/client/feel.json'), 'utf8'),
  ),
);
if (!feel.ok) throw new Error('feel.json invalid');
const lights = feel.feel.lights;
const light = (id: string): Light => {
  const l = lights[id];
  if (l === undefined) throw new Error(id);
  return l;
};

describe('the map light on a layer (v1.7c, D-047: trees and their fruit alike)', () => {
  it('no light, or none for that layer: untinted', () => {
    expect(lightTint([], 'mid')).toBe(0xffffff);
    expect(lightTint([light('overcast')], 'no_such_layer')).toBe(0xffffff);
  });

  it("is the light's own tint for one light (Wednesday's overcast mid plane)", () => {
    expect(lightTint([light('overcast')], 'mid')).toBe(0xc3c5c8);
  });

  it('compounds several lights channel by channel, like filters', () => {
    const a = light('golden');
    const b = light('dusty_wind');
    const both = lightTint([a, b], 'mid');
    expect(both).toBe(multiplyRgb(lightTint([a], 'mid'), lightTint([b], 'mid')));
    expect(multiplyRgb(0x808080, 0xffffff)).toBe(0x808080);
    expect(multiplyRgb(0xff8000, 0x80ff40)).toBe(0x808000);
  });
});
