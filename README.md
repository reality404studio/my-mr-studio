# VR 앱 만들기

Quest 3S 패스스루 앱들을 만드는 공통 작업대예요. n8n처럼 단계를 노드로 놓고 연결하며, 사람과 에이전트가 같은 파일을 보고 고쳐요.

```
VR 앱 만들기
├─ 공통      모든 앱이 함께 쓰는 조건, 결정, 모듈 (플랫폼 조건, Unity 버전, 72fps 규칙, 핸드 패턴, 책상 캘리브레이션 …)
└─ 앱들      앱마다 캔버스 하나. 만들 때 모드를 고름
   ├─ 책상 위 꿈        영상 우선
   └─ (새 앱)           스토리보드 우선 …
```

## 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열면 홈이 나와요.

## 모드

| 모드 | 출발점 | 흐름 |
| --- | --- | --- |
| 영상 우선 | 보고 싶은 화면 | 무드보드 → 콘셉트 → 영상 프롬프트 → 참조 영상 → 명세 → 구현 → 검수 |
| 스토리보드 우선 | 사용 흐름 | 콘셉트 → 사용 흐름 → 사용성 스토리보드 → 그레이박스 → 사용성 테스트 → 명세 → 구현 → 검수 |

모드는 `studio/templates/` 의 폴더예요. 폴더 하나를 복사해 고치면 새 모드가 생겨요.

## 할 수 있는 것

- **홈**: 공통 띠와 앱 카드. 카드의 띠 한 칸이 단계 하나, 색이 상태예요
- **새 앱 만들기**: 이름, id, 모드를 고르면 단계가 깔린 캔버스가 생겨요
- **단계 추가와 연결**: 오른쪽 위 버튼, 노드 점을 끌어 연결. 연결을 누르면 지울 수 있어요
- **공통 단계 가져오기**: 앱 캔버스에서 "공통" 단계를 추가하고 가져올 단계를 골라요. 상태는 공통을 따라가요
- **상세 편집**: 노드를 누르면 상태, 담당, 메모(마크다운 자동 저장), 파일
- **무드보드**: 파일 칸에 이미지를 끌어다 놓고 이미지마다 "왜 골랐는지" 메모
- **실시간 반영과 기록**: 에이전트가 파일을 고치면 바로 보이고, 누가 무엇을 했는지 남아요

## 에이전트와 함께 쓰기

규칙은 [AGENTS.md](AGENTS.md), Claude Code는 [CLAUDE.md](CLAUDE.md) 를 자동으로 읽어요.

```bash
npm run studio -- apps
npm run studio -- list --app shared
npm run studio -- show moodboard --app desk-dream
npm run studio -- status video-prompts doing --app desk-dream --as "Claude Code"
npm run studio -- new-app hand-garden "손끝 정원" --mode storyboard-first --as "Claude Code"
```

다른 컴퓨터나 클라우드 에이전트와는 평소처럼 커밋하고 푸시해서 공유해요.

## 구조

```
src/        웹 화면 (React + React Flow)
server/     파일 저장소와 API (Vite 개발 서버에 붙음)
scripts/    에이전트용 CLI
studio/     공통, 앱, 모드  ← 진실의 원천
unity/      Unity 프로젝트 (앱별, 공용 모듈)
```

## 첫 버전에서 올라온 경우

예전에는 `studio/` 바로 아래에 한 앱만 있었어요. 서버나 CLI를 처음 실행할 때 예전 위치에 남은 파일
(커밋하지 않은 무드보드 등)은 `studio/apps/desk-dream/` 과 `studio/shared/` 로 자동으로 옮겨져요.
