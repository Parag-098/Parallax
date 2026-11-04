# Parallax

Parallax is a local-first VS Code extension for inspecting text-file development history. History stays under VS Code global extension storage, isolated by a hash of the workspace roots. The extension has no telemetry or cloud service.

## License

Parallax is licensed under the MIT License.
See the [LICENSE](LICENSE) file for details.

## Implemented workflows

- Start and stop recording from commands or the sidebar.
- Capture text file creation, modification, deletion, saves, renames, and supported Git activity.
- Inspect and switch between persisted sessions without changing the active recording session.
- Navigate named checkpoints and move through a session timeline.
- Reconstruct historical text using verified content-addressed blobs, sparse sequence indexes, and the nearest valid snapshot. Indexed reads are bounded to 64 MiB and 100,000 events per operation.
- Compare two historical points using actual reconstructed content and line statistics.
- Inventory eligible existing UTF-8 text files at session start (up to 5,000 files / 64 MiB total, 10 MiB per file; scanning stops after 50,000 directory entries) and fingerprint them into a baseline snapshot. A complete baseline enables preview and confirmation of historical workspace restoration, including pre-existing files and later creates, deletes, and renames. Restore reports unavailable text paths from the bounded omission list, checks conflicts before writes, captures current contents, and attempts rollback if an apply fails.
- Capture multiple workspace roots with stable root prefixes and isolated workspace storage.
- Reconfigure workspace storage, session, watchers, and Git observers when workspace roots change. A saved `.code-workspace` integration test exercises adding/removing roots, switching roots, final-root removal, and capture/disposal behavior. A changed root set receives a different history identity; histories are preserved under each identity and are not automatically merged. One live recording owner per workspace is coordinated with a local lease; appends verify lock ownership and stale same-machine process locks can be reclaimed.
- Load timeline events in 100-event pages. Historical inspection and comparison seek through a sparse event index from the nearest valid snapshot. Full workspace restoration is capped by the reconstruction range safety limits.
- Use a responsive, VS Code theme-aware timeline with keyboard replay, event details, line-aligned historical comparisons, and a read-only historical editor that keeps VS Code syntax services.
- Open Parallax settings directly from the sidebar; settings remain owned by VS Code configuration.

The built-in Git extension's public API reports commits and checkouts explicitly; Parallax also records ambiguous HEAD changes as `git-head`. A HEAD transition alone is not proof of a commit operation.

## Current limits

Inventory is a bounded scan of eligible UTF-8 text files; binary, excluded, oversized, inaccessible, and over-limit files are not included. A baseline that hits scan errors or limits is marked incomplete and cannot be used for full-workspace restoration. Files created while recording is stopped or otherwise unobserved remain outside history. Restore rejects existing symlinks and rechecks canonical parents before filesystem changes, but Node's path-based rename APIs cannot make validation and rename one atomic no-follow operation; a concurrent local process that swaps parent paths remains a residual TOCTOU risk. Capture and inventory reject static symlinks, open canonical paths, use O_NOFOLLOW where available, and recheck resolved targets; Windows and Node path APIs cannot eliminate every concurrent filesystem swap race. The schema marker is migrated atomically from unversioned/legacy storage; it does not transform historic event records. Indexed reconstruction fails safely if its event range exceeds 64 MiB or 100,000 events. Root changes have been exercised in a saved multi-root Extension Development Host workspace; histories remain isolated by root-set identity and are not automatically merged when roots change. Virtual workspace restore is unavailable. Binary content is not recorded. Causal Rewind, terminal/test history, cloud sync, and AI analysis remain out of scope.

## Local storage

Data is written beneath `ExtensionContext.globalStorageUri/<workspace-hash>/`:

- `session-<id>.json`: independent session metadata.
- `events-<id>.jsonl`: ordered events.
- `events-<id>.idx`: regenerable sparse event sequence/byte-offset index (one entry per 64 events).
- `content/<sha256>`: deduplicated UTF-8 text blobs.
- `checkpoint-<id>.json`: named history positions.
- `snapshot-<session>-<sequence>.json`: fingerprinted path-to-content-reference manifests.

Snapshots may carry `inventoryComplete`, up to 500 unsupported/symlinked relative paths, and an omission-truncated flag. Excluded paths are not persisted in this list.

Event writes are serialized within an extension host. A local `recorder.lock` lease prevents simultaneous recording sessions for one workspace; windows can browse while another window records. Appends verify the owning token, and stale same-host process locks are reclaimed. Incomplete final JSONL records are repaired before the next append; malformed interior records fail reads. Retention creates snapshot anchors before pruning events, and checkpoint snapshots are preserved. Content blobs are not garbage collected. Storage schema metadata is upgraded atomically without rewriting v1 event/content records. Timeline pages read backward from the JSONL tail; the sparse index is rebuilt by streaming old event files when needed.

Review exclusions before recording sensitive projects. Exclusions reduce recording exposure but cannot guarantee that secrets are never captured.

## Build and run

Requirements: Node.js 18.18+ for development commands, VS Code 1.85+, and npm.

```sh
npm install
npm run build
npm test
npm run test:integration
```

Press **F5** to launch the Extension Development Host, open a project folder, then select the Parallax Activity Bar view. `npm run test:integration` launches the official VS Code test host on an isolated workspace. `npm test` includes core and browser-DOM webview interaction tests. Run `npm run package` to create a VSIX. A license has not been selected; the VSIX must not be published until the project owner chooses licensing terms and adds the corresponding license file.

For a packaged-extension host probe after installing the VSIX into an isolated extension directory, set `PARALLAX_INSTALLED_EXTENSION`, `PARALLAX_INSTALL_PROFILE`, and optionally `VSCODE_EXECUTABLE`, then run `npm run test:package-host`. The final VSIX was installed into a clean profile and passed the packaged-host suite, including Activity Bar/view contributions, activation, recording, root changes, and opening reconstructed history as a read-only TypeScript document. Browser-DOM tests cover timeline, compare, replay, checkpoint, and restore-preview requests. Manual visual review of light/dark/high-contrast themes and panel widths remains outstanding.

## Settings

| Setting | Default | Purpose |
|---|---:|---|
| `parallax.recordingEnabled` | `true` | Automatically record when a workspace opens. |
| `parallax.snapshotIntervalMinutes` | `30` | Periodic reconstruction snapshot interval. |
| `parallax.excludePatterns` | See `package.json` | Glob exclusions. |
| `parallax.maxEventsPerSession` | `10000` | Target event retention bound; pruning waits for a safe snapshot anchor. |
| `parallax.debounceMs` | `1000` | File watcher debounce interval. |

See `ARCHITECTURE.md`, `docs/features/`, and `docs/review/INDEPENDENT_REVIEWER.md` for design details and verification policy. Causal Rewind is future work.
