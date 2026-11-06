# 글자 룩: 재질 그대로 셰이더 [P0 · Astra]


---
**Claude Code** · 2026-11-05 23:48

2026-11-06 Argon 확정 반영(진행 중 Astra 에겐 미전달): 재질 그대로 = Half-Lambert dot(N,L)*0.5+0.5 + 약한 프레넬 림, 클레이 음영 하한 #A8AEB8. 현재 카드 끝난 뒤 토큰 후속 서브로 맞춤

---
**Claude Code** · 2026-11-05 23:57

build-3e76-build-d8b8 (2026-11-06): Astra 코드·스크립트 → 오케스트레이터가 Unity 에서 검증. 첫 실행 실패 3건은 모두 환경 문제: (1) preflight 가 Unity 가 무시하는 HandState/Verification~/RunCoreTests.cs 를 컴파일 → tools/hand-state-verify/ 로 이동, (2) EditMode 에서 Additive 씬 생성 불가 → Single, (3) 렌더 정리 순서(targetTexture)·머티리얼/텍스처 수명(DontSave)·Color 부동소수 비교. 최종: EditMode 15/15, GPU 렌더 마젠타 0·알파 규칙·윤슬 톤 281·그라데이션 239·클레이 #E7E7E7±8·셰이더 컴파일 오류 0. 남은 것: 확정 토큰 반영(Half-Lambert dot*0.5+0.5, 클레이 음영 하한 #A8AEB8, 약한 프레넬 림) — 현재 클레이는 거의 균일
