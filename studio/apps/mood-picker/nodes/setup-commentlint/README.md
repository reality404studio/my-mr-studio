
---
**Claude Code** · 2026-11-03 16:03

2026-11-04 GateFileChecks 에 comment 검사 (Assets/Scripts·Assets/Editor·../shared 의 .cs, 예외 MetaQuestVRSetup.cs·파일 머리의 -batchmode/사용: 안내 줄, 문자열·문자 리터럴 속 // 는 무시) + hand-tracking 검사. 주석 15개 파일에서 제거. 이유 주석 → 검사: 컨트롤러 허용(hand-tracking 게이트 + HandTracking_IsNotControllersOnly), 권한 한 곳(CameraPermission_IsRequestedOnlyByOvrManager), 해상도(RuntimeScripts_DoNotHardcodeCameraResolution), IsPlaying 뒤 GetTexture(PcaGetTexture_IsGuardedByIsPlaying), Meta 초기화 대기(BatchEntry_WaitsForMetaEditorReady 빌드·씬). 검증 scripts/verify-rule-gates.sh: 뮤테이션 6개 각각 해당 검사 실패, 주석 한 줄에 preflight·빌드 게이트 실패(exit 1), 원복 후 배치 빌드 exit 0. 테스트 16개 통과.
