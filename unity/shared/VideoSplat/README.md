# 영상 → 72fps 가우시안 스플랫 변환 공용 모듈 (`VideoSplat`)

임의의 짧은 영상(`.mov` / `.mp4`, 예: 윤슬·물결·불꽃·나뭇잎 그림자)을 **심리스 루프 + FFT 주기화 플립북 아틀라스**로 굽고, 3D 메시(`.glb` / `Mesh`) 표면을 **Quest 3 / 3S 실기 72fps 고정(`App ≈ 10ms`) 가우시안 스플랫 구름**으로 렌더링하는 공용 부품입니다.

---

## 1. 구성 파일 위치

| 구분 | 경로 | 역할 |
| --- | --- | --- |
| **영상 프레임 추출기** | `unity/shared/VideoSplat/extract_video_frames.sh` | `ffmpeg`로 영상을 정사각형(`256×256`, `30fps`) 프레임 PNG(`f_0001.png`…)로 추출 |
| **아틀라스·에셋 빌더 (CLI/Editor)** | `unity/mood-picker/Assets/Editor/VideoSplatPipeline.cs` | 프레임 폴더 → 루프 탐색·크로스페이드·FFT 주기화·2톤 추출 → `SplatPigmentSlotAsset` + `_Atlas.png` 생성 |
| **순수 C# 신호처리 코어** | `unity/mood-picker/Assets/Scripts/Pigment/Core/` | `LoopFinder`(Schödl 2000), `PeriodicTile`(Moisan 2011 2D FFT), `TwoToneExtractor`(k=2 k-means), `FlipbookAtlas` |
| **순수 C# 스플랫 샘플러** | `unity/mood-picker/Assets/Scripts/Splatter/Core/` | `MeshSplatSampler`(CDF 면적 가중 샘플링 + 용접 스무스 노멀 외곽선), `SplatCloudMeshBuilder`, `PigmentAtlasBuilder` |
| **Unity 런타임 컴포넌트** | `unity/mood-picker/Assets/Scripts/Splatter/Runtime/` | `SplatPigmentSlotAsset`, `SplatLetterRenderer`, `SplatWordController` |
| **Quest 3/3S 72fps URP 셰이더** | `unity/mood-picker/Assets/Shaders/Splatter/LetterSplatURP.shader` / `Assets/Shaders/Pigment/PigmentCommon.hlsl` | 5종 셰이더 모드(`Raw`, `TwoToneCel`, `Glint`, `Chrome`, `Caustic`) + 72Hz 서브프레임 보간 + 1패스 `AlphaToMask` |

---

## 2. 새 영상을 스플랫으로 만드는 3단계 (에이전트 실행 레시피)

### Step 1. 영상에서 `256×256` 정사각형 프레임 추출

```bash
./unity/shared/VideoSplat/extract_video_frames.sh \
  /path/to/input_video.mov \
  /tmp/vidref_frames/my_video \
  256 30
```
- **주의**: 원본 영상(`.mov`/`.mp4`)과 `/tmp/vidref_frames/` 임시 프레임은 절대 Git에 커밋하지 않습니다.

### Step 2. 심리스 루프 + 주기화 플립북 아틀라스 에셋 생성

Unity 배치모드 CLI 한 줄로 `Assets/Textures/Splatter/<SlotName>.asset`과 `<SlotName>_Atlas.png`를 생성합니다:

```bash
VIDEO_SPLAT_NAME="Slot2_MyVideo" \
VIDEO_SPLAT_FRAMES_DIR="/tmp/vidref_frames/my_video" \
/Applications/Unity/Hub/Editor/6000.3.27f2/Unity.app/Contents/MacOS/Unity \
  -batchmode -projectPath unity/mood-picker \
  -buildTarget Android \
  -executeMethod VideoSplatPipeline.BuildSlotFromEnvBatch \
  -logFile /tmp/video-splat-slot.log
```

또는 에디터 C# 코드에서 직접 호출합니다:

```csharp
SplatPigmentSlotAsset slot = VideoSplatPipeline.BuildSlotAssetFromFrames(
    "Slot2_MyVideo",
    "/tmp/vidref_frames/my_video",
    tileSize: 256,
    fps: 30f);
```

내부에서 자동으로 수행되는 파이프라인:
1. **`LoopFinder.FindBestLoop`**: `64×64` 그레이스케일 L1 거리 행렬 + 5탭 대각선 필터로 최적 루프 구간(`1.0~3.0초`, 최대 `48프레임`) 탐색
2. **`LoopFinder.CrossfadeLoopRGBA`**: 루프 끝 `K=8` 프레임을 시작 구간과 코사인 블렌딩해 시간 경계 점프 제거
3. **`PeriodicTile.MakePeriodicRGBA`**: 각 타일마다 경계 점프 $v$를 구하고 2D FFT 푸아송 해($\hat{s}_{q,r} = \hat{v}_{q,r} / (2\cos(2\pi q/W) + 2\cos(2\pi r/H) - 4)$)로 스무스 성분 $s$를 빼서 공간 경계(`seamError`)를 80~93% 감소
4. **`TwoToneExtractor.Extract`**: 알파가 0인 빈 셀을 제외하고 k=2 k-means로 명부(`lightTone`)·암부(`shadowTone`) 대표색과 임계값(`threshold`) 추출

### Step 3. 3D 메시(`.glb` / `Mesh`)에 스플랫 연결

`SplatterSceneSetup.CreateOrionSplatWord` (또는 `SplatLetterRenderer.RebuildFromMesh` + `SplatWordController.SetSlotAsset`)에 생성한 `SplatPigmentSlotAsset`을 넣으면 바로 동작합니다.

- **5종 셰이더 모드 (`SplatShaderMode`)**:
  - `Raw (0)`: 원본 주기화 영상 물결 + 스페큘러 하이라이트
  - `TwoToneCel (1)`: k-means 2톤 셀 셰이딩 + `#2E3350` 스플랫 외곽선
  - `Glint (2)`: `h > 0.6` 밝은 윤슬 입자만 반짝이는 반투명 스플랫
  - `Chrome (3)`: 유한 차분(`PerturbNormalFromHeightFiniteDiff`)으로 물결 법선을 흔드는 크롬 수은 반사
  - `Caustic (4)`: 월드 좌표 트라이플래너 수면 채광(`h^3 * 4`)

---

## 3. Quest 3 / 3S 실기 72fps 고정 성능 가드레일 (필수 준수)

실기 테스트(`PID 20696 → 21550`)에서 **`18fps` (`App=55ms`, `Tear=14`) → `72/72fps` (`App=9.95ms`, `Tear=0`, `Stale=0`)**를 달성한 핵심 규칙입니다. 다른 에이전트가 셰이더나 샘플러를 수정할 때 아래 6가지를 절대 깨뜨리지 마세요.

1. **반드시 1패스 `AlphaToMask On` + `ZWrite On` 유지 (`LetterSplatURP.shader`)**
   - 2패스(불투명 코어 + 반투명 `ZWrite Off` 가우시안 페더)로 나누면 10만 개 이상의 스플랫이 두 번씩 그려지고 반투명 오버드로우가 겹쳐 Adreno 740 GPU 시간이 `50ms+`로 폭증합니다.
   - Quest URP의 4x MSAA 위에서 단일 패스 `AlphaToMask On` + `ZWrite On`을 쓰면 가장자리 부드러움과 Early-Z 깊이 컬링을 동시에 얻습니다.
2. **정점 셰이더 뒷면 스플랫 즉시 컬링 (`dot(normalWS, V) < -0.15`)**
   - 닫힌 3D 메시의 시선 반대쪽 뒷면 스플랫은 프래그먼트 단계까지 보내지 말고 정점 셰이더에서 즉시 컬링합니다 (`mode != 2 && dot(normalWS, V) < -0.15`).
3. **외곽선 스플랫은 `TwoToneCel (Mode 1)`에만 생성**
   - `includeOutline = true`는 스플랫 정점 수를 2배로 늘립니다. 외곽선을 실제로 그리는 `SplatShaderMode.TwoToneCel`에만 `includeOutline = true`를 켭니다.
4. **트라이플래너 가중치 분기 (`w > 0.05`, `PigmentCommon.hlsl`)**
   - 돌출형(Extruded) 3D 글자/메시의 앞·뒷면은 법선이 한 축(`z`)에 집중됩니다. `w.x > 0.05`, `w.y > 0.05`, `w.z > 0.05`인 평면만 텍스처를 샘플링해 프래그먼트당 텍스처 페치 수를 1/3로 줄입니다.
5. **72Hz 서브프레임 보간 (`SlotFrameContinuous` + `lerp(c0, c1, frac)`)**
   - 30fps 아틀라스를 정수 프레임으로 넘기면 72Hz 헤드셋에서 3:2 풀다운 저더("드드득" 끊김)가 발생합니다. 반드시 소수점 프레임(`LetterPoseMath.SlotFrameContinuous`)을 넘기고 `SampleFlipbook`에서 인접 타일 두 장을 `lerp`합니다.
6. **프래그먼트 단위 스플랫 내부 좌표 샘플링 (`lerp(centerOS, posOS, 0.82)`)**
   - 스플랫 중심(`centerOS`) 하나만 샘플링하면 스플랫 원판이 단색 모자이크처럼 보입니다. 프래그먼트에서 `lerp(i.centerOS, i.posOS, 0.82)`로 샘플링해야 `256×256` 타일의 잔물결 해상도가 그대로 살아납니다.
   - 머티리얼에 색상을 넘길 때는 Unity Linear 색공간이 `SetColor` 시 sRGB→Linear 변환을 자동 수행하므로 C#에서 중복 감마 변환을 하지 않습니다.
