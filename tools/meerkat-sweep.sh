#!/bin/sh
# v1.7 (D-044) balance: each desert map with the meerkat colonies ("after") and the same build
# without them ("before": no colonies, and Namibië without the crop sprayer added for them).
#   sh tools/meerkat-sweep.sh <biome> <seeds> <out.tsv> ["<maps>"] [bots] [weapon] [sight]
# maps: e.g. "mon tue sat+verder" (default: the 7 weekdays and Saturday's 3 bonus maps).
# Appends one line per map, side and bot: biome, map, side, gun, bot, mean, penalties/hunt.
# WORKERS (default 2) sets balance-sim's worker processes (4 got OOM-killed on a busy box).
set -eu
biome=$1; seeds=$2; out=$3
maps=${4:-mon tue wed thu fri sat sun sat+verder sat+nogVerder sat+dieVerste}
bots=${5:-competent}; weapon=${6:-}; sight=${7:-}; workers=${WORKERS:-2}
case $biome in
  kalahari-summer) i=1; events='' ;;
  namibie) i=3; events='[{"id":"hadeda","creature":"hadeda","perHunt":[0,1],"window":[0.2,0.8]}]' ;;
  *) echo "unknown biome $biome" >&2; exit 1 ;;
esac
gun=''
[ -n "$weapon" ] && gun="--weapon $weapon"
[ -n "$sight" ] && gun="$gun --sight $sight"
for map in $maps; do
  layout=${map%%+*}
  bonus=''
  case $map in *+*) bonus="--bonus ${map#*+}" ;; esac
  for side in before after; do
    if [ $side = before ]; then
      set -- --set "biomes.$i.colonies=[]" --set "biomes.$i.layouts.*.colonies=[]"
      [ -n "$events" ] && set -- "$@" --set "biomes.$i.events=$events"
    else
      set --
    fi
    # shellcheck disable=SC2086
    npx tsx tools/balance-sim.ts --seeds "$seeds" --bots "$bots" --biome "$biome" \
      --layout "$layout" $bonus $gun --workers "$workers" "$@" 2>&1 |
      awk -F'|' -v b="$biome" -v m="$map" -v s="$side" -v w="${weapon:-default}${sight:+/$sight}" \
        '$2 ~ /^ (random|plinker|competent) $/ { gsub(/ /,"",$2); gsub(/ /,"",$4); gsub(/ /,"",$18);
           print b "\t" m "\t" s "\t" w "\t" $2 "\t" $4 "\t" $18 }' >>"$out"
  done
done
