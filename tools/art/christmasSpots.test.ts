// D-064: nothing floating, nothing out of reach. Every Christmas present spot (feesdae.json) stands
// on the line its prop's art stands on (within 2 px of the prop's lowest solid row under the box),
// is partly covered by the prop but never wholly (fair to find: its middle shows), and on every
// Daily map and weekday layout fits the camera sweep and the view's height. Every tinsel anchor
// (feel.json looks.christmas) hangs on the tree's drawn branches.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESENT_GROUND_PX } from '../../src/game/feesdae/christmasAssets';
import { planeToDx } from '../../src/sim/camera';
import { resolveMap } from '../../src/sim/maps';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from '../../src/sim/world';
import { readPng, type Rgba } from '../assets/image';
import { loadContent, loadDailyMeta, loadFeel } from '../testContent';

const root = join(import.meta.dirname, '..', '..');
const content = loadContent();
const feel = loadFeel();
const index = JSON.parse(
  readFileSync(join(root, 'public', 'assets', 'asset-index.json'), 'utf8'),
) as {
  images: Record<
    string,
    { file: { path: string }; scale?: number; originX?: number; originY?: number }
  >;
};
const christmas = content.feesdae.specials.find((f) => f.id === 'christmas');
if (christmas?.twist.rule !== 'kersfees') throw new Error('no christmas in feesdae.json');
const presents = christmas.twist.presents;
const MID = content.scoring.planes.mid;
/** The present's box (no bow) as drawn on the mid plane, design px. */
const BOX_W = 120 * MID.scale;
const BOX_H = 100 * MID.scale;
/** The narrowest view's half width (4:3 at 1080 tall) and the HUD's top band. */
const HALF_VIEW = 720;
const HUD_TOP = 120;

interface PropArt {
  readonly img: Rgba;
  readonly scale: number;
  readonly ox: number;
  readonly oy: number;
}
const arts = new Map<string, PropArt>();
function artOf(asset: string): PropArt {
  const got = arts.get(asset);
  if (got !== undefined) return got;
  const e = index.images[asset];
  if (e === undefined) throw new Error(`no art for ${asset}`);
  const img = readPng(join(root, 'public', e.file.path));
  const art = {
    img,
    scale: e.scale ?? 1,
    ox: (e.originX ?? 0.5) * img.width,
    oy: (e.originY ?? 0.5) * img.height,
  };
  arts.set(asset, art);
  return art;
}
/** Alpha at a point relative to the prop's position (design px). */
function alphaAt(a: PropArt, x: number, y: number): number {
  const px = Math.round(x / a.scale + a.ox);
  const py = Math.round(y / a.scale + a.oy);
  if (px < 0 || py < 0 || px >= a.img.width || py >= a.img.height) return 0;
  return a.img.data[(py * a.img.width + px) * 4 + 3] ?? 0;
}
const SOLID = 200;

function propOf(id: string): { asset: string } {
  for (const b of content.biomes) {
    const p = b.props.find((x) => x.id === id);
    if (p !== undefined) return p;
  }
  throw new Error(`no prop ${id}`);
}

describe('Christmas presents stand on drawn ground (D-064)', () => {
  it('the content lift matches the sheet (a present’s foot is PRESENT_GROUND_PX below its middle)', () => {
    expect(presents.lift).toBe(PRESENT_GROUND_PX);
  });

  for (const s of presents.spots)
    it(`${s.prop} ${s.dx}: on its prop's ground line, partly covered, its middle showing`, () => {
      const a = artOf(propOf(s.prop).asset);
      // The prop's lowest solid row under the box (its foot, a rock's base, a trunk's root).
      let foot = -Infinity;
      for (let x = Math.ceil(s.dx - BOX_W / 2); x <= s.dx + BOX_W / 2; x++)
        for (let y = 500; y > -500; y--)
          if (alphaAt(a, x, y) > SOLID) {
            foot = Math.max(foot, y);
            break;
          }
      expect(Math.abs(foot - s.dy), `foot at ${s.dy}, art at ${foot}`).toBeLessThanOrEqual(2);
      let covered = 0;
      let n = 0;
      for (let x = s.dx - BOX_W / 2; x <= s.dx + BOX_W / 2; x++)
        for (let y = s.dy - BOX_H; y <= s.dy; y++) {
          n++;
          if (alphaAt(a, x, y) > SOLID) covered++;
        }
      const share = covered / n;
      expect(share, 'tucked in: the prop covers part of it').toBeGreaterThanOrEqual(0.1);
      expect(share, 'fair: most of it shows').toBeLessThanOrEqual(0.5);
      expect(alphaAt(a, s.dx, s.dy - BOX_H / 2), 'its middle shows').toBeLessThanOrEqual(SOLID);
    });

  it('on every Daily map and weekday, every present fits the camera sweep and the view', () => {
    const meta = loadDailyMeta();
    const sf = MID.scrollFactor;
    for (const biomeId of meta.biomeRotation) {
      const biome = content.biomes.find((b) => b.id === biomeId);
      if (biome === undefined) throw new Error(`no biome ${biomeId}`);
      for (const layout of biome.layouts) {
        const map = resolveMap(biome, layout.id, undefined).biome;
        for (const s of presents.spots) {
          const prop = map.props.find((p) => p.id === s.prop);
          if (prop === undefined) continue;
          const x = prop.u * coreWidth(sf) + s.dx;
          const cx = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (x - 960) / sf + 960));
          const where = `${biomeId} ${layout.id} ${s.prop} ${s.dx}`;
          expect(Math.abs(planeToDx(cx, sf, x)), where).toBeLessThanOrEqual(HALF_VIEW - BOX_W);
          const y = prop.y + s.dy;
          expect(y - BOX_H, where).toBeGreaterThan(HUD_TOP);
          expect(y, where).toBeLessThan(1080);
        }
      }
    }
  });
});

describe('Christmas tinsel hangs on the tree (D-064)', () => {
  for (const t of feel.feesdae.looks.christmas.tinsel)
    it(`${t.prop}: every garland hook and bauble is on (or within 14 px of) the drawn tree`, () => {
      const a = artOf(propOf(t.prop).asset);
      const near = (x: number, y: number): boolean => {
        for (let dy = -14; dy <= 14; dy += 2)
          for (let dx = -14; dx <= 14; dx += 2) if (alphaAt(a, x + dx, y + dy) > SOLID) return true;
        return false;
      };
      for (const g of t.garlands) {
        expect(near(...g.from), `${t.prop} garland from ${g.from.join(',')}`).toBe(true);
        expect(near(...g.to), `${t.prop} garland to ${g.to.join(',')}`).toBe(true);
      }
      for (const b of t.baubles)
        expect(near(...b.at), `${t.prop} bauble ${b.at.join(',')}`).toBe(true);
    });
});
