---
name: independent-review
description: Review a Parallax change from a fresh agent context, challenge the implementation, and report evidence-based findings without modifying files.
---

# Parallax Independent Review

## Use this skill when

Reviewing a branch, pull request, commit, or diff that another agent or developer implemented.

## Independence rule

Use a separate agent or fresh context that did not implement the change. Do not edit files, fix issues, or accept the implementer's summary as evidence.

## Review workflow

1. Read `AGENTS.md`, `ARCHITECTURE.md`, the applicable feature spec, and `docs/review/INDEPENDENT_REVIEWER.md`.
2. Inspect the complete diff and surrounding code.
3. Check the changed behavior against the feature acceptance criteria.
4. Trace data through capture, persistence, reconstruction, and UI boundaries where applicable.
5. Look for data loss, event-ordering errors, stale state, hash/encoding mismatches, migration defects, unsafe paths, secret capture, unvalidated webview messages, resource leaks, and unbounded work.
6. Examine failure and cancellation behavior, not only the happy path.
7. Run safe, read-only checks or tests when useful. Do not execute untrusted project commands without permission.
8. Record precise file/line references and explain impact.
9. Separate confirmed defects from questions and optional improvements.
10. Return the required review format. Do not change files.

## Severity

- Critical: severe security failure, arbitrary code execution, secret exposure, or data loss/corruption.
- High: likely broken reconstruction, unsafe restore, incompatible persisted data, or major regression.
- Medium: important edge case, failure-handling gap, or missing significant test.
- Low: maintainability or minor UX issue.
- Question: needs clarification but is not a confirmed defect.

## Verdict

Choose one:

- `APPROVE`
- `APPROVE WITH NON-BLOCKING FOLLOW-UPS`
- `REQUEST CHANGES`

A review approval is not a substitute for tests or CI. State what was not verified.
