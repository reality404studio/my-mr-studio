
---
**Claude Code** · 2026-11-03 15:31

2026-11-04 사용: sh unity/mood-picker/scripts/run-editmode-tests.sh (에디터 닫고) → Library/TestResults/editmode.xml + 요약 출력, exit = Unity 종료 코드 (0 통과, 2 테스트 실패, XML 없으면 1). 테스트 어셈블리 Assets/Tests/EditMode/MoodPicker.Tests.EditMode.asmdef (Editor 전용, UNITY_INCLUDE_TESTS, BuildGate 런타임·에디터 참조). 들어 있는 테스트: 프로젝트가 빌드 게이트 파일 검사를 통과 / 게이트 로그 태그 MP. 음성 확인: 일부러 Assert.Fail 넣으면 failed=1, exit 2 (그 파일은 지움). 다음 카드부터 PigmentCore 같은 순수 C# 은 여기 EditMode 테스트로 증거를 낸다.

---
**Verifier** · 2026-11-03 15:37

검증(Verifier): run-editmode-tests.sh 직접 재실행 → total=2 passed=2 failed=0, exit 0 (21초). 음성 확인: Assert.Fail 테스트를 임시로 넣자 failed=1, exit 2 → 파일 삭제 후 재실행 exit 0, Assets/Tests git 변경 없음. 성공 조건(배치모드 exit 0 + XML 통과 1개 이상) 충족.
