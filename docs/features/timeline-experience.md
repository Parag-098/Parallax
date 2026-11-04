# Feature: Timeline Experience

- **Status:** Partial. The production webview implements the recorded-history workflows and a responsive VS Code theme-token design; screenshot review across actual themes and panel widths remains outstanding.
- **Related architecture:** [VS Code integration](../../ARCHITECTURE.md#10-vs-code-integration), [Replay engine](../../ARCHITECTURE.md#9-replay-engine)

## Problem

Developers need a compact, trustworthy view of what Parallax is recording, which session they are inspecting, what changed, and how to inspect or recover a prior file version.

## User experience

- A compact project header shows recording state, current project identity, elapsed session time, and access to Parallax's real VS Code settings.
- The timeline presents loaded events in chronological order with date dividers, event type, file identity, and time. History is loaded in 100-event pages.
- Session and checkpoint selectors navigate persisted history. Replay supports previous/next, play/pause, scrubbing, and arrow/space keyboard controls.
- Selecting a recorded file requests its content from the extension host. The webview labels the panel as historical and read-only. **Open in Editor** opens a read-only `parallax-history:` document that receives the filename suffix for VS Code language services.
- Comparison reconstructs both actual historical contents and displays line-aligned additions/removals, timestamps, counts, and a unified patch.
- Restore actions are labelled as previews and hand off to the extension host's diff preview and explicit native confirmation workflow.
- The Settings action opens VS Code's Parallax settings contribution rather than presenting controls disconnected from configuration.

## Design and accessibility

Shared CSS variables map surfaces, text, borders, accent, focus, and semantic colors to VS Code theme variables. The layout supports narrow stacked panes and wider timeline/detail columns; high-contrast modes strengthen borders and selected-state focus. Controls have labels and keyboard focus states, status uses text plus a marker, and reduced-motion preferences are honored.

## Acceptance criteria

- [x] The production webview bundle renders a real timeline and sends actions for session switching, older pages, event inspection, comparison, replay, checkpoint navigation, recording, and restore previews. Session identity and checkpoint request tokens keep delayed responses from changing a newly selected history point.
- [x] Historical file contents are requested from the extension host and can open as a read-only custom-scheme VS Code document.
- [x] Comparison lines, counts, and timestamps use extension-host reconstruction and diff output.
- [x] The UI uses VS Code color/font tokens, adapts to narrow widths, exposes focus indicators, and respects reduced motion.
- [x] Settings navigation opens the actual extension settings surface.
- [ ] Manually inspect rendered light, dark, high-contrast, narrow, standard, and wide layouts in VS Code and adjust any visual defects.
- [ ] Add a live VS Code webview test for the full host/webview message cycle and restore preview/cancel.

## Privacy and security

The webview has no network resources. It displays extension-host history and passes typed requests through a strict host message validator. Historical views use a custom read-only document provider and never target the active workspace file for display.

## Test strategy

`test/webview.test.ts` executes the compiled production bundle under JSDOM and checks rendered content and emitted message requests. The Extension Development Host suite validates the Activity Bar/view contribution, root lifecycle, and custom historical document provider. GUI screenshot inspection is still needed to verify actual appearance and platform-specific webview behavior.
