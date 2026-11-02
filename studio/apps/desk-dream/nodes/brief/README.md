# 앱 개요: 책상 위 꿈

모드: 영상 우선. 2026-11-02 기준 시스템 설계서를 옮겨왔어요.
플랫폼 조건, Unity 버전, 성능 규칙, 캘리브레이션 모듈은 이제 **공통** 캔버스에 있어요. 여기에는 이 앱만의 내용을 남겨요.

## 목표

보고 싶은 화면을 영상으로 먼저 만들고, 그 영상을 기준으로 에이전트가 Quest 3S 패스스루 앱을 짠다.
사용자는 앉아서 평범한 책상이 몽환적인 데스크테리어로 바뀌는 순간을 목격한다.

| 항목 | 확정 내용 |
| --- | --- |
| 기기 | Meta Quest 3S, 패스스루(MR) |
| 개발 환경 | MacBook Air M1, Unity 버전 결정 대기 |
| 코드 작성 | 에이전트 전담, 사람은 검수 |
| 성능 | 72fps 유지 |
| 체험 | 약 1분 투어 후 자유롭게 놀기 |
| 입력 | 핸드트래킹만 |
| 책상 | 사용자 지정 + 필수 캘리브레이션, 높이 미세조정 |
| 사운드 | 전체 BGM + 오브젝트 상호작용 효과음 |
| 배포 | 개인용, 해커톤 제출 |
| 실제 책상 | IKEA MICKE 105×50cm, 높이 75cm |
| 아트 톤 | 윔지코어, 드림코어, 핑크 구름 |

## 파이프라인

1. **콘셉트** — 기준안을 뽑고 깰 지점 2~3개를 사람이 고른다 (baseline-differential 방식)
2. **키프레임 → 참조 영상** — 에이전트가 프롬프트를 쓰고, 사람이 Google 영상 모델로 생성. 박 타이밍은 beat-direction 방식
3. **영상 → 명세 번역** (새로 만드는 부분) — 프레임 분해, 책상 좌표, 시간축 이벤트, 실현성 태그
4. **Unity 구현** — Claude Code + Meta agentic-tools 스킬. 시뮬레이터로 빠르게, 실기로 확정
5. **검수** — 헤드셋 녹화와 원본 영상을 비교, 차이를 기록하고 4단계로 되돌림

모든 단계는 `studio/scene_spec.yaml` 을 공용어로 쓴다. 영상은 참고 자료이고, 계약서는 이 파일이다.
캔버스 상태는 `studio/pipeline.json`, 단계별 메모와 파일은 `studio/nodes/<id>/`.

## 장면 명세서 블록

| 블록 | 담는 내용 | 누가 채우나 |
| --- | --- | --- |
| `meta` | 제목, 원본 영상, 길이, BPM | 영상 분석 |
| `desk` | 좌표 규칙, 상판 크기, 캘리브레이션 값 | 앱이 런타임에 덮어씀 |
| `objects` | 위치, 크기, 등장 방식, 반복 애니메이션 | 영상 분석 |
| `timeline` | 1분 투어의 시간축 이벤트 | 영상 분석 + 박 연출 |
| `interactions` | 손 제스처 → 반응 → 효과음 | 영상 분석 |
| `perf` | 실현성 태그와 대체안 | 기술 번역 |
| `unknowns` | 영상만으로 판단할 수 없는 것 | 영상 분석 → 사람이 답함 |
| `review` | 헤드셋 녹화와 원본의 차이 | 검수 |

## 아트 오브젝트와 72fps

| 오브젝트 | 태그 | 주의점과 대체안 |
| --- | --- | --- |
| 핑크 구름 (환경) | 비쌈 | 반투명 겹침 대신 불투명 메시 + 디더링, 개수 제한 |
| 조명 | 비쌈 | 실시간 조명·그림자 대신 발광 재질 + 가짜 그림자 |
| 헤엄치는 물고기 | 가능 | 셰이더로 꼬리 흔들기, 소수만 |
| 키보드 | 가능 | 인스턴싱, 손끝 누름 반응 |
| 일기 패널 | 가능 | 손 글자 입력은 어려움 → 스티커·도장 방식 검토 |
| 캘린더 | 가능 | TextMeshPro |
| 작은 레트로 컴퓨터 | 가능 | 특정 제품 복제가 아닌 오리지널 디자인 |
| 뽀모도로 시계 | 가능 | 자유놀이에서 실제 타이머 |
| CD 플레이어 | 가능 | BGM 재생 장치, 효과음 연결 |

## 출처 (2026-11-02 확인)

- [Meta XR All-in-One SDK v205](https://developers.meta.com/horizon/downloads/package/meta-xr-sdk-all-in-one-upm/) — 최소 Unity 6000.0.66f2
- [Meta XR All-in-One SDK v85](https://alpha.developers.meta.com/horizon/downloads/package/meta-xr-sdk-all-in-one-upm) — 최소 Unity 2022.3.15f1
- [Unity AI MCP 오픈 베타](https://gamedev.net/news/4376/) — Unity 6 이상, 구독 필요
- [Meta XR Unity MCP Extension](https://developers.meta.com/vr/documentation/unity/unity-mcp-extension/)
- [Meta Quest agentic-tools](https://developers.meta.com/horizon/documentation/unity/unity-tutorial-ai-vr-setup/)
- [MRUK 즉시 배치(Raycast)](https://developers.meta.com/horizon/documentation/unity/unity-mrmotifs-instant-content-placement)
- [Passthrough Camera API](https://developers.meta.com/horizon/documentation/unity/unity-pca-overview/)
- [Meta XR Simulator (Mac)](https://developers.meta.com/vr/blog/meta-xr-simulator-pc-mac-unity-unreal-developer-mixed-reality/)
- [Unity 개발 요구사항 (Link는 Windows만)](https://developers.meta.com/vr/documentation/unity/unity-development-requirements/)
