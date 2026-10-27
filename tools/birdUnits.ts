// D-049 / D-054: the guineafowl as drawn, measured from its delivered frames: the yardstick the
// far animals are sized by (tools/perspective-audit.ts, tools/art/interim.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { opaqueBounds, type Rgba } from './assets/image';
import { pxPerMetre } from './perspective';

const SRC = join(import.meta.dirname, '..', 'art-source');
/** Width of the bird box in bird units (the frames are drawn into it). */
const BOX_W = 620;

function read(path: string): Rgba {
  const p = PNG.sync.read(readFileSync(path));
  return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
}

/** A clip's first master frame: its opaque height in bird units (scale 1). */
export function birdUnits(clip: string): number {
  const dir = join(SRC, 'birds', 'tarentaal', 'planes', 'mid', clip);
  const file = readdirSync(dir).sort()[0];
  if (file === undefined) throw new Error(`no ${clip} frames`);
  const img = read(join(dir, file));
  return ((opaqueBounds(img)?.h ?? 0) * BOX_W) / img.width;
}

/** Design px per metre on a plane of `scale`, from the standing guineafowl (0.5 m) there. */
export function planePxPerMetre(scale: number): number {
  return pxPerMetre(birdUnits('alert') * scale);
}
