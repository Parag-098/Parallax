# Independent Reviewer Protocol

## Purpose

The implementing agent must not be the sole judge of its own work. Every substantial change should receive a review from a separate coding agent or a fresh agent context that did not implement the change.

The reviewer is a challenger, not a co-author. Its first responsibility is to find correctness, security, data-integrity, compatibility, and regression risks. It should not modify files during the review.

## When to request a review

Require an independent review for:

- Persisted event or content schema changes.
- Storage, hashing, snapshots, reconstruction, replay, or restoration changes.
- File-system watchers and workspace lifecycle changes.
- VS Code extension-host/webview message contracts.
- Privacy, exclusion, path handling, or security-sensitive changes.
- New commands, settings, or substantial UI workflows.
- Causal Rewind, verification capture, or process execution.
- Any change that touches multiple architectural components.

Small documentation-only edits may use a lightweight review.

## Reviewer rules

1. Read `AGENTS.md`, `ARCHITECTURE.md`, and the relevant feature specification.
2. Inspect the full diff and surrounding implementation, not just the changed lines.
3. Do not assume the implementer's summary is correct.
4. Do not edit files or silently fix issues during the review.
5. Report only actionable findings supported by code references or reproducible evidence.
6. Check failure paths, not only the happy path.
7. Treat local history as user data: assess data loss, corruption, migration, and privacy risks.
8. Check whether tests actually cover the changed contract.
9. Distinguish confirmed defects from questions or suggestions.
10. If no findings exist, state what was reviewed and what was not verified. Do not issue a blanket guarantee.

## Severity levels

- **Critical:** data loss/corruption, arbitrary code execution, secret exposure, or a severe security boundary failure. Blocks merge.
- **High:** likely incorrect behavior, broken reconstruction, unsafe restore, persisted-data incompatibility, or major regression. Blocks merge.
- **Medium:** meaningful edge-case bug, missing important test, poor failure handling, or compatibility concern. Normally resolve before merge; any deferral needs an explicit owner and rationale.
- **Low:** minor maintainability, clarity, or non-blocking UX issue.
- **Question:** clarification needed; not yet a confirmed defect.

## Review checklist

### Correctness and data integrity

- Are event identity and ordering preserved?
- Are persisted records backward compatible?
- Are hashes computed over the intended bytes?
- Can a missing or corrupt record produce a false successful reconstruction?
- Are snapshots and checkpoints tied to the correct historical position?
- Are concurrent edits, watcher duplicates, and shutdown races handled?

### Security and privacy

- Can paths escape the workspace or storage root?
- Are symlinks, traversal, and platform-specific path rules considered?
- Can secrets or excluded files leak through another capture path?
- Is any recorded command or untrusted content executed?
- Are webview messages validated by the extension host?
- Are logs free of source content, credentials, and environment values?

### VS Code lifecycle and performance

- Are subscriptions, watchers, timers, and processes disposed?
- Can large histories block the extension host or freeze the webview?
- Are cancellation and workspace closure handled?
- Does the feature work if the Git provider is unavailable?

### Testing and documentation

- Do tests cover success, failure, cancellation, corruption, and edge cases?
- Are tests deterministic and isolated from the developer's real workspace?
- Were the documented build/test commands actually run?
- Do the README and feature specs accurately describe the implementation?
- Are known limitations and migration requirements documented?

## Required review output

Use this format:

```markdown
# Independent Review

- Change/PR:
- Reviewer:
- Review date:
- Scope inspected:
- Validation performed:

## Findings

### [SEVERITY] Short title
- File/line:
- Evidence:
- Impact:
- Recommended correction:

## Questions

- ...

## What was not verified

- ...

## Verdict

- APPROVE
- APPROVE WITH NON-BLOCKING FOLLOW-UPS
- REQUEST CHANGES

## Rationale

...
```

## Merge gate

- Any Critical or High finding must be resolved and re-reviewed.
- Medium findings should normally be resolved. Deferrals require explicit rationale and an issue/follow-up owner.
- The implementing agent must respond to each finding with a code change, test, or reasoned disagreement.
- A fresh review is required after material changes to address review findings.
- Review approval does not replace CI, tests, or manual verification.

## Prompt for a separate reviewer agent

Copy this into a separate agent session and provide the branch/PR diff:

> Act as the independent reviewer for Parallax. You did not implement this change. Read `AGENTS.md`, `ARCHITECTURE.md`, the relevant feature specification, and `docs/review/INDEPENDENT_REVIEWER.md`. Inspect the full diff and relevant surrounding code. Do not edit files. Look specifically for data loss, incorrect historical reconstruction, event-ordering errors, schema compatibility, path traversal, secret capture, unsafe restoration or command execution, VS Code lifecycle leaks, performance regressions, and missing tests. Validate claims by running read-only checks or tests where safe. Return findings ordered by severity using the required review output format. If you find no issues, state the reviewed scope and unverified areas; do not claim that the change is guaranteed correct.
