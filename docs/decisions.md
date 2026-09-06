# Parallax — Design Decisions

## Event stream over versioned copies

**Decision:** Represent history as an append-only typed event stream, not as numbered project copies (`version1/`, `version2/`).

**Rationale:** An event stream has a natural timestamp order, is extensible (adding a new event type does not break existing code), and allows efficient reconstruction via snapshot + diffs without storing full copies of every file after every change. It also maps naturally to a future backend where events can be streamed, replayed, or queried.

---

## SHA-256 content-addressed storage

**Decision:** Store file content keyed by its SHA-256 hash, not by filename+timestamp.

**Rationale:** Content deduplication is automatic — if two files have the same content, or a file reverts to a previous state, the same hash is used and content is only stored once. Hashes are deterministic and stable across restarts, machines, and events.

---

## Unified diff format

**Decision:** Use the `diff` npm package to generate unified patch format.

**Rationale:** Unified diff is a well-understood, human-readable format. The `diff` package is small, well-maintained, and produces patches that are independently applicable with `applyPatch`. Storing patches instead of full file copies keeps the event store compact.

---

## JSONL for event logs

**Decision:** Append events as one JSON object per line (JSONL) to session-specific files.

**Rationale:** Append-only writes are efficient (no read-modify-write cycle). Lines can be parsed individually, so a corrupted line does not prevent reading the rest of the file. Files remain human-readable.

---

## JSON files for all other records

**Decision:** Store projects, sessions, diffs, snapshots, checkpoints, and content as individual JSON files in a directory hierarchy.

**Rationale:** Simple, debuggable, zero-dependency persistence. No SQLite, no LevelDB, no additional native binaries. Files can be inspected directly. The `IParallaxStorage` interface fully encapsulates storage so a backend implementation can replace it in Phase 2 without touching business logic.

---

## Debouncing file modifications

**Decision:** Buffer rapid file changes and emit a single FILE_MODIFIED event after a configurable debounce interval (default 1000ms).

**Rationale:** Without debouncing, holding a key for two seconds could create hundreds of events, making the history noisy and storage-heavy. The debounce window captures the final state of a "burst" of typing as one meaningful change.

---

## Snapshot + diff hybrid storage

**Decision:** Periodically take full snapshots (manifests of file path + content hash). Between snapshots, record only diffs. Reconstruction applies the nearest preceding snapshot as a base and replays diffs forward.

**Rationale:** Storing only diffs means reconstruction could require replaying the entire event history from the beginning. A periodic snapshot bounds the replay depth. The default 30-minute interval is a reasonable balance between storage cost and reconstruction speed.

---

## Non-destructive replay

**Decision:** The replay engine updates UI state only. It never modifies current working files.

**Rationale:** Silently overwriting the developer's current work would be a catastrophic mistake. File restoration is explicitly out of scope for Phase 1. If added in Phase 2, it must require an explicit confirmation.

---

## VS Code Git API integration

**Decision:** Use the VS Code built-in `vscode.git` extension API, not direct Git CLI calls.

**Rationale:** The Git extension API is the supported, sandboxed path for extensions to read Git state. It works on all platforms without shell invocations. It degrades gracefully when Git is not available.

---

## React for the webview

**Decision:** Use React for the webview UI.

**Rationale:** React's component model, state management, and event handling are well-suited to a reactive timeline UI. The developer ecosystem and tooling (TypeScript, webpack) are mature. For Phase 1, the development build (1.1 MiB) is acceptable; a production build would be significantly smaller.

---

## Project ID from workspace root hash

**Decision:** Derive the project ID as the first 16 hex characters of the SHA-256 hash of the lowercase, forward-slash-normalised workspace root path.

**Rationale:** Stable across restarts, unique per project, does not expose the full path. 16 hex characters (64-bit) is sufficient to avoid collisions in practice for a single user.

---

## Webview-only types in `webviewTypes.ts`

**Decision:** Define a separate `webviewTypes.ts` with plain data interfaces for the webview bundle, instead of importing `src/events/types.ts` from the webview.

**Rationale:** `src/events/types.ts` uses `const enum` which is TypeScript-only syntax. The webview TypeScript config has different module targets. Keeping types separate prevents cross-boundary import issues and ensures the webview bundle has no accidental VS Code extension dependencies.
