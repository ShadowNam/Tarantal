import { describe, expect, it } from 'vitest';
import type { GunLook, Weapon } from '../../content/schemas';
import { loadContent, loadFeel } from '../../../tools/testContent';
import {
  ammoSlots,
  checkGunLook,
  crosshairExtent,
  crosshairPrims,
  crosshairWeapon,
  gunLookFor,
  pileRows,
  type AmmoState,
} from './gunLook';

const feel = loadFeel();
const guns = feel.guns;
const weapons = loadContent().weapons.weapons;
const weapon = (id: string): Weapon => {
  const w = weapons.find((x) => x.id === id);
  if (w === undefined) throw new Error(id);
  return w;
};
const belt = { x: 1000, y: 900, w: 392, h: 96 };
const state = (o: Partial<AmmoState>): AmmoState => ({
  shells: 8,
  magazine: 8,
  reloading: false,
  reloadProgress: 0,
  perShellReload: false,
  cooldownTicks: 0,
  ticksLeft: null,
  totalTicks: null,
  ...o,
});
const slotsFor = (id: string, o: Partial<AmmoState>) => {
  const look = gunLookFor(guns, id);
  return ammoSlots(look.ammo, look.type, look.typeId, state(o), belt);
};

describe('gun look content (D-032)', () => {
  it('every weapon has an ammo display and crosshair that fit it', () => {
    expect(checkGunLook(guns, weapons)).toEqual([]);
  });

  it('flags a missing look and a layout that does not fit the weapon', () => {
    const broken: GunLook = {
      ...guns,
      weapons: {
        ...guns.weapons,
        dubbelloop: {
          crosshair: gunLookFor(guns, 'dubbelloop').crosshair,
          ammo: { layout: 'pile', type: 'shell12', count: 3 },
        },
      },
    };
    delete broken.weapons['kettie'];
    const errs = checkGunLook(broken, weapons);
    expect(errs.some((e) => e.includes('no look for weapon "kettie"'))).toBe(true);
    expect(errs.some((e) => e.includes('dubbelloop: a pile is for unlimited ammo'))).toBe(true);
  });

  it('adding a gun (the .22) is data only: a new ammo type and look', () => {
    const tweeTwee: Weapon = { ...weapon('windbuks'), id: 'twee_twee' };
    const more: GunLook = {
      ...guns,
      ammo: {
        ...guns.ammo,
        rimfire22: {
          width: 14,
          height: 44,
          pitch: 30,
          spent: 'sprite',
          body: '#C9A04A',
          base: '#8C9196',
        },
      },
      weapons: {
        ...guns.weapons,
        twee_twee: {
          ammo: { layout: 'belt', type: 'rimfire22' },
          crosshair: { parts: [{ shape: 'cross', gap: 6, len: 18, width: 0.6 }], jitterPx: 0 },
        },
      },
    };
    expect(checkGunLook(more, [...weapons, tweeTwee])).toEqual([]);
    const look = gunLookFor(more, 'twee_twee');
    const slots = ammoSlots(
      look.ammo,
      look.type,
      look.typeId,
      state({ magazine: 5, shells: 2 }),
      belt,
    );
    expect(slots.map((s) => s.key)).toEqual([
      'ui/ammo/rimfire22',
      'ui/ammo/rimfire22',
      'ui/ammo/rimfire22_spent',
      'ui/ammo/rimfire22_spent',
      'ui/ammo/rimfire22_spent',
    ]);
  });
});

describe('ammo on the HUD', () => {
  it('shotguns: 12-gauge shells, fired ones show as spent hulls', () => {
    const s = slotsFor('dubbelloop', { shells: 3 });
    expect(s.filter((x) => x.key === 'ui/ammo/shell12')).toHaveLength(3);
    expect(s.filter((x) => x.key === 'ui/ammo/shell12_spent')).toHaveLength(5);
    expect(
      slotsFor('pomp', { magazine: 6, shells: 6 }).every((x) => x.key === 'ui/ammo/shell12'),
    ).toBe(true);
    // Right-aligned, loaded rounds on the left, all inside the belt.
    for (const x of s) {
      expect(x.x).toBeGreaterThan(belt.x);
      expect(x.x).toBeLessThan(belt.x + belt.w);
    }
    expect(s[0]?.x ?? 0).toBeLessThan(s[7]?.x ?? 0);
  });

  it('Windbuks: diabolo pellets; a fired pellet is gone; the loading one fades in', () => {
    expect(slotsFor('windbuks', { magazine: 6, shells: 2 }).map((x) => x.key)).toEqual([
      'ui/ammo/diabolo',
      'ui/ammo/diabolo',
    ]);
    const loading = slotsFor('windbuks', {
      magazine: 6,
      shells: 2,
      reloading: true,
      perShellReload: true,
      reloadProgress: 0.5,
    });
    expect(loading).toHaveLength(3);
    expect(loading[2]?.alpha).toBeCloseTo(0.675);
  });

  it('Kettie: a pile of river stones, the top one gone while the band is drawn', () => {
    expect(pileRows(5)).toEqual([3, 2]);
    expect(slotsFor('kettie', { magazine: -1, shells: -1 })).toHaveLength(5);
    const drawing = slotsFor('kettie', { magazine: -1, shells: -1, cooldownTicks: 10 });
    expect(drawing).toHaveLength(4);
    expect(drawing.every((x) => x.key === 'ui/ammo/stone')).toBe(true);
  });

  it('Voorlaaier: paper cartridges, fired ones torn', () => {
    const s = slotsFor('voorlaaier', { magazine: 3, shells: 1 });
    expect(s.map((x) => x.key)).toEqual([
      'ui/ammo/paper',
      'ui/ammo/paper_spent',
      'ui/ammo/paper_spent',
    ]);
  });

  it('Mielie-Masjien: the hopper empties with the time left', () => {
    const s = slotsFor('mielie_masjien', {
      magazine: -1,
      shells: -1,
      ticksLeft: 150,
      totalTicks: 600,
    });
    expect(s.map((x) => x.key)).toEqual(['ui/ammo/kernel_spent', 'ui/ammo/kernel']);
    expect(s[1]?.fill).toBeCloseTo(1 - 0.84 + 0.72 * 0.25);
  });
});

describe('crosshairs show the spread', () => {
  const extent = (id: string): number =>
    crosshairExtent(crosshairPrims(gunLookFor(guns, id).crosshair, crosshairWeapon(weapon(id))));
  const ringR = (id: string): number => {
    const prims = crosshairPrims(gunLookFor(guns, id).crosshair, crosshairWeapon(weapon(id)));
    const ring = prims.find((p) => p.kind === 'path' && p.pts.length > 4);
    if (ring === undefined || ring.kind !== 'path') return 0;
    return Math.max(...ring.pts.map(([x, y]) => Math.hypot(x, y)));
  };

  it('shotgun ring = the pellet spread; the Pomp is tighter', () => {
    expect(ringR('dubbelloop')).toBeCloseTo(weapon('dubbelloop').spreadPx, 0);
    expect(ringR('pomp')).toBeCloseTo(weapon('pomp').spreadPx, 0);
    expect(ringR('pomp')).toBeLessThan(ringR('dubbelloop'));
  });

  it('Windbuks: a fine dot with a thin ring, much smaller than a shotgun', () => {
    const prims = crosshairPrims(
      gunLookFor(guns, 'windbuks').crosshair,
      crosshairWeapon(weapon('windbuks')),
    );
    expect(prims.some((p) => p.kind === 'dot')).toBe(true);
    expect(extent('windbuks')).toBeLessThan(40);
  });

  it('Kettie: a V and a drop line reaching the far-band drop', () => {
    const w = weapon('kettie');
    const far = w.kind === 'primary' ? (w.projectile?.dropPx.far ?? 0) : 0;
    const prims = crosshairPrims(gunLookFor(guns, 'kettie').crosshair, crosshairWeapon(w));
    const ys = prims.flatMap((p) => (p.kind === 'path' ? p.pts.map(([, y]) => y) : []));
    expect(Math.max(...ys)).toBe(far);
    expect(Math.min(...ys)).toBeLessThan(0); // the V's arms above the point
  });

  it('Voorlaaier: a very wide rough ring; Mielie-Masjien jitters', () => {
    expect(ringR('voorlaaier')).toBeGreaterThan(weapon('voorlaaier').spreadPx * 0.9);
    expect(gunLookFor(guns, 'mielie_masjien').crosshair.jitterPx).toBeGreaterThan(0);
    expect(gunLookFor(guns, 'dubbelloop').crosshair.jitterPx).toBe(0);
  });
});
