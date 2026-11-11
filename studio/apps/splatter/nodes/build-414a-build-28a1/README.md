
---
**Gemini Argon** · 2026-11-09 07:38

check 실패 (exit 1): `python3 -B unity/mood-picker/Assets/Scripts/Splatter/Verification~/verify_compile.py`

```
[INFO] hand-tracking: ControllersAndHands
[INFO] comment: 주석 없음 (배치 실행 안내 머리말 제외)
files: PASS

PASS Roslyn MoodPicker.Pigment: 4 source files
PASS Roslyn MoodPicker.Splatter: 1 source files
PASS Roslyn Splatter.CoreTests: 2 source files
Traceback (most recent call last):
  File "/Users/rafaela/01_PROJECT_NOW/my-vr-colorpicker/my-mr-studio/unity/mood-picker/Assets/Scripts/Splatter/Verification~/verify_compile.py", line 62, in <module>
    shutil.copyfile(pigment_dll, output / pigment_dll.name)
    ~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/homebrew/Cellar/python@3.14/3.14.3_1/Frameworks/Python.framework/Versions/3.14/lib/python3.14/shutil.py", line 293, in copyfile
    raise SameFileError("{!r} and {!r} are the same file".format(src, dst))
shutil.SameFileError: PosixPath('/var/folders/n_/8p5lyp65519c7k__7vz83jgm0000gn/T/splatter-core-check-gwymusx6/MoodPicker.Pigment.dll') and PosixPath('/var/folders/n_/8p5lyp65519c7k__7vz83jgm0000gn/T/splatter-core-check-gwymusx6/MoodPicker.Pigment.dll') are the same file

```

---
**Gemini Argon** · 2026-11-09 07:39

check 실패 (exit 1): `python3 -B unity/mood-picker/Assets/Scripts/Splatter/Verification~/verify_compile.py`

```
[INFO] skybox: FirstLight: None
[INFO] camera: FirstLight: OVRCameraRig 1개
[INFO] outline-shader: 외곽선 셰이더 1개 검사
[INFO] shader-colormask: 알파를 빼는 ColorMask 없음 (셰이더 5개)
[INFO] forbidden-api: 없음 (Shader.Find, ReadPixels, WebCamTexture, OVRInput)
[INFO] hand-tracking: ControllersAndHands
[INFO] comment: 주석 없음 (배치 실행 안내 머리말 제외)
files: PASS

PASS Roslyn MoodPicker.Pigment: 4 source files
PASS Roslyn MoodPicker.Splatter: 1 source files
PASS Roslyn Splatter.CoreTests: 2 source files
Core NUnit (.NET): passed=4 failed=1 skipped=0


```
