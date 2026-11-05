
---
**Cursor Fable** · 2026-11-05 18:20

Cursor Fable · web/orion 구현 완료, check 통과(47/47) → proof. 커밋은 훅이 done 카드만 받아서 오케스트레이터가 done 으로 올린 뒤 가능 (파일은 unity/mood-picker 에 스테이징 안 한 상태로 둠).

만든 것: web/orion/{index.html,style.css,src/(settings,schema,material,layout,loader,app).js, server/(server,ws-lite).mjs, schema/, test/, vendor/three@0.170.0}, tools/web-orion/samples/(orion.export.json + chips 3종: yunseul·paint_004(흰 천, 털 대역)·gradient_sample 합성).

결정 메모 (왜):
- npm 의존성 0. WebSocket 은 node:http upgrade + RFC6455 프레임 손수 구현(server/ws-lite.mjs), 코덱·중계 테스트로 증명. ws 패키지 안 씀.
- 기본 포트 5180 (브리프 예시 5174 는 이 맥에서 작업대 Vite 가 쓰고 있어서 충돌). --port 로 바꿀 수 있음.
- lightDir 는 Unity 왼손 좌표계 값으로 보고 웹에서 z 를 뒤집음(material.js unityToThreeDir, 테스트 고정). 안 뒤집으면 빛이 뒤에서 와서 글자 정면이 어두움(look-web 1차 스크린샷에서 확인).
- tracking 정의: 단어 중심 기준 글자 중심 간격의 배율 (1 = GLB 그대로 0.615m, 0 = 전부 겹침). thickness = Z 스케일, rotation = 그룹 Y. 글자 offset 은 그 뒤에 더함. layout.test 로 고정.
- 업로드 inbox 는 평면(슬래시 금지)이라 Quest 가 올리는 orion.export.json 의 tile 경로는 평면 파일명이어야 함 (예: paint_x.tile.png). 샘플은 chips/<id>/tile.png 폴더 구조. → Unity 내보내기 카드(build-a3a1-build-f049)와 맞출 것. 스키마는 ".." 없는 상대 경로면 둘 다 허용.
- Download GLB: 칩 ShaderMaterial 은 glTF 로 못 나가서 내보내는 순간만 MeshStandardMaterial(map=타일, UV 사용)로 바꿔 export 후 복원. 트라이플래너 룩은 GLB 에 안 담김(재질 텍스처만).
- hero 는 샘플을 기본으로 띄우고, 서버 export 이벤트(.json 업로드)가 오면 /inbox 의 그 파일로 교체. 브라우저 테스트로 업로드→교체 확인.

열린 것:
- 룩 비교 PNG(성공 조건 3번째): Unity 쪽 build-3e76 결과가 아직 없음. 웹 렌더만 test/shots/look-web.png 로 남김. 같은 칩·같은 lightDir 로 Unity 배치 렌더가 나오면 나란히 붙일 것.
- 윤슬 칩 톤(light/mid/shadow)은 paint.json 이 없어 이미지 밝기 분위로 계산한 값. 그라데이션 칩은 합성본(마블링 작업대 결과물 대기).

---
**Claude Code** · 2026-11-05 23:41

check 실패 (exit 1): `cd unity/mood-picker && node --test web/orion/test/`

```
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 69.8535

✖ failing tests:

test at web/orion/test:1:1
✖ web/orion/test (63.532125ms)
  'test failed'

```

---
**Claude Code** · 2026-11-05 23:41

check 실패 (exit 1): `cd unity/mood-picker/web/orion && node --test test/*.test.mjs`

```
ℹ tests 47
ℹ suites 0
ℹ pass 46
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8484.7405

✖ failing tests:

test at test/browser.test.mjs:63:1
✖ browser: editor presets, sliders -> quest relay, hero GLB export (8251.178958ms)
  [Error: ENOTEMPTY: directory not empty, rmdir '/var/folders/n_/8p5lyp65519c7k__7vz83jgm0000gn/T/orion-chrome-MYveKn/Default'] { errno: -66, code: 'ENOTEMPTY', syscall: 'rmdir', path: '/var/folders/n_/8p5lyp65519c7k__7vz83jgm0000gn/T/orion-chrome-MYveKn/Default' }

```
