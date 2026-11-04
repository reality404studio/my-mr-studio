# LoopCapture: 물결 루프

HANDOFF §4-1, §5 (LoopCapture). 차별점의 핵심이지만 MVP 다음 순위. 셀 단순화가 흔들림과 저화질을 덮는다.
- 프레임 읽기는 AsyncGPUReadback, 루프 메모리 상한을 둔다 (72fps 성능 규칙)

---
**Claude Code** · 2026-11-03 13:56

2026-11-03: three.js 데모의 포팅 기준이 meta-mr-picker PR #1 (`reference/texture-lab/`, 미머지)에 있음. 연결표는 그 README '보드 과업과 연결'. Assets 에 넣는 건 PigmentCore/*.cs + PigmentCommon.hlsl 만. shader-lab 7모드는 탐색일 뿐 (셀 룩 위에 얹을지는 사람 결정).
