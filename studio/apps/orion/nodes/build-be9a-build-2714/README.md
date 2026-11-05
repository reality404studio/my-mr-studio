
---
**Claude Code** · 2026-11-05 17:25

check 실패 (exit 1): `sh unity/mood-picker/scripts/run-editmode-tests.sh >/tmp/em.out 2>&1; grep -E "^total=" /tmp/em.out; grep -c "Passed  MoodPicker.Tests.HandState" /tmp/em.out; grep -E "Failed|error CS" /tmp/em.out | head -5; grep -q "failed=0" /tmp/em.out && [ "$(grep -c "Passed  MoodPicker.Tests.HandState" /tmp/em.out)" -gt 0 ]`

```
total=237 passed=236 failed=1
57
  Failed  MoodPicker.Tests.HandStateRuntimeTests.DisableReenableRebindAndDestroyManageSubscriptions

```
