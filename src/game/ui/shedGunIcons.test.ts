import { describe, expect, it } from 'vitest';
import { loadShedPictures } from './shedGunIcons';
import { SHED_GUN_SHEET, SHED_GUN_SHEET_W } from './shedGunSheet';

describe('the Gun Shed side views (v1.19, D-084)', () => {
  it('cuts each gun from the sheet at the delivered file scale', async () => {
    const asked: string[] = [];
    const img = { naturalWidth: SHED_GUN_SHEET_W * 2 } as HTMLImageElement;
    const pics = await loadShedPictures({
      loadOnDemand: (key: string) => {
        asked.push(key);
        return Promise.resolve(img);
      },
    });
    expect(asked).toEqual([SHED_GUN_SHEET]);
    const pomp = pics?.picture('pomp');
    expect(pomp?.img).toBe(img);
    expect(pomp?.region).toEqual({ page: 0, x: 760, y: 280, w: 760, h: 280, rotated: false });
    expect(pics?.picture('vuvuzela')).toBeNull();
  });

  it('has nothing without a delivered sheet', async () => {
    expect(await loadShedPictures({ loadOnDemand: () => Promise.resolve(null) })).toBeNull();
  });
});
