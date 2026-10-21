import { describe, expect, it } from 'vitest';
import type { Command } from '../types';
import {
  createRecorder,
  decodeInputLog,
  decodeInputLogText,
  encodeInputLog,
  encodeInputLogText,
  fromBase64Url,
  INPUT_LOG_VERSION,
  toBase64Url,
  type InputLog,
} from './inputLog';

const HASH = 'ab'.repeat(32);

const ALL: Command[] = [
  { t: 'fire', dx: -812.5, sy: 333 },
  { t: 'fireHoldStart', dx: 0, sy: 1079.5 },
  { t: 'fireHoldMove', dx: 1260, sy: 0 },
  { t: 'fireHoldEnd' },
  { t: 'reload' },
  { t: 'cameraTarget', cx: 4160 },
  { t: 'gadget' },
  { t: 'consumable', slot: 1 },
];

describe('InputLog', () => {
  it('v2 records the aim-assist level; standard is the default and is left out', () => {
    const rec = createRecorder({
      seed: 5,
      contentHash: HASH,
      mode: { id: 'classic' },
      inputKind: 'touch',
      aimAssist: 'off',
    });
    rec.record(3, [{ t: 'fire', dx: 1, sy: 2 }]);
    const log = rec.toLog();
    expect(log.v).toBe(INPUT_LOG_VERSION);
    expect(decodeInputLogText(encodeInputLogText(log))).toEqual(log);
    const std = createRecorder({
      seed: 5,
      contentHash: HASH,
      mode: { id: 'classic' },
      inputKind: 'touch',
      aimAssist: 'standard',
    }).toLog();
    expect('aimAssist' in std).toBe(false);
    expect(decodeInputLogText(encodeInputLogText(std))).toEqual(std);
  });

  it('still decodes v1 logs (pre-M5) as standard aim assist', () => {
    const v1: InputLog = {
      v: 1,
      seed: 9,
      contentHash: HASH,
      mode: { id: 'daily' },
      inputKind: 'touch',
      commands: [[4, { t: 'reload' }]],
    };
    const back = decodeInputLog(encodeInputLog(v1));
    expect(back).toEqual(v1);
    expect(back.aimAssist).toBeUndefined();
  });

  it('round-trips every command type, header and mode option', () => {
    const log: InputLog = {
      v: 1,
      seed: 0xdeadbeef,
      contentHash: HASH,
      mode: {
        id: 'seasonHunt',
        biome: 'karoo-autumn',
        weapon: 'pomp',
        huntSeconds: 60,
        stampede: true,
        omen: false,
      },
      inputKind: 'touch',
      commands: ALL.map((c, i) => [i === 0 ? 3 : i % 2, c] as const),
    };
    expect(decodeInputLog(encodeInputLog(log))).toEqual(log);
    expect(decodeInputLogText(encodeInputLogText(log))).toEqual(log);
  });

  it('records tick deltas, with 0 for same-tick commands, and quantises to 0.5', () => {
    const rec = createRecorder({
      seed: 1,
      contentHash: HASH,
      mode: { id: 'classic' },
      inputKind: 'pointer',
    });
    rec.record(5, [
      { t: 'cameraTarget', cx: 1000.26 },
      { t: 'fire', dx: 1.1, sy: -2.3 },
    ]);
    rec.record(9, []);
    rec.record(12, [{ t: 'reload' }]);
    const log = rec.toLog();
    expect(log.commands).toEqual([
      [5, { t: 'cameraTarget', cx: 1000.5 }],
      [0, { t: 'fire', dx: 1, sy: 0 }],
      [7, { t: 'reload' }],
    ]);
    expect(decodeInputLog(encodeInputLog(log))).toEqual(log);
  });

  it('drops commands the sim ignores and clamps the rest, so any live input stays encodable', () => {
    const rec = createRecorder({
      seed: 1,
      contentHash: HASH,
      mode: { id: 'classic' },
      inputKind: 'touch',
    });
    rec.record(1, [
      { t: 'fire', dx: Number.NaN, sy: 10 },
      { t: 'fire', dx: Infinity, sy: 10 },
      { t: 'cameraTarget', cx: Number.NaN },
      { t: 'consumable', slot: -1 },
      { t: 'fire', dx: 1e300, sy: -1e300 },
      { t: 'cameraTarget', cx: 1e300 },
    ]);
    const log = rec.toLog();
    expect(log.commands).toEqual([
      [1, { t: 'fire', dx: 1260, sy: 0 }],
      [0, { t: 'cameraTarget', cx: 4160 }],
    ]);
    expect(decodeInputLog(encodeInputLog(log))).toEqual(log);
  });

  it('rejects corrupt input', () => {
    const bytes = encodeInputLog({
      v: 1,
      seed: 1,
      contentHash: HASH,
      mode: { id: 'classic' },
      inputKind: 'pointer',
      commands: [[0, { t: 'reload' }]],
    });
    expect(() => decodeInputLog(bytes.slice(0, -1))).toThrow(/truncated/);
    expect(() => decodeInputLog(Uint8Array.from([...bytes, 0]))).toThrow(/trailing/);
    expect(() =>
      decodeInputLog(Uint8Array.from([INPUT_LOG_VERSION + 1, ...bytes.slice(1)])),
    ).toThrow(/version/);
    expect(() => decodeInputLogText('ab$c')).toThrow(/base64url/);
  });

  it('base64url matches Node for any length', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + n * 31) & 0xff);
      const text = toBase64Url(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64url'));
      expect(fromBase64Url(text)).toEqual(bytes);
    }
  });
});
