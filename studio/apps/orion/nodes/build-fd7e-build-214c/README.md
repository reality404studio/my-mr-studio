
---
**Claude Code** · 2026-11-06 00:07

check 실패 (exit 1): `sh unity/mood-picker/scripts/verify-tokens.sh >/tmp/vt.out 2>&1 || { tail -5 /tmp/vt.out; exit 1; }; sh unity/mood-picker/scripts/run-editmode-tests.sh >/tmp/em.out 2>&1; grep -E "^total=" /tmp/em.out; grep -c "Passed  MoodPicker.Tests.OrionTokens" /tmp/em.out; grep -E "Failed|error CS" /tmp/em.out | head -6; grep -q "failed=0" /tmp/em.out && [ "$(grep -c "Passed  MoodPicker.Tests.OrionTokens" /tmp/em.out)" -gt 0 ]`

```
total=261 passed=255 failed=6
9
  Failed  MoodPicker.Tests.OrionLookTests.OutlineToggleAddsOnlyOpaqueKleinBorder
  Failed  MoodPicker.Tests.OrionLookTests.RenderedRampHasContinuousOrExactIntegerToneCount(0)
  Failed  MoodPicker.Tests.OrionLookTests.RenderedRampHasContinuousOrExactIntegerToneCount(1)
  Failed  MoodPicker.Tests.OrionLookTests.RenderedRampHasContinuousOrExactIntegerToneCount(2)
  Failed  MoodPicker.Tests.OrionLookTests.RenderedRampHasContinuousOrExactIntegerToneCount(4)
  Failed  MoodPicker.Tests.OrionLookTests.RenderedRampHasContinuousOrExactIntegerToneCount(8)

```
