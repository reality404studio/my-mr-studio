# 에이전트 작업 규칙 (AGENTS.md)

이 레포는 Quest 3S 패스스루 VR 앱들을 만드는 **공통 작업대**예요.
위에 모든 앱이 함께 쓰는 **공통** 보드가 있고, 그 아래 앱마다 보드가 하나씩 있어요.
앱은 만들 때 **모드**(영상 우선, 스토리보드 우선 …)를 골라 단계와 과업이 미리 깔려요.
사람은 웹(`npm run dev`)으로, 에이전트는 파일과 CLI로 **같은 상태**를 읽고 써요. 고친 내용은 열린 화면에 바로 나타나요.

## 보드 구조

```
단계 (stage)        왼쪽에서 오른쪽으로 진행하는 열. 예: 정의 → 레퍼런스 → 영상 → 명세 → 구현 → 검수
└ 과업 (task)       에이전트가 맡는 작업 묶음. 산출물(output) 하나를 책임진다
  └ 하위 과업 (sub) 과업 안의 행동. 특성(kind)과 하는 쪽(by: agent | human)이 있다. 위에서부터 순서대로
```

- **특성(kind)**: `decide` 결정, `collect` 수집, `analyze` 분석, `write` 작성, `make` 생성, `build` 구현, `verify` 검증
- **연결**: 과업 사이에만 있다. 뒤 과업은 앞 과업이 `done` 이어야 시작한다. `feedback` 연결(검수 → 구현 같은 되돌림)은 기다리지 않는다
- **상태 계산**: 하위 과업이 있는 과업의 상태는 하위 과업에서 계산된다. 과업이 아니라 **하위 과업의 상태를 바꾼다**
- **공통 과업**(type `shared`): 앱 보드에 놓인 공통 보드 과업의 사본. 상태는 공통 보드를 따른다

## 일하는 순서

1. `npm run studio -- apps` — 공통과 앱 목록, 앱마다 지금 할 일
2. `npm run studio -- next --app <앱 id> --by agent` — **지금 내가 시작할 수 있는 하위 과업**. 여기에 없는 일은 아직 차례가 아니다
3. `npm run studio -- show <하위 과업 id> --app <앱 id>` — 방법(how), 속한 과업의 목표·산출물, 메모와 파일
4. 처음이면 공통 조건을 읽는다: `show platform --app shared`, `show perf-rules --app shared`, `show hand-patterns --app shared`, 그리고 앱의 `show brief`
5. 시작: `status <id> doing` → 일한다 → 결과를 산출물 위치에 남긴다 → `note <과업 id> "무엇을 했고, 무엇이 남았는지"` → `status <id> done`
6. 다음 하위 과업이 `human` 이면 거기서 멈추고 사람에게 알린다. 사람 확인이 필요한 결과를 냈다면 `status <id> review`

전체 그림은 `list --app <앱 id>` (단계 > 과업 > 하위 과업 트리, ▶ 표시가 과업 안에서 지금 차례).

## 폴더 구조

```
studio/
  studio.json                    스튜디오 이름
  shared/                        공통 보드 (--app shared)
    pipeline.json                단계, 과업, 하위 과업, 연결, 상태
    nodes/<id>/README.md         과업(또는 하위 과업) 메모
    nodes/<id>/assets/           첨부 파일
    scene_spec.template.yaml     장면 명세 형식 (새 앱에 복사됨)
  apps/<앱 id>/                  앱 보드. 구조는 shared 와 같음
    scene_spec.yaml              이 앱의 구현 계약
    log.jsonl                    누가 무엇을 했는지 (자동)
  templates/<모드 id>/           모드: template.json + pipeline.json + nodes/*/README.md
unity/<앱 id>/                   앱별 Unity 프로젝트 (만들 때)
unity/shared/                    여러 앱이 가져다 쓰는 공용 모듈
```

## 공통과 앱 구분

- **공통**: 모든 앱에 적용되는 조건(기기, 입력, 성능), 모든 앱이 따르는 결정(Unity 버전), 같은 형식(장면 명세),
  여러 앱이 재사용하는 모듈(책상 캘리브레이션), 여러 앱에서 쓸 레퍼런스.
- **앱**: 그 앱의 개요, 무드보드, 콘셉트, 영상이나 스토리보드, 명세, 구현, 검수.
- 앱이 공통 과업을 쓰면 앱 보드에 `shared` 과업으로 둔다: `add shared --ref calibration --stage build --app <앱>`.
- 앱 작업 중 "다른 앱에도 해당하는" 결정이나 패턴이 나오면 공통 과업에 `note` 로 덧붙이고 사람에게 알린다.

## 보드를 고칠 때

- **상태와 구조는 CLI로 바꾼다.** `pipeline.json` 을 직접 편집하지 말 것. CLI가 잠금과 기록을 처리한다.
- **과업을 나누는 기준**: 에이전트 한 명이 맡아 산출물 하나로 끝낼 수 있는 단위. 같은 산출물로 이어지는 일(수집 → 분석 → 확인)은
  과업 하나의 하위 과업으로 묶는다. 산출물이 다르면 과업을 나누고 연결한다.
- **하위 과업 추가**: `sub <과업 id> <kind> "제목" --by agent|human --how "방법과 결과 위치"`. 순서는 `move <id> up|down`.
- **과업 추가**: `add <type> "제목" --stage <단계 id> --goal "목표" --output "산출물"`. 단계 목록은 `stages`.
- **사람이 판단할 지점은 `decide` 하위 과업으로 둔다.** 깰 지점 고르기, 무드보드 확인, 테스트·검수 통과는 사람의 몫이다.
  에이전트는 선택지를 메모로 정리하고 멈춘다.
- **메모는 덧붙인다.** 사람이 쓴 문단을 지우거나 고쳐 쓰지 말 것.
- **산출물은 해당 과업 폴더에.** `asset <id> <파일> --memo "설명"`, 또는 `nodes/<id>/assets/` 에 직접.
- **새 앱**: 사람이 요청했을 때만. `new-app <id> "이름" --mode <모드 id>` (`modes` 로 목록 확인).
- **새 모드**: `studio/templates/` 의 폴더 하나를 복사해 고친다. 이미 만든 앱에는 영향이 없다.
- **이름과 보드를 남긴다.** 모든 명령에 `--as "<내 이름>"` 과 `--app <앱 id>` (또는 `STUDIO_ACTOR`, `STUDIO_APP`).
- **오리지널 디자인.** 특정 제품, 브랜드, 캐릭터를 복제하는 프롬프트나 에셋을 만들지 않는다.
