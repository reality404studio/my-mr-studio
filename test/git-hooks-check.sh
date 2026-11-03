#!/bin/sh
HOOKS="$(cd "$(dirname "$0")/../scripts/githooks" && pwd)"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
git init -q --bare "$T/remote.git"
git init -q -b work "$T/repo" && cd "$T/repo" || exit 1
git config user.email t@t && git config user.name t && git config core.hooksPath "$HOOKS"
git remote add origin "$T/remote.git"
fail=0
expect() { want=$1; shift; "$@" >"$T/out" 2>&1; got=$?; if { [ "$want" = ok ] && [ $got -eq 0 ]; } || { [ "$want" = no ] && [ $got -ne 0 ]; }; then echo "ok   $want: $*"; else echo "FAIL $want: $* (exit $got)"; cat "$T/out"; fail=1; fi; }
echo a > a
git add a
expect no git commit -q -m "그냥 고침"
expect no git commit -q -m "no-such-card: 무언가"
expect ok git commit -q -m "${DONE_CARD:-proof-gate-selfcheck}: 임시 레포 훅 확인"
expect no git push -q origin work:main
expect no git push -q origin work:other
STUDIO_PUSH_APPROVED=1 expect ok git push -q origin work:main
echo b > a && git commit -qam "${DONE_CARD:-proof-gate-selfcheck}: 두 번째" && git push -q origin work:main 2>/dev/null; git reset -q --hard HEAD~1
echo c > a && git commit -qam "${DONE_CARD:-proof-gate-selfcheck}: 갈라진 커밋"
STUDIO_PUSH_APPROVED= expect no git push -q -f origin work:main
exit $fail
