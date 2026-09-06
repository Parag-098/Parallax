# Parallax

**A local-first VS Code development time machine.**

Parallax records meaningful software-development activity as you work and lets you inspect, replay, and navigate how your project evolved over time — with no backend, no cloud, no API key required.

---

## What Parallax Is

Parallax treats your development history as an **event stream** rather than a series of manually created snapshots. Every file creation, modification, deletion, save, and Git operation is recorded as a typed event with a stable ID, timestamp, and content hash. You can travel backwards and forwards through that stream, view what any file looked like at any point in time, and inspect the diffs between versions.

Think of it as a local, continuous git log for your individual edits — not just commits.

---

## Phase 1 Features

| Feature | Status |
|---|---|
| Workspace / project detection | ✅ |
| Start / stop recording | ✅ |
| Development sessions | ✅ |
| File event recording (create, modify, delete, rename, save) | ✅ |
| SHA-256 content hashing | ✅ |
| File diffs (unified patch, lines added/removed) | ✅ |
| Local persistent history | ✅ |
| Snapshots (periodic + on-demand) | ✅ |
| Historical state reconstruction | ✅ |
| Timeline UI (VS Code webview) | ✅ |
| Historical code viewer | ✅ |
| Diff viewer (side-by-side) | ✅ |
| Replay engine (step forward/back, play, scrub) | ✅ |
| Basic Git awareness (commits, checkouts) | ✅ |
| Named checkpoints | ✅ |
| Configurable exclusions | ✅ |
| Persistence across VS Code restarts | ✅ |
| Automated tests (89 passing) | ✅ |

---

## Local-First and Privacy

- All data stays on your machine.
- Nothing is uploaded anywhere.
- History is stored in VS Code's global extension storage directory (`~/.vscode/extensions/…`).
- No API keys, accounts, or network access of any kind.
- History survives VS Code restarts and workspace reopening.

---

## Development Setup

### Prerequisites

- Node.js 18 or later (tested on 24)
- VS Code 1.85 or later
- npm

### Install dependencies

```bash
npm install
```

### Build the extension

```bash
npm run build
```

This runs two steps:

1. `build:extension` — TypeScript → `out/` via `tsc`
2. `build:webview` — React + TypeScript → `out/webview/webview.js` via webpack

### Watch mode (development)

```bash
# Extension TypeScript watch
npm run watch

# Webview webpack watch (separate terminal)
npm run watch:webview
```

---

## Running the VS Code Extension Development Host

1. Open this repository in VS Code.
2. Press **F5** (or **Run → Start Debugging**).
3. A new VS Code window opens with Parallax installed.
4. Open any folder in that window.
5. Parallax activates automatically and starts recording.
6. Open the Parallax sidebar (clock icon in the activity bar).
7. Use the Command Palette (`Ctrl+Shift+P`) for `Parallax: …` commands.

---

## Available Commands

| Command | Description |
|---|---|
| `Parallax: Start Recording` | Begin recording file events |
| `Parallax: Stop Recording` | Stop recording |
| `Parallax: Open Timeline` | Open the Parallax sidebar timeline |
| `Parallax: Create Checkpoint` | Save a named milestone |

---

## Running Tests

```bash
# Compile extension + tests
npx tsc -p tsconfig.test.json

# Run all unit tests
npx mocha "out/test/**/*.test.js" --timeout 10000 --exit
```

Or via the npm script:

```bash
npm test
```

### Test results

```
89 passing
```

Tests cover: event creation/serialization, SHA-256 hashing, diff generation/application, exclusion matching, storage persistence, historical state reconstruction, and checkpoints.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `parallax.recordingEnabled` | `true` | Auto-start recording on VS Code startup |
| `parallax.snapshotIntervalMinutes` | `30` | Interval between automatic full snapshots |
| `parallax.excludePatterns` | See defaults | Directories/patterns excluded from recording |
| `parallax.maxEventsPerSession` | `10000` | Maximum events retained per session |
| `parallax.debounceMs` | `1000` | Debounce interval for file modification events |

---

## Known Limitations

- **Binary files** are not hashed or stored (only UTF-8 text files are processed).
- **Very large files** (images, compiled assets) may be slow to hash; exclude them via `parallax.excludePatterns`.
- The webview is 1.1 MiB in development mode (React + react-dom dev build). A production webpack build would reduce this significantly.
- Historical reconstruction is accurate for text files but has not been tested with files > 10 MB.
- The VS Code Git integration requires the built-in `vscode.git` extension to be active; if it is disabled, Git events are silently skipped.
- There is no UI for browsing all sessions yet — the timeline shows the current/most recent session's events.

---

## What Remains for Phase 2

- Backend sync (FastAPI + PostgreSQL)
- AI/BYOK integration (prompt attribution, code provenance)
- RAG over development history
- Software forensics and bug-origin analysis
- Multi-device / team history sync
- Web dashboard
- Production packaging (minified webview bundle, VSIX publish)
- Advanced timeline filtering, search, and annotation

See `docs/implementation-status.md` for the full Phase 2 backlog.
