#!/bin/sh
# v1.7d (D-059) balance: each Namibië map with the veld life ("after": the ostrich pairs and their
# nests, the hot-air balloons) and the same build without it ("before": no pairs, Namibië's events
# as before 1.9.6), so the difference is exactly what the sim gained.
#   sh tools/namibie-life-sweep.sh <seeds> <out.tsv> ["<maps>"] [bots] [weapon] [sight]
# maps: e.g. "mon tue sat+verder" (default: the 7 weekdays and Saturday's 3 bonus maps).
# Appends one line per map, side and bot: biome, map, side, gun, bot, mean, penalties/hunt.
# WORKERS (default 2) sets balance-sim's worker processes.
set -eu
seeds=$1; out=$2
maps=${3:-}; [ -n "$maps" ] || maps="mon tue wed thu fri sat sun sat+verder sat+nogVerder sat+dieVerste"
bots=${4:-competent}; weapon=${5:-}; sight=${6:-}; workers=${WORKERS:-2}
i=3
events='[{"id":"hadeda","creature":"hadeda","perHunt":[0,1],"window":[0.2,0.8]},{"id":"cropSprayer","creature":"sproeier","perHunt":[0,1],"window":[0.3,0.7]}]'
gun=''
[ -n "$weapon" ] && gun="--weapon $weapon"
[ -n "$sight" ] && gun="$gun --sight $sight"
for map in $maps; do
  layout=${map%%+*}
  bonus=''
  case $map in *+*) bonus="--bonus ${map#*+}" ;; esac
  for side in before after; do
    if [ $side = before ]; then
      set -- --set "biomes.$i.ostriches=[]" --set "biomes.$i.layouts.*.ostriches=[]" \
        --set "biomes.$i.events=$events"
    else
      set --
    fi
    # shellcheck disable=SC2086
    npx tsx tools/balance-sim.ts --seeds "$seeds" --bots "$bots" --biome namibie \
      --layout "$layout" $bonus $gun --workers "$workers" "$@" 2>&1 |
      awk -F'|' -v m="$map" -v s="$side" -v w="${weapon:-default}${sight:+/$sight}" \
        '$2 ~ /^ (random|plinker|competent) $/ { gsub(/ /,"",$2); gsub(/ /,"",$4); gsub(/ /,"",$18);
           print "namibie\t" m "\t" s "\t" w "\t" $2 "\t" $4 "\t" $18 }' >>"$out"
  done
done
