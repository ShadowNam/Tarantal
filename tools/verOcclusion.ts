// v1.4 B (D-039 review): how much of a map's Ver feeding spots is hidden behind nearer art at the
// map's opening camera. Composes only what draws in front of the Ver plane (the far veld, mid,
// near and foreground layers and their props, from art-source/ exactly as ParallaxView places
// them; Tech §3.3: planeX = (cx − 960) × f + 960 + dx) and measures the opaque share of the band
// where Ver birds stand (the feeding spot's u range × the Ver lane, bird height above it).
//   npx tsx tools/verOcclusion.ts [biome]      prints the table
import type { Biome } from '../src/content/schemas';
import { BONUS_MAP_IDS, WEEKDAY_IDS } from '../src/content/schemas';
import { planeToDx } from '../src/sim/camera';
import { resolveMap } from '../src/sim/maps';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from '../src/sim/world';
import { composeScene } from './art/scenePreview';
import { createSim } from '../src/sim/Sim';
import { loadContent } from './testContent';

/** Design width of the measured screen (16:9). */
const WIDTH = 1920;
/** Ver birds' height above their feet (design px): the bird box × the Ver scale, generously. */
const BIRD_PX = 16;

export interface VerOcclusionRow {
  readonly map: string;
  readonly cameraU: number;
  /** Opaque share (0..1) of the Ver birds' band over the map's Ver feeding spots. */
  readonly hidden: number;
}

/** The opening camera centre of a resolved map (Sim.ts: cameraStartU, else the middle). */
function openingCamera(b: Biome): number {
  const u = b.cameraStartU;
  return u === undefined
    ? (CAMERA_MIN_X + CAMERA_MAX_X) / 2
    : CAMERA_MIN_X + u * (CAMERA_MAX_X - CAMERA_MIN_X);
}

/** Occlusion of the Ver feeding spots on every map of `biomeId` that opens the Ver plane. */
export function verOcclusion(biomeId: string): VerOcclusionRow[] {
  const content = loadContent();
  const base = content.biomes.find((b) => b.id === biomeId);
  if (base === undefined) throw new Error(`no biome ${biomeId}`);
  const rows: VerOcclusionRow[] = [];
  const maps: [string, string, string | null][] = [];
  for (const l of WEEKDAY_IDS) {
    maps.push([l, l, null]);
    for (const bonus of BONUS_MAP_IDS) maps.push([`${l}+${bonus}`, l, bonus]);
  }
  for (const [name, layout, bonus] of maps) {
    const m = resolveMap(base, layout, bonus ?? undefined);
    const ver = m.biome.layers.find((x) => x.plane === 'ver');
    const lane = m.biome.lanes.ver;
    const spots = (m.biome.feedingSpots ?? []).filter((s) => s.plane === 'ver');
    if (!m.ver || ver === undefined || lane === undefined || !('groundY' in lane)) continue;
    if (spots.length === 0) continue;
    const ground = lane.groundY;
    if (ground === undefined) continue;
    const cx = openingCamera(m.biome);
    // Only what draws in front of the Ver plane.
    const front: Biome = {
      ...m.biome,
      layers: m.biome.layers.filter((x) => x.scrollFactor > ver.scrollFactor),
      props: m.biome.props.filter((p) =>
        m.biome.layers.some((x) => x.id === p.layer && x.scrollFactor > ver.scrollFactor),
      ),
    };
    const img = composeScene(front, cx, WIDTH);
    let opaque = 0;
    let total = 0;
    for (const s of spots) {
      const w = coreWidth(ver.scrollFactor);
      const x0 = Math.round(WIDTH / 2 + planeToDx(cx, ver.scrollFactor, s.u[0] * w));
      const x1 = Math.round(WIDTH / 2 + planeToDx(cx, ver.scrollFactor, s.u[1] * w));
      for (let y = Math.round(ground[0] - BIRD_PX); y <= Math.round(ground[1]); y++)
        for (let x = Math.max(0, x0); x <= Math.min(WIDTH - 1, x1); x++) {
          total++;
          if ((img.data[(y * WIDTH + x) * 4 + 3] ?? 0) > 128) opaque++;
        }
    }
    rows.push({
      map: name,
      cameraU: m.biome.cameraStartU ?? 0.5,
      hidden: total === 0 ? 0 : opaque / total,
    });
  }
  return rows;
}

/**
 * The reviewer's measure: the share of Ver birds (sampled every half second over `seconds` of
 * `seeds` hunts, no shots) whose body is behind nearer art at the map's opening camera.
 */
export function verBirdsHidden(
  biomeId: string,
  layout: string,
  bonus: string | undefined,
  seeds: number,
  seconds = 60,
): number {
  const content = loadContent();
  const base = content.biomes.find((b) => b.id === biomeId);
  if (base === undefined) throw new Error(`no biome ${biomeId}`);
  const m = resolveMap(base, layout, bonus);
  const ver = m.biome.layers.find((x) => x.plane === 'ver');
  if (ver === undefined) return 0;
  const cx = openingCamera(m.biome);
  const front: Biome = {
    ...m.biome,
    layers: m.biome.layers.filter((x) => x.scrollFactor > ver.scrollFactor),
    props: m.biome.props.filter((p) =>
      m.biome.layers.some((x) => x.id === p.layer && x.scrollFactor > ver.scrollFactor),
    ),
  };
  const img = composeScene(front, cx, WIDTH);
  let hidden = 0;
  let total = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = createSim({
      seed,
      content,
      mode: { id: 'classic', biome: biomeId, layout, ...(bonus === undefined ? {} : { bonus }) },
      inputKind: 'pointer',
    });
    for (let t = 0; t < seconds * 60; t += 30) {
      for (let k = 0; k < 30; k++) sim.step([]);
      for (const b of sim.snapshot().birds) {
        if (b.plane !== 'ver') continue;
        const x = Math.round(WIDTH / 2 + planeToDx(cx, ver.scrollFactor, b.x));
        if (x < 0 || x >= WIDTH) continue;
        total++;
        // The bird's body: a few px above its feet.
        const y = Math.round(b.y - BIRD_PX / 2);
        if ((img.data[(y * WIDTH + x) * 4 + 3] ?? 0) > 128) hidden++;
      }
    }
  }
  return total === 0 ? 0 : hidden / total;
}

if (process.argv[1]?.endsWith('verOcclusion.ts')) {
  const biome = process.argv[2] ?? 'namibie';
  for (const r of verOcclusion(biome))
    console.log(
      `${r.map.padEnd(16)} camera u ${r.cameraU.toFixed(2)}  spot hidden ${(r.hidden * 100).toFixed(1)} %  birds hidden ${(
        verBirdsHidden(biome, r.map.split('+')[0] ?? r.map, r.map.split('+')[1], 20) * 100
      ).toFixed(1)} %`,
    );
}
