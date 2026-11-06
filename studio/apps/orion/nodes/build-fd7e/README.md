# 디자인 토큰 → 코드 [P0 · Astra + Fable]


---
**Claude Code** · 2026-11-06 00:08

build-fd7e-build-214c (2026-11-06): Astra 가 Portal asmdef 참조 추가 승인을 요청 → 패치 검토 후 적용(토큰 참조만 추가). 오케스트레이터 Unity 검증: 전체 EditMode 255/255 (OrionTokens 9 포함). 첫 실행은 룩 테스트의 GPU 필요 6개가 -nographics 러너에서 실패 → [Category("Gpu")] 부여 + run-editmode-tests.sh 가 !Gpu 로 실행 (GPU 테스트는 verify-orion-look.sh 가 실제 GPU 로 계속 돌림). 풀아웃 시차 0.15→0.08 반영. 남은 것: Hover 위치 값의 좌표계(z-zone)는 모호해서 유지 — 풀아웃 실기 때 맞춤

---
**Claude Code** · 2026-11-06 03:24

2026-11-06 라우팅: 웹 토큰 서브(build-fd7e-build-2f75)는 Fable 한도 → Gemini Flash 로 우회 가능(레시피 .harness/briefs/web-tokens-fable.md, --as 이름만 바꿈)
