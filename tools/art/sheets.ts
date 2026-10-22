// Contact sheets for review (D-029): labelled rows of frames on a paper background, written to
// docs/art-preview/. Labels use a system font when one is there (docs only; never game art).
import { existsSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { encodePng, type Rgba } from '../assets/image';
import type { ArtConfig } from './config';
import { el, r2 } from './svg';

export interface SheetRow {
  readonly label: string;
  readonly frames: readonly Rgba[];
  /** Optional SVG drawn over each cell, in cell px (e.g. the hitboxes). */
  readonly overlay?: (cellW: number, cellH: number) => string;
}

const FONTS = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

const dataUri = (img: Rgba): string =>
  `data:image/png;base64,${Buffer.from(encodePng(img)).toString('base64')}`;

/** One sheet: rows of frames scaled to `cellH` px tall, a label column on the left. */
export function contactSheet(
  cfg: ArtConfig,
  title: string,
  rows: readonly SheetRow[],
  cellH: number,
): Uint8Array {
  const gap = cfg.sheets.gap;
  const labelW = 220;
  const titleH = 56;
  const cols = Math.max(...rows.map((r) => r.frames.length));
  const cellW = Math.max(
    ...rows.flatMap((r) => r.frames.map((f) => Math.round((f.width / f.height) * cellH))),
  );
  const W = labelW + cols * (cellW + gap) + gap;
  const H = titleH + rows.length * (cellH + gap) + gap;
  const parts: string[] = [
    el('rect', { x: 0, y: 0, width: W, height: H, fill: cfg.sheets.background }),
    el(
      'text',
      {
        x: gap,
        y: 38,
        'font-family': 'DejaVu Sans',
        'font-size': 28,
        'font-weight': 'bold',
        fill: cfg.ink,
      },
      title,
    ),
  ];
  rows.forEach((row, ri) => {
    const y = titleH + ri * (cellH + gap);
    parts.push(
      el(
        'text',
        {
          x: gap,
          y: y + cellH / 2 + 8,
          'font-family': 'DejaVu Sans',
          'font-size': 20,
          fill: cfg.ink,
        },
        row.label,
      ),
    );
    row.frames.forEach((f, ci) => {
      const x = labelW + ci * (cellW + gap);
      const w = Math.round((f.width / f.height) * cellH);
      parts.push(
        el('rect', { x, y, width: cellW, height: cellH, fill: cfg.sheets.checker, rx: 6 }),
      );
      parts.push(
        el('image', { x: x + (cellW - w) / 2, y, width: w, height: cellH, href: dataUri(f) }),
      );
      if (row.overlay !== undefined)
        parts.push(
          `<g transform="translate(${r2(x + (cellW - w) / 2)} ${r2(y)})">${row.overlay(w, cellH)}</g>`,
        );
    });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
  const png = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: FONTS.filter((f) => existsSync(f)),
      defaultFontFamily: 'DejaVu Sans',
    },
  })
    .render()
    .asPng();
  const img = PNG.sync.read(png);
  return encodePng({ width: img.width, height: img.height, data: new Uint8Array(img.data) });
}
