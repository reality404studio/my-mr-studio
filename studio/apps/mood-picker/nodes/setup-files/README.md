
---
**Claude Code** · 2026-11-03 14:11

2026-11-03 파일 점검: [통과] ProjectSettings scriptingBackend Android: 1, AndroidTargetArchitectures: 2 / manifest.json 에 URP / packages-lock 에 core·MRUK 207.0.1, com.unity.xr.oculus 없음 / XRGeneralSettingsPerBuildTarget: Android 로더 1개 (OpenXRLoader Android), Standalone 1개. [아직] Assets/Plugins/Android/AndroidManifest.xml 에 HEADSET_CAMERA·패스스루·손 추적 항목 없음 — setup-scene 에서 OVRManager 를 켠 뒤 매니페스트를 다시 만들고 HEADSET_CAMERA 를 손으로 넣은 다음 재점검. [발견] Unity 6 기본 액티비티가 com.unity3d.player.UnityPlayerGameActivity (가드레일 §6 의 am start 경로와 다름).

---
**Claude Code** · 2026-11-03 14:16

2026-11-03 재점검 (setup-scene 뒤): AndroidManifest 에 com.oculus.feature.PASSTHROUGH required, horizonos.permission.HEADSET_CAMERA, com.oculus.permission.HAND_TRACKING, oculus.software.handtracking 모두 있음 → §1~§3 [M] 항목 통과.
