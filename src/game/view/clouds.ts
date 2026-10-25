// v1.6 (D-042, product owner 25 Oct: "The clouds need to be more realistic"): each biome's
// fair-weather cloud deck, drawn from four soft sprites (cumulus, a wide cumulus, cirrus wisps,
// a building tower) on the sky layer, so they sit behind the mountains. They drift slowly on sim
// time (a held frame holds still) and grey over on weather days. Pure layout and motion here,
// unit-tested; ParallaxView places the images. Cumulus stay low, under the flyers' sky band
// (bible §1 rule 5); only faint cirrus cross it.
import { TEX } from '../assets/AssetManifest';

export type CloudKind = 'cumulus' | 'wide' | 'cirrus' | 'tower';

export const CLOUD_TEX: Readonly<Record<CloudKind, string>> = {
  cumulus: TEX.cloudCumulus,
  wide: TEX.cloudWide,
  cirrus: TEX.cloudCirrus,
  tower: TEX.cloudTower,
};

/** The sprites are drawn at half size: shown at this scale for their nominal width. */
export const CLOUD_SPRITE_SCALE = 2;

export interface CloudDeck {
  readonly kind: CloudKind;
  readonly count: number;
  /** Design y of the cloud's base line (cirrus: its middle). */
  readonly y: readonly [number, number];
  /** Shown width (design px). */
  readonly w: readonly [number, number];
  /** Multiply tint (sunlit colour of the biome's light) and opacity. */
  readonly tint: string;
  readonly alpha: number;
}

/** Fair-weather decks per biome (dry biomes: cirrus and small cumulus; Okavango builds up). */
export const CLOUD_DECKS: Readonly<Record<string, readonly CloudDeck[]>> = {
  'karoo-autumn': [
    { kind: 'cumulus', count: 5, y: [500, 560], w: [240, 380], tint: '#FFF6E8', alpha: 0.95 },
    { kind: 'wide', count: 2, y: [530, 575], w: [420, 560], tint: '#F2E8DA', alpha: 0.9 },
    { kind: 'cirrus', count: 3, y: [140, 300], w: [420, 600], tint: '#FFFFFF', alpha: 0.45 },
  ],
  'bushveld-winter': [
    { kind: 'cirrus', count: 4, y: [130, 320], w: [420, 620], tint: '#FFF2E6', alpha: 0.42 },
    { kind: 'cumulus', count: 3, y: [520, 575], w: [220, 340], tint: '#F2E0CC', alpha: 0.8 },
  ],
  'okavango-spring': [
    { kind: 'tower', count: 4, y: [540, 590], w: [300, 420], tint: '#FFFFFF', alpha: 0.95 },
    { kind: 'cumulus', count: 4, y: [520, 575], w: [240, 360], tint: '#F8FBFF', alpha: 0.92 },
    { kind: 'cirrus', count: 2, y: [150, 280], w: [420, 560], tint: '#FFFFFF', alpha: 0.4 },
  ],
  'kalahari-summer': [
    { kind: 'cumulus', count: 3, y: [500, 560], w: [220, 340], tint: '#FFF4EA', alpha: 0.9 },
    { kind: 'cirrus', count: 2, y: [140, 280], w: [420, 560], tint: '#FFFFFF', alpha: 0.42 },
  ],
  namibie: [
    { kind: 'cirrus', count: 4, y: [120, 300], w: [440, 620], tint: '#FFFFFF', alpha: 0.48 },
    { kind: 'cumulus', count: 2, y: [520, 570], w: [200, 300], tint: '#FFFFFF', alpha: 0.85 },
  ],
};

export interface CloudPlace {
  readonly kind: CloudKind;
  /** Layer x of the centre at sim time 0, base y, width. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  /** Drift (design px a second, + = left → right). */
  readonly speed: number;
  readonly tint: string;
  readonly alpha: number;
}

/** A deterministic 0 … 1 from an integer (the same sky every time). */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** Places a deck along a sky `span` px wide starting at layer x `left`. */
export function layoutDeck(
  deck: readonly CloudDeck[],
  left: number,
  span: number,
  seed: number,
): CloudPlace[] {
  const out: CloudPlace[] = [];
  deck.forEach((d, di) => {
    for (let k = 0; k < d.count; k++) {
      const j = (n: number): number => hash01(seed * 9973 + di * 131 + k * 7 + n);
      out.push({
        kind: d.kind,
        x: left + ((k + 0.2 + 0.6 * j(1)) / d.count) * span,
        y: d.y[0] + (d.y[1] - d.y[0]) * j(2),
        w: d.w[0] + (d.w[1] - d.w[0]) * j(3),
        speed: (d.kind === 'cirrus' ? 7 : 4) * (0.7 + 0.6 * j(4)),
        tint: d.tint,
        alpha: d.alpha,
      });
    }
  });
  return out;
}

/** Where a cloud is after `seconds` of sim time, wrapping round the sky's span. */
export function driftX(
  x0: number,
  speed: number,
  seconds: number,
  left: number,
  span: number,
): number {
  const p = (((x0 - left + speed * seconds) % span) + span) % span;
  return left + p;
}

/** Weather greys the deck: a multiply tint between the deck's own and a rain grey. */
export function gloomTint(tint: string, gloom: number): number {
  const a = Number.parseInt(tint.slice(1), 16);
  const b = 0x8e96a2;
  const mixc = (s: number): number => {
    const x = (a >> s) & 0xff;
    const y = (b >> s) & 0xff;
    return Math.round(x + (y - x) * Math.min(1, Math.max(0, gloom)));
  };
  return (mixc(16) << 16) | (mixc(8) << 8) | mixc(0);
}
