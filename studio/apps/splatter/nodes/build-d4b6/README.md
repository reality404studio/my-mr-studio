# 물감 3슬롯 & 글자별 선택·애니메이션 컨트롤러


---
**Gemini Argon** · 2026-11-09 08:11

PigmentAtlasBuilder, SplatWordState(선택 글자 또는 전체 슬롯·셰이더 지정), SplatWordController(슬롯별 독립 fps 프레임 진행, 글자별 회전·둥실 애니메이션) 구현 완료. NUnit 10/10 통과. 다음은 사람 실기 확인(build-d4b6-verify-2edf).

---
**Antigravity** · 2026-11-09 11:32

LetterSplatURP.shader 프래그먼트 샘플링(lerp(centerOS, posOS, 0.82)) 적용으로 윤슬 물결 해상도 개선 및 Quest 3S(340YC10G9707W0)에 Builds/splatter-dev.apk 설치·실행 완료

---
**Antigravity** · 2026-11-09 11:49

PigmentCommon.hlsl SampleFlipbook 72Hz 서브프레임 보간(lerp(f0, f1, frac)) 및 SplatWordController 초기 헤드 위치 고정 반영 후 Quest 3S 재설치·실행 완료
