# Feature: Safe Workspace Recovery

- **Status:** Partial. Bounded eligible-text baseline inventory and full-workspace preview/restore are implemented when the snapshot is complete. Unsupported, excluded, unobserved, or over-limit files remain unavailable; path-based filesystem operations retain a concurrent symlink-swap limitation.
- **Related architecture:** [Historical reconstruction](../../ARCHITECTURE.md#8-historical-reconstruction), [Persistence and recovery](../../ARCHITECTURE.md#11-persistence-and-recovery)

## Problem

Inspecting a historical file is different from safely restoring a project. Developers need a controlled way to recover selected recorded files or a complete workspace state without losing current work.

## Goals

- Preview the difference between current and selected historical content.
- Restore selected files or, when a complete manifest exists, a selected workspace state.
- Create a recoverable pre-restore backup/checkpoint.
- Make restoration undoable where technically possible.
- Prevent writes outside the intended workspace.

## Non-goals

- Rewriting Git history or changing branches.
- Restoring ignored, excluded, binary, or otherwise unrecorded content as if it were available.
- Silent destructive restoration.

## Functional requirements

1. The user selects the target historical point and restore scope.
2. Parallax previews all planned file additions, replacements, deletions, and path changes.
3. Parallax identifies files that cannot be restored because they were excluded, unsupported, or unavailable.
4. Before applying changes, Parallax records a recoverable representation of the current affected files.
5. Restoration requires explicit confirmation.
6. Paths are canonicalized and checked to remain within the intended workspace boundary.
7. Conflicts caused by concurrent edits are detected and surfaced; they are not silently overwritten.
8. The operation produces a result summary and supports rollback from its recovery point where possible.

## Acceptance criteria

- [x] A user can preview restoration of one file without changing it.
- [x] A user can restore a selected file to a historical version after confirmation.
- [x] The current file state is stored in history before restoration.
- [x] Complete workspace restore is offered only when a complete, valid inventory snapshot exists at or before the target. The initial scan is limited to 5,000 files / 64 MiB total / 10 MiB per file; excluded and unsupported paths are left untouched.
- [x] Excluded paths are reported and left untouched; unsupported current text files block the operation. Missing/corrupt historical content fails reconstruction before writes.
- [ ] Static symlinks and traversal are rejected. The remaining parent-directory TOCTOU race cannot be eliminated by Node's path-based rename APIs.
- [x] Concurrent modifications are detected before replacement.
- [x] The preview lists every planned path and diff; all conflicts are preflighted before writes, current files are preserved for rollback, and rollback is attempted after partial failure.
- [ ] Parallax does not execute Git reset/checkout or rewrite commits as a side effect.

## Test strategy

Use temporary workspaces to test baseline inventory, additions, replacements, deletions, renames, conflicts, exclusions, path traversal, symlinks, missing content, cancellation, partial failure, and rollback. Current automated tests cover baseline restoration, create/delete/rename state, exclusions, conflicts, and static symlink rejection. Test Windows and POSIX path semantics.

## Safety requirements

The active workspace must never be changed by preview. Destructive writes require a preview and explicit confirmation. Any partial restore must leave a clear recovery path and report incomplete operations.

Implementation note: restore rejects static symlinked paths and revalidates canonical parents immediately before filesystem changes. The current Node path-based rename APIs cannot make parent validation and rename one atomic no-follow operation, so a concurrent malicious local process that swaps a parent path remains a residual TOCTOU risk.
