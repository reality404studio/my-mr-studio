
---
**Claude Code** · 2026-11-03 14:16

2026-11-03 완료 (에이전트 대행, 사람 승인: "좋아요 씬 셋업까지 부탁드립니다."). Assets/Editor/MoodPickerSceneSetup.cs (메뉴 Mood Picker > Setup FirstLight Scene, 다시 돌려도 같은 결과) → Assets/Scenes/FirstLight.unity, 빌드 씬 목록에 등록. 파일로 확인: OVRCameraRig 하나, Main Camera 없음 / OVRManager isInsightPassthroughEnabled=1, 카메라 권한은 OVRManager requestPassthroughCameraAccessPermissionOnStartup 한 곳만 / OVRPassthroughLayer(Underlay) / Skybox None / 카메라 3대 clearFlags SolidColor, 배경 알파 0, 포스트프로세싱 0 / PassthroughCameraAccess(MRUK) Left, 1280×960. 프로젝트: Passthrough Required, Passthrough Camera Access 켬, 손 추적 ControllersAndHands (디버그용 컨트롤러 허용, 최종은 컨트롤러 끄고 — 바꿀 수 있음). 에디터 화면으로는 안 봤음, 실기 확인은 setup-device.
