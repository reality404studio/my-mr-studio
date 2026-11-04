
---
**Claude Code** · 2026-11-03 14:52

2026-11-03 코드 작성: Assets/Scripts/FirstLight/FirstLight.cs + 씬 생성 스크립트에 BuildFirstLight 추가 (Unlit .mat 3개 Assets/Materials/FirstLight, 큐브 8cm 정면 60cm yaw-only, 카메라 쿼드 = PCA GetTexture → _BaseMap, IsPlaying 뒤에만 읽고 CurrentResolution 로 비율, 손끝 점 = OVRHand+OVRSkeleton(OpenXR 스켈레톤 XRHandLeft/Right) 의 XRHand_IndexTip). 로그 [MP]: loader·passthrough·layer·clearFlags·배경 알파·손 추적, pca 요청/CurrentResolution, 5초마다 status. 사전 점검 컴파일 PASS. 남은 것: 씬 다시 만들기 (에디터를 닫아야 배치로 돌림).

---
**Claude Code** · 2026-11-03 15:14

2026-11-04 실기 3회. ① 7613030: [MP] build= 줄 없음 → Reality404.BuildGate 런타임 어셈블리가 IL2CPP 스트리핑으로 통째로 빠짐 (ManagedStripped 에 없음) → [assembly: AlwaysLinkAssembly] + 게이트 후처리 검사(BuildGatePostBuild: 빠지면 빌드 실패). 큐브·쿼드 마젠타 → URP 패키지만 있고 파이프라인 에셋이 Graphics·Quality 어디에도 없었음 (metavr 부트스트랩이 안 만듦) → MoodPickerUrpSetup 으로 Assets/Settings/URP_Quest.asset (MSAA 4, HDR 끔, 깊이·불투명 텍스처 끔) 생성·전 품질 단계 지정 + 게이트 render-pipeline 검사 추가 (없으면 FAIL, 사전 점검이 실제로 잡는 것 확인). ② 7613030-dirty: build= 확인. ③ f0bcc74: 마젠타 해결, 방+큐브+카메라 쿼드 확인. 색은 IL-01 B안 (하늘 #7FA6D9, 손끝 점 #F0EEE6). -dirty 는 URP 가 첫 빌드에서 설정 파일을 다시 쓴 탓 → 커밋함. install -g 로 권한 자동 승인이라 권한 창 흐름은 아직 실기 확인 안 함.
