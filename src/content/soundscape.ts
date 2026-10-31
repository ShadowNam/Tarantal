// v1.9 (D-066): parses content/client/soundscape.json and checks its cross-references (the
// content tool and the lazy soundscape chunk; never in the sim bundle or its hash). Pure: no I/O.
import { SoundscapeSchema, type Soundscape } from './schemas';

export type SoundscapeResult =
  | { readonly ok: true; readonly soundscape: Soundscape }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseSoundscape(raw: unknown): SoundscapeResult {
  const r = SoundscapeSchema.safeParse(raw);
  if (r.success) return { ok: true, soundscape: r.data };
  return {
    ok: false,
    errors: r.error.issues.map(
      (i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`,
    ),
  };
}

export interface SoundscapeRefs {
  /** Every biome id (content/biomes, the Harvest's `oes` too). */
  readonly biomes: readonly string[];
  /** Every light preset (feel.json lights). */
  readonly lights: readonly string[];
  /** The layout lights the biomes' maps use (each needs a factor in every profile). */
  readonly layoutLights: readonly string[];
  /** Bonus maps' lights (each needs a hazeDb unless it is a layout light). */
  readonly bonusLights: readonly string[];
  /** Creature id → its kind (birds.json). */
  readonly creatures: ReadonlyMap<string, string>;
  /** Sound keys that have a sound (the interim renders, or a delivery). */
  readonly sounds: ReadonlySet<string>;
}

/** Cross-reference errors (empty = fine). */
export function checkSoundscape(sc: Soundscape, refs: SoundscapeRefs): string[] {
  const errors: string[] = [];
  const lights = new Set(refs.lights);
  const layout = new Set(refs.layoutLights);
  for (const b of refs.biomes)
    if (sc.areas[b] === undefined) errors.push(`areas: biome ${b} has no soundscape`);
  for (const a of Object.keys(sc.areas))
    if (!refs.biomes.includes(a)) errors.push(`areas.${a}: no such biome`);
  if (!lights.has(sc.defaultLight)) errors.push(`defaultLight ${sc.defaultLight}: no such light`);
  if (!layout.has(sc.defaultLight))
    errors.push(`defaultLight ${sc.defaultLight}: not a layout light (profiles have no factor)`);
  for (const h of Object.keys(sc.hazeDb))
    if (!lights.has(h)) errors.push(`hazeDb.${h}: no such light`);
  for (const l of refs.bonusLights)
    if (!layout.has(l) && sc.hazeDb[l] === undefined)
      errors.push(`hazeDb: bonus light ${l} has no entry`);
  for (const [name, p] of Object.entries(sc.profiles)) {
    for (const l of Object.keys(p))
      if (!lights.has(l)) errors.push(`profiles.${name}.${l}: no such light`);
    for (const l of layout)
      if (p[l] === undefined) errors.push(`profiles.${name}: no factor for layout light ${l}`);
  }
  for (const [id, c] of Object.entries(sc.calls)) {
    if (!refs.sounds.has(c.sound)) errors.push(`calls.${id}: sound ${c.sound} has no sound`);
    if (c.warns !== undefined) {
      const kind = refs.creatures.get(c.warns);
      if (kind === undefined) errors.push(`calls.${id}.warns: no creature ${c.warns}`);
      else if (kind !== 'nonTarget')
        errors.push(`calls.${id}.warns: ${c.warns} is not a penalty creature (${kind})`);
    }
  }
  const used = new Set<string>();
  for (const [area, list] of Object.entries(sc.areas))
    list.forEach((e, i) => {
      const at = `areas.${area}[${i}]`;
      const c = sc.calls[e.call];
      used.add(e.call);
      if (c === undefined) errors.push(`${at}: no call ${e.call}`);
      else if (c.warns !== undefined && e.distance !== 'far')
        errors.push(`${at}: ${e.call} sounds like a penalty creature: far only`);
      if (sc.profiles[e.profile] === undefined) errors.push(`${at}: no profile ${e.profile}`);
    });
  for (const id of Object.keys(sc.calls))
    if (!used.has(id)) errors.push(`calls.${id}: no area plays it`);
  return errors;
}
