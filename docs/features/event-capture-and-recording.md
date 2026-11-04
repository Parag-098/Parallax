# Feature: Event Capture and Recording

- **Status:** Partial. File/session capture, baseline inventory, and dynamic root lifecycle are implemented. A saved multi-root Extension Development Host test exercises root addition, removal, switching, last-root removal, watcher behavior, and workspace-history isolation.
- **Related architecture:** [Architecture — capture pipeline](../../ARCHITECTURE.md#5-capture-pipeline)

## Problem

Developers make many meaningful changes between Git commits. Parallax needs to capture supported workspace activity as durable, ordered history without overwhelming the extension with duplicate or noisy notifications.

## Goals

- Observe supported workspace and editor file activity.
- Record file creation, modification, deletion, rename, and save events.
- Associate events with a workspace and development session.
- Support explicit start/stop recording and configured automatic recording.
- Respect exclusion patterns and modification debounce settings.
- Preserve stable identities and deterministic ordering according to the existing event contract.

## Non-goals

- Recording binary-file contents.
- Capturing terminal commands, test executions, debugging, or AI prompts in the current baseline.
- Inferring developer intent from file activity.
- Recording every keystroke as a separate event.

## Functional requirements

1. Recording starts only when enabled by configuration or an explicit user command.
2. Stop recording prevents new supported activity from being added to the active recording session.
3. Events identify the event type, workspace/session context, timestamp, and stable identity according to the persisted schema.
4. Excluded paths are excluded consistently across all supported capture paths.
5. Modification notifications follow the configured debounce/coalescing behavior.
6. Duplicate or overlapping notifications do not silently corrupt the historical file state.
7. File operations that race with deletion, rename, or workspace closure fail safely.
8. Pending persistence work is handled according to a documented shutdown policy.
9. Adding or removing workspace folders reconfigures watchers and storage without restarting the window; events do not leak from removed roots into another workspace identity.

## Privacy and security

- Do not record secrets or arbitrary terminal output.
- Do not bypass exclusion rules in snapshot or Git integration code.
- Validate file paths and workspace boundaries before reading content.

## Acceptance criteria

- [ ] Creating a text file while recording produces a creation event and a reconstructable initial state.
- [ ] Modifying and saving a text file produces history that can reconstruct the prior and later content.
- [ ] Deleting and renaming a tracked file can be represented and reconstructed correctly.
- [ ] The configured debounce interval is applied consistently and tested with duplicate notifications.
- [ ] A matching exclusion pattern prevents the file from being recorded through every supported capture path.
- [ ] Stopping recording prevents subsequent activity from entering the stopped session.
- [ ] Recording survives a VS Code restart without losing already-persisted history.
- [ ] Workspace close or extension shutdown does not leave unhandled watchers or subscriptions.
- [ ] Event ordering remains deterministic for events with equal timestamps.
- [x] A `.code-workspace` Extension Development Host test observes real folder-change events for root addition, removal, switching, and removal of the last root; it verifies added/retained roots capture and removed roots stop capturing.

## Test strategy

Unit-test event creation, identity, ordering, serialization, exclusions, debounce/coalescing, and session transitions. Add integration tests using temporary workspaces for create/modify/delete/rename sequences and restart persistence. Test watcher races and shutdown behavior where practical.

## Open questions

- What is the exact event ordering and sequence-number scope in the current schema?
- How should history be presented when a workspace root set changes? Current behavior preserves histories under root-set-specific workspace identities and does not automatically merge them.
- Which file-system events are deduplicated against document/save events?
