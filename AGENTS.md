# 에이전트 작업 규칙 (AGENTS.md)

이 레포는 Quest 3S 패스스루 VR 앱들을 만드는 **공통 작업대**예요.
위에 모든 앱이 함께 쓰는 **공통** 캔버스가 있고, 그 아래 앱마다 캔버스가 하나씩 있어요.
앱은 만들 때 **모드**(영상 우선, 스토리보드 우선 …)를 골라 단계가 미리 깔려요.
사람은 웹(`npm run dev`)으로, 에이전트는 파일과 CLI로 **같은 상태**를 읽고 써요. 고친 내용은 열린 화면에 바로 나타나요.

## 먼저 읽을 것

1. `npm run studio -- apps` 로 공통과 앱 목록을 본다.
2. `npm run studio -- list --app shared` 로 공통 조건을 본다. 특히 `platform`, `perf-rules`, `hand-patterns`.
3. 맡은 앱은 `npm run studio -- list --app <앱 id>`, 앱의 `brief`(앱 개요) 노드를 먼저 `show` 한다.
4. 맡은 단계는 `npm run studio -- show <노드 id> --app <앱 id>`.

## 폴더 구조

```
studio/
  studio.json                    스튜디오 이름
  shared/                        공통 캔버스 (--app shared)
    pipeline.json                단계, 연결, 상태, 담당, 위치
    nodes/<id>/README.md         단계 메모
    nodes/<id>/assets/           첨부 파일
    scene_spec.template.yaml     장면 명세 형식 (새 앱에 복사됨)
  apps/<앱 id>/                  앱 캔버스. 구조는 shared 와 같음
    scene_spec.yaml              이 앱의 구현 계약
    log.jsonl                    누가 무엇을 했는지 (자동)
  templates/<모드 id>/           모드: template.json + pipeline.json + nodes/*/README.md
unity/<앱 id>/                   앱별 Unity 프로젝트 (만들 때)
unity/shared/                    여러 앱이 가져다 쓰는 공용 모듈
```

## 공통과 앱 구분

- **공통**에 두는 것: 모든 앱에 적용되는 조건(기기, 입력, 성능), 한 번 정하면 모든 앱이 따르는 결정(Unity 버전),
  여러 앱이 재사용하는 모듈(책상 캘리브레이션), 여러 앱에서 쓸 레퍼런스.
- **앱**에 두는 것: 그 앱의 개요, 무드보드, 콘셉트, 영상이나 스토리보드, 명세, 구현, 검수.
- 앱이 공통 단계를 쓰면 앱 캔버스에 `shared` 타입 노드로 연결한다: `add shared --ref calibration --app <앱>`.
  이 노드의 상태는 공통 노드를 따라가므로 앱 쪽에서 바꾸지 않는다.
- 앱 작업 중 "다른 앱에도 해당하는" 결정이나 패턴이 나오면 공통 노드에 `note` 로 덧붙이고 사람에게 알린다.

## 규칙

- **상태는 CLI로 바꾼다.** `pipeline.json` 을 직접 편집하지 말 것. CLI가 잠금과 기록을 처리한다.
  - 시작: `status <id> doing` · 사람 확인 필요: `status <id> review` · 막힘: `status <id> blocked` + `note` 로 이유 · 끝: `status <id> done`
- **메모는 덧붙인다.** `note <id> "무엇을 했고, 무엇이 남았는지"`. 사람이 쓴 문단을 지우거나 고쳐 쓰지 말 것.
  README.md 를 직접 편집해도 되지만 기존 내용은 보존한다.
- **산출물은 해당 단계 폴더에.** `asset <id> <파일> --memo "설명"`, 또는 `nodes/<id>/assets/` 에 직접 넣어도 화면에 뜬다.
- **새 단계**: `add <type> "제목" --after <이전 id>`. type: `reference`, `concept`, `prompt`, `video`, `storyboard`, `spec`, `build`, `review`, `note`, `shared`.
- **새 앱**: 사람이 요청했을 때만. `new-app <id> "이름" --mode <모드 id>` (`modes` 로 목록 확인).
- **새 모드**: `studio/templates/` 의 폴더 하나를 복사해 고친다. 이미 만든 앱에는 영향이 없다.
- **사람이 판단할 지점에서는 멈춘다.** 콘셉트에서 깰 지점 고르기, 무드보드 선택, 사용성 테스트·검수 통과는
  사람의 몫이다. 선택지를 메모로 정리하고 `review` 상태로 넘긴다.
- **이름을 남긴다.** 모든 CLI 명령에 `--as "Claude Code"` 처럼 이름을 붙이거나 `STUDIO_ACTOR` 를 설정한다.
- **캔버스를 지정한다.** 모든 캔버스 명령에 `--app <앱 id>` 또는 `--app shared`. 반복되면 `STUDIO_APP` 을 설정한다.
- **오리지널 디자인.** 특정 제품, 브랜드, 캐릭터를 복제하는 프롬프트나 에셋을 만들지 않는다.
