# Unity 구현

- 계약은 이 앱의 `scene_spec.yaml` 하나
- Unity 프로젝트는 `unity/<앱 id>/`
- 책상 기반이면 캘리브레이션은 공통 모듈을 가져다 쓴다 (`unity/shared/DeskCalibration/`)
- 성능과 개발 루프는 공통 캔버스의 "플랫폼 조건", "72fps 성능 규칙"을 따른다
