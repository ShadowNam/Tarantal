// v1.17b (D-080): the one rule for "may a flock of `size` burst up now": a free slot under the
// map's flock cap and room for every bird under its bird cap. Brakkie's point asks it before it
// shows its marker and again when the flock bursts, so a shown point always has its flock or none.

export interface FlushCaps {
  readonly liveFlocks: number;
  readonly maxFlocks: number;
  readonly aliveBirds: number;
  readonly maxBirds: number;
}

export const flushRoom = (caps: FlushCaps, size: number): boolean =>
  caps.liveFlocks < caps.maxFlocks && caps.aliveBirds + size <= caps.maxBirds;
