// v1.8b (D-062): whether a raid spot is clear on a map. Where its raiders stand at their mischief
// (the first at the spot, the second pairGapPx further out) they must never cover a secret's part,
// a tell animal, a meerkat colony or an ostrich pair on the spot's layer (a pellet stops on a
// raider before it reaches them). Layouts move props, colonies and pairs, so the hunt leaves out
// the spots that are blocked on its map (createBaboons), and content validation checks every map
// keeps enough clear spots (src/content/baboonChecks.ts). Pure: the sim and the checks share it.
import type { Biome, Birds, Scoring } from '../../content/schemas';
import { coreWidth } from '../world';
import { spotPoint } from './baboons';
import type { RaidSpot } from '../../content/schemas';

/** Clear space (layer px) a raider keeps from a secret part, a tell, a colony or a pair. */
export const RAIDER_CLEAR_PX = 16;

const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] < b[1] && b[0] < a[1];

/** Why a spot is blocked on this map (empty: clear). Structural problems (unknown layer or prop,
 *  not a mid or near plane) are reported too. */
export function spotBlockers(
  m: Biome,
  s: RaidSpot,
  birds: Pick<Birds, 'baboons' | 'tells' | 'meerkats' | 'ostriches'>,
  planes: Scoring['planes'],
): string[] {
  const out: string[] = [];
  const T = birds.baboons;
  const layer = m.layers.find((l) => l.id === s.layer);
  const plane = layer?.plane;
  if (layer === undefined || (plane !== 'mid' && plane !== 'near'))
    return ['is not on the mid or near plane'];
  const p = spotPoint(m, s);
  if (p === null) return [`names unknown prop "${s.prop ?? ''}"`];
  const boxes = [T.hitboxes.sit, T.hitboxes.walk, T.hitboxes.stand];
  let halfW = 0;
  let height = 0;
  for (const b of boxes)
    for (const e of [b.body, b.head]) {
      halfW = Math.max(halfW, e.rx + Math.abs(e.ox));
      height = Math.max(height, e.ry - e.oy);
    }
  const k = planes[plane].scale;
  const w = coreWidth(layer.scrollFactor);
  const second = p.x + s.from * T.raids.pairGapPx * k;
  const reach = halfW * k;
  const span: [number, number] = [Math.min(p.x, second) - reach, Math.max(p.x, second) + reach];
  if (p.x - reach < 0 || p.x + reach > w) out.push('is off its layer');
  if (p.y > 1080) out.push('is below the screen');
  const band: [number, number] = [p.y - height * k, p.y];
  const box = (cx: number, cy: number, hw: number, hh: number): boolean =>
    overlaps([cx - hw - RAIDER_CLEAR_PX, cx + hw + RAIDER_CLEAR_PX], span) &&
    overlaps([cy - hh - RAIDER_CLEAR_PX, cy + hh + RAIDER_CLEAR_PX], band);
  for (const prop of m.props) {
    const sec = prop.secret;
    if (prop.layer !== s.layer || sec === undefined) continue;
    const px = prop.u * w;
    const parts = sec.type === 'multiHit' ? sec.parts : [sec.part];
    for (const part of parts) {
      const sh = part.shape;
      const hw = sh.type === 'rect' ? sh.w / 2 : sh.rx;
      const hh = sh.type === 'rect' ? sh.h / 2 : sh.ry;
      if (box(px + sh.ox, prop.y + sh.oy, hw, hh))
        out.push(`covers secret "${prop.id}" part "${part.id}"`);
    }
    const tell = sec.tell;
    const sp = birds.tells.species.find((x) => x.id === tell?.species);
    if (tell !== undefined && sp !== undefined) {
      const sk = sp.scale ?? 1;
      const f = tell.facing ?? 1;
      const tx = px + tell.ox + sp.hit.ox * sk * f;
      if (box(tx, prop.y + tell.oy + sp.hit.oy * sk, sp.hit.rx * sk, sp.hit.ry * sk))
        out.push(`covers secret "${prop.id}"'s tell animal`);
    }
  }
  for (const c of m.colonies ?? []) {
    if (c.layer !== s.layer) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of c.burrows) {
      lo = Math.min(lo, c.u * w + b.dx);
      hi = Math.max(hi, c.u * w + b.dx);
    }
    const r = birds.meerkats.forageRadiusPx * k + RAIDER_CLEAR_PX;
    if (overlaps([lo - r, hi + r], span)) out.push(`stands in meerkat colony "${c.id}"`);
  }
  for (const f of m.ostriches ?? []) {
    if (f.layer !== s.layer) continue;
    const cx = f.u * w;
    const r = (f.rangePx + birds.ostriches.hitboxes.nest.rx) * k + RAIDER_CLEAR_PX;
    if (overlaps([cx - r, cx + r], span)) out.push(`stands in ostrich pair "${f.id}"'s range`);
  }
  return out;
}
