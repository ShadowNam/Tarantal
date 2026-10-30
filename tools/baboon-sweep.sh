#!/bin/sh
# v1.8b (D-062) balance: each map with its baboon troop ("after") and the same build without it
# ("before": no troops (troops=[]); the troops draw from their own
# stream, so nothing else in the hunt changes).
#   sh tools/baboon-sweep.sh <seeds> <out.tsv> "<biome:index> …" ["<maps>"] [bots] [weapon] [sight]
# biomes: e.g. "karoo-autumn:2 namibie:3"; maps: e.g. "mon tue sat+verder" (default: 7 weekdays).
# Appends one line per biome, map, side and bot: biome, map, side, gun, bot, mean, penalties/hunt.
# WORKERS (default 1) sets balance-sim's worker processes (this box runs out of memory with many).
# SIDES (default "before after") runs one side only (e.g. SIDES=after after a change to the troops).
set -eu
seeds=$1; out=$2; biomes=$3
maps=${4:-}; [ -n "$maps" ] || maps="mon tue wed thu fri sat sun"
bots=${5:-competent}; weapon=${6:-}; sight=${7:-}; workers=${WORKERS:-1}
gun=''
[ -n "$weapon" ] && gun="--weapon $weapon"
[ -n "$sight" ] && gun="$gun --sight $sight"
for bi in $biomes; do
  biome=${bi%%:*}; i=${bi#*:}
  for map in $maps; do
    layout=${map%%+*}
    bonus=''
    case $map in *+*) bonus="--bonus ${map#*+}" ;; esac
    for side in ${SIDES:-before after}; do
      if [ $side = before ]; then set -- --set "biomes.$i.baboons.troops=[]"; else set --; fi
      # shellcheck disable=SC2086
      npx tsx tools/balance-sim.ts --seeds "$seeds" --bots "$bots" --biome "$biome" \
        --layout "$layout" $bonus $gun --workers "$workers" "$@" 2>&1 |
        awk -F'|' -v b="$biome" -v m="$map" -v s="$side" -v w="${weapon:-default}${sight:+/$sight}" \
          '$2 ~ /^ (random|plinker|competent|baboonHappy) $/ { gsub(/ /,"",$2); gsub(/ /,"",$4);
             gsub(/ /,"",$18); print b "\t" m "\t" s "\t" w "\t" $2 "\t" $4 "\t" $18 }' >>"$out"
    done
  done
done
