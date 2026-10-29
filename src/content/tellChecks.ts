// v1.7e (D-061): content checks for the secrets' tell animals. Every secret that pays something
// names a tell (the cue that replaced the hint glint); a "don't shoot it" prop (a penalty, the
// weaver nests) has none, since a tell would lure the player to it. The species exists, each one
// lives at one secret only, and the tell's hit shape (with a small margin) never covers any part
// of its secret, where it stands or anywhere a rotor's parts sweep. Tells sit relative to their
// prop, so a layout that moves the prop moves its tell along: checking the biome's props covers
// every map.
import type { Biome, ContentBundle } from './schemas';

/** Clear space (layer px) between a tell's hit shape and its secret's parts. */
export const TELL_CLEAR_PX = 4;

type Shape =
  | { type: 'rect'; w: number; h: number; ox: number; oy: number }
  | { type: 'ellipse'; rx: number; ry: number; ox: number; oy: number };

function inShape(px: number, py: number, s: Shape, grow: number): boolean {
  if (s.type === 'rect')
    return Math.abs(px - s.ox) <= s.w / 2 + grow && Math.abs(py - s.oy) <= s.h / 2 + grow;
  const dx = (px - s.ox) / (s.rx + grow);
  const dy = (py - s.oy) / (s.ry + grow);
  return dx * dx + dy * dy <= 1;
}

/** Points on and inside an ellipse (its centre, two rings of 16). */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number): [number, number][] {
  const out: [number, number][] = [[cx, cy]];
  for (const k of [0.5, 1])
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
  return out;
}

/** The species' ids that a bundle's biomes use, with where (for the one-secret-each check). */
export function tellUses(bundle: ContentBundle): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const b of bundle.biomes)
    for (const p of b.props) {
      const t = p.secret?.tell;
      if (t !== undefined) out.set(t.species, [...(out.get(t.species) ?? []), `${b.id}/${p.id}`]);
    }
  return out;
}

export function tellIssues(bundle: ContentBundle, biome: Biome): string[] {
  const out: string[] = [];
  const species = new Map(bundle.birds.tells.species.map((s) => [s.id, s]));
  const uses = tellUses(bundle);
  for (const prop of biome.props) {
    const sec = prop.secret;
    if (sec === undefined) continue;
    const where = `secret "${prop.id}"`;
    const penalty = sec.reward.penalty !== undefined;
    if (sec.tell === undefined) {
      if (!penalty) out.push(`${where} has no tell animal (D-061: every secret names one)`);
      continue;
    }
    if (penalty) {
      out.push(`${where} is a "don't shoot it" prop: it gets no tell animal`);
      continue;
    }
    const sp = species.get(sec.tell.species);
    if (sp === undefined) {
      out.push(`${where} names unknown tell species "${sec.tell.species}"`);
      continue;
    }
    const at = uses.get(sp.id) ?? [];
    if (at.length > 1) out.push(`${where}: tell species "${sp.id}" lives at ${at.join(', ')}`);
    const f = sec.tell.facing ?? 1;
    const k = sp.scale ?? 1;
    const pts = ellipsePoints(
      sec.tell.ox + sp.hit.ox * k * f,
      sec.tell.oy + sp.hit.oy * k,
      sp.hit.rx * k,
      sp.hit.ry * k,
    );
    const parts = sec.type === 'multiHit' ? sec.parts : [sec.part];
    const rotor = sec.type === 'multiHit' ? sec.rotor : undefined;
    for (const part of parts) {
      const s = part.shape;
      let covers: boolean;
      if (rotor === undefined) covers = pts.some(([x, y]) => inShape(x, y, s, TELL_CLEAR_PX));
      else {
        // The part orbits the rotor: keep clear of the whole ring it sweeps.
        const r = Math.hypot(s.ox, s.oy);
        const pr = s.type === 'rect' ? Math.hypot(s.w, s.h) / 2 : Math.max(s.rx, s.ry);
        covers = pts.some(([x, y]) => {
          const d = Math.hypot(x - rotor.ox, y - rotor.oy);
          return d >= r - pr - TELL_CLEAR_PX && d <= r + pr + TELL_CLEAR_PX;
        });
      }
      if (covers) out.push(`${where}: the tell "${sp.id}" covers part "${part.id}"`);
    }
  }
  return out;
}
