# LoopCapture: 물결 루프

HANDOFF §4-1, §5 (LoopCapture). 차별점의 핵심이지만 MVP 다음 순위. 셀 단순화가 흔들림과 저화질을 덮는다.
- 프레임 읽기는 AsyncGPUReadback, 루프 메모리 상한을 둔다 (72fps 성능 규칙)
