// Replay input logs (Tech §3.10): { v, seed, contentHash, mode, inputKind, commands }, where
// commands are [tickDelta, command] pairs. Encoded as compact bytes (varints; positions as
// zig-zag half-pixel integers, the same 0.5 quantisation the sim applies) and then base64url.
// Deflate is added at the share/challenge-link boundary (M7), outside the sim (D-018).
import { quantiseHalf } from '../camera';
import { sanitiseCommand } from '../commands';
import type {
  AimAssistLevel,
  Command,
  InputKind,
  ModeConfig,
  ModeId,
  SeasonHuntConfig,
  SeasonHuntKind,
} from '../types';

/** v2 (M5) adds the aim-assist level after the input kind; v1 logs still decode ('standard').
 *  v3 (M6) adds the Season Run block (charms, Boss Rule, consumables …) and charmOrder.
 *  v4 (v1.2, D-033) adds the map after the mode block: layout and bonus map ids ('' = none). A
 *  v1–v3 log decodes with neither, so it replays on the plain biome it was played on.
 *  v5 (v1.3, D-036) adds the fitted sight after the map ('' = the gun's default) and the rifle
 *  commands aimStart / aimMove / aimRelease / aimCancel / zoom. */
export const INPUT_LOG_VERSION = 5;

export interface InputLog {
  readonly v: number;
  readonly seed: number;
  /** contentHash (64 hex chars) of the content the hunt was played with. */
  readonly contentHash: string;
  readonly mode: ModeConfig;
  readonly inputKind: InputKind;
  /** Absent = 'standard' (v1 logs). */
  readonly aimAssist?: AimAssistLevel;
  /** [ticks since the previous command (or tick 0), command]. Same-tick commands have delta 0. */
  readonly commands: readonly (readonly [number, Command])[];
}

export interface InputLogHeader {
  readonly seed: number;
  readonly contentHash: string;
  readonly mode: ModeConfig;
  readonly inputKind: InputKind;
  readonly aimAssist?: AimAssistLevel;
}

/** Records the commands sent to sim.step() tick by tick. */
export interface InputRecorder {
  record(tick: number, commands: readonly Command[]): void;
  toLog(): InputLog;
}

export function createRecorder(input: InputLogHeader): InputRecorder {
  // 'standard' is the default and is left out, so a log equals its decoded copy.
  const { aimAssist, ...rest } = input;
  const header =
    aimAssist === undefined || aimAssist === 'standard' ? rest : { ...rest, aimAssist };
  const commands: (readonly [number, Command])[] = [];
  let lastTick = 0;
  return {
    record(tick, list) {
      for (const raw of list) {
        // Drop exactly what the sim ignores, so every recorded command is encodable.
        const cmd = sanitiseCommand(raw);
        if (cmd === null) continue;
        commands.push([tick - lastTick, cmd]);
        lastTick = tick;
      }
    },
    toLog: () => ({ v: INPUT_LOG_VERSION, ...header, commands: [...commands] }),
  };
}

/** Absolute tick of every command. */
export function absoluteTicks(log: InputLog): number[] {
  let tick = 0;
  return log.commands.map(([delta]) => (tick += delta));
}

// --- bytes ---------------------------------------------------------------------------------

const OPS: readonly Command['t'][] = [
  'fire',
  'fireHoldStart',
  'fireHoldMove',
  'fireHoldEnd',
  'reload',
  'cameraTarget',
  'gadget',
  'consumable',
  'charmOrder',
  // v5 (v1.3)
  'aimStart',
  'aimMove',
  'aimRelease',
  'aimCancel',
  'zoom',
];
/** Commands a v1–v4 log can hold (the v5 rifle commands come after them). */
const V4_OPS = 9;
// Append only: the index is the encoded value.
const MODES: readonly ModeId[] = ['classic', 'daily', 'seasonHunt', 'ftue'];
const INPUT_KINDS: readonly InputKind[] = ['pointer', 'touch'];
const AIM_ASSIST: readonly AimAssistLevel[] = ['standard', 'low', 'off'];
const SEASON_KINDS: readonly SeasonHuntKind[] = ['plain', 'omen', 'boss'];

class ByteWriter {
  private bytes: number[] = [];
  byte(b: number): void {
    this.bytes.push(b & 0xff);
  }
  /** Unsigned LEB128 for 0 ≤ n < 2^53. */
  varint(n: number): void {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`varint out of range: ${n}`);
    let v = n;
    while (v >= 0x80) {
      this.byte((v % 0x80) | 0x80);
      v = Math.floor(v / 0x80);
    }
    this.byte(v);
  }
  /** A value quantised to 0.5, as a zig-zag varint of value × 2. */
  half(value: number): void {
    const n = Math.round(quantiseHalf(value) * 2);
    this.varint(n >= 0 ? n * 2 : -n * 2 - 1);
  }
  ascii(text: string): void {
    this.varint(text.length);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c > 0x7f) throw new Error('replay strings must be ASCII');
      this.byte(c);
    }
  }
  result(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** 128^7: longer varints cannot be safe integers. */
const MAX_VARINT_SCALE = 562949953421312;

class ByteReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}
  byte(): number {
    const b = this.bytes[this.pos++];
    if (b === undefined) throw new Error('replay log is truncated');
    return b;
  }
  varint(): number {
    let result = 0;
    let scale = 1;
    for (;;) {
      const b = this.byte();
      result += (b & 0x7f) * scale;
      if (b < 0x80) return result;
      scale *= 0x80;
      if (scale > MAX_VARINT_SCALE) throw new Error('replay varint too long');
    }
  }
  half(): number {
    const z = this.varint();
    const n = z % 2 === 0 ? z / 2 : -(z + 1) / 2;
    return n / 2;
  }
  ascii(): string {
    const len = this.varint();
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.byte());
    return s;
  }
  done(): boolean {
    return this.pos === this.bytes.length;
  }
}

const FLAG = {
  biome: 1,
  weapon: 2,
  huntSeconds: 4,
  stampede: 8,
  stampedeOn: 16,
  omen: 32,
  omenOn: 64,
  season: 128,
};

function writeSeason(w: ByteWriter, s: SeasonHuntConfig): void {
  w.byte(SEASON_KINDS.indexOf(s.kind));
  w.ascii(s.boss ?? '');
  w.varint(s.charms.length);
  for (const c of s.charms) w.ascii(c);
  w.varint(s.consumables.length);
  for (const c of s.consumables) w.ascii(c ?? '');
  w.ascii(s.rental ?? '');
  w.varint(s.runShellBonus);
}

function readSeason(r: ByteReader): SeasonHuntConfig {
  const kind = SEASON_KINDS[r.byte()];
  if (kind === undefined) throw new Error('bad replay season kind');
  const boss = r.ascii();
  const charms: string[] = [];
  for (let n = r.varint(); n > 0; n--) charms.push(r.ascii());
  const consumables: (string | null)[] = [];
  for (let n = r.varint(); n > 0; n--) {
    const c = r.ascii();
    consumables.push(c === '' ? null : c);
  }
  const rental = r.ascii();
  return {
    kind,
    boss: boss === '' ? null : boss,
    charms,
    consumables,
    rental: rental === '' ? null : rental,
    runShellBonus: r.varint(),
  };
}

export function encodeInputLog(log: InputLog): Uint8Array {
  const w = new ByteWriter();
  w.varint(log.v);
  w.varint(log.seed >>> 0);
  if (!/^[0-9a-f]{64}$/.test(log.contentHash)) throw new Error('contentHash must be 64 hex chars');
  for (let i = 0; i < 64; i += 2) w.byte(parseInt(log.contentHash.slice(i, i + 2), 16));
  w.byte(INPUT_KINDS.indexOf(log.inputKind));
  if (log.v >= 2) w.byte(AIM_ASSIST.indexOf(log.aimAssist ?? 'standard'));
  const m = log.mode;
  w.byte(MODES.indexOf(m.id));
  let flags = 0;
  if (m.biome !== undefined) flags |= FLAG.biome;
  if (m.weapon !== undefined) flags |= FLAG.weapon;
  if (m.huntSeconds !== undefined) flags |= FLAG.huntSeconds;
  if (m.stampede !== undefined) flags |= FLAG.stampede | (m.stampede ? FLAG.stampedeOn : 0);
  if (m.omen !== undefined) flags |= FLAG.omen | (m.omen ? FLAG.omenOn : 0);
  if (m.season !== undefined) {
    if (log.v < 3) throw new Error('Season Run replays need log version 3');
    flags |= FLAG.season;
  }
  w.byte(flags);
  if (m.biome !== undefined) w.ascii(m.biome);
  if (m.weapon !== undefined) w.ascii(m.weapon);
  if (m.huntSeconds !== undefined) w.half(m.huntSeconds);
  if (m.season !== undefined) writeSeason(w, m.season);
  if (log.v >= 4) {
    w.ascii(m.layout ?? '');
    w.ascii(m.bonus ?? '');
  } else if (m.layout !== undefined || m.bonus !== undefined) {
    throw new Error('a layout or bonus map needs log version 4');
  }
  if (log.v >= 5) w.ascii(m.sight ?? '');
  else if (m.sight !== undefined) throw new Error('a sight needs log version 5');

  w.varint(log.commands.length);
  for (const [delta, cmd] of log.commands) {
    w.varint(delta);
    w.byte(OPS.indexOf(cmd.t));
    switch (cmd.t) {
      case 'fire':
      case 'fireHoldStart':
      case 'fireHoldMove':
      case 'aimStart':
      case 'aimMove':
        w.half(cmd.dx);
        w.half(cmd.sy);
        break;
      case 'zoom':
        w.varint(Math.max(0, Math.trunc(cmd.step)));
        break;
      case 'cameraTarget':
        w.half(cmd.cx);
        break;
      case 'consumable':
        w.varint(Math.max(0, Math.trunc(cmd.slot)));
        break;
      case 'charmOrder':
        w.varint(cmd.order.length);
        for (const i of cmd.order) w.varint(i);
        break;
      default:
        break;
    }
  }
  return w.result();
}

export function decodeInputLog(bytes: Uint8Array): InputLog {
  const r = new ByteReader(bytes);
  const v = r.varint();
  if (!(v >= 1 && v <= INPUT_LOG_VERSION)) throw new Error(`unsupported replay version ${v}`);
  const seed = r.varint() >>> 0;
  let contentHash = '';
  for (let i = 0; i < 32; i++) contentHash += r.byte().toString(16).padStart(2, '0');
  const inputKind = INPUT_KINDS[r.byte()];
  const aimAssist = v >= 2 ? AIM_ASSIST[r.byte()] : undefined;
  if (v >= 2 && aimAssist === undefined) throw new Error('bad replay aim assist');
  const id = MODES[r.byte()];
  if (inputKind === undefined || id === undefined) throw new Error('bad replay header');
  const flags = r.byte();
  const mode: { -readonly [K in keyof ModeConfig]: ModeConfig[K] } = { id };
  if (flags & FLAG.biome) mode.biome = r.ascii();
  if (flags & FLAG.weapon) mode.weapon = r.ascii();
  if (flags & FLAG.huntSeconds) mode.huntSeconds = r.half();
  if (flags & FLAG.stampede) mode.stampede = (flags & FLAG.stampedeOn) !== 0;
  if (flags & FLAG.omen) mode.omen = (flags & FLAG.omenOn) !== 0;
  if (flags & FLAG.season) {
    if (v < 3) throw new Error('bad replay flags');
    mode.season = readSeason(r);
  }
  if (v >= 4) {
    const layout = r.ascii();
    const bonus = r.ascii();
    if (layout !== '') mode.layout = layout;
    if (bonus !== '') mode.bonus = bonus;
  }
  if (v >= 5) {
    const sight = r.ascii();
    if (sight !== '') mode.sight = sight;
  }

  const count = r.varint();
  const commands: (readonly [number, Command])[] = [];
  for (let i = 0; i < count; i++) {
    const delta = r.varint();
    const op = OPS[r.byte()];
    if (v < 5 && op !== undefined && OPS.indexOf(op) >= V4_OPS)
      throw new Error('bad replay command');
    const cmd = readCommand(r, op);
    commands.push([delta, cmd]);
  }
  if (!r.done()) throw new Error('trailing bytes in replay log');
  return {
    v,
    seed,
    contentHash,
    mode,
    inputKind,
    ...(aimAssist === undefined || aimAssist === 'standard' ? {} : { aimAssist }),
    commands,
  };
}

function readCommand(r: ByteReader, op: Command['t'] | undefined): Command {
  switch (op) {
    case 'fire':
    case 'fireHoldStart':
    case 'fireHoldMove':
    case 'aimStart':
    case 'aimMove':
      return { t: op, dx: r.half(), sy: r.half() };
    case 'zoom':
      return { t: op, step: r.varint() };
    case 'cameraTarget':
      return { t: op, cx: r.half() };
    case 'consumable':
      return { t: op, slot: r.varint() };
    case 'charmOrder': {
      const order: number[] = [];
      for (let n = r.varint(); n > 0; n--) order.push(r.varint());
      return { t: op, order };
    }
    case 'fireHoldEnd':
    case 'reload':
    case 'gadget':
    case 'aimRelease':
    case 'aimCancel':
      return { t: op };
    case undefined:
      throw new Error('bad replay command');
  }
}

// --- base64url -----------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63);
    if (b !== undefined) out += ALPHABET.charAt((n >> 6) & 63);
    if (c !== undefined) out += ALPHABET.charAt(n & 63);
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  const values: number[] = [];
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('invalid base64url');
    values.push(v);
  }
  if (values.length % 4 === 1) throw new Error('invalid base64url length');
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const n =
      ((values[i] ?? 0) << 18) |
      ((values[i + 1] ?? 0) << 12) |
      ((values[i + 2] ?? 0) << 6) |
      (values[i + 3] ?? 0);
    out.push((n >> 16) & 0xff);
    if (i + 2 < values.length) out.push((n >> 8) & 0xff);
    if (i + 3 < values.length) out.push(n & 0xff);
  }
  return Uint8Array.from(out);
}

export function encodeInputLogText(log: InputLog): string {
  return toBase64Url(encodeInputLog(log));
}

export function decodeInputLogText(text: string): InputLog {
  return decodeInputLog(fromBase64Url(text));
}
