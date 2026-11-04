---
name: feature-implementation
description: Implement a Parallax feature from its specification, preserving local-first guarantees, persisted-history compatibility, test coverage, and documentation.
---

# Parallax Feature Implementation

## Use this skill when

Implementing a new feature or a substantial enhancement to an existing Parallax capability.

## Workflow

1. Read the root `AGENTS.md` and `ARCHITECTURE.md`.
2. Find the relevant feature specification in `docs/features/`. If none exists, create one before coding.
3. Inspect the actual source tree, package scripts, existing tests, and extension contribution points. Never invent module paths or interfaces.
4. Record the current Git status and do not overwrite user changes.
5. Write a short implementation plan identifying affected layers: VS Code integration, capture, event model, storage, reconstruction, webview, tests, and docs.
6. Check whether the change alters persisted schemas, hashes, ordering, workspace identity, settings, or webview messages. Define compatibility and migration behavior before implementation.
7. Implement the smallest coherent vertical slice. Keep business logic out of the webview and validate all webview messages on the extension host.
8. Add tests for the acceptance criteria, including failure, cancellation, and malformed/missing data paths.
9. Run targeted tests, then the documented build and full test commands after confirming they exist in `package.json`.
10. Update the feature specification, `ARCHITECTURE.md`, README, settings/commands documentation, and known limitations as appropriate.
11. Request an independent review using `docs/review/INDEPENDENT_REVIEWER.md`.
12. Summarize files changed, tests run, outcomes, limitations, and unverified assumptions.

## Constraints

- Do not introduce network calls, cloud dependencies, telemetry, AI APIs, or mandatory accounts into core workflows without explicit approval.
- Do not record secrets, arbitrary terminal output, or excluded files.
- Do not silently normalize content before hashing.
- Do not mutate the active workspace during historical inspection or replay.
- Do not execute recorded commands automatically.
- Do not claim a planned feature is implemented.
