# Feature: Session Explorer

- **Status:** Partial; session selection and event browsing are implemented in the sidebar.
- **Related architecture:** [Workspace and session lifecycle](../../ARCHITECTURE.md#3-workspace-and-session-lifecycle)

## Problem

The current timeline focuses on the current or most recent session. Developers need to browse prior sessions, understand when work occurred, and reopen a session's history without manually locating storage records.

## Goals

- List recorded sessions for the current workspace.
- Show useful session metadata, such as start/end time, duration where known, event count, and changed-file count where derivable.
- Open a selected session in the existing timeline/replay experience.
- Clearly distinguish active, completed, interrupted, and unavailable sessions where the data supports those states.

## Non-goals

- Cloud synchronization or cross-device browsing.
- AI-generated summaries as a requirement.
- Claiming exact active time from timestamps alone.

## User experience

A Session Explorer view should show sessions in reverse chronological order, allow selection, and provide an explicit empty state. Selecting a session opens its recorded history while preserving the currently active recording session.

## Functional requirements

1. Discover sessions from local Parallax storage for the selected workspace.
2. Paginate or virtualize large session lists where needed.
3. Display only metadata that can be reliably derived.
4. Open a session without changing the active recorder's session.
5. Handle interrupted sessions and partially unavailable history.
6. Respect exclusions and local storage privacy guarantees.

## Acceptance criteria

- [ ] A workspace with multiple sessions displays each available session exactly once.
- [ ] Sessions are ordered deterministically by their recorded start time with a stable tie-breaker.
- [ ] Selecting a session opens its timeline and historical file views.
- [ ] Browsing an old session does not stop, corrupt, or reassign the active recording session.
- [ ] Empty, interrupted, and partially corrupted session states are understandable.
- [x] Timeline initially queries and renders at most 100 events; older pages load on demand. Reconstruction still reads a full session history.
- [ ] Session metadata is derived from persisted records rather than invented estimates.

## Test strategy

Test session discovery, ordering, duplicate handling, active-session isolation, missing storage, interrupted sessions, and large result sets. Add UI tests for empty/loading/error states and selection behavior.

## Privacy and security

Session names and file paths can reveal sensitive project information. Keep the index local and avoid logging session contents.
