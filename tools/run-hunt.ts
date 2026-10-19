// Runs one headless hunt and prints the result (docs/04-BUILD-PLAN.md M1).
// Usage: npx tsx tools/run-hunt.ts [--seed 42] [--bot random|aim] [--mode classic|daily]
//                                  [--input pointer|touch] [--log] [--json]
import { runReplay } from '../src/sim/replay/verify';
import { encodeInputLogText } from '../src/sim/replay/inputLog';
import type { InputKind, ModeId } from '../src/sim/types';
import { BOT_KINDS, type BotKind } from './bots';
import { playHunt } from './playHunt';
import { loadContent, loadContentHash } from './testContent';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}
function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  const found = allowed.find((a) => a === value);
  if (found === undefined) {
    console.error(`--${name} must be one of ${allowed.join(', ')}`);
    process.exit(2);
  }
  return found;
}

const seed = Number(arg('seed', '42')) >>> 0;
const bot: BotKind = oneOf('bot', arg('bot', 'random'), BOT_KINDS);
const modeId: ModeId = oneOf('mode', arg('mode', 'classic'), ['classic', 'daily'] as const);
const inputKind: InputKind = oneOf('input', arg('input', 'pointer'), ['pointer', 'touch'] as const);

const content = loadContent();
const contentHash = loadContentHash();
const started = performance.now();
const play = playHunt({ seed, bot, mode: { id: modeId }, inputKind, content, contentHash });
const elapsedMs = performance.now() - started;

// The recorded log must replay to the same events.
const replay = runReplay(play.log, content);
const replayOk = replay.eventHash === play.eventHash;

const r = play.result;
const logText = encodeInputLogText(play.log);
if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({
      ...r,
      eventHash: play.eventHash,
      replayOk,
      elapsedMs,
      logChars: logText.length,
    }),
  );
} else {
  console.log(
    `Tarantal Madness — headless hunt (${modeId}, ${r.biome}, ${r.weapon}, ${inputKind}, bot ${bot})`,
  );
  console.log(`  seed        ${seed}`);
  console.log(`  score       ${r.score}  rank ${r.rank}`);
  console.log(
    `  shots       ${r.shots}  hit shots ${r.hitShots}  accuracy ${(r.accuracy * 100).toFixed(1)} %`,
  );
  console.log(
    `  bagged      ${r.bagged}  (near ${r.baggedByPlane.near}, mid ${r.baggedByPlane.mid}, far ${r.baggedByPlane.far})  wing shots ${r.wingShots}`,
  );
  console.log(`  combos      best Frenzy streak ${r.bestStreak}, Twee Vlieë ×${r.twoFlies}`);
  console.log(`  penalties   ${r.penalties}  empty clicks ${r.emptyClicks}`);
  console.log(
    `  events      ${play.eventCount}  hash ${play.eventHash}  replay ${replayOk ? 'OK' : 'MISMATCH'}`,
  );
  console.log(
    `  replay log  ${play.log.commands.length} commands, ${logText.length} chars base64url`,
  );
  console.log(
    `  time        ${elapsedMs.toFixed(1)} ms for ${r.ticks} ticks (${(elapsedMs / r.ticks).toFixed(3)} ms/tick incl. bot)`,
  );
  if (process.argv.includes('--log')) console.log(`\n${logText}`);
}
if (!replayOk) process.exit(1);
