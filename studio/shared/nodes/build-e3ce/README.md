# 책상 키보드 착시 실험


---
**Claude Code** · 2026-11-03 16:08

2026-11-04 build-6f1c: Assets/Scripts/Experiments/DeskKeyboard/Core (asmdef MoodPicker.DeskKeyboard, 참조 MoodPicker.Hands 만). DeskPlane.FromThreePoints(앞왼·앞오른·뒤) / DwellDetector(0.6s, 4mm 반경, 3cm 움직여야 다음) / DeskCalibrator(오른손 검지 세 점) / TouchDetector(검지·중지·약지 양손, 닿음 5mm·뗌 12mm·예측 30mm 안에서 내려오는 속도 0.08m/s 이상일 때 (h-5mm)/속도 ≤ predictLead(기본 40ms) 면 Predicted, 예측 없이 닿으면 late). 캘리브레이션 점 = 닿은 순간의 손끝 위치라 손끝 패드 오프셋은 상쇄됨. HandPose 에 middleTip·ringTip 추가 (OvrHandInput 도). 위치는 카드 how 의 Assets/Experiments 대신 Assets/Scripts/Experiments (주석 린트·OVR 직접 참조 금지 테스트 범위 안).

---
**Claude Code** · 2026-11-03 16:59

2026-11-04 오늘 종료. 실험 카드 4개 중 2개 done (6f1c 감지 코어, c099 실험 씬), f36b(사람 체감) 진행 중, a9f0(마이크 간격 측정) 대기. 결과 요약: 소리가 나면 '눌렸다'고 뇌가 속는 순간이 있음, 소리는 B(낮고 둔탁)가 선택됨, 키가 빽빽하면 눌림이 안 보임 → 간격 22mm, 반발감이 없는 게 남은 함정, 타자기 같은 형태가 손을 납득시킬 것 같다는 의견.
