# Dab: 푝 + 셀 셰이더

HANDOFF §4-5, §5 (DabPaint, CelShader, HandJudge). 셀 셰이더는 공통 "Unity 실기 가드레일" §4 를 지킨다:
알파 0이 아닌 값 쓰기, ColorMask RGB 금지, 외곽선 Render Face Back(_Cull 1), 광원 없이 동작.

## 결정 (2026-11-03, dab-decide)

- 집 무대: **셀 애니 스타일만, CRT 데스크 세계관은 뺀다.** 오브제는 그냥 책상 위에
- 손 판단: **휴리스틱만** (ML 분류기 안 함)
- 오브제: **페트병 하나 먼저.** 의자·머그는 시간 남으면
