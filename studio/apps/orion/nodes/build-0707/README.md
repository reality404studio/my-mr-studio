# 병풍 아코디언 폴리오 + 3D 칩 (A+C) [P0 · Astra]


---
**Claude Code** · 2026-11-06 00:33

build-0707-build-adf7 · cf55 (2026-11-06): Astra 가 사용 한도(오후 1:45 해제)로 최종 보고·HANDOFF 갱신 전에 멈춤. 오케스트레이터가 이어서 검증. asmdef 참조 패치(Dab.Editor·Tests.EditMode 에 Folio/Tokens 참조 추가) 검토 후 적용. 고친 것: (1) FolioController 의 MaterialPropertyBlock 을 필드 초기값→Initialize 에서 생성(Unity 가 생성자 단계 객체를 무효 처리해 NRE), (2) EditMode 는 enabled 변경 시 OnDisable/OnEnable 을 안 부름 → 테스트가 직접 호출, (3) ChipRender 가 빈 씬 상태에서 RestoreSceneManagerSetup(빈 배열)로 예외 → 길이 가드. 결과: EditMode 278/278 (Chip 4·Folio 19), 칩 GPU 렌더: 마젠타 0·알파 1·ㄱ자 코발트 4곳·클라인 윤곽 17788px·옆면 4mm 타일 51/51·정면+30°. 남은 것: 씬 연결·실기(build-0707-verify-d2bb), 클레이 Half-Lambert
