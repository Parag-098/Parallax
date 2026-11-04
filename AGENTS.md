# AGENTS.md — Parallax Engineering Guide

This file gives coding agents a shared set of project rules. Read it before changing code. More specific instructions may exist in nested `AGENTS.md` files; when they do, follow both, with the more specific instruction taking precedence unless it conflicts with a repository-wide safety rule.

## 1. Product purpose

Parallax is a **local-first VS Code development history and reconstruction extension**. It records supported development activity as a persistent event stream and lets developers inspect, compare, replay, and reconstruct historical file states.

Parallax complements Git. It does not replace Git, and Git remains the source of truth for shared version control.

## 2. Current product boundaries

Treat the following as the current product contract unless the source code or an explicitly approved specification proves otherwise:

- The product is a VS Code extension with a TypeScript extension host and a React/TypeScript webview.
- Core recording and history workflows work locally.
- Core functionality must not require a hosted backend, cloud account, API key, or network connection.
- The current recorder supports text-file activity and observes the public VS Code Git API when available. Binary-file history is not currently supported.
- Recorded data is stored locally through VS Code extension storage.
- The sidebar can browse persisted sessions; large-history pagination remains incomplete.
- Terminal activity, test executions, and debugger activity are not part of the current recorded event stream unless the codebase has since changed.
- **Causal Rewind is planned. Do not describe or expose it as implemented until its implementation and tests are merged.**

Do not silently change these product boundaries. Propose a specification and explain the privacy, compatibility, and migration implications first.

## 3. Read before changing code

Before implementing a feature or fixing a non-trivial bug:

1. Read this file and `ARCHITECTURE.md`.
2. Read the relevant feature specification in `docs/features/`.
3. Inspect the actual source files, package scripts, tests, and VS Code contribution points. Do not infer file names or APIs from documentation alone.
4. Check the working tree and current branch. Do not overwrite or discard user changes.
5. Identify the smallest set of components that need to change.
6. State any assumptions that cannot be verified from the repository.

The source code and tests are authoritative for current behavior. Documentation describes intended behavior and must be updated when implementation changes.

## 4. Engineering principles

### 4.1 Event history

- Treat persisted history as an ordered record of observed activity. Do not silently rewrite or reinterpret existing events.
- Preserve stable event identity and the ordering semantics used by the current implementation.
- Handle duplicate, delayed, reordered, and coalesced file-system notifications deliberately; do not assume that every watcher notification represents one user edit.
- Keep event payloads minimal and versionable. Avoid persisting unnecessary source text in event metadata when a content reference is sufficient.
- If an event schema changes, define compatibility and migration behavior and add tests for old persisted records.
- Distinguish an observed event from an inferred explanation. Never present a correlation as proven causation.

### 4.2 Content and reconstruction

- Preserve the existing SHA-256/content-addressing contract unless a specification explicitly authorizes a migration.
- A content hash must be computed from a clearly defined byte representation. Do not normalize line endings, whitespace, encoding, or Unicode implicitly.
- Verify content after reading it from storage where integrity matters.
- Historical reconstruction must fail safely when required content or events are missing or corrupt. Do not silently return a plausible but incorrect file.
- Keep snapshots as reconstruction accelerators; do not make them an undocumented replacement for the event history.
- Avoid loading an entire large workspace into memory when a bounded or streaming approach is possible.

### 4.3 Local-first privacy and security

- No network requests, telemetry, remote storage, external AI calls, or API-key requirements may be introduced into core functionality without explicit product approval and documentation.
- Do not record secrets, credentials, environment variable values, access tokens, private keys, or sensitive terminal output.
- Add conservative exclusions and make recording behavior understandable and controllable by the user.
- Treat workspace paths, file contents, Git metadata, and webview messages as untrusted input.
- Validate paths before reading, writing, deleting, or restoring. Prevent path traversal and unintended writes outside the workspace or designated Parallax storage.
- Never execute a recorded terminal command automatically. Any future command replay must require explicit user approval and an isolated execution environment.
- Do not restore or delete files without a preview, a recoverable pre-restore state, and clear user confirmation.

### 4.4 VS Code extension and webview

- Respect VS Code activation, cancellation, disposal, and workspace lifecycle APIs.
- Dispose watchers, subscriptions, timers, providers, and other resources when they are no longer needed.
- Keep expensive hashing, diffing, indexing, and reconstruction work off latency-sensitive UI paths where practical.
- Validate and version messages crossing the extension-host/webview boundary.
- Do not trust webview-provided file paths, event identifiers, or commands without extension-host validation.
- Keep the webview presentation layer separate from history and storage business logic.
- Preserve keyboard accessibility, clear empty states, and understandable error messages.

### 4.5 TypeScript and dependencies

- Follow the repository's existing TypeScript, linting, formatting, and module conventions.
- Prefer small, typed functions and explicit data contracts over broad abstractions.
- Avoid adding dependencies for functionality that can be implemented safely with existing project dependencies or platform APIs.
- Do not upgrade major dependencies or the VS Code engine range as part of an unrelated feature.
- Do not introduce a database, server, cloud service, or AI SDK merely to support a local feature.

## 5. Required workflow for code changes

For each substantial change:

1. **Specification:** identify or create a feature specification with scope, non-goals, acceptance criteria, failure behavior, and privacy implications.
2. **Design:** document affected components, event/data changes, compatibility concerns, and alternatives.
3. **Implementation:** make the smallest coherent change. Keep UI, extension-host, and storage responsibilities separated.
4. **Tests:** add or update unit, integration, and UI/message-contract tests as appropriate. Include regression tests for bugs.
5. **Validation:** run the relevant tests, then the full available build/test commands.
6. **Independent review:** ask a separate agent or fresh context to review the diff without implementing it. Use `docs/review/INDEPENDENT_REVIEWER.md`.
7. **Documentation:** update the feature spec, architecture notes, README, settings/command documentation, and known limitations where relevant.
8. **Summary:** report files changed, behavior added, commands run, results, known gaps, and any unverified assumptions.

Do not claim a command passed unless it was actually run and its result was observed.

## 6. Baseline development commands

The README currently documents these commands. Inspect `package.json` before relying on them because scripts can change:

```bash
npm install
npm run build
npm test
```

The documented test fallback is:

```bash
npx tsc -p tsconfig.test.json
npx mocha "out/test/**/*.test.js" --timeout 10000 --exit
```

For UI or extension behavior, also test in a VS Code Extension Development Host where practical. Unit tests alone do not establish that activation, webview messaging, or workspace lifecycle behavior works.

## 7. Definition of done

A change is not complete merely because it compiles. It is complete when:

- The implementation matches an approved specification.
- Acceptance criteria are covered by tests or documented manual verification.
- Existing persisted history remains readable, or a tested migration is provided.
- Privacy, path safety, and failure behavior have been considered.
- The relevant build and tests pass, or failures are reported accurately.
- No unrelated user changes are overwritten.
- Documentation reflects what is actually implemented.
- An independent review has no unresolved critical or high-severity findings.

## 8. Useful project documents

- `ARCHITECTURE.md` — system boundaries, event lifecycle, storage, reconstruction, replay, and VS Code integration.
- `docs/features/README.md` — feature specification index and status definitions.
- `docs/review/INDEPENDENT_REVIEWER.md` — independent review process and reviewer prompt.
- `.agents/skills/` — reusable workflows for implementation, debugging, architecture changes, and review.

## 9. Rules for reporting status

Use these labels consistently:

- **Implemented:** present in the codebase and supported by tests or reproducible verification.
- **Partial:** some behavior exists, but documented acceptance criteria remain unmet.
- **Planned:** specified or proposed, but not implemented.
- **Research:** an idea requiring feasibility or prior-art investigation before commitment.

Do not upgrade a status based on a design document, mock-up, TODO, or passing unit test alone.
