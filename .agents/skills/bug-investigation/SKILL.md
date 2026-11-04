---
name: bug-investigation
description: Investigate Parallax defects using event history, reproduction steps, focused tests, and evidence without risking local project history.
---

# Parallax Bug Investigation

## Use this skill when

Diagnosing a reported bug, failed test, missing event, incorrect diff, reconstruction mismatch, storage issue, or VS Code lifecycle problem.

## Workflow

1. Read `AGENTS.md`, `ARCHITECTURE.md`, and the relevant feature specification.
2. Preserve the current working tree. Do not reset, clean, or overwrite user changes.
3. Capture the exact reproduction steps, expected behavior, observed behavior, environment, and relevant logs. Redact secrets and personal data.
4. Determine whether the issue is in capture, normalization, event ordering, content storage, diffing, reconstruction, snapshots, replay, Git integration, or webview presentation.
5. Reproduce with the smallest safe fixture, preferably a temporary workspace.
6. Inspect persisted event/content records read-only. Do not edit user history to make a test pass.
7. Form a hypothesis and identify evidence that would disprove it.
8. Add a regression test before or with the fix.
9. Make the smallest targeted correction. Consider old persisted records and interrupted operations.
10. Run targeted tests and the full available validation commands.
11. Request independent review for changes to persistence, reconstruction, path handling, or security boundaries.
12. Report root cause only when supported by evidence. Otherwise report the leading hypothesis and what remains unknown.

## Special handling for history bugs

- Preserve a copy of relevant local history before experimentation.
- Verify content hashes before trusting reconstructed content.
- Distinguish event time from observation/persistence time if ordering is involved.
- Check duplicate, delayed, and reordered watcher notifications.
- Check missing blobs, malformed diffs, snapshot boundaries, and session transitions.
- Never describe correlation as causation without a controlled reproduction.

## Output format

```markdown
## Bug investigation
- Reproduction:
- Expected:
- Observed:
- Affected component:
- Evidence:
- Root cause / hypothesis:
- Fix:
- Regression test:
- Validation:
- Remaining uncertainty:
```
