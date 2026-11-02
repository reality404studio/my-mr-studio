# 에이전트 작업 규칙 (AGENTS.md)

이 레포는 "책상 위 꿈" Quest 3S 패스스루 앱을 **영상 우선**으로 만드는 작업 공간이에요.
사람은 웹 캔버스(`npm run dev`)로, 에이전트는 파일과 CLI로 **같은 상태**를 읽고 써요.
에이전트가 고친 내용은 열려 있는 웹 화면에 바로 나타나요.

## 먼저 읽을 것

1. `npm run studio -- list` 로 전체 단계와 상태를 본다.
2. 맡은 단계는 `npm run studio -- show <id>` 로 메모와 첨부 파일을 본다.
3. 설계 배경은 `docs/system-design.md`, 구현 계약은 `studio/scene_spec.yaml`.

## 폴더 구조

```
studio/
  pipeline.json          단계(노드)와 연결(엣지), 상태, 담당, 캔버스 위치
  nodes/<id>/README.md   단계별 메모 (사람과 에이전트가 함께 쓰는 마크다운)
  nodes/<id>/assets/     무드보드 이미지, 참조 영상, 산출물
  nodes/<id>/assets.json 파일별 메모 ("왜 골랐는지")
  scene_spec.yaml        영상 → 구현 명세. Unity 구현은 이 파일만 계약으로 본다
  log.jsonl              누가 무엇을 했는지 기록 (자동)
docs/system-design.md    전체 시스템 설계
```

## 규칙

- **상태는 CLI로 바꾼다.** `pipeline.json` 을 직접 편집하지 말 것. CLI가 잠금과 기록을 처리한다.
  - 시작할 때: `npm run studio -- status <id> doing --as "<내 이름>"`
  - 사람 확인이 필요할 때: `status <id> review`
  - 막혔을 때: `status <id> blocked` + `note` 로 이유
  - 끝났을 때: `status <id> done`
- **메모는 덧붙인다.** `npm run studio -- note <id> "무엇을 했고, 무엇이 남았는지" --as "<내 이름>"`.
  사람이 쓴 문단을 지우거나 고쳐 쓰지 말 것. README.md 를 직접 편집해도 되지만 기존 내용은 보존한다.
- **산출물은 해당 단계 폴더에.** `npm run studio -- asset <id> <파일> --memo "설명"`, 또는
  `studio/nodes/<id>/assets/` 에 직접 넣어도 화면에 뜬다.
- **새 단계가 필요하면** `npm run studio -- add <type> "제목" --after <이전 id> --as "<내 이름>"`.
  type: `reference`, `concept`, `prompt`, `video`, `spec`, `build`, `review`, `note`.
- **사람이 판단할 지점에서는 멈춘다.** 콘셉트에서 깰 지점 고르기, 무드보드 선택, 검수 통과 여부는
  사람의 몫이다. 선택지를 메모로 정리하고 `review` 상태로 넘긴다.
- **이름을 남긴다.** 모든 CLI 명령에 `--as "Claude Code"` 처럼 이름을 붙이거나 `STUDIO_ACTOR` 를 설정한다.

## 프로젝트 고정 조건

- 기기: Meta Quest 3S, 패스스루(MR), 핸드트래킹만 (컨트롤러 없음)
- 성능: 72fps 유지. 반투명 겹침, 실시간 조명·그림자는 피하고 대체안을 쓴다
- 개발: MacBook Air M1. Link 불가 → Meta XR Simulator + APK 실기 빌드
- Unity 버전: 결정 대기 (`unity-version` 단계 참고)
- 책상: IKEA MICKE 105×50cm, 높이 75cm. 좌표 원점은 책상 앞 모서리 중앙, x 오른쪽, y 위, z 안쪽, 미터
- 영상 생성: Google 영상 모델로 사람이 직접 생성. 에이전트는 프롬프트를 쓴다
- 아트 톤: 윔지코어, 드림코어, 핑크 구름. 특정 제품·캐릭터 복제가 아닌 오리지널 디자인
