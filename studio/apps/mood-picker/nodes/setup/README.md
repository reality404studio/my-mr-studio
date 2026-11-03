# Unity 셋업 + First Light

**시작 전에 반드시:** `npm run studio -- show unity-guardrails --app shared` (공통의 "Unity 실기 가드레일").
특히 §2 XR 플러그인은 과거 프로젝트 메모와 정반대가 됐으니 그 표를 따른다.

- 위치: `unity/mood-picker/`
- 공통 "Unity 버전" 결정이 나야 시작 (PCA 샘플 기준 최소 6000.0.38f1, 최신 Meta SDK는 6000.0.66f2+)
- **First Light 통과 기준** (기기 스크린샷 한 장에 모두):
  1. 방(현실)이 보인다 — 검은 배경·스카이박스가 아님
  2. 정면 약 60cm 에 Unlit 큐브
  3. PCA 카메라 텍스처를 붙인 작은 쿼드 (`CurrentResolution` 이 logcat 에 찍힘)
  4. 손끝 점이 손을 따라감 (컨트롤러 꺼진 상태)
- 공식 PCA 샘플(CameraViewer, CameraToWorld)은 참고만. 컨트롤러 A/B 입력은 가져오지 않는다

## 가드레일에서 뽑은 이번 체크리스트

_setup-guardrails 하위 과업에서 에이전트가 덧붙인다._
