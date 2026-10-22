// M10 asset pipeline: loudness meter, WAV, shelf packing and a full pack of a tiny delivery.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ASSET_INDEX_PATH, parseAssetIndex } from '../../src/game/assets/assetIndex';
import { loadContent } from '../testContent';
import { buildCatalog } from './catalog';
import { blank, encodePng, readPng, resize } from './image';
import { applyGain, integratedLufs, normaliseGainDb, truePeakDb } from './loudness';
import { packAssets } from './pack';
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
    expect(index.audio['sfx/click']?.lufs).toBeCloseTo(-14, 0);
    const tile = index.layers['karoo/far_ridge']?.tiles[0];
    expect(readPng(join(out, tile?.path ?? '')).width).toBe(2048);

    put('sprites/ui/not_a_key.png', encodePng(blank(4, 4)));
    const bad = await packAssets({ src, publicDir: out, content, catalog });
    expect(bad.errors.some((e) => e.includes('not_a_key'))).toBe(true);
  }, 60_000);
});
