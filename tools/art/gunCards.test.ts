// v1.19 (D-084): the Gun Shed's side-view sheet: one cell per gun the game has, each picture
// inside its cell with a clear margin (nothing clipped at a cell edge, nothing bleeding into the
// next card), and every gun distinct.
import { describe, expect, it } from 'vitest';
import {
  SHED_GUN_CELL,
  SHED_GUN_ORDER,
  SHED_GUN_SHEET_H,
  SHED_GUN_SHEET_W,
  isShedGun,
  shedGunCell,
} from '../../src/game/ui/shedGunSheet';
import { loadContent } from '../testContent';
import { renderGunCardSheet } from './gunCards';

describe('Gun Shed side views (D-084)', () => {
  it('has a cell for every gun in weapons.json', () => {
    const ids = loadContent().weapons.weapons.map((w) => w.id);
    for (const id of ids) expect(isShedGun(id), id).toBe(true);
    expect(new Set(SHED_GUN_ORDER).size).toBe(SHED_GUN_ORDER.length);
  });

  it('places cells in a grid inside the sheet', () => {
    for (const id of SHED_GUN_ORDER) {
      const c = shedGunCell(id, 1);
      expect(c).not.toBeNull();
      if (c === null) continue;
      expect(c.x + c.w).toBeLessThanOrEqual(SHED_GUN_SHEET_W);
      expect(c.y + c.h).toBeLessThanOrEqual(SHED_GUN_SHEET_H);
    }
    expect(shedGunCell('vuvuzela')).toBeNull();
  });

  it('draws each gun inside its cell with a margin, and no two alike', () => {
    const img = renderGunCardSheet(1);
    expect(img.width).toBe(SHED_GUN_SHEET_W);
    const signatures = new Set<string>();
    for (const id of SHED_GUN_ORDER) {
      const c = shedGunCell(id, 1);
      if (c === null) continue;
      let opaque = 0;
      let edge = 0;
      let sum = 0;
      for (let y = c.y; y < c.y + c.h; y++)
        for (let x = c.x; x < c.x + c.w; x++) {
          const i = (y * img.width + x) * 4;
          const a = img.data[i + 3] ?? 0;
          if (a < 40) continue;
          opaque++;
          sum += (img.data[i] ?? 0) + x + y;
          const m = 2;
          if (x < c.x + m || x >= c.x + c.w - m || y < c.y + m || y >= c.y + c.h - m) edge++;
        }
      expect(opaque, id).toBeGreaterThan(SHED_GUN_CELL.w * SHED_GUN_CELL.h * 0.06);
      expect(edge, `${id} touches its cell edge`).toBe(0);
      signatures.add(`${opaque}:${sum}`);
    }
    expect(signatures.size).toBe(SHED_GUN_ORDER.length);
  });
});
