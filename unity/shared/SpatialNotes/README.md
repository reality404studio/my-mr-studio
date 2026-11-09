# 헤드셋 메모 (Unity)

헤드셋을 쓴 채로 말 한마디를 남기면, 그 순간 보던 것과 거리·각도가 스튜디오의 사람 화면과 `npm run studio -- feel` 로 들어가요.
웹 그레이박스(`xr.html`)와 같은 형식이라 스튜디오에서는 똑같이 보여요.

| 파일 | 하는 일 |
| --- | --- |
| `SpatialNoteSender.cs` | 녹음, 대상 고르기, 거리·각도 계산, 스튜디오로 보내기 |
| `SpatialNoteTarget.cs` | 메모 대상 오브젝트에 붙임. `specPath` = 명세 경로 (`objects.cd_player`) |

## 붙이기

1. 빈 GameObject 에 `SpatialNoteSender` 를 붙이고 `serverUrl`, `appId` 를 적어요.
   - 같은 Wi-Fi: 맥에서 `npm run dev:xr` → 터미널에 뜬 `https://192.168.x.x:5173`. 자체 서명 인증서라 `acceptSelfSignedCertificate` 를 켜 둬요.
   - http 로 쓰려면 `npm run dev -- --host` 와 Player Settings > Other > **Allow downloads over HTTP** = Always allowed.
2. 메모 대상이 될 오브젝트에 `SpatialNoteTarget` 을 붙이고 `specPath` 를 적어요.
3. `deskFrame` 에 책상 캘리브레이션 원점을 넣어요. 축이 명세와 같아요 (x 오른쪽, y 위, z 책상 안쪽).
   비워 두면 세션 좌표로 남고, 스튜디오는 상대값(거리·각도)만 믿어요.
4. 손끝 Transform(`leftIndexTip`, `rightIndexTip`)을 넣으면 "가리킨 것"과 손끝 거리도 남아요.
5. 앱의 손바닥 메뉴 버튼에서 `ToggleNote()` 를 불러요. 에디터와 XR 시뮬레이터에서는 **N** 키.
6. Android 매니페스트에 마이크 권한(`RECORD_AUDIO`)이 들어가요. 처음 실행할 때 허용해요.

## 알아 둘 것

- **받아쓰기는 안 해요.** wav 만 올라가고, 사람 화면에서 듣고 한 줄로 적어요. 받아쓰기를 붙이면 `SetTranscript()` 로 넣어요.
- 조절 값을 같이 남기려면 `ISpatialNoteParams` 를 구현한 컴포넌트를 `paramsSource` 에 넣어요.
- **아직 Unity 에서 컴파일해 보지 않았어요.** 문법은 Unity 밖에서 확인했어요. 첫 실기 테스트 때 맞는지 봐 주세요.
