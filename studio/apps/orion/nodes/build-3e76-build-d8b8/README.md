
---
**Claude Code** · 2026-11-05 23:53

check 실패 (exit 1): `sh unity/mood-picker/scripts/verify-orion-look.sh`

```
[INFO] camera: FirstLight: OVRCameraRig 1개
[INFO] outline-shader: 외곽선 셰이더 1개 검사
[INFO] shader-colormask: 알파를 빼는 ColorMask 없음 (셰이더 4개)
[INFO] forbidden-api: 없음 (Shader.Find, ReadPixels, WebCamTexture, OVRInput)
[INFO] hand-tracking: ControllersAndHands
[INFO] comment: 주석 없음 (배치 실행 안내 머리말 제외)
files: PASS
== 2. 컴파일 검사 (Unity 6000.3.27f2)
unity/mood-picker/Assets/Scripts/HandState/Verification~/RunCoreTests.cs(5,7): error CS0246: 'NUnit' 형식 또는 네임스페이스 이름을 찾을 수 없습니다. using 지시문 또는 어셈블리 참조가 있는지 확인하세요.
unity/mood-picker/Assets/Scripts/HandState/Verification~/RunCoreTests.cs(6,7): error CS0246: 'NUnit' 형식 또는 네임스페이스 이름을 찾을 수 없습니다. using 지시문 또는 어셈블리 참조가 있는지 확인하세요.
Assembly-CSharp: FAIL
unity/mood-picker/Assets/Editor/MoodPickerSceneSetup.cs(137,36): error CS0246: 'FirstLight' 형식 또는 네임스페이스 이름을 찾을 수 없습니다. using 지시문 또는 어셈블리 참조가 있는지 확인하세요.
Assembly-CSharp-Editor: FAIL
== 결과: FAIL

```

---
**Claude Code** · 2026-11-05 23:54

check 실패 (exit 1): `sh unity/mood-picker/scripts/verify-orion-look.sh`

```
Thread 0x176f07000 may have been prematurely finalized
Thread 0x176f93000 may have been prematurely finalized
Thread 0x178047000 may have been prematurely finalized
Thread 0x1781eb000 may have been prematurely finalized
Thread 0x1780d3000 may have been prematurely finalized
Thread 0x178277000 may have been prematurely finalized
Thread 0x17815f000 may have been prematurely finalized
AcceleratorClientConnectionCallback - disconnected - :0
[40m[32minfo[39m[22m[49m: Microsoft.Hosting.Lifetime[0]
      Application is shutting down...
Cleanup mono
[40m[32minfo[39m[22m[49m: Unity.ILPP.Runner.PostProcessingAssemblyLoadContext[0]
      ALC ILPP context 1 is unloading
debugger-agent: Unable to listen on 44

```

---
**Claude Code** · 2026-11-05 23:55

check 실패 (exit 1): `sh unity/mood-picker/scripts/verify-orion-look.sh`

```
Thread 0x17fa87000 may have been prematurely finalized
Thread 0x17fb13000 may have been prematurely finalized
Thread 0x17fc2b000 may have been prematurely finalized
Thread 0x17fcb7000 may have been prematurely finalized
Thread 0x17fb9f000 may have been prematurely finalized
Thread 0x17fdcf000 may have been prematurely finalized
Thread 0x17fd43000 may have been prematurely finalized
AcceleratorClientConnectionCallback - disconnected - :0
Cleanup mono
[40m[32minfo[39m[22m[49m: Microsoft.Hosting.Lifetime[0]
      Application is shutting down...
[40m[32minfo[39m[22m[49m: Unity.ILPP.Runner.PostProcessingAssemblyLoadContext[0]
      ALC ILPP context 1 is unloading
debugger-agent: Unable to listen on 44

```
