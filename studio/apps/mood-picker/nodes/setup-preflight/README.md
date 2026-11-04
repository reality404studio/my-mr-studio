
---
**Claude Code** · 2026-11-03 14:52

2026-11-03 사용: sh "unity/shared/BuildGate/Preflight~/preflight.sh" unity/mood-picker (작업대 루트에서). Preflight~ 는 Unity 가 무시하는 폴더. 1) GateFileChecks 를 dotnet 으로 2) Roslyn(csc) 으로 Assets 런타임 / Editor 스크립트를 Unity 6000.3.27f2 Managed DLL + Library/ScriptAssemblies 패키지 DLL 에 대고 컴파일. 에디터가 열려 있어도 된다. 2026-11-03 결과: 파일 검사 PASS (로더 1, HEADSET_CAMERA, Skybox None, 리그 1, 금지 API 없음), Assembly-CSharp PASS (1), Assembly-CSharp-Editor PASS (3). 한계: 패키지 DLL 은 에디터가 마지막으로 컴파일한 것 기준, 정의 심볼은 UNITY_ANDROID 등 일부만.
