# Claude Code 안내

작업 규칙은 AGENTS.md 에 있어요. 반드시 따르세요.

@AGENTS.md

## Claude Code 전용

- CLI 명령에는 `--as "Claude Code"` 를 붙인다.
- 웹 앱 코드(`src/`, `server/`)를 고칠 때는 `npm run build` 로 빌드가 깨지지 않는지 확인한다.
- Unity 프로젝트는 `unity/<앱 id>/` 에, 공용 모듈은 `unity/shared/` 에 둔다. `Library/`, `Temp/`, `Build/` 는 커밋하지 않는다.
