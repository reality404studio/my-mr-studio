#!/bin/sh
# render hand-punch sheets to PNG (headless Chrome)
cd "$(dirname "$0")"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for o in ALL A B C D; do
  n=$( [ "$o" = ALL ] && echo 00-overview || echo "$o" | tr 'ABCD' '1234' )
  case $o in A) n=01-leader-line;; B) n=02-pinch-lever;; C) n=03-miniature-punch;; D) n=04-slack-thread;; esac
  "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=6000 \
    --window-size=1600,900 --screenshot="$PWD/hand-punch-$n.png" "file://$PWD/hand-punch-sheets.html?opt=$o" >/dev/null 2>&1
done
ls -la *.png
