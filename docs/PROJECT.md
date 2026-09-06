# Parallax — Project Document

## Vision

Parallax is a local-first development time machine built as a VS Code extension. It records every meaningful developer action as a typed event and allows the developer to replay, inspect, and navigate their own development history — with no backend, no cloud, and no API keys.

The long-term vision is a platform that links individual developer actions to AI prompts, test results, and build outcomes so teams can understand the provenance of code and diagnose bugs at their origin. Phase 1 establishes the foundational local infrastructure that all future phases build on.

---

## Phase 1 Scope

Phase 1 is a complete, usable, standalone VS Code extension.

### In scope

- Workspace and project detection
- Development session management
- File event recording (create, modify, delete, rename, save)
- SHA-256 content hashing
- Diff generation and storage
- Local persistent storage (JSON files in VS Code global storage)
- Periodic and on-demand snapshots
- Historical state reconstruction
- Timeline UI (VS Code webview, React + TypeScript)
- Historical code viewer
- Diff viewer (side-by-side)
- Replay engine (step, play, scrub)
- Basic Git awareness (commits, checkouts)
- Named checkpoints
- Configurable exclusions
- Persistence across VS Code restarts
- 89 automated unit tests

### Out of scope for Phase 1

- Backend sync
- PostgreSQL / Redis
- Cloud services
- AI / LLM integration
- BYOK
- Web dashboard
- Authentication
- Multi-device sync
- Production packaging / VSIX publish

---

## Non-Goals

- Replace Git — Parallax complements Git, it does not replace it
- Process every keystroke — history should be meaningful, not noisy
- Store binary files — only UTF-8 text is processed

---

## Design Constraints

- **Local-first** — all data stays on the developer's machine
- **Non-destructive** — replay and navigation never modify working files
- **Extensible** — storage abstraction and event model designed for a future backend
- **Minimal dependencies** — only well-maintained npm packages with specific purposes
