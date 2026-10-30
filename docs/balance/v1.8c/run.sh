#!/bin/bash
# v1.8c Harvest balance: every gun, 500 seeds in 100-seed chunks, one process at a time.
cd /home/tank/projects/Web-shooter-tarantal
for gun in dubbelloop pomp kettie windbuks langloop twee_twee; do
  for from in 1 101 201 301 401; do
    out=tmp/v18c/$gun-$from.json
    [ -f "$out" ] && continue
    npx tsx tools/balance-sim.ts --mode harvest --weapon $gun --seeds 100 --from $from --workers 1 --out $out --json > /dev/null 2>> tmp/v18c/err.log
  done
done
echo DONE > tmp/v18c/DONE
