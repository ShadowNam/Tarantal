// Review sheets of the interim birds (D-029): every clip of the tarentaal per plane, the hitbox
// overlay (content/birds.json, so the fit can be checked by eye), every variant, and the
// silhouette line-up against the kwêvoël and hadeda (bible §1 rule 6).
import type { ContentBundle } from '../../src/content/schemas';
import type { BirdClip } from '../../src/game/assets/assetIndex';
import type { PlaneId } from '../../src/sim/types';
import { NEAR_CLIPS } from '../assets/pack';
import { BIRD_BOX, CLIP_SPEC } from '../assets/targets';
import type { Rgba } from '../assets/image';
import { birdShape, renderBirdFrame } from './birdFrames';
import { clipsFor, GUN_IDS, type ArtConfig } from './config';
import { renderGunFrame } from './gunFrames';
import { gunClipNames, gunFrameCount } from './guns';
import { contactSheet, type SheetRow } from './sheets';
import { encodePng } from '../assets/image';
import { POT_SEAT_Y, POT_SIZE, renderPot } from './pot';
import { el } from './svg';

function frames(
  cfg: ArtConfig,
  content: ContentBundle,
  creature: string,
  plane: PlaneId,
  clip: BirdClip,
): Rgba[] {
  return Array.from({ length: CLIP_SPEC[clip].frames }, (_, k) =>
    renderBirdFrame(cfg, content, creature, plane, clip, k),
  );
}

/** The Generaal's pot where BirdView puts it: on the head hitbox, origin on the rim (D-029). */
function potOverlay(cfg: ArtConfig, content: ContentBundle, creature: string) {
  const s = birdShape(content, creature);
  const href = `data:image/png;base64,${Buffer.from(encodePng(renderPot(cfg))).toString('base64')}`;
  return (w: number): string => {
    const k = w / BIRD_BOX.width;
    const x = BIRD_BOX.originX * k + s.head.x * k - POT_SIZE.originX * k;
    const y = BIRD_BOX.originY * k + (s.head.y - s.head.r * 0.55) * k - POT_SEAT_Y * k;
    return el('image', { x, y, width: POT_SIZE.width * k, height: POT_SIZE.height * k, href });
  };
}

function hitboxOverlay(content: ContentBundle, creature: string) {
  const s = birdShape(content, creature);
  return (w: number): string => {
    const k = w / BIRD_BOX.width;
    const ox = BIRD_BOX.originX * k;
    const oy = BIRD_BOX.originY * k;
    const style = { fill: 'none', stroke: '#E0218A', 'stroke-width': 2, 'stroke-dasharray': '6 4' };
    return [
      el('ellipse', {
        cx: ox,
        cy: oy + s.body.oy * k,
        rx: s.body.rx * k,
        ry: s.body.ry * k,
        ...style,
      }),
      el('circle', { cx: ox + s.head.x * k, cy: oy + s.head.y * k, r: s.head.r * k, ...style }),
      el('circle', { cx: ox, cy: oy, r: 4, fill: '#E0218A' }),
    ].join('');
  };
}

export function birdSheets(
  cfg: ArtConfig,
  content: ContentBundle,
  only?: string,
): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  if (only === undefined || only === 'tarentaal') {
    const clips = clipsFor(cfg, 'tarentaal');
    const mid: SheetRow[] = clips.map((c) => ({
      label: `${c} (${CLIP_SPEC[c].frames} @ ${CLIP_SPEC[c].fps})`,
      frames: frames(cfg, content, 'tarentaal', 'mid', c),
    }));
    out.push([
      'tarentaal-clips-mid.png',
      contactSheet(cfg, 'Tarentaal — mid plane, all 11 clips (interim, D-029)', mid, 200),
    ]);
    const near: SheetRow[] = clips
      .filter((c) => NEAR_CLIPS.includes(c))
      .map((c) => ({ label: c, frames: frames(cfg, content, 'tarentaal', 'near', c) }));
    out.push([
      'tarentaal-clips-near.png',
      contactSheet(cfg, 'Tarentaal — near plane (pop-ups)', near, 300),
    ]);
    const far: SheetRow[] = clips.map((c) => ({
      label: c,
      frames: frames(cfg, content, 'tarentaal', 'far', c),
    }));
    out.push([
      'tarentaal-clips-far.png',
      contactSheet(
        cfg,
        'Tarentaal — far plane at 1:1 (fewer, larger dots; 2 px ink; sky tint)',
        far.map((r) => ({ ...r, frames: r.frames })),
        88,
      ),
    ]);
    const fit: SheetRow[] = (['forage_walk', 'alert', 'run', 'flap', 'peek'] as BirdClip[]).map(
      (c) => ({
        label: c,
        frames: frames(cfg, content, 'tarentaal', 'mid', c),
        overlay: hitboxOverlay(content, 'tarentaal'),
      }),
    );
    out.push([
      'tarentaal-hitboxes.png',
      contactSheet(
        cfg,
        'Hitbox fit — content/birds.json body + head (dashed), sim position (dot)',
        fit,
        200,
      ),
    ]);
  }
  const variants = Object.keys(cfg.birds.creatures).filter(
    (c) => c !== 'tarentaal' && (only === undefined || only === c),
  );
  if (variants.length > 0) {
    const rows: SheetRow[] = variants.map((v) => ({
      label: v,
      frames: clipsFor(cfg, v).map((c) => renderBirdFrame(cfg, content, v, 'mid', c, 0)),
      overlay: (w: number) =>
        hitboxOverlay(content, v)(w) + (v === 'generaal' ? potOverlay(cfg, content, v)(w) : ''),
    }));
    // The Generaal after the knock-off (his pot spun away): the bare stub-casque head.
    const bare = rows.find((r) => r.label === 'generaal');
    if (bare !== undefined)
      rows.push({
        ...bare,
        label: 'generaal (pot off)',
        overlay: hitboxOverlay(content, 'generaal'),
      });
    out.push([
      'variants.png',
      contactSheet(
        cfg,
        'Variants — first frame of each clip (mid plane), hitboxes dashed',
        rows,
        200,
      ),
    ]);
  }
  return out;
}

/** Every gun: one row per weapon, all clips side by side (idle, fire, reload, flash). */
export function gunSheets(cfg: ArtConfig, only?: string): [string, Uint8Array][] {
  const rows: SheetRow[] = [];
  for (const id of GUN_IDS) {
    if (only !== undefined && only !== id) continue;
    for (const clip of gunClipNames(cfg, id)) {
      if (clip === 'flash') continue;
      rows.push({
        label: `${id} ${clip}`,
        frames: Array.from({ length: gunFrameCount(cfg, id, clip) }, (_, k) =>
          renderGunFrame(cfg, id, clip, k),
        ),
      });
    }
  }
  const flashes: SheetRow[] = GUN_IDS.filter((id) => only === undefined || only === id).map(
    (id) => ({
      label: `${id} flash`,
      frames: Array.from({ length: gunFrameCount(cfg, id, 'flash') }, (_, k) =>
        renderGunFrame(cfg, id, 'flash', k),
      ),
    }),
  );
  return [
    [
      'guns.png',
      contactSheet(
        cfg,
        'Guns — idle, fire (recoil), reload (interim, D-029); muzzle at y = 80',
        rows,
        260,
      ),
    ],
    [
      'gun-flashes.png',
      contactSheet(
        cfg,
        'Muzzle flashes (200 × 200, local; "reduce flashes" dims them)',
        flashes,
        160,
      ),
    ],
  ];
}

/** sRGB relative luminance (WCAG 2) of an 8-bit colour. */
function luminance(r: number, g: number, b: number): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const hexRgb = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/** The bird's average colour (alpha-weighted) and its luminance. */
function birdMean(img: Rgba): { rgb: [number, number, number]; lum: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const w = (img.data[i + 3] ?? 0) / 255;
    r += (img.data[i] ?? 0) * w;
    g += (img.data[i + 1] ?? 0) * w;
    b += (img.data[i + 2] ?? 0) * w;
    a += w;
  }
  const rgb: [number, number, number] = [r / a, g / a, b / a].map(Math.round) as [
    number,
    number,
    number,
  ];
  return { rgb, lum: luminance(...rgb) };
}

function onColour(img: Rgba, hex: string, silhouette = false): Rgba {
  const [br, bg, bb] = hexRgb(hex);
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = (img.data[i + 3] ?? 0) / 255;
    const src = silhouette
      ? [27, 20, 16]
      : [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
    out[i] = Math.round((src[0] ?? 0) * a + br * (1 - a));
    out[i + 1] = Math.round((src[1] ?? 0) * a + bg * (1 - a));
    out[i + 2] = Math.round((src[2] ?? 0) * a + bb * (1 - a));
    out[i + 3] = 255;
  }
  return { ...img, data: out };
}

/**
 * Review 2 (bible §1 rule 5, "targets must pop"): every interim bird on the Karoo veld, soil and
 * sky colours plus its solid silhouette, and the WCAG contrast of the bird's average colour
 * against each background (docs/art-preview/contrast.json).
 */
export function contrastSheet(cfg: ArtConfig, content: ContentBundle): [string, Uint8Array][] {
  const grounds: Record<string, string> = {
    veld: '#E3A23B',
    'veld light': '#EDC277',
    soil: '#B8562C',
    'sky low': '#F2D8A7',
    'sky high': '#8DB8D8',
  };
  const rows: SheetRow[] = [];
  const report: Record<string, unknown> = {};
  const cases: [string, PlaneId, BirdClip][] = [
    ['tarentaal', 'near', 'peek'],
    ['tarentaal', 'mid', 'forage_walk'],
    ['tarentaal', 'mid', 'flap'],
    ['tarentaal', 'far', 'flap'],
    ...Object.keys(cfg.birds.creatures)
      .filter((c) => c !== 'tarentaal')
      .map((c): [string, PlaneId, BirdClip] => [c, 'mid', 'forage_walk']),
  ];
  for (const [creature, plane, clip] of cases) {
    const img = renderBirdFrame(cfg, content, creature, plane, clip, 0);
    const m = birdMean(img);
    const vs = Object.fromEntries(
      Object.entries(grounds).map(([name, hex]) => [
        name,
        Math.round(ratio(m.lum, luminance(...hexRgb(hex))) * 100) / 100,
      ]),
    );
    report[`${creature} ${plane} ${clip}`] = {
      meanRgb: m.rgb,
      luminance: Math.round(m.lum * 1000) / 1000,
      contrastVs: vs,
    };
    rows.push({
      label: `${creature} ${plane} (vs veld ${String(vs['veld'])}:1)`,
      frames: [
        ...Object.values(grounds).map((hex) => onColour(img, hex)),
        onColour(img, grounds['veld'] ?? '#E3A23B', true),
      ],
    });
  }
  return [
    [
      'contrast.png',
      contactSheet(
        cfg,
        'Contrast on the Karoo — veld, light veld, soil, low sky, high sky, silhouette',
        rows,
        160,
      ),
    ],
    ['contrast.json', new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`)],
  ];
}
