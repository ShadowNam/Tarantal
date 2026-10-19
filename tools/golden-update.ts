// Regenerates golden replay expectations (src/sim/replay/golden/replays.json).
// Run after an intentional sim/content change and say why in the commit message (CLAUDE.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeInputLogText } from '../src/sim/replay/inputLog';
import { runReplay } from '../src/sim/replay/verify';
import { GOLDEN_CASES, type GoldenReplay } from './goldenCases';
import { playHunt } from './playHunt';
import { loadContent, loadContentHash } from './testContent';

const content = loadContent();
const contentHash = loadContentHash();
const out: GoldenReplay[] = [];

for (const c of GOLDEN_CASES) {
  const play = playHunt({ ...c, mode: { id: c.mode }, content, contentHash });
  const replay = runReplay(play.log, content);
  if (replay.eventHash !== play.eventHash) {
    console.error(`${c.name}: replay does not reproduce the live run — determinism bug`);
    process.exit(1);
  }
  out.push({
    ...c,
    contentHash,
    log: encodeInputLogText(play.log),
    expected: { eventHash: play.eventHash, eventCount: play.eventCount, score: play.result.score },
  });
  console.log(
    `  ${c.name}: score ${play.result.score}, ${play.eventCount} events, hash ${play.eventHash}`,
  );
}

const dir = join(import.meta.dirname, '..', 'src', 'sim', 'replay', 'golden');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'replays.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`golden:update: wrote ${out.length} replays (content ${contentHash.slice(0, 12)}…)`);
