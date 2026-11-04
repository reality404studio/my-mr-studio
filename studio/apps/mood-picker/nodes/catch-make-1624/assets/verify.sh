#!/bin/sh
# >=5 sheet PNGs, each >20KB, 1600x900
cd "$(dirname "$0")"; n=0; fail=0
for f in hand-punch-*.png; do
  [ -f "$f" ] || continue; n=$((n+1))
  sz=$(stat -f%z "$f"); w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}'); h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  echo "$f ${sz}B ${w}x${h}"
  [ "$sz" -gt 20000 ] && [ "$w" = 1600 ] && [ "$h" = 900 ] || { echo "FAIL $f"; fail=1; }
done
[ "$n" -ge 5 ] || { echo "FAIL only $n png"; fail=1; }
[ $fail = 0 ] && echo "PASS $n sheets"; exit $fail
