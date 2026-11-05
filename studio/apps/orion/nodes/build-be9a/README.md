# 손 상태 기계 + 손 표시 + 손 마스크 [P0 · Astra]


---
**Claude Code** · 2026-11-05 17:26

build-be9a-build-2714 (2026-11-06): Astra 가 사용 한도로 최종 보고 전에 멈춤. 오케스트레이터가 Unity EditMode 로 검증: 첫 실행 236/237, 실패 1개는 테스트의 가정 오류(EditMode 는 enabled 변경 시 OnDisable/OnEnable 을 부르지 않음) → 테스트가 생명주기 메서드를 직접 호출하도록 고침(검증 내용 동일). 재실행 237/237
