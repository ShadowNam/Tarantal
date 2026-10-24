#!/bin/sh
# v1.4 B (D-039 review): every gun × sight on Namibië's weekday maps and bonus maps, competent bot.
#   sh tools/namibie-sweep.sh <seeds> <out.jsonl> [maps...]   (maps: mon … sun, sat+verder, …)
SEEDS=${1:-100}
OUT=${2:-tmp/namibie-sweep.jsonl}
shift 2
MAPS=${*:-"mon tue wed thu fri sat sun sat+verder sat+nogVerder sat+dieVerste"}
LOADOUTS="dubbelloop: pomp: windbuks: kettie: twee_twee:iron twee_twee:peep twee_twee:scope_small langloop:scope_var"
for m in $MAPS; do
  layout=${m%%+*}
  bonus=""
  case "$m" in *+*) bonus="--bonus ${m#*+}" ;; esac
  for lo in $LOADOUTS; do
    gun=${lo%%:*}
    sight=${lo#*:}
    s=""
    [ -n "$sight" ] && s="--sight $sight"
    line=$(npx tsx tools/balance-sim.ts --seeds "$SEEDS" --biome namibie --layout "$layout" $bonus --weapon "$gun" $s --bots competent --workers 4 --json 2>/dev/null | tail -1)
    echo "{\"map\":\"$m\",\"loadout\":\"$lo\",\"report\":$line}" >> "$OUT"
  done
done
echo DONE >> "$OUT"
