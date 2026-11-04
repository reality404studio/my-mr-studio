
---
**Claude Code** · 2026-11-03 15:54

2026-11-04 구현: Assets/Scripts/Hands/Core (asmdef MoodPicker.Hands, 참조 없음): HandPose/HandFrame(엄지끝·검지끝·손바닥·손바닥 법선, 트래킹 공간 m), IHandInput, PinchDetector(시작 <1.5cm 0.05s 유지, 끝 >3cm, 추적 끊기면 끝), HandTrajectory JSON + RecordedHandInput. Assets/Scripts/Hands/Ovr (Oculus.VR 참조는 여기만): OvrHandInput(OVRSkeleton OpenXR XRHand_ThumbTip/IndexTip/Palm), HandTrajectoryRecorder(시작 3s 뒤 15s, persistentDataPath/hand_*.json). FirstLight 씬에 둘 다 붙임. 🔒: 코어 asmdef·어셈블리에 Oculus 참조 있으면 실패, Assets/Scripts 에서 Hands/Ovr·FirstLight 밖의 OVRHand/OVRSkeleton/OVRInput/OVRPlugin/OVRBone 쓰면 실패 (일부러 넣어 보고 failed=1 exit 2 확인). 실기 녹화 관찰: 오른손 거리 최소 0.05cm, 왼손 0.6cm → 1.5cm 시작 임계 여유 있음. 15초 동안 양손 tracked=true 가 끊긴 적 없음 (손을 시야 밖으로 내려도 OVR 이 데이터를 유지했거나 내린 동작이 짧았음 → 추적 끊김 처리는 합성 픽스처로만 검증). palmNormal(-palm.up) 방향이 실제 손바닥 쪽인지는 portal 카드에서 확인 필요. preflight 는 asmdef 폴더를 건너뛰게 고침 (그 폴더는 Unity 테스트 하네스가 검증).
