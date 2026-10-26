#!/usr/bin/env bash
# Rebuild project.json and publish it on the project-log branch.
# Usage: tools/publish.sh <board dir> "<what changed>"
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
board="$1"; msg="$2"
cd "$here"
git -C /home/user/Tarantal fetch -q origin main
python3 tools/build.py --board "$board" --live live.json --out project.json
# Validate with the page's own schema before publishing (an invalid file makes the overview fall back).
(cd /tmp/claude-0/-home-user-Tarantal/cf2d2856-b1ab-5535-be86-2527ddfe82b7/scratchpad/wt17m && npm run -s project:check -- "$here/project.json")
git add -A
if git diff --cached --quiet; then echo "project-log: nothing changed"; exit 0; fi
git commit -q -F - <<MSG
chore(project-log): $msg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X9BKcABj5FscZbGJZnCiA3
MSG
for i in 1 2 3 4; do git push -q origin project-log && break || sleep $((2**i)); done
git log --oneline -1
