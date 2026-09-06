import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { postMessage } from './vscodeApi';
import type {
  ParallaxEvent,
  Session,
  Checkpoint,
  DiffRecord,
} from './webviewTypes';

// ---------------------------------------------------------------------------
// Message types (mirror of src/webview/messages.ts without vscode dependency)
// ---------------------------------------------------------------------------

interface MsgInitialize {
  type: 'initialize';
  projectId: string;
  projectName: string;
  projectPath: string;
  events: ParallaxEvent[];
  sessions: Session[];
  checkpoints: Checkpoint[];
  isRecording: boolean;
}

interface MsgEventsUpdated {
  type: 'eventsUpdated';
  events: ParallaxEvent[];
}

interface MsgReplayState {
  type: 'replayState';
  status: 'idle' | 'playing' | 'paused';
  currentIndex: number;
  currentTimestamp: string | undefined;
}

interface MsgFileContent {
  type: 'fileContent';
  requestId: string;
  filePath: string;
  content: string | undefined;
  timestamp: string;
  error: string | undefined;
}

interface MsgDiffContent {
  type: 'diffContent';
  requestId: string;
  diff: DiffRecord | undefined;
  beforeContent: string | undefined;
  afterContent: string | undefined;
  error: string | undefined;
}

interface MsgRecordingStatus {
  type: 'recordingStatus';
  isRecording: boolean;
}

interface MsgError {
  type: 'error';
  message: string;
}

type IncomingMessage =
  | MsgInitialize
  | MsgEventsUpdated
  | MsgReplayState
  | MsgFileContent
  | MsgDiffContent
  | MsgRecordingStatus
  | MsgError;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

interface AppState {
  initialized: boolean;
  projectName: string;
  projectPath: string;
  events: ParallaxEvent[];
  sessions: Session[];
  checkpoints: Checkpoint[];
  isRecording: boolean;
  replayStatus: 'idle' | 'playing' | 'paused';
  replayIndex: number;
  selectedEventIndex: number;
  view: 'timeline' | 'diff' | 'code';
  fileContentMap: Map<string, string>; // requestId → content
  diffContentMap: Map<string, { diff?: DiffRecord; before?: string; after?: string }>;
  errorMessage: string | undefined;
}

type AppAction =
  | { type: 'INIT'; payload: MsgInitialize }
  | { type: 'EVENTS_UPDATED'; events: ParallaxEvent[] }
  | { type: 'REPLAY_STATE'; status: 'idle' | 'playing' | 'paused'; index: number }
  | { type: 'SELECT_EVENT'; index: number }
  | { type: 'SET_VIEW'; view: 'timeline' | 'diff' | 'code' }
  | { type: 'FILE_CONTENT'; requestId: string; content: string | undefined }
  | { type: 'DIFF_CONTENT'; requestId: string; diff?: DiffRecord; before?: string; after?: string }
  | { type: 'RECORDING_STATUS'; isRecording: boolean }
  | { type: 'ERROR'; message: string };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        initialized: true,
        projectName: action.payload.projectName,
        projectPath: action.payload.projectPath,
        events: action.payload.events,
        sessions: action.payload.sessions,
        checkpoints: action.payload.checkpoints,
        isRecording: action.payload.isRecording,
      };
    case 'EVENTS_UPDATED':
      return { ...state, events: action.events };
    case 'REPLAY_STATE':
      return { ...state, replayStatus: action.status, replayIndex: action.index, selectedEventIndex: action.index };
    case 'SELECT_EVENT':
      return { ...state, selectedEventIndex: action.index };
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'FILE_CONTENT': {
      const m = new Map(state.fileContentMap);
      if (action.content !== undefined) {
        m.set(action.requestId, action.content);
      }
      return { ...state, fileContentMap: m };
    }
    case 'DIFF_CONTENT': {
      const m = new Map(state.diffContentMap);
      m.set(action.requestId, { diff: action.diff, before: action.before, after: action.after });
      return { ...state, diffContentMap: m };
    }
    case 'RECORDING_STATUS':
      return { ...state, isRecording: action.isRecording };
    case 'ERROR':
      return { ...state, errorMessage: action.message };
    default:
      return state;
  }
}

const initialState: AppState = {
  initialized: false,
  projectName: '',
  projectPath: '',
  events: [],
  sessions: [],
  checkpoints: [],
  isRecording: false,
  replayStatus: 'idle',
  replayIndex: -1,
  selectedEventIndex: -1,
  view: 'timeline',
  fileContentMap: new Map(),
  diffContentMap: new Map(),
  errorMessage: undefined,
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function eventIcon(type: string): string {
  switch (type) {
    case 'FILE_CREATED': return '📄';
    case 'FILE_MODIFIED': return '✏️';
    case 'FILE_DELETED': return '🗑️';
    case 'FILE_RENAMED': return '↗️';
    case 'FILE_SAVED': return '💾';
    case 'GIT_COMMIT': return '🔖';
    case 'GIT_CHECKOUT': return '🌿';
    case 'CHECKPOINT_CREATED': return '📌';
    case 'SNAPSHOT_CREATED': return '📷';
    case 'SESSION_STARTED': return '▶️';
    case 'SESSION_ENDED': return '⏹️';
    default: return '•';
  }
}

function eventLabel(event: ParallaxEvent): string {
  const e = event as Record<string, unknown>;
  switch (event.type) {
    case 'FILE_CREATED': return `Created ${basename(e['filePath'] as string)}`;
    case 'FILE_MODIFIED': return `Modified ${basename(e['filePath'] as string)}`;
    case 'FILE_DELETED': return `Deleted ${basename(e['filePath'] as string)}`;
    case 'FILE_RENAMED': return `Renamed ${basename(e['oldPath'] as string)} → ${basename(e['newPath'] as string)}`;
    case 'FILE_SAVED': return `Saved ${basename(e['filePath'] as string)}`;
    case 'GIT_COMMIT': return `Commit: ${String(e['commitMessage'] ?? '').slice(0, 50)}`;
    case 'GIT_CHECKOUT': return `Checkout: ${e['fromBranch']} → ${e['toBranch']}`;
    case 'CHECKPOINT_CREATED': return `Checkpoint: ${e['name']}`;
    case 'SNAPSHOT_CREATED': return `Snapshot (${e['trigger']})`;
    case 'SESSION_STARTED': return 'Session started';
    case 'SESSION_ENDED': return 'Session ended';
    default: return event.type;
  }
}

function basename(p: string): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? p;
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export function App(): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pendingRequests = useRef<Map<string, (data: unknown) => void>>(new Map());
  const requestCounter = useRef(0);

  // Listen for messages from the extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as IncomingMessage;
      switch (msg.type) {
        case 'initialize':
          dispatch({ type: 'INIT', payload: msg });
          break;
        case 'eventsUpdated':
          dispatch({ type: 'EVENTS_UPDATED', events: msg.events });
          break;
        case 'replayState':
          dispatch({ type: 'REPLAY_STATE', status: msg.status, index: msg.currentIndex });
          break;
        case 'fileContent': {
          const cb = pendingRequests.current.get(msg.requestId);
          if (cb) {
            cb(msg);
            pendingRequests.current.delete(msg.requestId);
          }
          dispatch({ type: 'FILE_CONTENT', requestId: msg.requestId, content: msg.content });
          break;
        }
        case 'diffContent': {
          const cb = pendingRequests.current.get(msg.requestId);
          if (cb) {
            cb(msg);
            pendingRequests.current.delete(msg.requestId);
          }
          dispatch({
            type: 'DIFF_CONTENT',
            requestId: msg.requestId,
            diff: msg.diff,
            before: msg.beforeContent,
            after: msg.afterContent,
          });
          break;
        }
        case 'recordingStatus':
          dispatch({ type: 'RECORDING_STATUS', isRecording: msg.isRecording });
          break;
        case 'error':
          dispatch({ type: 'ERROR', message: msg.message });
          break;
      }
    };

    window.addEventListener('message', handler);
    postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const selectedEvent = state.selectedEventIndex >= 0
    ? state.events[state.selectedEventIndex]
    : undefined;

  if (!state.initialized) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner}>⟳</div>
        <p style={styles.muted}>Loading Parallax…</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <Header
        projectName={state.projectName}
        isRecording={state.isRecording}
        eventCount={state.events.length}
      />

      {/* View tabs */}
      <ViewTabs view={state.view} onChange={(v) => dispatch({ type: 'SET_VIEW', view: v })} />

      {/* Main content area */}
      <div style={styles.content}>
        {state.view === 'timeline' && (
          <TimelineView
            events={state.events}
            checkpoints={state.checkpoints}
            selectedIndex={state.selectedEventIndex}
            onSelect={(i) => dispatch({ type: 'SELECT_EVENT', index: i })}
          />
        )}
        {state.view === 'diff' && selectedEvent && (
          <DiffView event={selectedEvent} />
        )}
        {state.view === 'diff' && !selectedEvent && (
          <EmptyState message="Select a modification event in the Timeline to view its diff." />
        )}
        {state.view === 'code' && selectedEvent && (
          <CodeView event={selectedEvent} />
        )}
        {state.view === 'code' && !selectedEvent && (
          <EmptyState message="Select an event in the Timeline to view historical code." />
        )}
      </div>

      {/* Replay controls */}
      <ReplayControls
        status={state.replayStatus}
        currentIndex={state.replayIndex}
        total={state.events.length}
      />

      {/* Error banner */}
      {state.errorMessage && (
        <div style={styles.errorBanner}>{state.errorMessage}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  projectName,
  isRecording,
  eventCount,
}: {
  projectName: string;
  isRecording: boolean;
  eventCount: number;
}): React.ReactElement {
  return (
    <div style={styles.header}>
      <div style={styles.headerLeft}>
        <span style={styles.logo}>⏱</span>
        <span style={styles.projectName}>{projectName || 'Parallax'}</span>
      </div>
      <div style={styles.headerRight}>
        <span style={styles.eventCount}>{eventCount} events</span>
        <RecordingDot isRecording={isRecording} />
        {isRecording ? (
          <button style={styles.btnDanger} onClick={() => postMessage({ type: 'stopRecording' })}>
            Stop
          </button>
        ) : (
          <button style={styles.btnPrimary} onClick={() => postMessage({ type: 'startRecording' })}>
            Record
          </button>
        )}
      </div>
    </div>
  );
}

function RecordingDot({ isRecording }: { isRecording: boolean }): React.ReactElement {
  return (
    <span style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: isRecording ? '#f44' : '#555',
      marginRight: 6,
      boxShadow: isRecording ? '0 0 4px #f44' : 'none',
    }} />
  );
}

// ---------------------------------------------------------------------------
// View tabs
// ---------------------------------------------------------------------------

function ViewTabs({
  view,
  onChange,
}: {
  view: string;
  onChange: (v: 'timeline' | 'diff' | 'code') => void;
}): React.ReactElement {
  const tabs: Array<['timeline' | 'diff' | 'code', string]> = [
    ['timeline', 'Timeline'],
    ['diff', 'Diff'],
    ['code', 'Code'],
  ];
  return (
    <div style={styles.tabs}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          style={{ ...styles.tab, ...(view === id ? styles.tabActive : {}) }}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline view
// ---------------------------------------------------------------------------

function TimelineView({
  events,
  checkpoints,
  selectedIndex,
  onSelect,
}: {
  events: ParallaxEvent[];
  checkpoints: Checkpoint[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-index]');
      const target = items[selectedIndex] as HTMLElement | undefined;
      target?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (events.length === 0) {
    return (
      <EmptyState message="No events recorded yet. Start recording to begin capturing your development history." />
    );
  }

  const checkpointByTimestamp = new Map<string, Checkpoint>();
  for (const cp of checkpoints) {
    checkpointByTimestamp.set(cp.timestamp.slice(0, 19), cp);
  }

  return (
    <div ref={listRef} style={styles.timelineList}>
      {events.map((event, i) => {
        const isSelected = i === selectedIndex;
        const e = event as Record<string, unknown>;
        return (
          <div
            key={event.eventId}
            data-index={i}
            style={{
              ...styles.timelineItem,
              ...(isSelected ? styles.timelineItemSelected : {}),
            }}
            onClick={() => onSelect(i)}
          >
            <span style={styles.eventIcon}>{eventIcon(event.type)}</span>
            <div style={styles.eventInfo}>
              <span style={styles.eventLabel}>{eventLabel(event)}</span>
              <span style={styles.eventMeta}>{formatTimestamp(event.timestamp)}</span>
            </div>
            {event.type === 'FILE_MODIFIED' && (
              <span style={styles.statsBadge}>
                <span style={{ color: '#4a4' }}>+{String(e['linesAdded'] ?? 0)}</span>
                {' '}
                <span style={{ color: '#a44' }}>-{String(e['linesRemoved'] ?? 0)}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff view
// ---------------------------------------------------------------------------

function DiffView({ event }: { event: ParallaxEvent }): React.ReactElement {
  const e = event as Record<string, unknown>;
  const [diffData, setDiffData] = useState<{
    diff?: DiffRecord;
    before?: string;
    after?: string;
    loading: boolean;
    error?: string;
  }>({ loading: true });

  useEffect(() => {
    const diffId = e['diffId'] as string | undefined;
    if (!diffId || event.type !== 'FILE_MODIFIED') {
      setDiffData({ loading: false, error: 'No diff available for this event.' });
      return;
    }

    const requestId = `diff-${Date.now()}`;
    setDiffData({ loading: true });

    const handler = (ev: MessageEvent) => {
      const msg = ev.data as { type: string; requestId: string };
      if (msg.type === 'diffContent' && msg.requestId === requestId) {
        const d = ev.data as {
          diff?: DiffRecord;
          beforeContent?: string;
          afterContent?: string;
          error?: string;
        };
        setDiffData({
          loading: false,
          diff: d.diff,
          before: d.beforeContent,
          after: d.afterContent,
          error: d.error,
        });
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    postMessage({ type: 'getDiff', requestId, diffId });

    return () => window.removeEventListener('message', handler);
  }, [event.eventId]);

  if (diffData.loading) {
    return <div style={styles.centered}><span style={styles.muted}>Loading diff…</span></div>;
  }
  if (diffData.error || !diffData.diff) {
    return <EmptyState message={diffData.error ?? 'Diff not available.'} />;
  }

  const { diff, before = '', after = '' } = diffData;
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  return (
    <div style={styles.diffView}>
      <div style={styles.diffHeader}>
        <span style={styles.filePath}>{basename(diff.filePath)}</span>
        <span style={styles.diffMeta}>
          <span style={{ color: '#4a4' }}>+{diff.linesAdded}</span>
          {' '}
          <span style={{ color: '#a44' }}>-{diff.linesRemoved}</span>
          {' · '}
          {formatTimestamp(diff.timestamp)}
        </span>
      </div>
      <div style={styles.diffSplit}>
        <div style={styles.diffPane}>
          <div style={styles.diffPaneHeader}>Before</div>
          <pre style={styles.diffCode}>{before || '(empty)'}</pre>
        </div>
        <div style={styles.diffDivider} />
        <div style={styles.diffPane}>
          <div style={styles.diffPaneHeader}>After</div>
          <pre style={styles.diffCode}>{after || '(empty)'}</pre>
        </div>
      </div>
      <div style={styles.patchSection}>
        <div style={styles.diffPaneHeader}>Patch</div>
        <pre style={styles.patchCode}>
          {diff.patch.split('\n').map((line, i) => (
            <span
              key={i}
              style={{
                display: 'block',
                background: line.startsWith('+') && !line.startsWith('+++')
                  ? 'rgba(0,128,0,0.15)'
                  : line.startsWith('-') && !line.startsWith('---')
                  ? 'rgba(128,0,0,0.15)'
                  : undefined,
                color: line.startsWith('+') && !line.startsWith('+++')
                  ? '#6a6'
                  : line.startsWith('-') && !line.startsWith('---')
                  ? '#a66'
                  : undefined,
              }}
            >
              {line}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code view
// ---------------------------------------------------------------------------

function CodeView({ event }: { event: ParallaxEvent }): React.ReactElement {
  const e = event as Record<string, unknown>;
  const filePath = (e['filePath'] ?? e['newPath'] ?? '') as string;
  const [codeData, setCodeData] = useState<{
    content?: string;
    loading: boolean;
    error?: string;
  }>({ loading: true });

  useEffect(() => {
    if (!filePath) {
      setCodeData({ loading: false, error: 'No file path for this event.' });
      return;
    }

    const requestId = `code-${Date.now()}`;
    setCodeData({ loading: true });

    const handler = (ev: MessageEvent) => {
      const msg = ev.data as { type: string; requestId: string };
      if (msg.type === 'fileContent' && msg.requestId === requestId) {
        const d = ev.data as { content?: string; error?: string };
        setCodeData({ loading: false, content: d.content, error: d.error });
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    postMessage({ type: 'getFileContent', requestId, filePath, timestamp: event.timestamp });

    return () => window.removeEventListener('message', handler);
  }, [event.eventId]);

  if (codeData.loading) {
    return <div style={styles.centered}><span style={styles.muted}>Loading…</span></div>;
  }
  if (codeData.error || codeData.content === undefined) {
    return <EmptyState message={codeData.error ?? 'Content not available for this event.'} />;
  }

  return (
    <div style={styles.codeView}>
      <div style={styles.diffHeader}>
        <span style={styles.filePath}>{basename(filePath)}</span>
        <span style={styles.diffMeta}>
          Historical · {formatTimestamp(event.timestamp)}
        </span>
      </div>
      <pre style={styles.codeBlock}>{codeData.content}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Replay controls
// ---------------------------------------------------------------------------

function ReplayControls({
  status,
  currentIndex,
  total,
}: {
  status: 'idle' | 'playing' | 'paused';
  currentIndex: number;
  total: number;
}): React.ReactElement {
  const pct = total > 0 ? Math.round((currentIndex / (total - 1)) * 100) : 0;

  return (
    <div style={styles.replayBar}>
      <button
        style={styles.replayBtn}
        onClick={() => postMessage({ type: 'replayStepBackward' })}
        title="Previous"
      >
        ⏮
      </button>
      {status === 'playing' ? (
        <button
          style={styles.replayBtn}
          onClick={() => postMessage({ type: 'replayPause' })}
          title="Pause"
        >
          ⏸
        </button>
      ) : (
        <button
          style={styles.replayBtn}
          onClick={() => postMessage({ type: 'replayPlay' })}
          title="Play"
        >
          ▶
        </button>
      )}
      <button
        style={styles.replayBtn}
        onClick={() => postMessage({ type: 'replayStepForward' })}
        title="Next"
      >
        ⏭
      </button>
      <div style={styles.scrubberTrack}>
        <div style={{ ...styles.scrubberFill, width: `${pct}%` }} />
      </div>
      <span style={styles.replayCounter}>
        {total > 0 ? `${currentIndex + 1} / ${total}` : '–'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <div style={styles.emptyState}>
      <span style={styles.emptyIcon}>📭</span>
      <p style={styles.muted}>{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (VS Code variable-based for theme compatibility)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--vscode-editor-background)',
    color: 'var(--vscode-foreground)',
    fontSize: 12,
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 8,
  },
  spinner: {
    fontSize: 24,
    animation: 'spin 1s linear infinite',
  },
  muted: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: 11,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBar-background)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    overflow: 'hidden',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  logo: { fontSize: 14 },
  projectName: {
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 120,
  },
  eventCount: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: 10,
    marginRight: 4,
  },
  btnPrimary: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: 3,
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: 11,
  },
  btnDanger: {
    background: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: 3,
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: 11,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBar-background)',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: '5px 0',
    border: 'none',
    background: 'none',
    color: 'var(--vscode-descriptionForeground)',
    cursor: 'pointer',
    fontSize: 11,
    borderBottom: '2px solid transparent',
    transition: 'color 0.15s',
  },
  tabActive: {
    color: 'var(--vscode-foreground)',
    borderBottom: '2px solid var(--vscode-focusBorder)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0,
  },
  timelineList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '4px 0',
  },
  timelineItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 10px',
    cursor: 'pointer',
    borderLeft: '2px solid transparent',
    gap: 6,
    transition: 'background 0.1s',
  },
  timelineItemSelected: {
    background: 'var(--vscode-list-activeSelectionBackground)',
    color: 'var(--vscode-list-activeSelectionForeground)',
    borderLeft: '2px solid var(--vscode-focusBorder)',
  },
  eventIcon: { fontSize: 12, flexShrink: 0 },
  eventInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    flex: 1,
  },
  eventLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 11,
  },
  eventMeta: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: 10,
  },
  statsBadge: {
    fontSize: 10,
    flexShrink: 0,
  },
  diffView: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  diffHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderBottom: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
    background: 'var(--vscode-sideBar-background)',
  },
  filePath: {
    fontWeight: 600,
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  diffMeta: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: 10,
    flexShrink: 0,
    marginLeft: 8,
  },
  diffSplit: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  diffPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    minWidth: 0,
  },
  diffPaneHeader: {
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 600,
    background: 'var(--vscode-sideBar-background)',
    borderBottom: '1px solid var(--vscode-panel-border)',
    flexShrink: 0,
    color: 'var(--vscode-descriptionForeground)',
  },
  diffCode: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: 11,
    padding: 8,
    margin: 0,
    overflow: 'auto',
    whiteSpace: 'pre',
    flex: 1,
  },
  diffDivider: {
    width: 1,
    background: 'var(--vscode-panel-border)',
    flexShrink: 0,
  },
  patchSection: {
    borderTop: '1px solid var(--vscode-panel-border)',
    maxHeight: 200,
    overflow: 'auto',
    flexShrink: 0,
  },
  patchCode: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: 10,
    padding: 8,
    margin: 0,
    overflow: 'auto',
    whiteSpace: 'pre',
  },
  codeView: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  codeBlock: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: 11,
    padding: 10,
    margin: 0,
    overflow: 'auto',
    whiteSpace: 'pre',
    flex: 1,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 8,
    padding: 20,
    textAlign: 'center',
  },
  emptyIcon: { fontSize: 24 },
  replayBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    gap: 4,
    borderTop: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBar-background)',
    flexShrink: 0,
  },
  replayBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--vscode-foreground)',
    cursor: 'pointer',
    padding: '2px 4px',
    fontSize: 13,
    borderRadius: 2,
  },
  scrubberTrack: {
    flex: 1,
    height: 4,
    background: 'var(--vscode-scrollbarSlider-background)',
    borderRadius: 2,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  scrubberFill: {
    height: '100%',
    background: 'var(--vscode-focusBorder)',
    borderRadius: 2,
    transition: 'width 0.1s',
  },
  replayCounter: {
    fontSize: 10,
    color: 'var(--vscode-descriptionForeground)',
    minWidth: 40,
    textAlign: 'right',
  },
  errorBanner: {
    background: 'var(--vscode-inputValidation-errorBackground)',
    color: 'var(--vscode-inputValidation-errorForeground)',
    padding: '4px 10px',
    fontSize: 11,
    borderTop: '1px solid var(--vscode-inputValidation-errorBorder)',
    flexShrink: 0,
  },
};
