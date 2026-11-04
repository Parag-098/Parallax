# Parallax Documentation and Agent Workflow Pack

This pack adds project guidance for developers and compatible coding agents.

## Included files

```text
AGENTS.md
ARCHITECTURE.md
README-DOCS.md
docs/
  features/
    README.md
    event-capture-and-recording.md
    content-storage-and-reconstruction.md
    snapshots-checkpoints-and-replay.md
    git-awareness.md
    session-explorer.md
    history-search.md
    safe-workspace-recovery.md
    verification-recorder.md
    causal-rewind.md
  review/
    INDEPENDENT_REVIEWER.md
.agents/
  skills/
    feature-implementation/SKILL.md
    bug-investigation/SKILL.md
    architecture-change/SKILL.md
    independent-review/SKILL.md
```

## How to use it

1. Copy `AGENTS.md` and `ARCHITECTURE.md` into the repository root.
2. Copy `docs/` into the repository's existing `docs/` directory, merging carefully if one already exists. Do not overwrite existing project documentation without reviewing it.
3. Copy `.agents/skills/` into the repository root. These follow the Agent Skills `SKILL.md` convention; confirm that your coding agent supports the `.agents/skills/` discovery location. If it uses a different location, copy the skill directories there without changing their contents.
4. Keep `docs/review/INDEPENDENT_REVIEWER.md` and use it when asking a separate agent to review substantial changes.
5. Update statuses and acceptance criteria after checking the real source code. The pack was authored from the project's supplied README and description, not from a full repository inspection.

## Important accuracy note

The feature statuses reflect the supplied Parallax description. Some architectural details are logical descriptions, not verified source-level module names or exact interfaces. In particular, Causal Rewind, verification recording, session browsing, global search, and safe workspace restoration are documented as planned/research work, not current functionality.
