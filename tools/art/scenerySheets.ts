// Contact sheets for graphics pass 2 (D-031): shared sprites, each biome's props and layers, and
// composed panoramas (left / centre / right of the hunt) with bird silhouettes to check contrast.
// Read from art-source/ after `npm run art:interim`; written to docs/art-preview/.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { Biome } from '../../src/content/schemas';
import { encodePng8, type Rgba } from '../assets/image';
import type { ArtConfig } from './config';
import { composeScene, shrink, type Stamp } from './scenePreview';
import { planeCentreX } from '../../src/sim/camera';
import { BIRD_BOX } from '../assets/targets';
import { contactSheet, type SheetRow } from './sheets';
import { SPRITES } from './sprites';
import { FLYERS } from './flyers';
import { readdirSync } from 'node:fs';

const SRC = join(import.meta.dirname, '..', '..', 'art-source');

function read(path: string): Rgba | null {
  if (!existsSync(path)) return null;
  const p = PNG.sync.read(readFileSync(path));
  return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
}

const sprite = (key: string): Rgba | null => read(join(SRC, 'sprites', `${key}.png`));

/** Shared sprites, grouped. */
export function spriteSheet(cfg: ArtConfig): [string, Uint8Array] {
  const groups: [string, (k: string) => boolean][] = [
    ['HUD', (k) => k.startsWith('ui/')],
    ['secrets', (k) => k.startsWith('secret/') || k === 'fx/glint' || k === 'fx/ring'],
    ['crate, helper', (k) => k.startsWith('crate/') || k.startsWith('helper/')],
    ['FX', (k) => ['fx/flash', 'fx/bubble', 'fx/grass_tuft', 'fx/feather'].includes(k)],
    [
      'particles',
      (k) =>
        k.startsWith('fx/') &&
        ![
          'fx/glint',
          'fx/ring',
          'fx/dust_devil',
          'fx/flash',
          'fx/bubble',
          'fx/grass_tuft',
          'fx/feather',
        ].includes(k),
    ],
    [
      'weather, water',
      (k) => k.startsWith('omen/') || k === 'biome/water' || k === 'fx/dust_devil',
    ],
  ];
  const rows: SheetRow[] = groups.map(([label, test]) => ({
    label,
    frames: SPRITES.filter((s) => test(s.key))
      .map((s) => sprite(s.key))
      .filter((f): f is Rgba => f !== null),
  }));
  return ['sprites.png', contactSheet(cfg, 'Shared sprites (interim, D-031)', rows, 200)];
}

/** One biome: its props, then each layer (shrunk), then three panoramas. */
export function biomeSheets(
  cfg: ArtConfig,
  biome: Biome,
  stamps: (cx: number) => readonly Stamp[] = (cx) => birdStamps(biome, cx),
): [string, Uint8Array][] {
  const props = biome.props.map((p) => sprite(p.asset)).filter((f): f is Rgba => f !== null);
  const layers: SheetRow[] = biome.layers
    .map((l) => ({ id: l.id, img: read(join(SRC, 'layers', biome.id, `${l.id}.png`)) }))
    .filter((l): l is { id: string; img: Rgba } => l.img !== null)
    .map((l) => ({ label: l.id, frames: [shrink(l.img, 1600)] }));
  const short = biome.id.split('-')[0] ?? biome.id;
  const out: [string, Uint8Array][] = [];
  out.push([
    `scenery-${short}-props.png`,
    contactSheet(
      cfg,
      `${biome.id}: props (interim, D-031)`,
      [{ label: 'props', frames: props }],
      300,
    ),
  ]);
  out.push([
    `scenery-${short}-layers.png`,
    contactSheet(
      cfg,
      `${biome.id}: parallax layers, full width (interim, D-031)`,
      layers.map((r) => ({ ...r, frames: r.frames })),
      90,
    ),
  ]);
  const pans = [960, 2560, 4160].map((cx) =>
    shrink(composeScene(biome, cx, 1920, stamps(cx)), 960),
  );
  out.push([
    `scenery-${short}-pan.png`,
    contactSheet(
      cfg,
      `${biome.id}: hunt view panned left, centre, right`,
      pans.map((p, i) => ({ label: ['left', 'centre', 'right'][i] ?? '', frames: [p] })),
      540,
    ),
  ]);
  return out;
}

/** A bird master frame scaled to its plane's @1x size, with the sim origin (bird box). */
function birdFrame(
  creature: string,
  plane: string,
  clip: string,
  frame: number,
  scale: number,
): Stamp | null {
  const img = read(
    join(SRC, 'birds', creature, 'planes', plane, clip, `${String(frame).padStart(2, '0')}.png`),
  );
  if (img === null) return null;
  const w = Math.round(BIRD_BOX.width * scale);
  return {
    layer: '',
    x: 0,
    y: 0,
    img: shrink(img, w),
    ox: BIRD_BOX.originX * scale,
    oy: BIRD_BOX.originY * scale,
  };
}

/**
 * Contrast check (bible §1 rule 5): interim birds where the game puts them: a mid flock on its
 * ground lane, far birds on theirs, a near pop-up, mid and far flyers in the sky band, a hadeda.
 */
export function birdStamps(biome: Biome, cx: number): Stamp[] {
  const out: Stamp[] = [];
  const at = (s: Stamp | null, layer: string, dx: number, y: number): void => {
    const l = biome.layers.find((x) => x.id === layer);
    if (s === null || l === undefined) return;
    out.push({ ...s, layer, x: planeCentreX(cx, l.scrollFactor) + dx, y });
  };
  const plane = (p: 'near' | 'mid' | 'far') => biome.layers.find((l) => l.plane === p)?.id ?? p;
  const { far, mid, near } = biome.lanes;
  // Lanes are optional per plane; the fallbacks are the Karoo's.
  const midGround = mid?.groundY ?? [690, 760];
  const midY = (midGround[0] + midGround[1]) / 2;
  const farGround = far?.groundY ?? [585, 610];
  const farSky = far?.skyY ?? [120, 300];
  const midSky = mid?.skyY ?? [160, 420];
  const popup = near?.popupY ?? [880, 960];
  for (const [i, dx] of [-260, -150, -40, 70, 190].entries())
    at(
      birdFrame('tarentaal', 'mid', i % 2 === 0 ? 'forage_walk' : 'peck', i, 0.5),
      plane('mid'),
      dx,
      midY + (i % 3) * 14,
    );
  for (const [i, dx] of [300, 360, 430].entries())
    at(
      birdFrame('tarentaal', 'far', 'forage_walk', i, 0.22),
      plane('far'),
      dx,
      farGround[0] + i * 8,
    );
  at(birdFrame('tarentaal', 'near', 'peek', 2, 1), plane('near'), -620, popup[0] + 20);
  at(birdFrame('tarentaal', 'mid', 'flap', 1, 0.5), plane('mid'), 420, midSky[0] + 60);
  at(birdFrame('tarentaal', 'far', 'flap', 3, 0.22), plane('far'), -480, farSky[1] - 40);
  at(birdFrame('hadeda', 'far', 'flap', 0, 0.22), plane('far'), 600, farSky[0] + 20);
  return out;
}

/** Non-target and special flyers: every packed clip, per plane (masters, not to scale). */
export function flyerSheet(cfg: ArtConfig): [string, Uint8Array] {
  const rows: SheetRow[] = [];
  for (const [creature, planes] of Object.entries(FLYERS))
    for (const [plane, clips] of Object.entries(planes))
      for (const clip of clips) {
        const dir = join(SRC, 'birds', creature, 'planes', plane, clip);
        if (!existsSync(dir)) continue;
        const frames = readdirSync(dir)
          .filter((f) => f.endsWith('.png'))
          .sort()
          .map((f) => read(join(dir, f)))
          .filter((f): f is Rgba => f !== null);
        rows.push({ label: `${creature} ${plane} ${clip}`, frames });
      }
  return [
    'flyers.png',
    contactSheet(cfg, 'Non-target and special flyers (interim, D-031)', rows, 150),
  ];
}

export const png8 = encodePng8;
