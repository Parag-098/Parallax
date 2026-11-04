# Feature: Global History Search and Filtering

- **Status:** Planned.
- **Related architecture:** [Event model](../../ARCHITECTURE.md#4-logical-event-model), [Persistence](../../ARCHITECTURE.md#11-persistence-and-recovery)

## Problem

As history grows, navigating only by timeline position becomes slow. Developers need to locate events, files, checkpoints, and sessions using information Parallax has actually recorded.

## Goals

- Search recorded file paths, event types, checkpoint names, and session metadata.
- Filter by date/time range, event type, file, and session.
- Open results at the corresponding timeline position.
- Keep search local and responsive.

## Non-goals

- Semantic or AI-powered code search in the initial version.
- Searching excluded files or unrecorded content.
- Indexing secrets or terminal output.

## Functional requirements

1. Search operates only on locally recorded and permitted metadata.
2. Results identify the session and historical position that produced the match.
3. Filters can be combined and cleared independently.
4. Search results use deterministic ordering and pagination/virtualization for large histories.
5. Indexes are rebuildable from durable source records or safely versioned.
6. Search errors or incomplete indexes are visible to the user.

## Acceptance criteria

- [ ] Searching a recorded relative file path returns matching events.
- [ ] Filtering by event type and date range returns only matching records.
- [ ] Checkpoint-name and session metadata searches return the correct result.
- [ ] Selecting a result opens the corresponding historical position.
- [ ] Excluded paths and unrecorded contents do not appear in results.
- [ ] Search remains local and works without network access.
- [ ] An interrupted or outdated index can be rebuilt without losing source history.
- [ ] Large result sets do not freeze the extension host or webview.

## Test strategy

Test query parsing, filter composition, index rebuilding, result ordering, pagination, exclusion behavior, and navigation targets. Include large synthetic event histories and corrupted-index recovery.
