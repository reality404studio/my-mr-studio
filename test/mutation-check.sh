#!/bin/sh
cd "$(dirname "$0")/.." || exit 1
B=$(mktemp)
cp server/board.mjs "$B"
node -e "
const fs=require('fs');const f='server/board.mjs';const s=fs.readFileSync(f,'utf8');
const from=\"a.check && a.check.exit === 0 && String(a.check.cmd || '').trim()\";
if(!s.includes(from)){console.log('MUTATION TARGET NOT FOUND');process.exit(1)}
fs.writeFileSync(f,s.replace(from,'true'));"
[ $? -eq 0 ] || { cp "$B" server/board.mjs; exit 1; }
node --check server/board.mjs || { echo "MUTATION INVALID (syntax)"; cp "$B" server/board.mjs; exit 1; }
echo "== mutated: check 로그 조건 → true (문법 정상)"
OUT=$(npm test 2>&1)
echo "$OUT" | grep -E "^(✖ [^t]|ℹ (pass|fail))"
cp "$B" server/board.mjs
echo "== restored"
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
npm test >/dev/null 2>&1; r=$?
cmp -s server/board.mjs "$B" && echo "board.mjs 원본과 동일"
echo "$OUT" | grep -q "^✖ 검증 명령 기록이 없는 파일은 증거가 아니다" && echo "$OUT" | grep -q "^✖ 실패한 검증 로그" && [ $r -eq 0 ] && { echo "MUTATION KILLED by targeted tests"; exit 0; }
echo "MUTATION SURVIVED"; exit 1
