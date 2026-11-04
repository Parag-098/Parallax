# Feature: Snapshots, Checkpoints, and Replay

- **Status:** Partial; fingerprinted snapshots accelerate reconstruction and anchor event retention.
- **Related architecture:** [Diffs, snapshots, and checkpoints](../../ARCHITECTURE.md#7-diffs-snapshots-and-checkpoints), [Replay engine](../../ARCHITECTURE.md#9-replay-engine)

## Problem

Reconstructing a file by processing its entire event history can become expensive. Developers also need recognizable milestones and a navigable view of how recorded code changed over time.

## Goals

- Create periodic snapshots using the configured interval.
- Support on-demand snapshots/checkpoints where available.
- Allow developers to create named checkpoints.
- Navigate event history forward and backward.
- Play and scrub through recorded history.
- Show historical code and diffs without changing the active workspace.

## Non-goals

- Treating a file snapshot as proof of a complete workspace snapshot.
- Automatically executing historical commands.
- Mutating Git branches or commits during replay.

## Functional requirements

1. Snapshot scheduling respects `parallax.snapshotIntervalMinutes`.
2. Manual checkpoint creation records a stable reference to the represented history position.
3. Checkpoint names and metadata remain associated with the correct workspace/session.
4. Replay position maps deterministically to an event order.
5. Stepping backward/forward and scrubbing request the corresponding historical state.
6. Playback can be paused/stopped and does not continue after the owning view/session is disposed.
7. Historical inspection is read-only.
8. Snapshot corruption or missing data is surfaced and handled safely.

## Acceptance criteria

- [ ] A periodic snapshot is created according to the configured interval while recording is active.
- [ ] A user can create a named checkpoint and later locate it in the history UI.
- [ ] Checkpoint metadata refers to the correct historical position.
- [ ] Replay moves one event/state backward and forward consistently.
- [ ] Play, pause, and scrub update the historical viewer without modifying workspace files.
- [ ] Reopening VS Code preserves available checkpoints and replayable history.
- [ ] A missing or invalid snapshot does not silently return an incorrect historical state.
- [ ] Timers and subscriptions are disposed when no longer needed.

## Test strategy

Unit-test snapshot scheduling, checkpoint serialization, replay-position transitions, and snapshot selection. Integration-test snapshots against event sequences and verify that replayed states match independently computed fixtures. Exercise pause/disposal and missing-snapshot paths.

## Open questions

- Do current snapshots represent individual files, a session, or a whole workspace?
- What is the fallback strategy if a snapshot cannot be read?
- Are checkpoint names unique per workspace, per session, or unrestricted?
