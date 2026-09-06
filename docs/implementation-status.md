# Parallax — Implementation Status

## Phase 1 — Complete

### Core infrastructure

| Component | Status | Notes |
|---|---|---|
| Project / workspace detection | ✅ | Derives stable project ID from workspace root hash |
| Development sessions | ✅ | SESSION_STARTED / SESSION_ENDED events, persisted |
| Typed event system | ✅ | 12 event types, UUID v4 IDs, ISO timestamps |
| Event serialization | ✅ | JSON round-trip with validation |
| Local storage (JSON files) | ✅ | All records persisted in VS Code global storage |
| Content store (hash-addressed) | ✅ | SHA-256 keyed, sharded by first 2 chars |
| Persistence across restarts | ✅ | Tested with fresh storage instance |

### File recording

| Feature | Status | Notes |
|---|---|---|
| FILE_CREATED | ✅ | Hash + size recorded |
| FILE_MODIFIED (debounced) | ✅ | Diff generated, content saved |
| FILE_DELETED | ✅ | Before-hash recorded |
| FILE_RENAMED | ✅ | Old/new paths recorded |
| FILE_SAVED | ✅ | Content hash updated |
| Debouncing | ✅ | Configurable via `parallax.debounceMs` |
| Exclusion patterns | ✅ | Defaults + configurable via `parallax.excludePatterns` |

### Hashing and diffs

| Feature | Status | Notes |
|---|---|---|
| SHA-256 content hashing | ✅ | Deterministic, Node.js built-in crypto |
| Diff generation (unified patch) | ✅ | Via `diff` npm package |
| Diff application | ✅ | `applyPatch` with fallback to full content |
| Lines added / removed stats | ✅ | Counted from patch headers |

### Snapshots and reconstruction

| Feature | Status | Notes |
|---|---|---|
| Periodic auto-snapshot | ✅ | Configurable interval (default 30 min) |
| On-demand snapshot | ✅ | Via checkpoint creation |
| Snapshot content persistence | ✅ | Per entry in content store |
| Historical reconstruction | ✅ | Snapshot + diffs forward |
| getFileAtTimestamp | ✅ | Single-file convenience method |
| Graceful degradation on corrupt data | ✅ | Warnings returned, no crash |

### Git integration

| Feature | Status | Notes |
|---|---|---|
| GIT_COMMIT detection | ✅ | Via vscode.git repository state changes |
| GIT_CHECKOUT detection | ✅ | Branch change detection |
| Current branch/commit info | ✅ | Used by checkpoint service |
| Graceful absence of Git | ✅ | Silently skips if vscode.git is inactive |

### Checkpoints

| Feature | Status | Notes |
|---|---|---|
| Create checkpoint | ✅ | Name + description via input box |
| Associate snapshot | ✅ | Snapshot taken at checkpoint time |
| Associate Git state | ✅ | Branch + commit hash captured |
| Persist checkpoint | ✅ | Survives restart |
| List checkpoints | ✅ | `loadCheckpointsForProject` |

### Replay engine

| Feature | Status | Notes |
|---|---|---|
| Load events (project / session) | ✅ | Sorted by timestamp |
| Step forward / backward | ✅ | Index-based cursor |
| Play / pause | ✅ | Configurable interval timer |
| Jump to index | ✅ | Direct cursor set |
| Jump to timestamp | ✅ | Binary search to nearest event |
| Non-destructive | ✅ | Never touches working files |

### UI

| Feature | Status | Notes |
|---|---|---|
| VS Code sidebar webview | ✅ | Registered as WebviewView |
| Timeline view | ✅ | Chronological event list with icons |
| Diff view (side-by-side) | ✅ | Before/After panes + unified patch |
| Code view (historical) | ✅ | File content at selected timestamp |
| Replay bar | ✅ | ⏮ ◄ ▶ ⏭ + scrubber + counter |
| Recording status | ✅ | Status bar item + header dot |
| Empty / loading / error states | ✅ | All three handled |

### Commands and settings

| Feature | Status | Notes |
|---|---|---|
| `parallax.startRecording` | ✅ | |
| `parallax.stopRecording` | ✅ | |
| `parallax.openTimeline` | ✅ | |
| `parallax.createCheckpoint` | ✅ | Prompts for name + description |
| `parallax.recordingEnabled` | ✅ | Auto-start on workspace open |
| `parallax.snapshotIntervalMinutes` | ✅ | |
| `parallax.excludePatterns` | ✅ | |
| `parallax.maxEventsPerSession` | ✅ | |
| `parallax.debounceMs` | ✅ | |

---

## Test Status

### Test suite: 89 passing, 0 failing

| Suite | Tests | Status |
|---|---|---|
| Event System | 17 | ✅ |
| Content Hashing | 11 | ✅ |
| Diff Engine | 19 | ✅ |
| Exclusions | 13 | ✅ |
| Storage Layer | 17 | ✅ |
| Historical State Reconstruction | 10 | ✅ |
| Checkpoint Service | 6 | ✅ |

Run with:
```bash
npx tsc -p tsconfig.test.json
npx mocha "out/test/**/*.test.js" --timeout 10000 --exit
```

---

## Known Limitations

1. **Binary files** — only UTF-8 text files are processed. Binary content is silently skipped.
2. **Webview bundle size** — 1.1 MiB in development mode. A production webpack build (`mode: 'production'`) would reduce this to ~200–300 KiB.
3. **Large files** — files >10 MB have not been stress-tested.
4. **Session browser** — the timeline shows the most recently loaded session/project events; there is no separate UI for browsing all past sessions.
5. **Reconstruction at scale** — reconstruction currently loads all events for a project; a large project with many sessions could be slow without pagination.
6. **Git dependency** — Git events are silently skipped if `vscode.git` is not active.
7. **Windows path separator** — storage uses path.join which handles OS separators, but reconstruction state map keys may differ between OS. This has been tested on Windows only.

---

## Phase 2 Backlog

| Area | Description |
|---|---|
| Backend sync | FastAPI + PostgreSQL event store |
| AI/BYOK | Prompt attribution, AI_PROMPT / AI_RESPONSE events |
| RAG | Query development history with LLMs |
| Software forensics | Bug-origin analysis, blame at the edit level |
| Provenance graphs | Visualise code lineage |
| Multi-device sync | Merge event streams from multiple machines |
| Web dashboard | Browser-based timeline viewer |
| Production build | Minified webview bundle, VSIX publish workflow |
| Session browser UI | Browse and compare all past sessions |
| Reconstruction pagination | Bounded reconstruction for large histories |
| Conflict-free event IDs | CRDT-compatible IDs for multi-device merging |
| Test coverage | Integration tests with VS Code extension test host |
