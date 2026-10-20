// Touch gesture recognition (GDD §18.2, Tech §6). Pure: fed with pointer samples in design px
// and milliseconds, returns what each gesture means. InputMapper turns that into Commands.
//   tap        contact < tapMaxMs and movement < tapMaxMovePx         → fire at the touch-down point
//   flick-down vertical travel ≥ flickMinPx within flickMaxMs, downward → reload
//   drag       anything else                                        → pan (with inertia on release)
import type { Feel } from '../../content/schemas';

export type GestureTuning = Pick<
  Feel['input'],
  'tapMaxMs' | 'tapMaxMovePx' | 'flickMinPx' | 'flickMaxMs'
>;

export type GestureEnd =
  | { readonly kind: 'tap'; readonly x: number; readonly y: number }
  | { readonly kind: 'flickDown' }
  /** Release velocity in screen px/s (x only; drags pan horizontally). */
  | { readonly kind: 'dragEnd'; readonly vx: number }
  | { readonly kind: 'none' };

interface Sample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

interface Track {
  readonly start: Sample;
  last: Sample;
  maxMove: number;
  dragging: boolean;
  /** Recent samples for release velocity. */
  history: Sample[];
}

const VELOCITY_WINDOW_MS = 80;

export class GestureRecognizer {
  private readonly tuning: GestureTuning;
  private readonly tracks = new Map<number, Track>();
  /** The pointer that pans; other fingers can still tap. */
  private panPointer: number | null = null;

  constructor(tuning: GestureTuning) {
    this.tuning = tuning;
  }

  get activePointers(): number {
    return this.tracks.size;
  }

  down(id: number, x: number, y: number, t: number): void {
    const s = { x, y, t };
    this.tracks.set(id, { start: s, last: s, maxMove: 0, dragging: false, history: [s] });
    this.panPointer ??= id;
  }

  /** Returns the horizontal pan delta in screen px for this move (0 if not panning). */
  move(id: number, x: number, y: number, t: number): number {
    const tr = this.tracks.get(id);
    if (tr === undefined) return 0;
    const dx = x - tr.last.x;
    const s = { x, y, t };
    tr.last = s;
    tr.history.push(s);
    while (tr.history.length > 2 && t - (tr.history[0]?.t ?? t) > VELOCITY_WINDOW_MS)
      tr.history.shift();
    tr.maxMove = Math.max(tr.maxMove, Math.hypot(x - tr.start.x, y - tr.start.y));
    if (!tr.dragging && tr.maxMove >= this.tuning.tapMaxMovePx) {
      tr.dragging = true;
      // Pan from the touch-down point so the first drag frame doesn't lose the slop distance.
      if (this.panPointer === id) return x - tr.start.x;
    }
    return tr.dragging && this.panPointer === id ? dx : 0;
  }

  up(id: number, x: number, y: number, t: number): GestureEnd {
    const tr = this.tracks.get(id);
    this.tracks.delete(id);
    if (this.panPointer === id) this.panPointer = this.tracks.keys().next().value ?? null;
    if (tr === undefined) return { kind: 'none' };
    const dt = t - tr.start.t;
    const moved = Math.max(tr.maxMove, Math.hypot(x - tr.start.x, y - tr.start.y));
    if (dt < this.tuning.tapMaxMs && moved < this.tuning.tapMaxMovePx) {
      return { kind: 'tap', x: tr.start.x, y: tr.start.y };
    }
    const dy = y - tr.start.y;
    const dxTotal = x - tr.start.x;
    if (
      dt <= this.tuning.flickMaxMs &&
      dy >= this.tuning.flickMinPx &&
      dy > Math.abs(dxTotal) * 1.5
    ) {
      return { kind: 'flickDown' };
    }
    const first = tr.history[0];
    const vx =
      first !== undefined && t - first.t > 0 && tr.dragging
        ? ((x - first.x) / (t - first.t)) * 1000
        : 0;
    return { kind: 'dragEnd', vx };
  }

  cancel(id: number): void {
    this.tracks.delete(id);
    if (this.panPointer === id) this.panPointer = this.tracks.keys().next().value ?? null;
  }
}
