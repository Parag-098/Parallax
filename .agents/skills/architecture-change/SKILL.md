---
name: architecture-change
description: Design and review cross-cutting Parallax changes involving event schemas, storage, reconstruction, extension boundaries, or privacy guarantees.
---

# Parallax Architecture Change

## Use this skill when

A change affects multiple components or alters a persisted contract, event schema, storage format, reconstruction algorithm, extension-host/webview boundary, workspace identity, or privacy/security behavior.

## Workflow

1. Read `AGENTS.md` and the complete relevant sections of `ARCHITECTURE.md`.
2. Inspect existing implementation and tests. Separate verified facts from assumptions.
3. Write the problem, constraints, goals, non-goals, and observable acceptance criteria.
4. Draw the current and proposed data flow. Identify ownership of each responsibility.
5. Evaluate alternatives, complexity, performance, crash behavior, cancellation, and compatibility.
6. Identify every persisted contract affected: event schema, identifiers, ordering, hash semantics, content encoding, snapshot format, checkpoint references, and indexes.
7. Define migration, rollback, and old-version read behavior before changing data formats.
8. Evaluate local-first privacy, secrets, path safety, symlinks, network access, and webview trust boundaries.
9. Add an Architecture Decision Record under `docs/architecture/decisions/` for a consequential decision.
10. Implement behind a small interface or incremental migration where possible.
11. Add tests that exercise old data, corrupt data, partial writes, concurrency, and lifecycle edges.
12. Update architecture and feature documentation.
13. Obtain independent review from a separate agent/context.

## Required design questions

- What is the source of truth?
- What identifiers and ordering guarantees are required?
- Can the result be reconstructed deterministically?
- What happens if the process crashes halfway through?
- Can an older Parallax version still read the data?
- Can excluded or secret data leak through this flow?
- Can the active workspace be modified unexpectedly?
- What happens when the Git provider is disabled?
- What are the expected performance and storage bounds?

## Constraints

Do not add a backend, cloud dependency, AI SDK, database, or network requirement to solve a local architecture problem without explicit product approval.
