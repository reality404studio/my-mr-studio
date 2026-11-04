
---
**Claude Code** · 2026-11-04 05:09

check 실패 (exit 127): `sh unity/mood-picker/scripts/run-editmode-tests.sh MoodPicker.Tests.CatchProjectionTests|MoodPicker.Tests.CatchCropTests`

```
sh: MoodPicker.Tests.CatchCropTests: command not found

```

---
**Claude Code** · 2026-11-04 05:09

2026-11-04 보류 (오케스트레이터 전달: 사람이 '넓게 채집 → 스탬프/커터 틀로 잘라내기' 흐름 검토 중, 채집 범위 요구가 바뀔 수 있음). 상태 proof 에서 멈춤, done·커밋·재빌드 안 함. 작업 트리(앱 레포, 미커밋): Core/CatchProjection.cs(ThroughSquare), CatchSettings.sceneDistance=3m, CropRect.requestedSide/Shrunk, CatchController 가 눈→모서리 방향 투영 + readback 로그에 requested/SHRUNK·거리·초점거리·렌즈 오프셋, CatchProjectionTests 6개. 전체 73/73. 진단: 손 깊이 사각형을 카메라에 바로 투영 → 렌즈가 눈보다 ~7cm 앞이라 시차로 1.4배+ 넓어짐, 16~17cm 는 960 상한. 넓게 채집 쪽으로 가면 되돌리지 말고 이 투영을 '틀' 기준으로 재사용 가능
