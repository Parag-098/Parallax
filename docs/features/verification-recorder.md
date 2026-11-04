# Feature: Verification Recorder

- **Status:** Planned.
- **Related architecture:** [Planned verification and Causal Rewind](../../ARCHITECTURE.md#12-planned-architecture-verification-and-causal-rewind)

## Problem

A test result is meaningful only in relation to the code and environment that were tested. A passing test from an earlier workspace state should not be presented as verification of the current state.

## Goals

- Record user-initiated VS Code test runs and/or explicitly configured verification commands.
- Associate every result with a workspace manifest/fingerprint.
- Capture before/after state to detect edits made while tests are running.
- Store test outcome, duration, and available test identifiers.
- Make verification evidence available to later regression investigations.

## Non-goals

- Running tests automatically without user configuration or approval.
- Capturing arbitrary terminal output by default.
- Claiming reproducibility from exit status alone.
- Treating a test result as proof of correctness beyond the tests that ran.

## Functional requirements

1. The user can enable or disable verification capture.
2. A verification record identifies the test command or test-run identifier and its outcome.
3. A canonical manifest/fingerprint is captured before and after execution.
4. If the workspace changes during execution, the result is marked as spanning multiple states or otherwise unsuitable as exact-state evidence.
5. Runtime/tool metadata is captured only where available and safe.
6. Sensitive command arguments and output are not persisted by default.
7. Test results are linked to event/session history.
8. The feature works without a remote backend or AI service.

## Acceptance criteria

- [ ] A user-initiated test run creates a verification record with start time, end time, duration, and outcome.
- [ ] The record references the exact canonical workspace manifest/fingerprint captured before the run.
- [ ] A workspace change during execution is detected and represented explicitly.
- [ ] A result cannot be shown as validating a later workspace fingerprint unless the fingerprints match under the defined manifest rules.
- [ ] Test identifiers and per-test results are recorded when available through the VS Code Testing API.
- [ ] Command/output capture is disabled by default or safely redacted and explicitly enabled.
- [ ] Verification records remain local and can be inspected after VS Code restart.
- [ ] Missing or partial test information is represented as unknown, not fabricated.

## Test strategy

Test passing, failing, cancelled, timed-out, and interrupted runs; workspace mutation during a run; missing test identifiers; changed dependency lockfiles; manifest ordering stability; exclusions; and restart persistence.

## Open questions

- Should the first implementation integrate only with the VS Code Testing API, or also support user-configured commands?
- Which environment details can be captured reliably without collecting secrets?
- How should generated files and untracked files be treated in the workspace manifest?
