#!/bin/sh
# 사전 점검 — 사람에게 빌드를 부탁하기 전에 에이전트가 돌린다. 에디터가 열려 있어도 된다.
#   1) 게이트와 같은 파일 검사 (GateFileChecks.cs 를 dotnet 으로)
#   2) Roslyn 컴파일 검사: Assets 의 런타임 스크립트 / Editor 스크립트를 Unity·패키지 DLL 에 대고 컴파일
#      (패키지 DLL 은 Library/ScriptAssemblies — 에디터가 한 번은 열려 패키지를 컴파일해 둔 상태여야 한다)
# 사용: sh "unity/shared/BuildGate/Preflight~/preflight.sh" unity/mood-picker
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PROJ=$(cd "${1:?usage: preflight.sh <unity project>}" && pwd)
VER=$(sed -n 's/^m_EditorVersion: //p' "$PROJ/ProjectSettings/ProjectVersion.txt")
UNITY="/Applications/Unity/Hub/Editor/$VER/Unity.app/Contents/Resources/Scripting"
CSC=$(ls -d /usr/local/share/dotnet/sdk/*/Roslyn/bincore/csc.dll 2>/dev/null | tail -1)
OUT="$PROJ/Library/BuildGatePreflight"
mkdir -p "$OUT"
status=0

echo "== 1. 파일 검사"
dotnet run --project "$HERE/Checker/Checker.csproj" -v q -- "$PROJ" || status=1

echo "== 2. 컴파일 검사 (Unity $VER)"
[ -d "$UNITY" ] || { echo "Unity $VER 없음: $UNITY"; exit 1; }
[ -n "$CSC" ] || { echo "csc.dll 없음 (dotnet SDK)"; exit 1; }
[ -d "$PROJ/Library/ScriptAssemblies" ] || { echo "Library/ScriptAssemblies 없음 → 에디터를 한 번 열어 컴파일해 둘 것"; exit 1; }

refs() { # $1 = editor|runtime
  echo "-r:$UNITY/NetStandard/ref/2.1.0/netstandard.dll"
  for d in "$UNITY"/NetStandard/compat/2.1.0/shims/netfx/*.dll; do echo "-r:$d"; done
  for d in "$UNITY"/Managed/UnityEngine/UnityEngine*.dll; do echo "-r:$d"; done
  for d in "$PROJ"/Library/ScriptAssemblies/*.dll; do
    b=$(basename "$d")
    case "$b" in Assembly-CSharp*) continue;; esac
    if [ "$1" = runtime ]; then case "$b" in *Editor*|*editor*) continue;; esac; fi
    echo "-r:$d"
  done
  if [ "$1" = editor ]; then
    echo "-r:$UNITY/Managed/UnityEditor.dll"
    for d in "$UNITY"/Managed/UnityEngine/UnityEditor*.dll; do echo "-r:$d"; done
    [ -f "$OUT/Assembly-CSharp.dll" ] && echo "-r:$OUT/Assembly-CSharp.dll"
  fi
}

# Assets 안 asmdef 가 없는 스크립트 = Assembly-CSharp / Assembly-CSharp-Editor (Editor 폴더)
rm -f "$OUT"/Assembly-CSharp*.dll
# asmdef 가 있는 폴더는 별도 어셈블리라 여기서 뺀다 (Unity 가 컴파일. 테스트 하네스가 검증)
find "$PROJ/Assets" -name '*.asmdef' -exec dirname {} \; > "$OUT/asmdef_dirs.txt"
in_asmdef() { while read -r d; do case "$1" in "$d"/*) return 0;; esac; done < "$OUT/asmdef_dirs.txt"; return 1; }
: > "$OUT/runtime.txt"; : > "$OUT/editor.txt"
find "$PROJ/Assets" -name '*.cs' | while read -r f; do
  in_asmdef "$f" && continue
  case "$f" in */Editor/*) echo "$f" >> "$OUT/editor.txt";; *) echo "$f" >> "$OUT/runtime.txt";; esac
done
DEFS="-define:UNITY_ANDROID;UNITY_6000_0_OR_NEWER;UNITY_2023_1_OR_NEWER;UNITY_2022_3_OR_NEWER;ENABLE_INPUT_SYSTEM"

compile() { # $1 name  $2 list  $3 refkind
  if [ ! -s "$2" ]; then echo "$1: 스크립트 없음"; return 0; fi
  refs "$3" > "$OUT/$1.rsp"
  sed 's/^/"/; s/$/"/' "$2" >> "$OUT/$1.rsp"
  if dotnet "$CSC" -nologo -noconfig -nostdlib -target:library -langversion:9 -nowarn:CS1701,CS1702 "$DEFS" \
      -out:"$OUT/$1.dll" @"$OUT/$1.rsp" > "$OUT/$1.log" 2>&1; then
    echo "$1: PASS ($(wc -l < "$2" | tr -d ' ') files)"
  else
    grep -E 'error CS' "$OUT/$1.log" | sed "s|$PROJ/||" | head -30
    echo "$1: FAIL"; return 1
  fi
}
compile Assembly-CSharp "$OUT/runtime.txt" runtime || status=1
compile Assembly-CSharp-Editor "$OUT/editor.txt" editor || status=1

echo "== 결과: $([ $status = 0 ] && echo PASS || echo FAIL)"
exit $status
