# Parallax Feature Specifications

This directory defines feature behavior, scope, and acceptance criteria. A specification is not evidence that a feature is implemented.

## Status definitions

- **Implemented:** present in the source code and backed by tests or reproducible verification.
- **Partial:** some behavior exists, but one or more acceptance criteria remain unmet or unverified.
- **Planned:** approved or proposed work that is not currently available.
- **Research:** feasibility or prior-art investigation is required before committing to implementation.

Statuses below reflect the repository implementation as currently verified.

## Specifications

| Specification | Status | Purpose |
|---|---|---|
| [Event capture and recording](event-capture-and-recording.md) | Partial | Capture file changes and baseline inventories; folder add/remove/switch behavior is verified in a saved multi-root Extension Development Host workspace. |
| [Content storage and reconstruction](content-storage-and-reconstruction.md) | Partial | Hash, persist, diff, and snapshot-indexed reconstruction with explicit corruption and bounded-range handling. |
| [Snapshots, checkpoints, and replay](snapshots-checkpoints-and-replay.md) | Partial | Fingerprinted snapshots, retention anchors, checkpoints, and replay navigation. |
| [Git awareness](git-awareness.md) | Partial | Public Git API commits/checkouts and generic observed HEAD transitions. |
| [Session Explorer](session-explorer.md) | Partial | Browse local sessions and inspect a selected session. |
| [History Search](history-search.md) | Planned | Search and filter recorded history. |
| [Timeline experience](timeline-experience.md) | Partial | Theme-aware history workspace, replay, historical editor handoff, comparisons, checkpoints, and restore actions. |
| [Safe Workspace Recovery](safe-workspace-recovery.md) | Partial | Inventory eligible text baselines and preview/restore full historical text states when the baseline is complete; residual path-based symlink race remains documented. |
| [Verification Recorder](verification-recorder.md) | Planned | Associate test outcomes with exact recorded workspace states. |
| [Causal Rewind](causal-rewind.md) | Research / Planned | Minimize recorded changes while preserving a reproducible test failure. |

## Rules for adding a specification

Every substantial feature must define:

1. Problem and user outcome.
2. Goals and non-goals.
3. User workflow and observable behavior.
4. Data/event/API changes, if any.
5. Privacy and security implications.
6. Failure modes and recovery behavior.
7. Acceptance criteria written so they can be verified.
8. Automated and manual test strategy.
9. Migration and compatibility requirements.
10. Explicit status and unresolved questions.

Use the following template when adding a new feature:

```markdown
# Feature: <name>

- Status: Research | Planned | Partial | Implemented
- Owner: <person/team>
- Related architecture: [ARCHITECTURE.md](../../ARCHITECTURE.md)

## Problem
## Goals
## Non-goals
## User experience
## Functional requirements
## Data and integration changes
## Privacy and security
## Failure behavior
## Acceptance criteria
## Test strategy
## Rollout and compatibility
## Open questions
```

Do not turn implementation ideas into acceptance criteria that cannot be observed. Prefer Given/When/Then or explicit measurable assertions.
