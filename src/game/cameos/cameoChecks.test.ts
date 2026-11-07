import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { cameoSheetErrors } from './cameoChecks';

describe('cameos.json against the sheets (D-075)', () => {
  it('every area’s kinds are drawn on that area’s sheet', () => {
    expect(cameoSheetErrors(loadContent().cameos)).toEqual([]);
  });
  it('a kind put on another area’s map is caught', () => {
    const errs = cameoSheetErrors({ areas: [{ biome: 'karoo-autumn', cameos: ['springbok'] }] });
    expect(errs).toHaveLength(1);
    expect(cameoSheetErrors({ areas: [{ biome: 'namibie', cameos: ['elephants'] }] })).toHaveLength(
      1,
    );
    expect(cameoSheetErrors({ areas: [{ biome: 'oes', cameos: ['tortoise'] }] })).toHaveLength(1);
  });
});
