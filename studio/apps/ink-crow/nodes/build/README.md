# 실행과 검증

[묵전 실행](https://reality404studio.github.io/my-mr-studio/)

Quest 3S의 Meta Quest Browser에서 위 주소를 직접 연다. 손 추적을 켜거나 컨트롤러를 들고 **VR 대련 시작**을 눌러 권한을 허용한다. 기본은 종이 산수화 배경의 VR 대련이고, **? → 패스스루로 시작**을 선택하면 현실 배경 위에서 대련한다. 데스크톱에서는 **직접 그리기**나 **시연 보기**를 선택한다.

## 저장소에서 실행

저장소 루트에서 다음 명령을 실행하고 컴퓨터 브라우저에서 `http://localhost:8080/`을 연다.

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory public/ink-crow
```

USB 디버깅을 허용한 Quest에 로컬 버전을 띄울 때는 다른 터미널에서 `adb reverse tcp:8080 tcp:8080`을 실행하고 **헤드셋 브라우저**에서 `http://localhost:8080/`을 연다. 배포할 때는 `public/ink-crow/`의 정적 파일을 한 HTTPS 디렉터리에 함께 둔다. 스튜디오 개발 서버에서는 `/ink-crow/`로 접근할 수 있다.

## 테스트

```sh
node --test test/ink-crow.test.mjs
```

양쪽 손, 열린 원과 흔들림, 실패 후 다시 그리기, 충전 중단, 추적 누락, 양안 뷰, 적 명중·회피·승패·초기화를 검증한다. 브라우저 데스크톱 시연에서 적 체력 감소를 확인했다. 소프트웨어 GLES 3에서 먹, 종이, 헤드업 안내 셰이더를 컴파일·링크하고 인스턴스 한 개의 픽셀을 읽어 중심, 가장자리, 빈 공간의 알파가 순서대로 감소하는 것을 확인했다.

---
**Codex** · 2026-11-18 12:41

웹 실행본 배포와 데스크톱 시연, 자동 테스트 10개, GLES 픽셀 판독을 완료했다. Quest 3S 착용 검수 대기.

---
**Codex** · 2026-11-18 14:21

실제 대련의 손·포인터와 시연에 먹 실험판의 InkBrush/InkPaper를 연결했다. 안료를 나눠 쓰는 공중 먹방울, 가상 종이 충돌 자국, 양안 공유 스플랫과 소프트웨어 미리보기는 public/ink-crow/에 있다. Quest 3S 실기 감도와 프레임 시간은 검수 대상이다.

---
**Antigravity** · 2026-11-18 15:37

비주얼·에셋 4종 전면 개편: 1) 새 조(鳥) 초서/행서 11획 레퍼런스 적용 및 수묵 엔진(InkBrush/InkPaper) 획순 실시간 필서 연출 2) 찌그러진 원 제스처도 해당 반경의 유려한 먹진 원상으로 자동 보정 3) 농묵-담묵 그라데이션 수묵 새떼(9마리 군집) 소환 및 비행·공격 시 깃털 모양 먹물·먹방울 흩날림 4) 겸재 정선 신묘년풍악도첩 풍 밝은 진경산수화(화강암 수직준·폭포·피마준·미점·소나무·운해) 배경, 부정형 도깨비불 적, 블레이드 앤 소울 초기 소환사 감성의 안개·날카로운 빛줄기(Tone 9/10/11) VFX 추가

---
**Antigravity** · 2026-11-18 16:05

피드백 4건 반영: 1) 중앙 팝업 가이드(readyGuide, VR 중앙 HUD 배너, guide 모달/entryStatus) 제거 2) 뼈대 선 대신 손바닥 면과 손가락 볼륨을 채운 자연스러운 사람 손 마스크(paintHand) 적용 3) 수묵 붓질·풍경 종소리·기운 공명·까마귀 울음/날갯짓·도깨비불 타격 Web Audio 효과음(sound.js) 추가 4) 새떼 소환 직후(t=0)부터 모든 새가 도깨비불 방향을 바라보도록 비행 조준 수정

---
**Antigravity** · 2026-11-19 13:03

1차 코어 블소(A안) 수묵·광채 VFX 폴리싱 완료: Drop-in SVG→512² SDF 鳥 2-레이어 인장(assets/glyph-bird.svg, glyph-sdf.js), 512² 4채널 Ink/Flow/Bristle/Glint 아틀라스, 단일패스 _AlphaShare 듀얼 블렌드, Tone 12 4각 성광·금분, AddEyeSafe 근안 페이드, Burst→Gather 2단 모핑, 전면 fx 레이어 크로스 참격 구현. 12/12 테스트 및 WebGL2 헤드리스 렌더링 0에러 검증 완료. 다음: 사용자 2766×4096 鳥 SVG 교체 테스트 및 Quest 3S 실기 검수(또는 2차 고도화 진행).

---
**Antigravity** · 2026-11-19 13:48

2차 상용 VFX 고도화(P0~P3) + 단일 직선 금지 룰 반영 완료: 3D 곡선 리본/초승달 검기 엔진(ribbon.js+ribbonProg) 도입 및 원·날개·충격파·타격의 직선 바늘 100% 제거, WorldWash 472x472 RG8 1-Draw-Call GPU 쿼드(washProg)로 패스스루 충전 스플랫 1,113개(-87%) 달성, handRipple 방사형 파동, Static/Dynamic VBO 분리 적용. 12/12 단위 테스트 및 WebGL2 5장면 0-에러 시각 검수 통과.

---
**Antigravity** · 2026-11-19 14:46

3차 시네마틱 6단계 소환 연출 완료: 블소 도교풍 4단 입체 Z-스택 마법진(circleProg 2 Draw Call: -9cm 팔괘·구름 / -3cm 원상 / 0cm 鳥 / +7cm 중앙 비운 부적 링), 실제 11획 필순 붓글씨 전개+붓끝 이미터(glyph-sdf.js), vfx-studio 3D Curl Noise+손 콜라이더 깃털 군집(curl-feathers.js) 및 SplatGlint 이식, 0.14초 흡입 정적->대북 폭발 오디오(sound.js) 통합. 13/13 테스트 및 WebGL2 7장면 0-에러 검수 통과(패스스루 충전 스플랫 882개).

---
**Antigravity** · 2026-11-20 05:04

다크소울+겸재 정선+몽유도원도 다크모드 배경 리뉴얼 및 mp4 BGM 드롭인 시스템(sound.js ./assets/bgm.mp4 자동 루프+0.14초 흡입 덕킹) 구현 완료. paperFrag 먹구름·사선 금빛 갓레이·운해·수면, forms.js 암봉·기와 누각·고성벽·폭포·금빛 복사꽃 고목, ink.css/xr.js 다크모드 UI 적용. 13/13 테스트 및 WebGL2 0-에러 검수 통과.

---
**Antigravity** · 2026-11-20 05:21

기존 절차적 신디사이저 효과음을 전면 삭제하고 assets/의 bgm.mp3(173초) + 넘버링된 01~13 WAV 13종으로 sound.js 100% 교체 완료. public/ink-crow/assets/ 복사 및 실제 Chromium Web Audio 14/14 디코딩, 13/13 단위 테스트, Pages 번들 빌드 검증 통과.
