# MR 스튜디오

"책상 위 꿈" Quest 3S 패스스루 앱을 **영상 먼저 → 명세 → Unity** 순서로 만드는 작업 공간이에요.
n8n처럼 단계를 노드로 놓고 연결하며, 사람과 에이전트가 같은 파일을 보고 고쳐요.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 열어요.

## 할 수 있는 것

- **단계 추가**: 오른쪽 위 버튼. 레퍼런스, 콘셉트, 프롬프트, 영상, 명세, 구현, 검수, 메모
- **연결**: 노드 오른쪽 점을 끌어 다른 노드 왼쪽 점에 놓기. 연결을 누르면 지울 수 있어요
- **상세 편집**: 노드를 누르면 오른쪽에 상태, 담당, 메모(마크다운), 파일이 열려요
- **무드보드**: 파일 칸에 이미지를 끌어다 놓고, 각 이미지에 "왜 골랐는지" 메모를 달아요
- **실시간 반영**: 에이전트가 `studio/` 파일을 고치면 화면이 바로 바뀌어요. 진행 중인 단계는 분홍빛으로 빛나요
- **기록**: 누가(나 / 에이전트) 무엇을 했는지 시간순으로 보여요

## 에이전트와 함께 쓰기

모든 상태는 `studio/` 폴더의 평범한 파일이라, 어떤 에이전트든 읽을 수 있어요.
규칙은 [AGENTS.md](AGENTS.md) 에 있고, Claude Code는 [CLAUDE.md](CLAUDE.md) 를 자동으로 읽어요.

```bash
npm run studio -- list
npm run studio -- show moodboard
npm run studio -- status video-prompts doing --as "Claude Code"
npm run studio -- note video-prompts "1~3컷 프롬프트 초안 작성" --as "Claude Code"
```

다른 컴퓨터나 클라우드 에이전트와 공유하려면 평소처럼 커밋하고 푸시하면 돼요.

## 구조

```
src/        웹 화면 (React + React Flow)
server/     파일 저장소와 API (Vite 개발 서버에 붙음)
scripts/    에이전트용 CLI
studio/     파이프라인 상태, 단계별 메모와 파일  ← 진실의 원천
docs/       시스템 설계서
```
