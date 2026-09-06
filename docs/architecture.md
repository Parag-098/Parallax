# Parallax — Architecture

## Overview

```
VS Code Workspace
      │
      ▼
 FileCollector (VS Code file watchers + onDidSaveTextDocument)
      │  Debounced FILE_CREATED / FILE_MODIFIED / FILE_DELETED / FILE_RENAMED / FILE_SAVED
      ▼
 Typed Event Stream  ──────────────────────────────────────────────────────────────────┐
      │                                                                                │
      ▼                                                                                │
 JsonFileStorage                                                                       │
   projects/         ← project metadata                                               │
   sessions/         ← recording sessions                                             │
   events/           ← append-only JSONL per session                                  │
   fileVersions/     ← per-file version manifests                                     │
   diffs/            ← diff records (unified patch + stats)                           │
   snapshots/        ← periodic full workspace manifests                              │
   checkpoints/      ← user-named milestones                                          │
   content/          ← content store keyed by SHA-256 hash (sharded)                 │
      │                                                                                │
      ▼                                                                                │
 SnapshotEngine (periodic + on-demand manifests)                                      │
      │                                                                                │
      ▼                                                                                │
 ReconstructionService                                                                 │
   reconstructState(projectId, timestamp)                                             │
   getFileAtTimestamp(projectId, filePath, timestamp)                                 │
      │                                                                                │
      ▼                                                                                │
 ReplayEngine                                                                          │
   loadProject / loadSession                                                           │
   stepForward / stepBackward / play / pause / jumpToIndex / jumpToTimestamp          │
      │                                                                                │
      ▼                                                                                │
 TimelineWebviewProvider (VS Code WebviewView)                                        │
      │  HTML + webview.js (React bundle)                                             │
      ▼                                                                                │
 App.tsx                                                                               │
   Timeline view  ◄──── events list, checkpoint markers                              │
   Diff view      ◄──── side-by-side before/after + unified patch                    │
   Code view      ◄──── historical file content at selected timestamp                │
   Replay bar     ◄──── ⏮ ◄ ▶ ► ⏭ + scrubber                                       │
      │                                                                                │
      └──── message passing (postMessage / onDidReceiveMessage) ────────────────────┘
```

## Modules

### `src/events/`

- **`types.ts`** — Discriminated union of all event types. Strongly typed interfaces for every event. Shared domain types (Project, Session, Checkpoint, Snapshot, FileVersion, DiffRecord).
- **`factory.ts`** — Pure functions that construct typed events with stable UUID v4 IDs and ISO-8601 timestamps. Serialization/deserialization helpers.

### `src/storage/`

- **`storage.ts`** — `IParallaxStorage` interface + `JsonFileStorage` implementation. JSON files on disk inside VS Code's `globalStorageUri`. JSONL for append-only event logs. Content store sharded by first 2 hex characters of hash.

### `src/collectors/`

- **`exclusions.ts`** — `ExclusionMatcher` — pattern-based path exclusion with defaults and VS Code configuration integration.
- **`fileCollector.ts`** — `FileCollector` — wraps VS Code file watcher APIs. Debounces rapid edits. Emits typed events and writes content/diff/version records to storage.

### `src/snapshots/`

- **`hash.ts`** — `hashContent(string): string` — SHA-256 hex digest using Node.js `crypto`.
- **`diff.ts`** — `generateDiff` / `applyDiff` / `buildDiffRecord` — unified diff via the `diff` npm package.
- **`snapshotEngine.ts`** — `SnapshotEngine` — creates full workspace manifests (file path + content hash). Supports auto (interval), manual, and checkpoint-triggered snapshots.
- **`reconstruction.ts`** — `ReconstructionService.reconstructState(projectId, timestamp)` — finds the nearest preceding snapshot, then replays FILE_CREATED / FILE_MODIFIED / FILE_DELETED / FILE_RENAMED events forward to reconstruct the file tree at the target timestamp.

### `src/git/`

- **`gitService.ts`** — `GitService` — uses the VS Code `vscode.git` extension API. Watches `RepositoryState.onDidChange` to detect new commits and branch checkouts. Gracefully degrades when Git is unavailable.

### `src/checkpoints/`

- **`checkpointService.ts`** — `CheckpointService.createCheckpoint(name, description)` — records a named milestone. Optionally takes a snapshot and records the current Git state. Does not modify the project.

### `src/replay/`

- **`replayEngine.ts`** — `ReplayEngine` — in-memory cursor over a loaded event list. Supports step, play (with configurable interval), pause, stop, jump by index, jump by timestamp. Notifies listeners on every state change. Non-destructive.

### `src/commands/`

- **`commands.ts`** — Registers `parallax.startRecording`, `parallax.stopRecording`, `parallax.openTimeline`, `parallax.createCheckpoint` VS Code commands.

### `src/webview/`

- **`messages.ts`** — Shared typed message contracts between extension host and webview.
- **`timelineProvider.ts`** — `TimelineWebviewProvider` — VS Code `WebviewViewProvider`. Serves the React app HTML, handles `postMessage` / `onDidReceiveMessage` bridge.
- **`App.tsx`** — React app. Three views: Timeline (event list), Diff (side-by-side + patch), Code (historical file content). Replay control bar at the bottom.
- **`vscodeApi.ts`** — Thin wrapper over `acquireVsCodeApi()`.
- **`webviewTypes.ts`** — Plain-data type definitions for the webview bundle (no VS Code imports).

### `src/extension.ts`

- `ParallaxController` — central coordinator. Initialises all services, wires events, manages session lifecycle, debounces webview pushes.
- `activate` / `deactivate` — VS Code extension lifecycle hooks.

---

## Data Flow: File Modification

```
User edits file
      │
      ▼
VS Code onDidChange fires
      │
      ▼
FileCollector debounce timer resets (debounceMs, default 1000ms)
      │
      ▼  (after debounce)
Read new file content
      │
      ▼
SHA-256 hash new content
      │
Compare to cached previous hash
      │  (changed?)
      ▼
generateDiff(oldContent, newContent)  →  DiffRecord  →  storage.saveDiff()
      │
      ▼
storage.saveContent(afterHash, newContent)
      │
      ▼
createFileModifiedEvent(...)  →  storage.appendEvent()  →  emit to ParallaxController
      │
      ▼
storage.saveFileVersion(...)
      │
      ▼
(500ms batch flush) → TimelineWebviewProvider.pushEventsUpdate(events)
```

## Data Flow: Historical Reconstruction

```
reconstructState(projectId, "2024-01-01T10:10:00")
      │
      ▼
Load all snapshots for project
Find latest snapshot ≤ target timestamp
      │
      ▼
Load all snapshot entry content by hash → base state Map<filePath, content>
      │
      ▼
Load all events for project after snapshot timestamp and ≤ target
      │
      ▼
For each event (chronologically):
  FILE_CREATED  → add content to state map
  FILE_MODIFIED → apply diff (or load content if no diff)
  FILE_DELETED  → remove from state map
  FILE_RENAMED  → rename key in state map
      │
      ▼
Return ReconstructionResult { state: Map, eventsApplied, warnings }
```

---

## Storage Layout

All data lives inside VS Code's `context.globalStorageUri.fsPath`:

```
<storageRoot>/
  projects/
    <projectId>.json
  sessions/
    <sessionId>.json
  events/
    <projectId>/
      <sessionId>.jsonl        ← one JSON object per line, append-only
  fileVersions/
    <projectId>/
      <safeFilename>.json      ← array of FileVersion objects
  diffs/
    <projectId>/
      <diffId>.json
  snapshots/
    <projectId>/
      <snapshotId>.json
  checkpoints/
    <projectId>/
      <checkpointId>.json
  content/
    <aa>/                      ← first 2 chars of SHA-256 hash
      <full-hash>.txt          ← raw file content
```

---

## Extension Points for Phase 2

- `IParallaxStorage` interface can be implemented by a backend HTTP/WebSocket adapter.
- `ParallaxEvent` union is open — new event types (AI_PROMPT, TEST_RESULT, BUILD_EVENT) can be added without changing existing consumers.
- `ReconstructionService` is pure logic with no VS Code dependency — usable server-side.
- `ReplayEngine` has no UI dependency — can drive a server-side replay.
