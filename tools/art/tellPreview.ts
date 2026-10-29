// v1.7e (D-061): each secret's prop with its tell animal stamped on, straight from art-source/
// (no browser), to place the tells: the prop art at 1:1, the tell's frame at its feet, the
// secret's part outlined in red and the tell's hit shape in blue. A grid, 2× zoom.
// Run: npx tsx tools/art/tellPreview.ts <out.png> [pose]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blank, crop, encodePng, readPng, resize, type Rgba } from '../assets/image';
import { loadContent } from '../testContent';
import { over } from './scenePreview';
import { renderTellSheet } from './tells';
import { tellFrames, type TellPose } from '../../src/game/view/tell/tellSheet';

const ROOT = join(import.meta.dirname, '..', '..');
const out = process.argv[2] ?? join(ROOT, 'tell-preview.png');
const pose = (process.argv[3] ?? 'rest') as TellPose;
const content = loadContent();
const sheet = renderTellSheet(2);
const frames = tellFrames();
const CELL = 640;

function flipX(img: Rgba): Rgba {
  const o = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const a = (y * img.width + x) * 4;
      const b = (y * img.width + (img.width - 1 - x)) * 4;
      o.data.set(img.data.subarray(a, a + 4), b);
    }
  return o;
}

function dot(img: Rgba, x: number, y: number, c: readonly number[]): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return;
  img.data.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255], (yi * img.width + xi) * 4);
}

function ellipse(
  img: Rgba,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: readonly number[],
): void {
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    dot(img, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c);
  }
}

const cells: Rgba[] = [];
for (const b of content.biomes)
  for (const prop of b.props) {
    const tell = prop.secret?.tell;
    if (tell === undefined || prop.secret === undefined) continue;
    const png = join(ROOT, 'art-source', 'sprites', `${prop.asset}.png`);
    if (!existsSync(png)) continue;
    const side = JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf8')) as {
      master?: number;
      originX?: number;
      originY?: number;
    };
    const raw = readPng(png);
    const k = side.master ?? 1;
    const img = k === 1 ? raw : resize(raw, Math.round(raw.width / k), Math.round(raw.height / k));
    const cell = blank(CELL, CELL);
    for (let i = 0; i < cell.data.length; i += 4) cell.data.set([200, 214, 226, 255], i);
    // The prop's content origin at the cell's centre-ish (lower middle).
    const px = CELL / 2;
    const py = CELL * 0.62;
    over(
      cell,
      img,
      px - (side.originX ?? 0.5) * img.width,
      py - (side.originY ?? 0.5) * img.height,
    );
    const f = frames.find((x) => x.name === `${tell.species}_${pose}`);
    const sp = content.birds.tells.species.find((s) => s.id === tell.species);
    if (f !== undefined && sp !== undefined) {
      const k = sp.scale ?? 1;
      const fw = Math.round(f.w * k);
      const fh = Math.round(f.h * k);
      let fr = resize(crop(sheet, f.x * 2, f.y * 2, f.w * 2, f.h * 2), fw, fh);
      const facing = tell.facing ?? 1;
      if (facing === -1) fr = flipX(fr);
      const ox = (facing === -1 ? f.w - f.ox : f.ox) * k;
      over(cell, fr, px + tell.ox - ox, py + tell.oy - f.oy * k);
      ellipse(
        cell,
        px + tell.ox + sp.hit.ox * k * facing,
        py + tell.oy + sp.hit.oy * k,
        sp.hit.rx * k,
        sp.hit.ry * k,
        [40, 90, 230],
      );
    }
    const parts = prop.secret.type === 'multiHit' ? prop.secret.parts : [prop.secret.part];
    for (const part of parts) {
      const s = part.shape;
      if (s.type === 'ellipse') ellipse(cell, px + s.ox, py + s.oy, s.rx, s.ry, [220, 40, 40]);
      else
        for (let t = 0; t <= 1; t += 0.002) {
          dot(cell, px + s.ox - s.w / 2 + s.w * t, py + s.oy - s.h / 2, [220, 40, 40]);
          dot(cell, px + s.ox - s.w / 2 + s.w * t, py + s.oy + s.h / 2, [220, 40, 40]);
          dot(cell, px + s.ox - s.w / 2, py + s.oy - s.h / 2 + s.h * t, [220, 40, 40]);
          dot(cell, px + s.ox + s.w / 2, py + s.oy - s.h / 2 + s.h * t, [220, 40, 40]);
        }
    }
    cells.push(cell);
  }
const cols = 4;
const grid = blank(CELL * cols, CELL * Math.ceil(cells.length / cols));
cells.forEach((c, i) => {
  over(grid, c, (i % cols) * CELL, Math.floor(i / cols) * CELL);
});
writeFileSync(out, encodePng(grid));
console.log(`${cells.length} props`);
