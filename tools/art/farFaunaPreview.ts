// D-054: a contact sheet of every far animal look (all poses and variants) on a veld-coloured
// ground, for checking the drawing by eye: `npx tsx tools/art/farFaunaPreview.ts <out.png> [species…]`.
import { writeFileSync } from 'node:fs';
import { encodePng } from '../assets/image';
import {
  lookHeight,
  type FaunaPose,
  type FaunaSpecies,
  type FaunaVariant,
} from '../../src/game/view/faunaHerds';
import { drawLook } from './farFauna';
import { FAUNA_M } from '../../src/game/view/faunaHerds';
const FAUNA_M_OF = (sp: FaunaSpecies): number => FAUNA_M[sp];
import { renderSvg } from './raster';
import { resetIds } from './scenery';
import { svgDoc } from './svg';

const H: Readonly<Record<FaunaSpecies, number>> = {
  elephant: 252,
  giraffe: 394,
  zebra: 106,
  wildebeest: 110,
  gemsbok: 95,
  springbok: 63,
  ostrich: 197,
  lechwe: 79,
};
const out = process.argv[2] ?? 'fauna-preview.png';
const want = process.argv.slice(3) as FaunaSpecies[];
const species = want.length > 0 ? want : (Object.keys(H) as FaunaSpecies[]);
const looks: [FaunaPose, FaunaVariant][] = [
  ['alert', 'm'],
  ['graze', 'f'],
  ['walk', 'm'],
  ['alert', 'y'],
];
const cellW = (sp: FaunaSpecies): number =>
  H[sp] * (sp === 'giraffe' ? 0.9 : sp === 'ostrich' ? 0.8 : 2.1);
const rowH = (sp: FaunaSpecies): number =>
  H[sp] * (sp === 'giraffe' || sp === 'ostrich' ? 1.25 : 1.6);
const W = Math.max(...species.map((s) => cellW(s) * looks.length)) + 40;
const Ht = species.reduce((a, s) => a + rowH(s), 0) + 20;
resetIds();
let y = 10;
const body: string[] = [`<rect x="0" y="0" width="${W}" height="${Ht}" fill="#C9B48E"/>`];
for (const sp of species) {
  y += rowH(sp);
  looks.forEach(([pose, variant], i) => {
    const d = drawLook(
      {
        species: sp,
        pose: sp === 'giraffe' && i === 1 ? 'graze' : pose,
        variant,
        h: lookHeight(sp, variant, H[sp] / FAUNA_M_OF(sp)),
      },
      { wading: sp === 'lechwe' && i === 3, ...(sp === 'elephant' ? { dust: '#A07E62' } : {}) },
    );
    const x = 20 + cellW(sp) * (i + 0.5);
    const p = d.parts;
    body.push(
      `<g transform="translate(${x} ${y - 8})">${p.tail ?? ''}${p.body ?? ''}${p.head ?? ''}${p.ear ?? ''}</g>`,
    );
  });
}
const k = Number(process.env['ZOOM'] ?? '1');
writeFileSync(
  out,
  encodePng(
    renderSvg(svgDoc(Math.round(W * k), Math.round(Ht * k), [0, 0, W, Ht], '', body.join(''))),
  ),
);
console.log(out, Math.round(W), Math.round(Ht));
