# Feature: Git Awareness

- **Status:** Partial; the public Git API is observed when available.
- **Related architecture:** [VS Code integration](../../ARCHITECTURE.md#10-vs-code-integration)

## Problem

Git commits and branch operations provide important context, but they do not describe every local edit. Parallax should associate supported Git activity with its finer-grained local history without taking ownership of Git operations.

## Goals

- Detect the built-in VS Code Git extension when available.
- Record supported Git context, including commits and checkouts as implemented.
- Keep Git metadata associated with the correct workspace/session.
- Continue core file-history functionality when the Git extension is unavailable.

## Non-goals

- Reimplementing Git.
- Automatically staging, committing, checking out, rebasing, resetting, or pushing.
- Treating a Git commit as a replacement for all local events.

## Functional requirements

1. Git integration is activated only when the supported VS Code Git API is available.
2. Public `Repository.onDidCommit` and `Repository.onDidCheckout` events are recorded with related revision/ref metadata where available. Unclassified `HEAD` changes use a generic event kind.
3. Git-provider absence or deactivation is reported or diagnosable; it must not crash the recorder.
4. File recording remains operational if Git integration is unavailable.
5. Git events do not imply that all uncommitted files are captured in a commit state.

## Acceptance criteria

- [x] A supported commit event is recorded when the Git provider exposes the public event.
- [x] A supported checkout event is recorded when exposed by the integration; branch/ref changes are also observed.
- [ ] The event is associated with the correct workspace/session.
- [ ] Disabling the built-in Git extension does not break file recording or timeline rendering.
- [ ] Git-provider errors are surfaced in diagnostics or an understandable status message rather than silently ignored.
- [ ] Parallax does not invoke mutating Git commands during passive observation.

## Test strategy

Mock the Git extension API for commit, checkout, provider-unavailable, provider-disposed, and multi-repository cases. Add an Extension Development Host smoke test for the supported VS Code version range.

## Open questions

- Git API events observed: public commit, checkout, and repository state change events.
- How are multiple repositories in one workspace represented?
- How are branch switches distinguished from checkouts in the persisted event schema?
