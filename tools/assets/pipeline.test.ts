// M10 asset pipeline: loudness meter, WAV, shelf packing and a full pack of a tiny delivery.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { ASSET_INDEX_PATH, parseAssetIndex } from '../../src/game/assets/assetIndex';
import { loadContent } from '../testContent';
import { buildCatalog } from './catalog';
import { blank, encodePng, readPng, resize } from './image';
import { applyGain, integratedLufs, normaliseGainDb, truePeakDb } from './loudness';
import { nearlySame, packAssets } from './pack';
import { shelfPack, shelfPackPages } from './shelfPack';
import { readWav, writeWav, type Pcm } from './wav';

const sine = (db: number, seconds: number, hz = 997, rate = 48000): Pcm => {
  const a = 10 ** (db / 20);
  const ch = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < ch.length; i++) ch[i] = a * Math.sin((2 * Math.PI * hz * i) / rate);
  return { sampleRate: rate, channels: [ch] };
};

const tmp: string[] = [];
afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
});

describe('loudness (BS.1770)', () => {
  it('a 997 Hz sine at −20 dBFS reads −23.0 LUFS (mono reference)', () => {
    expect(integratedLufs(sine(-20, 3))).toBeCloseTo(-23.0, 1);
  });
  it('normalises to the target without crossing the true-peak ceiling', () => {
    const quiet = sine(-30, 2);
    const g = normaliseGainDb(quiet, -14, -1);
    expect(integratedLufs(applyGain(quiet, g))).toBeCloseTo(-14, 1);
    const loud = sine(-1, 2);
    const g2 = normaliseGainDb(loud, -14, -1);
    expect(truePeakDb(applyGain(loud, g2))).toBeLessThanOrEqual(-1 + 1e-6);
  });
  it('silence has no loudness and gets no gain', () => {
    const s: Pcm = { sampleRate: 44100, channels: [new Float32Array(44100)] };
    expect(integratedLufs(s)).toBe(-Infinity);
    expect(normaliseGainDb(s, -14, -1)).toBe(0);
  });
});

describe('wav + images', () => {
  it('16-bit WAV round-trips', () => {
    const pcm = sine(-6, 0.1, 440, 44100);
    const back = readWav(writeWav(pcm));
    expect(back.sampleRate).toBe(44100);
    expect(back.channels[0]?.[100]).toBeCloseTo(pcm.channels[0]?.[100] ?? 0, 3);
  });
  it('area-average resize keeps a flat colour and full alpha', () => {
    const img = blank(8, 8);
    img.data.fill(200);
    const small = resize(img, 3, 3);
    expect([...small.data.subarray(0, 4)]).toEqual([200, 200, 200, 200]);
  });
});

describe('frame merging (D-029 final review)', () => {
  const frame = (): ReturnType<typeof blank> => {
    const img = blank(120, 80);
    for (let i = 0; i < img.data.length; i += 4) img.data.set([46, 47, 69, 255], i);
    return img;
  };
  const withBlock = (delta: number) => {
    const img = frame();
    for (let y = 30; y < 40; y++)
      for (let x = 50; x < 70; x++)
        img.data.set([46 + delta, 47 + delta, 69 + delta, 255], (y * 120 + x) * 4);
    return img;
  };
  it('a 20 × 10 block that differs keeps two frames apart, even by a small step', () => {
    expect(nearlySame(frame(), withBlock(200), 2)).toBe(false);
    expect(nearlySame(frame(), withBlock(20), 2)).toBe(false);
  });
  it('exact repeats and ±2 rounding still merge', () => {
    expect(nearlySame(frame(), frame(), 2)).toBe(true);
    expect(nearlySame(frame(), withBlock(2), 2)).toBe(true);
  });
});

describe('shelf packing', () => {
  it('packs into a power-of-two page without overlaps', () => {
    const rects = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, width: 100, height: 60 }));
    const r = shelfPack(rects, 512);
    expect(r.placed).toHaveLength(10);
    expect([r.width, r.height]).toEqual([512, 128]);
    for (const a of r.placed)
      for (const b of r.placed)
        if (a !== b)
          expect(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
          ).toBe(true);
  });
  it('spills onto more pages when one is full', () => {
    const rects = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, width: 200, height: 200 }));
    const pages = shelfPackPages(rects, 512);
    expect(pages.length).toBe(8);
    expect(pages.reduce((n, p) => n + p.placed.length, 0)).toBe(30);
  });
});

describe('pack-atlases', () => {
  it('packs a sprite, a layer and a sound into a valid index; unknown keys are errors', async () => {
    const content = loadContent();
    const catalog = await buildCatalog(content);
    const src = mkdtempSync(join(tmpdir(), 'tm-pack-src-'));
    const out = mkdtempSync(join(tmpdir(), 'tm-pack-out-'));
    tmp.push(src, out);
    const put = (p: string, b: Uint8Array) => {
      mkdirSync(dirname(join(src, p)), { recursive: true });
      writeFileSync(join(src, p), b);
    };
    const shell = catalog.entries.get('ui/shell');
    expect(shell?.kind).toBe('texture');
    put('sprites/ui/shell.png', encodePng(blank(shell?.width ?? 1, shell?.height ?? 1)));
    const ridge = catalog.layers.get('karoo/far_ridge');
    put('layers/karoo-autumn/far_ridge.png', encodePng(blank(ridge?.width ?? 1, 50)));
    // D-031: a layer sidecar marks interim art and asks for palette tiles.
    put(
      'layers/karoo-autumn/far_ridge.json',
      new TextEncoder().encode('{"top":400,"origin":"interim","encode":"png8"}'),
    );
    const wav = sine(-20, 0.3, 440, 44100);
    put('audio/sfx/click.wav', writeWav(wav));
    const r = await packAssets({ src, publicDir: out, content, catalog });
    expect(r.errors).toEqual([]);
    const { index, error } = parseAssetIndex(
      JSON.parse(readFileSync(join(out, ASSET_INDEX_PATH), 'utf8')),
    );
    expect(error).toBeNull();
    expect(index.initialGroups).toEqual(['common', 'karoo-autumn']);
    expect(index.images['ui/shell']?.group).toBe('common');
    expect(index.layers['karoo/far_ridge']?.tiles).toHaveLength(2);
    expect(index.layers['karoo/far_ridge']?.origin).toBe('interim');
    expect(index.layers['karoo/far_ridge']?.top).toBe(400);
    expect(index.audio['sfx/click']?.lufs).toBeCloseTo(-14, 0);
    const tile = index.layers['karoo/far_ridge']?.tiles[0];
    expect(readPng(join(out, tile?.path ?? '')).width).toBe(2048);
    // `encode: png8` writes palette tiles (PNG colour type 3, byte 25 of the file).
    expect(readFileSync(join(out, tile?.path ?? ''))[25]).toBe(3);

    // D-029: per-plane bird masters, @1x-only palette atlases, interim provenance, guns.
    const disc = (w: number, h: number) => {
      const img = blank(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if ((x - w / 2) ** 2 / (w / 4) ** 2 + (y - h / 2) ** 2 / (h / 4) ** 2 < 1)
            img.data.set([40, 50, 70, 255], (y * w + x) * 4);
      return encodePng(img);
    };
    put(
      'birds/tarentaal/rig.json',
      new TextEncoder().encode('{"origin":"interim","x2":false,"encode":"png8","group":"late"}'),
    );
    put('birds/tarentaal/flap/00.png', disc(620, 400));
    put('birds/tarentaal/forage_walk/00.png', disc(620, 400));
    put('birds/tarentaal/forage_walk/01.png', disc(620, 400));
    put('birds/tarentaal/peek/00.png', disc(620, 400));
    // A frame that differs from flap/00 only by a small block: must stay its own frame.
    const flap1 = PNG.sync.read(Buffer.from(disc(620, 400)));
    for (let y = 190; y < 210; y++)
      for (let x = 290; x < 330; x++) flap1.data.set([215, 38, 61, 255], (y * 620 + x) * 4);
    put('birds/tarentaal/flap/01.png', PNG.sync.write(flap1));
    put('birds/tarentaal/planes/far/flap/00.png', disc(272, 176));
    put(
      'guns/pomp/rig.json',
      new TextEncoder().encode('{"origin":"interim","x2":false,"tipY":0.05}'),
    );
    put('guns/pomp/idle/00.png', disc(420, 520));
    put('guns/pomp/fire/00.png', disc(420, 520));
    put('guns/pomp/flash/00.png', disc(200, 200));
    const d = await packAssets({ src, publicDir: out, content, catalog });
    expect(d.errors).toEqual([]);
    const mid = d.index.birds['tarentaal']?.mid;
    expect(mid?.origin).toBe('interim');
    expect(mid?.x2).toBeUndefined();
    const page = mid?.x1.pages[0];
    const json = JSON.parse(readFileSync(join(out, page?.data.path ?? ''), 'utf8')) as {
      frames: Record<string, { trimmed: boolean; frame: { w: number }; sourceSize: { w: number } }>;
    };
    // Never trimmed (Phaser 4.2.1 mis-draws trimmed frames in animations, D-029 §3): cropped to
    // the clip's opaque bounds instead, with the sim position as the frame's pivot.
    const flap = json.frames['flap/00'] as unknown as {
      trimmed: boolean;
      frame: { w: number; h: number };
      pivot: { x: number; y: number };
    };
    expect(flap.trimmed).toBe(false);
    expect(flap.frame.w).toBeLessThan(200);
    expect(mid?.pivots).toBe(true);
    // The disc is centred in the box; the sim position (310, 230) of the 620 × 400 box, halved.
    expect(flap.frame.w * flap.pivot.x).toBeCloseTo(155 - (310 / 2 - flap.frame.w / 2), 0);
    // Identical frames of a clip are packed once and named twice.
    expect(mid?.clips.forage_walk?.frames).toEqual(['forage_walk/00', 'forage_walk/00']);
    expect(mid?.clips.flap?.frames).toEqual(['flap/00', 'flap/01']);
    expect(mid?.group).toBe('late');
    // The palette PNG decodes back to an image.
    expect(readPng(join(out, page?.image.path ?? '')).width).toBeGreaterThan(0);
    // The far plane uses its own master (only flap there): forage_walk still comes from the shared one.
    expect(Object.keys(d.index.birds['tarentaal']?.far?.clips ?? {}).sort()).toEqual([
      'flap',
      'forage_walk',
      'peek',
    ]);
    // Near frames stay untrimmed (pop-ups crop at the grass line in frame px).
    const near = d.index.birds['tarentaal']?.near?.x1.pages[0];
    const nearJson = JSON.parse(readFileSync(join(out, near?.data.path ?? ''), 'utf8')) as {
      frames: Record<string, { trimmed: boolean }>;
    };
    expect(Object.values(nearJson.frames).every((f) => !f.trimmed)).toBe(true);
    const gun = d.index.guns['pomp'];
    expect(gun?.origin).toBe('interim');
    expect(gun?.tipY).toBe(0.05);
    expect(gun?.originY).toBe(1);
    expect(Object.keys(gun?.clips ?? {}).sort()).toEqual(['fire', 'flash', 'idle']);

    put('guns/pomp/recoil/00.png', disc(420, 520));
    put('sprites/ui/not_a_key.png', encodePng(blank(4, 4)));
    const bad = await packAssets({ src, publicDir: out, content, catalog });
    expect(bad.errors.some((e) => e.includes('not_a_key'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('guns/pomp/recoil'))).toBe(true);
  }, 60_000);
});
