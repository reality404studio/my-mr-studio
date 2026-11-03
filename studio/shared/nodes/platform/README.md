# 플랫폼 조건

모든 앱에 공통으로 적용돼요. 앱마다 다른 조건은 각 앱의 "앱 개요" 노드에 적어요.

| 항목 | 조건 |
| --- | --- |
| 기기 | Meta Quest 3S, 패스스루(MR) |
| 입력 | 핸드트래킹만, 컨트롤러 없음 |
| 성능 | 72fps 유지 |
| 개발 PC | MacBook Air M1 |
| 코드 작성 | 에이전트가 전담, 사람은 검수 |
| Unity 버전 | 결정 대기 (같은 캔버스의 Unity 결정 노드) |
| 배포 | 개인용, 해커톤 제출 |
| 디자인 | 특정 제품, 브랜드, 캐릭터를 복제하지 않은 오리지널 |

## Mac 개발 루프

Mac에서는 PC처럼 헤드셋에 바로 스트리밍하는 Link를 쓸 수 없어서, 실기 확인은 매번 APK 빌드예요.

| 루프 | 도구 | 확인하는 것 |
| --- | --- | --- |
| 빠른 루프 | Meta XR Simulator (Apple Silicon) | 배치, 순서, 타임라인, 사운드 연결 |
| 실기 루프 | USB로 APK 빌드 후 설치 | 손끝 접촉 정확도, 72fps, 패스스루 위 색감 |

M1 Air는 빌드가 느린 편이라 실기 루프는 하루 몇 번으로 묶어요.

## 책상 기반 앱의 좌표 규칙

원점은 책상 앞 모서리 중앙(사용자 배꼽 앞). x 오른쪽, y 위, z 책상 안쪽, 단위 미터.
모든 오브젝트를 이 좌표로 적으면 책상 크기가 바뀌어도 비율로 다시 배치할 수 있어요.

## Unity 프로젝트 위치

앱마다 `unity/<앱 id>/` 에 둬요. `Library/`, `Temp/`, `Build/` 는 커밋하지 않아요.

출처 (2026-11-02 확인): [Meta 개발 요구사항, Link는 Windows만](https://developers.meta.com/vr/documentation/unity/unity-development-requirements/), [Meta XR Simulator Mac 지원](https://developers.meta.com/vr/blog/meta-xr-simulator-pc-mac-unity-unreal-developer-mixed-reality/)

---
**Claude Code** · 2026-11-03 03:37

2026-11-03: Unity 버전 = **Unity 6** 으로 결정 (6000.0.66f2 이상, 6.1+ 권장). XR 플러그인은 OpenXR — 공통 'Unity 실기 가드레일' §2.
