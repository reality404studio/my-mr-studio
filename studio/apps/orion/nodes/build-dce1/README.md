# 시험 녹화: 패스스루에서 맥북 화면이 읽히는지


---
**Claude Code** · 2026-11-05 16:03

2026-11-06 01:05 시험 (빌드 mvp-dev2 6d25a43). ① metavr device_screenshot(metacam) = 패스스루 프레임이 담김. ② adb screenrecord(mr record) = 완전 검은 영상(3664x1920) → 영상용으로 쓸 수 없음. ③ 맥북 화면: 큰 글자 ORION 과 슬라이더 라벨(TRACKING/THICKNESS/ROTATION)은 읽힘 (mac-screen-readable-metacam.jpg), 작은 글자(IDE·칸반 본문)는 안 읽히고 흐림 (…unreadable-small-text.jpg). 맥 화면 밝기 낮춤+큰 글자·고대비 필요. ④ 남은 것: 패스스루가 담기는 영상 녹화 방법 1개 (Quest 내장 녹화·MQDH 캐스팅 녹화 후보)

---
**Claude Code** · 2026-11-05 16:05

2026-11-06 사람: "맥북은 일단 그 mqdh로 녹화하려고요. 그정도면 보여요. 패스스루 잘되고." → 영상 녹화 = MQDH 캐스팅 녹화(Mac 화면 녹화), 패스스루·맥북 가독성 사람 판정 통과.

---
**Claude Code** · 2026-11-05 16:05

녹화 방법 확정: MQDH 캐스팅(DECIDED 2026-09-11 공통 '실기 관찰은 MQDH 캐스팅, 녹화는 필요할 때만') → Mac 화면 녹화. adb screenrecord 는 검은 영상이라 폐기

---
**Claude Code** · 2026-11-05 16:05

사람 판정(verify-f3a3): 위 발언으로 맥북 화면·패스스루 가독성 통과. 단, 영상에 실제 쓸 클립은 MQDH 녹화로 본 촬영 때 다시 확인
