// 24 Oct update (D-037) Skietbaan hit and miss markers, driven by the sim's range events (the game
// never touches sim state): a hit draws an expanding ring and "HIT" on the target, coloured by
// distance and sized in design px so it reads at Ver without a scope; a miss puffs dust where the
// shot was counted, or says "SHORT" when it fell short of Ver. Drawn on the plane's overlay layer
// (plane coordinates: it pans with the world and a raised scope magnifies it). Local sprites
// only, never a full-screen flash; "reduce flashes" dims the ring's fill. Rendering only.
import type * as Phaser from 'phaser';
import type { PlaneId } from '../../sim/types';
import { FONT } from '../view/Fx';

// Rendering only: marker colours by distance, sizes (design px) and timings (ms).
const COLOUR: Record<PlaneId, number> = {
  near: 0xffd25a,
  mid: 0x7ee081,
  far: 0x5ac8ff,
  ver: 0xff7ad9,
};
const CSS: Record<PlaneId, string> = {
  near: '#FFD25A',
  mid: '#7EE081',
  far: '#5AC8FF',
  ver: '#FF7AD9',
};
const HIT_MS = 600;
const MISS_MS = 500;
const RING_MIN_PX = 22;
const RING_GROW = 1.8;
const RING_LINE_PX = 4;
const FILL_ALPHA = 0.25;
const FILL_ALPHA_REDUCED = 0.08;
const TEXT_PX = 26;
const DUST = 0xb89d6e;
const PUFF_PX = 18;

export type MarkerKind = 'hit' | 'miss' | 'short';

interface Marker {
  readonly kind: MarkerKind;
  readonly plane: PlaneId;
  readonly g: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text | null;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly ms: number;
  t: number;
}

export class RangeFeedback {
  private markers: Marker[] = [];
  /** Markers shown so far, by kind (the test hook reads them). */
  readonly shown: Record<MarkerKind, number> = { hit: 0, miss: 0, short: 0 };
  /** The newest hit marker's distance (the test hook reads it). */
  lastHit: PlaneId | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: (plane: PlaneId) => Phaser.GameObjects.Container | null,
    private readonly text: { hit: string; short: string },
    private readonly reduceFlashes: () => boolean,
  ) {}

  /** A hit on a target of `size` px radius at (x, y) on its plane. */
  hit(plane: PlaneId, x: number, y: number, size: number): void {
    this.add('hit', plane, x, y, Math.max(RING_MIN_PX, size * 1.15), HIT_MS, this.text.hit);
    this.lastHit = plane;
  }

  /** A miss counted at (x, y) on its plane; `short` when it fell short of Ver. */
  miss(plane: PlaneId, x: number, y: number, short: boolean): void {
    if (short) this.add('short', plane, x, y, PUFF_PX, MISS_MS + 200, this.text.short);
    else this.add('miss', plane, x, y, PUFF_PX, MISS_MS, null);
  }

  private add(
    kind: MarkerKind,
    plane: PlaneId,
    x: number,
    y: number,
    r: number,
    ms: number,
    text: string | null,
  ): void {
    const layer = this.layer(plane);
    if (layer === null) return;
    const g = this.scene.add.graphics();
    const label =
      text === null
        ? null
        : this.scene.add
            .text(x, y - r - 6, text, {
              fontFamily: FONT,
              fontSize: `${String(TEXT_PX)}px`,
              fontStyle: 'bold',
              color: kind === 'hit' ? CSS[plane] : '#F3EAD3',
              stroke: '#1B1410',
              strokeThickness: 5,
            })
            .setOrigin(0.5, 1);
    layer.add(label === null ? [g] : [g, label]);
    this.markers.push({ kind, plane, g, label, x, y, r, ms, t: 0 });
    this.shown[kind]++;
    this.draw(this.markers[this.markers.length - 1]);
  }

  private draw(m: Marker | undefined): void {
    if (m === undefined) return;
    const k = Math.min(1, m.t / m.ms);
    const fade = 1 - k * k;
    m.g.clear();
    if (m.kind === 'hit') {
      const r = m.r * (1 + (RING_GROW - 1) * k);
      const fill = this.reduceFlashes() ? FILL_ALPHA_REDUCED : FILL_ALPHA;
      m.g
        .fillStyle(COLOUR[m.plane], fill * fade)
        .fillCircle(m.x, m.y, r)
        .lineStyle(RING_LINE_PX, 0x1b1410, 0.6 * fade)
        .strokeCircle(m.x, m.y, r + 1.5)
        .lineStyle(RING_LINE_PX - 1, COLOUR[m.plane], fade)
        .strokeCircle(m.x, m.y, r);
    } else {
      // Dust: a few puffs rising and spreading where the shot landed.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.6;
        const d = m.r * (0.4 + 1.4 * k);
        m.g
          .fillStyle(DUST, 0.75 * fade)
          .fillCircle(
            m.x + Math.cos(a) * d,
            m.y - k * m.r * 1.2 + Math.sin(a) * d * 0.5,
            m.r * (0.45 + 0.4 * k),
          );
      }
    }
    if (m.label !== null) {
      m.label.setAlpha(Math.min(1, fade * 1.5));
      m.label.y = m.y - m.r - 6 - k * 14;
    }
  }

  update(dtMs: number): void {
    if (this.markers.length === 0) return;
    for (const m of this.markers) {
      m.t += dtMs;
      this.draw(m);
    }
    const done = this.markers.filter((m) => m.t >= m.ms);
    if (done.length === 0) return;
    for (const m of done) {
      m.g.destroy();
      m.label?.destroy();
    }
    this.markers = this.markers.filter((m) => m.t < m.ms);
  }

  destroy(): void {
    for (const m of this.markers) {
      m.g.destroy();
      m.label?.destroy();
    }
    this.markers = [];
  }
}
