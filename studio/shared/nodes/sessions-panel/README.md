# 활성 세션 표시


---
**Claude Code** · 2026-11-04 04:50

check 실패 (exit 1): `sh -c npm test && npm run build`

```
    ping, pkg, prefix, profile, prune, publish, query, rebuild,
    repo, restart, root, run, sbom, search, set, shrinkwrap,
    star, stars, start, stop, team, test, token, trust,
    undeprecate, uninstall, unpublish, unstar, update, version,
    view, whoami

Specify configs in the ini-formatted file:
    /Users/rafaela/.npmrc
or on the command line via: npm <command> --key=value

More configuration info: npm help config
Configuration fields: npm help 7 config

npm@11.12.1 /opt/homebrew/lib/node_modules/npm

```

---
**Claude Code** · 2026-11-04 04:50

활성 세션 줄 붙임. /api/sessions 가 ~/.claude/sessions/<pid>.json 에서 이름·상태·cwd·시각만 읽고 (.key 안 읽음, 소켓 경로 안 냄), 죽은 pid랑 상위 폴더 밖 cwd는 뺌. CLI는 CLAUDE_CODE_SESSION_ID 있으면 로그 줄에 session 붙임 (actor 그대로). 홈이랑 보드 상단에 칩으로 뜨고 5초마다 갱신, 카드 누르면 열림. 첫 check 실패는 내가 sh -c 로 감싸서 따옴표 깨진 것. 남은 것: 옛 로그엔 session 이 없어서 이 CLI 쓰기 전 세션은 카드가 비어 보임. 웹 사람 편집은 session 안 붙음.
