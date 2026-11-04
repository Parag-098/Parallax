# Feature: Causal Rewind

- **Status:** Research / Planned. Not implemented.
- **Working title:** Event-Level Regression Isolation Through Historical Workspace Reconstruction.
- **Related architecture:** [Historical reconstruction](../../ARCHITECTURE.md#8-historical-reconstruction), [Planned verification and Causal Rewind](../../ARCHITECTURE.md#12-planned-architecture-verification-and-causal-rewind)

## Problem

A developer can make many uncommitted changes between a known-good test result and a failing result. Commit-based regression tools may not have a revision for each local edit. Manually reviewing every diff can be slow, especially when multiple changes interact.

Causal Rewind aims to use Parallax's fine-grained local history to find a small set of recorded changes that is sufficient to reproduce a selected test failure.

## Product hypothesis

A developer should be able to select a known-good verification state and a reproducibly failing state. Parallax should reconstruct the candidate change set, run controlled experiments in a disposable workspace, and report a minimal failure-inducing set with evidence and limitations.

This is an engineering/product hypothesis. The underlying ideas of regression bisection and delta debugging are established. The potentially distinctive contribution to investigate is applying change-set minimization to Parallax's fine-grained local event history, including uncommitted changes, with explicit workspace-state provenance.

## Goals

- Use Verification Recorder evidence to identify suitable good and failing states.
- Extract candidate changes between those states.
- Reconstruct experiments without modifying the active workspace.
- Apply candidate subsets and run a user-approved verification command.
- Minimize the candidate set while preserving the selected failure.
- Preserve experiment logs and report reproducibility limits.

## Non-goals

- Guaranteeing a unique root cause.
- Automatically running arbitrary recorded terminal commands.
- Testing production systems or executing untrusted code outside a user-approved isolated environment.
- Replacing Git Bisect for commit-level history.
- Claiming results for flaky or non-reproducible failures.
- Running experiments against cloud services or external systems by default.

## User workflow

1. The user selects a known-good verification record.
2. The user selects a failing verification record.
3. Parallax validates that both states have reconstructable manifests and that the failure can be reproduced from the failing state.
4. Parallax displays candidate recorded changes and asks the user to approve the test command, environment, resource limits, and isolation mode.
5. Parallax creates a disposable workspace from the good state.
6. The experiment runner applies a selected subset of changes and executes the approved test.
7. The minimization algorithm repeats experiments until it finds a 1-minimal set within configured bounds, or reaches an inconclusive/resource-limit state.
8. Parallax presents the candidate set, experiment log, diffs, and confidence/limitations.

## Proposed algorithm

The first implementation should use a conservative, testable delta-debugging strategy rather than an opaque AI ranking system.

1. Define atomic candidate change units. Initially, use file-level change groups or event groups that can be replayed consistently. Hunk-level units may follow after dependency handling is reliable.
2. Verify the baseline: the selected known-good state passes and the selected failing state reproduces the target failure under the approved command.
3. Partition the candidate set into subsets and complements.
4. Apply each candidate subset to the known-good workspace and execute the test.
5. Retain subsets that reproduce the target failure; otherwise test complements and refine the partition.
6. Repeat until no individual remaining unit can be removed while preserving the failure, or until experiment/time limits are reached.
7. Re-run the final minimized set to confirm reproducibility.

The exact algorithm, partition strategy, and handling of interacting changes require a separate technical design and benchmarks. The output must say **1-minimal under the tested units and conditions** when that is what has been established; do not claim globally smallest or uniquely causal.

## Data requirements

- A reconstructable known-good workspace manifest.
- A reconstructable failing workspace manifest.
- A mapping from candidate changes to replayable event/content references.
- A VerificationRun record with outcome and test identity.
- A reproducible or explicitly captured test command/configuration.
- Experiment records containing candidate set, resulting workspace fingerprint, outcome, duration, and failure signature.

## Safety and privacy requirements

- Experiments run in a disposable directory or stronger isolation boundary, never in the active workspace.
- The user explicitly approves the test command and any setup commands.
- Recorded terminal commands are never replayed automatically.
- Secrets and environment values are not copied by default. The user must explicitly provide any required safe environment configuration.
- The runner has configurable limits for duration, disk, memory where enforceable, process count/concurrency, and total experiments.
- Cancellation terminates child processes and cleans up temporary resources safely.
- File paths are validated against the experiment root.
- No experiment result is trusted if the workspace changes during the run or the test environment is materially different without disclosure.
- Network access should be disabled by default where practical; any required network dependency must be explicit.

## Failure and inconclusive states

The feature must distinguish at least:

- Good baseline does not pass.
- Failing state does not reproduce the selected failure.
- Failure is flaky or nondeterministic.
- Required content is missing or corrupt.
- Candidate changes cannot be replayed independently.
- Dependency or environment drift prevents a meaningful comparison.
- Experiment limit or timeout reached.
- User cancelled.
- Isolation setup failed.

An inconclusive investigation is a valid result. Do not fabricate a likely culprit.

## Acceptance criteria

- [ ] The user can select good and failing verification records from the same compatible workspace history.
- [ ] Parallax refuses or clearly marks investigations when either state is not reconstructable.
- [ ] The selected failure is reproduced from the failing state before minimization begins.
- [ ] The known-good baseline passes the selected verification before minimization begins.
- [ ] All experiments execute outside the active workspace.
- [ ] No recorded command is executed without explicit user approval.
- [ ] Every experiment records the tested change-unit set, resulting workspace fingerprint, test outcome, duration, and failure signature where available.
- [ ] The minimization process returns a 1-minimal set under its documented change-unit model, or a clear inconclusive/resource-limit result.
- [ ] The final candidate set reproduces the selected failure in a confirmation run.
- [ ] The report distinguishes evidence of a failure-inducing set from proof of a unique root cause.
- [ ] Flaky tests and workspace/environment changes are detected or explicitly surfaced as limitations.
- [ ] The active workspace and its Git state remain unchanged by the investigation.
- [ ] User cancellation terminates experiments and cleans up temporary workspaces safely.
- [ ] The feature operates without cloud services or mandatory AI APIs.

## Evaluation plan

Before claiming research novelty or effectiveness, benchmark against:

- Manual diff-based investigation.
- Git Bisect where the relevant changes are committed.
- A straightforward file-level delta-debugging baseline.

Use reproducible regression fixtures with known failure-inducing changes. Report:

- Correctness of the minimized set.
- Number of test executions.
- Wall-clock time and resource consumption.
- Reconstruction accuracy.
- Behavior under interacting changes.
- Behavior with flaky tests and environment drift.

Do not claim the method is faster or more accurate without measured results.

## Open research questions

- What is the right atomic change unit: file, event, edit episode, diff hunk, or AST node?
- How should dependent edits, renames, generated files, and lockfiles be grouped?
- How can test outcome equivalence be defined when failure messages vary?
- Which isolation mechanism is practical across Windows, macOS, and Linux?
- How should dependency installation and network-dependent tests be handled safely?
- What exact capability is distinct from existing delta-debugging, regression-bisection, and agent-replay systems?
