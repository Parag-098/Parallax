# Parallax beta reliability audit — 2026-11-03

## Scope and environment

Audit performed on Windows with VS Code 1.144.1, Node.js 24.16.0, npm 11.13.0. Integration fixtures and scale fixtures were disposable. The production extension remains compatible with VS Code 1.85+; development tests require Node.js 18.18+ because of Mocha 11.

## Workspace lifecycle and packaged host

A saved `.code-workspace` Extension Development Host test exercises adding a root, removing it, replacing the remaining root, removing the final root, and waiting for `onDidChangeWorkspaceFolders`. It confirms that a newly added root records, a removed root stops recording, the retained root still records, switched root sets use separate storage identities, and the final root removal stops watchers. It also opens an actual captured TypeScript file through the packaged `parallax-history:` document provider and confirms the reconstructed text, TypeScript language mode, and virtual read-only URI scheme.

The same integration suite passed against the installed VSIX in an isolated VS Code profile. The VS Code manifest contributes the Parallax Activity Bar container and `parallax.timeline` view; `parallax.openTimeline` was invoked by the test. JSDOM tests exercise the production webview bundle's actual message requests for session switching, pagination, inspection, comparison, replay, checkpoint navigation, recording, and restore preview.

The root-set hash is the workspace identity. When folders change, history remains preserved under each previous identity and a different root set gets a separate store; Parallax does not merge these stores automatically. This avoids cross-root contamination but does mean sessions can appear as separate projects after changing the root set.

## Synthetic performance check

The inventory benchmark created 5,000 small TypeScript files (255,000 source bytes) on local storage. It measured three file limits on the same fixture. Values are wall-clock measurements from this environment, not product guarantees.

| Inventory limit | Before bounded workers | After bounded workers | Latest run (2026-11-03) | Observed heap delta after latest run |
|---:|---:|---:|---:|---:|
| 100 files | 644 ms | 145 ms | 82 ms | 3.84 MiB |
| 1,000 files | 4,636 ms | 869 ms | 460 ms | 2.96 MiB |
| 5,000 files | 22,872 ms | 6,690 ms | 5,069 ms | 14.60 MiB |

The inventory now enumerates deterministically, inspects metadata with at most 16 workers, allocates the byte cap in sorted path order, and reads content with at most 8 workers. The 5,000-file bound still has a several-second startup cost on this machine; scans remain capped, and the result is not generalized to network or slower disks.

A synthetic 100,000-event session used an 18.95 MiB JSONL event file and 1,562 sparse index entries. Latest readings were: a 100-event newest page in 7.93 ms; an indexed 100-event range in 14.40 ms; snapshot-assisted reconstruction across that tail in 23.16 ms; and 1.83 MiB heap delta for the page/range/reconstruction sequence. The benchmark did not measure concurrent workspace writes or multiple VS Code processes under sustained load.

## Data integrity and security evidence

Automated coverage includes incomplete JSONL tail repair, migration of the schema marker without rewriting v1 event data, missing/corrupt snapshot fallback, hash and content validation, stale/truncated writer-lock recovery, active-lock ownership verification, static symlink rejection, traversal rejection, restore conflict preflight, and storage identity separation. The lock behavior is exercised with independent store objects in one test process; an actual two-window stress/abnormal-termination run was not performed.

The host validates webview message types and bounds sequence/path fields. Session-scoped requests and history generations prevent stale timeline, content, comparison, and older-page responses from crossing project/session changes. A request token additionally rejects out-of-order checkpoint responses within the same session. Workspace-root reconfiguration refreshes the open provider after its new store is initialized. Content reads use workspace-root checks, canonical paths, `O_NOFOLLOW` when available, and post-read revalidation. Exclusions apply to inventory and watcher capture. Extension storage is excluded from inventory. No network or telemetry path was added.

Restore remains subject to a local path-based TOCTOU limitation: Node's ordinary rename APIs cannot atomically combine ancestor validation and no-follow replacement. Static symlinks and traversal are rejected, and paths are revalidated immediately before mutation, but a concurrent local process can still race by swapping a parent. Full workspace restore is available only for complete eligible-text inventories; excluded, binary, over-limit, and otherwise unavailable data is not restored.

The automated suite exercises multi-file restore preflight and successful create/modify/delete behavior. A deterministic fault-injection test proving rollback after a mid-apply filesystem failure was not present during this audit. Actual concurrent-window writing and a screenshot-based inspection of malformed webview traffic were not performed.

## Dependency audit

`npm audit --omit=dev` reports zero production vulnerabilities. The full development tree currently reports five vulnerabilities across four transitive packages pulled by Mocha 11.8.0:

| Package in lockfile | Parent | Audit finding | Resolution constraint |
|---|---|---|---|
| `diff@7.0.0` | `mocha@11.8.0` | `parsePatch` / `applyPatch` denial of service | Mocha 11 constrains `diff` to `^7`; Mocha 12 moves to `^9`. The extension's direct production `diff@9.0.0` is not affected. |
| `glob@10.5.0` | `mocha@11.8.0` | moderate AbortSignal cancellation bypass | Mocha 11 constrains `glob` to `^10`; the proposed Mocha 12 tree uses `glob@13`. |
| `minimatch@9.0.9` | Mocha / glob | moderate globparts amplification DoS | The patched major requires `minimatch@11.0.1`, whose supported Node versions start at Node 20. |
| `serialize-javascript@6.0.2` | `mocha@11.8.0` | high RCE and additional XSS/DoS advisories | The audited fixed line is 7.1.3+, which requires Node 20. |

`npm audit fix --dry-run` proposes `mocha@12.0.3` and marks it as a breaking update. Mocha 11.8.0 is the newest 11.x release in the registry; Mocha 12.0.3 requires Node `^20.19.0 || >=22.12.0`. Applying that update would invalidate the documented Node 18 development baseline. No overrides were applied because replacing Mocha's transitive parser/glob libraries outside their declared compatibility ranges is not a proven safe patch. The vulnerable packages are development-only and are not shipped in the VSIX; the dev audit remains a release maintenance item.

## Release checklist

- **Verified:** build, core/webview tests, Extension Development Host integration, dynamic root changes, read-only historical document provider, clean VSIX install, packaged-host integration, and production dependency audit.
- **Verified this run:** `npm run build`, `npm test` (29 passing), `npm run test:integration` (including root add/remove/switch/final-root removal), `npm run package`, isolated profile VSIX install, packaged-host integration, VSIX asset/hash inspection (43 entries, 131,429 bytes), and `npm audit --omit=dev` (0 vulnerabilities). Synthetic scan and 100,000-event benchmark results are recorded above.
- **Independent review:** prior findings on root timeline refresh and session-crossing responses were fixed. A follow-up review also found and helped close a same-session checkpoint response race using request tokens; no actionable findings remained in that review.
- **Unverified UI:** an actual screenshot review at narrow/standard/wide sizes and dark/light/high-contrast themes could not be performed. The Computer Use inventory returned no apps/windows; production-bundle JSDOM and Extension Host tests are not substitutes for visual QA.
- **Technical follow-up:** run two separate VS Code windows concurrently on the same project and simulate owner shutdown during active writes; add a deterministic restoration mid-apply rollback fault-injection test.
- **Risk:** local malicious filesystem races cannot be fully closed with Node path-based rename operations; avoid describing restore as immune to a concurrent local attacker.
- **Dependency follow-up:** decide whether to raise the development toolchain floor to Node 20.19+ and migrate Mocha 12, or adopt a separately validated compatible dependency remediation. Production dependencies remain audit-clean.
- **External prerequisite:** project ownership must choose a license and provide the corresponding LICENSE file before publishing. No license has been selected.
