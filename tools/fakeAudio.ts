// A minimal Web Audio fake for unit tests (Node has no AudioContext): gain params record their
// automation and report the value at the context's current time; sources record start/stop.

interface Point {
  readonly t: number;
  readonly v: number;
  readonly ramp: boolean;
}

export class FakeParam {
  points: Point[] = [];
  constructor(
    private readonly ctx: FakeContext,
    private initial: number,
  ) {}
  get value(): number {
    return this.at(this.ctx.currentTime);
  }
  set value(v: number) {
    this.initial = v;
    this.points = [];
  }
  /** The automated value at time t (set = step, linear ramp = interpolated). */
  at(t: number): number {
    let v = this.initial;
    let prev: Point = { t: 0, v, ramp: false };
    for (const p of this.points) {
      if (p.t > t) {
        if (p.ramp) return prev.v + ((p.v - prev.v) * (t - prev.t)) / Math.max(1e-9, p.t - prev.t);
        return v;
      }
      v = p.v;
      prev = p;
    }
    return v;
  }
  setValueAtTime(v: number, t: number): this {
    this.points.push({ t, v, ramp: false });
    this.points.sort((a, b) => a.t - b.t);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.points.push({ t, v, ramp: true });
    this.points.sort((a, b) => a.t - b.t);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    return this.linearRampToValueAtTime(v, t);
  }
  cancelScheduledValues(t: number): this {
    const v = this.at(t);
    this.points = this.points.filter((p) => p.t < t);
    this.initial = this.points.length === 0 ? v : this.initial;
    return this;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  connect(n: FakeNode): FakeNode {
    this.outputs.push(n);
    return n;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
}

export class FakeGain extends FakeNode {
  readonly gain: FakeParam;
  constructor(ctx: FakeContext) {
    super();
    this.gain = new FakeParam(ctx, 1);
  }
}

export class FakeSource extends FakeNode {
  buffer: { duration: number; id: string } | null = null;
  loop = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  start(t = 0): void {
    this.startedAt = t;
  }
  stop(t = 0): void {
    this.stoppedAt = t;
  }
}

export class FakeContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  readonly destination = new FakeNode();
  readonly sources: FakeSource[] = [];
  readonly decoded: string[] = [];
  createGain(): FakeGain {
    return new FakeGain(this);
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createStereoPanner(): FakeNode & { pan: FakeParam } {
    return Object.assign(new FakeNode(), { pan: new FakeParam(this, 0) });
  }
  createBuffer(
    _ch: number,
    length: number,
    rate: number,
  ): { getChannelData: () => Float32Array; duration: number } {
    const data = new Float32Array(length);
    return { getChannelData: () => data, duration: length / rate };
  }
  createOscillator(): FakeNode & {
    frequency: FakeParam;
    type: string;
    start: () => void;
    stop: () => void;
  } {
    return Object.assign(new FakeNode(), {
      frequency: new FakeParam(this, 440),
      type: 'sine',
      start: () => undefined,
      stop: () => undefined,
    });
  }
  createBiquadFilter(): FakeNode & { frequency: FakeParam; Q: FakeParam; type: string } {
    return Object.assign(new FakeNode(), {
      frequency: new FakeParam(this, 350),
      Q: new FakeParam(this, 1),
      type: 'lowpass',
    });
  }
  /** "Decodes" bytes whose first byte is the duration in seconds; the id is the text after it. */
  decodeAudioData(bytes: ArrayBuffer): Promise<{ duration: number; id: string }> {
    const b = new Uint8Array(bytes);
    const id = new TextDecoder().decode(b.subarray(1));
    this.decoded.push(id);
    return Promise.resolve({ duration: b[0] ?? 1, id });
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

/** Bytes the fake decodes into a buffer of `seconds` named `id`. */
export function fakeFile(seconds: number, id: string): ArrayBuffer {
  const text = new TextEncoder().encode(id);
  const out = new Uint8Array(text.length + 1);
  out[0] = seconds;
  out.set(text, 1);
  return out.buffer;
}
