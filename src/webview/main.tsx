import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { diffLines } from 'diff';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

type EventRow = {
 id: string; sequence: number; timestamp: number; kind: string; path?: string; oldPath?: string;
 name?: string; contentHash?: string; previousHash?: string; metadata?: Record<string, string>;
};
type SessionRow = { id: string; startedAt: number; endedAt?: number };
type CheckpointRow = { id: string; name: string; sequence: number; timestamp: number };
type Comparison = { before: string; after: string; diff: { patch: string; added: number; removed: number }; baseTimestamp: number; timestamp: number; path?: string };
type DiffLine = { text: string; kind: 'same' | 'added' | 'removed' | 'empty' };

const eventIcon: Record<string, string> = {
 create: '+', modify: '±', save: '↥', delete: '−', rename: '↗', checkpoint: '◆',
 'git-commit': '●', 'git-checkout': '⑂', 'git-head': '⑂', 'session-start': '◷',
 'session-end': '◴', 'workspace-baseline': '▤', snapshot: '◈',
};
const prettyKind: Record<string, string> = {
 create: 'Created', modify: 'Changed', save: 'Saved', delete: 'Deleted', rename: 'Renamed',
 checkpoint: 'Checkpoint', 'git-commit': 'Git commit', 'git-checkout': 'Git checkout',
 'git-head': 'Git HEAD changed', 'session-start': 'Session started', 'session-end': 'Session ended',
 'workspace-baseline': 'Workspace baseline', snapshot: 'Snapshot',
};
const dateTime = (timestamp: number): string => new Date(timestamp).toLocaleString();
const shortTime = (timestamp: number): string => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dateLabel = (timestamp: number): string => new Date(timestamp).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fileName = (value?: string): string => value?.split('/').filter(Boolean).at(-1) ?? '';

function alignDiff(before: string, after: string): { left: DiffLine[]; right: DiffLine[] } {
 const changes = diffLines(before, after), left: DiffLine[] = [], right: DiffLine[] = [];
 const splitLines = (value: string): string[] => { const lines = value.split('\n'); if (value.endsWith('\n')) lines.pop(); return lines; };
 for (let index = 0; index < changes.length;) {
  const part = changes[index]!;
  if (!part.added && !part.removed) {
   for (const line of splitLines(part.value)) {
    left.push({ text: line, kind: 'same' }); right.push({ text: line, kind: 'same' });
   }
   index++; continue;
  }
  const removed: string[] = [], added: string[] = [];
  while (index < changes.length && (changes[index]!.added || changes[index]!.removed)) {
   const change = changes[index]!, lines = splitLines(change.value);
   (change.added ? added : removed).push(...lines); index++;
  }
  const rows = Math.max(removed.length, added.length);
  for (let row = 0; row < rows; row++) {
   const oldLine = removed[row], newLine = added[row];
   left.push(oldLine === undefined ? { text: '', kind: 'empty' } : { text: oldLine, kind: 'removed' });
   right.push(newLine === undefined ? { text: '', kind: 'empty' } : { text: newLine, kind: 'added' });
  }
 }
 return { left, right };
}

function App(): React.JSX.Element {
 const [events, setEvents] = React.useState<EventRow[]>([]);
 const [sessions, setSessions] = React.useState<SessionRow[]>([]);
 const [checkpoints, setCheckpoints] = React.useState<CheckpointRow[]>([]);
 const [sessionId, setSessionId] = React.useState('');
 const [activeSessionId, setActiveSessionId] = React.useState<string>();
 const [projectName, setProjectName] = React.useState('Workspace');
 const [content, setContent] = React.useState('Choose a session and select a file event.');
 const [selected, setSelected] = React.useState(0);
 const [playing, setPlaying] = React.useState(false);
 const [baseSequence, setBaseSequence] = React.useState('');
 const [pendingSequence, setPendingSequence] = React.useState<number>();
 const [comparison, setComparison] = React.useState<Comparison>();
 const [recording, setRecordingState] = React.useState(false);
 const [notice, setNotice] = React.useState<{ message: string; error: boolean }>();
 const [copied, setCopied] = React.useState(false);
 const [checkpointFiles, setCheckpointFiles] = React.useState<string[]>([]);
 const [checkpointSequence, setCheckpointSequence] = React.useState<number>();
 const [checkpointPath, setCheckpointPath] = React.useState('');
 const [hasOlder, setHasOlder] = React.useState(false);
 const [loadingOlder, setLoadingOlder] = React.useState(false);
 const [now, setNow] = React.useState(Date.now());
 const selectedEventId = React.useRef<string>();
 const selectedEventRef = React.useRef<EventRow>();
 const viewedSessionRef = React.useRef('');
 const checkpointRequestRef = React.useRef(0);
 const requestedContent = React.useRef<{ sessionId: string; sequence: number; path: string }>();
 const requestedComparison = React.useRef<{ sessionId: string; baseSequence: number; sequence: number; path: string }>();

 React.useEffect(() => {
  const receive = (event: MessageEvent<unknown>): void => {
   if (!event.data || typeof event.data !== 'object') return;
   const message = event.data as Record<string, unknown>;
   const expectedComparison = requestedComparison.current, selectedEvent = selectedEventRef.current;
   if (message.type === 'history') {
    const incomingSessionId = typeof message.viewedSessionId === 'string' ? message.viewedSessionId : '';
    if (incomingSessionId !== viewedSessionRef.current) checkpointRequestRef.current++;
    viewedSessionRef.current = incomingSessionId;
    requestedContent.current = undefined; requestedComparison.current = undefined; setNotice(undefined); setCopied(false);
    const rows = Array.isArray(message.events) ? (message.events as EventRow[]).slice().sort((a, b) => a.sequence - b.sequence) : [];
    setEvents(rows); setHasOlder(message.hasMore === true); setLoadingOlder(false);
    setSessions(Array.isArray(message.sessions) ? message.sessions as SessionRow[] : []);
    setCheckpoints(Array.isArray(message.checkpoints) ? message.checkpoints as CheckpointRow[] : []);
    if (typeof message.viewedSessionId === 'string') setSessionId(message.viewedSessionId);
    if (typeof message.activeSessionId === 'string') setActiveSessionId(message.activeSessionId); else setActiveSessionId(undefined);
    if (typeof message.projectName === 'string' && message.projectName.trim()) setProjectName(message.projectName);
    if (typeof message.recording === 'boolean') setRecordingState(message.recording);
    setSelected(Math.max(0, rows.length - 1)); setCheckpointSequence(undefined); setCheckpointFiles([]);
    setCheckpointPath(''); setComparison(undefined); setBaseSequence('');
    setContent(rows.length ? 'Select a historical event to inspect its recorded contents.' : 'No recorded events in this session.');
   } else if (typeof message.sessionId === 'string' && message.sessionId !== viewedSessionRef.current) return;
   else if (message.type === 'older-events') {
    if (typeof message.sessionId !== 'string' || message.sessionId !== viewedSessionRef.current) return;
    const older = Array.isArray(message.events) ? message.events as EventRow[] : [];
    setEvents(previous => {
     const currentId = selectedEventId.current;
     const merged = [...older, ...previous].sort((a, b) => a.sequence - b.sequence);
     const keepIndex = currentId ? merged.findIndex(item => item.id === currentId) : Math.max(0, older.length - 1);
     setSelected(Math.max(0, keepIndex)); return merged;
    });
    setHasOlder(message.hasMore === true); setLoadingOlder(false);
   } else if (message.type === 'checkpoint-files' && typeof message.sessionId === 'string' && message.sessionId === viewedSessionRef.current && message.requestId === checkpointRequestRef.current && typeof message.sequence === 'number' && Array.isArray(message.files)) {
    setCheckpointSequence(message.sequence); setCheckpointFiles(message.files.filter((item): item is string => typeof item === 'string')); setCheckpointPath('');
   } else if (message.type === 'content' && typeof message.sessionId === 'string' && message.sessionId === viewedSessionRef.current && typeof message.content === 'string' && typeof message.sequence === 'number' && typeof message.path === 'string' && requestedContent.current?.sessionId === message.sessionId && requestedContent.current.sequence === message.sequence && requestedContent.current.path === message.path) setContent(message.content);
   else if (message.type === 'restore-result' && typeof message.message === 'string') setNotice({ message: message.message, error: false });
   else if (message.type === 'comparison' && typeof message.sessionId === 'string' && message.sessionId === viewedSessionRef.current && typeof message.before === 'string' && typeof message.after === 'string' && message.diff && typeof message.diff === 'object' && expectedComparison && expectedComparison.sessionId === message.sessionId && expectedComparison.sequence === message.sequence && expectedComparison.baseSequence === message.baseSequence && expectedComparison.path === message.path && selectedEvent?.sequence === message.sequence) {
    setComparison({ before: message.before, after: message.after, diff: message.diff as Comparison['diff'], baseTimestamp: typeof message.baseTimestamp === 'number' ? message.baseTimestamp : 0, timestamp: typeof message.timestamp === 'number' ? message.timestamp : 0, path: typeof message.path === 'string' ? message.path : undefined });
   } else if (message.type === 'error' && typeof message.message === 'string') { setNotice({ message: message.message, error: true }); if (requestedContent.current) setContent('Historical content is unavailable at this point.'); }
   else if (message.type === 'select-sequence' && typeof message.sessionId === 'string' && message.sessionId === viewedSessionRef.current && message.requestId === checkpointRequestRef.current && typeof message.sequence === 'number') setPendingSequence(message.sequence);
  };
  window.addEventListener('message', receive); vscode.postMessage({ type: 'refresh' });
  return () => window.removeEventListener('message', receive);
 }, []);

 React.useEffect(() => { if (pendingSequence === undefined) return; const index = events.findIndex(item => item.sequence === pendingSequence); if (index >= 0) { setSelected(index); setPendingSequence(undefined); } }, [pendingSequence, events]);
 React.useEffect(() => { selectedEventId.current = events[selected]?.id; selectedEventRef.current = events[selected]; }, [events, selected]);
 React.useEffect(() => {
  const item = events[selected];
  setNotice(undefined); setComparison(undefined); requestedComparison.current = undefined;
  if (!item?.path) { requestedContent.current = undefined; setComparison(undefined); if (item) setContent('This event has no recorded file contents.'); return; }
  requestedContent.current = { sessionId: viewedSessionRef.current, sequence: item.sequence, path: item.path };
  setContent('Loading historical contents…');
  vscode.postMessage({ type: 'inspect', sessionId: viewedSessionRef.current, sequence: item.sequence, path: item.path });
 }, [selected, events]);
 React.useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(interval); }, []);
 React.useEffect(() => {
  if (!playing) return;
  const timer = window.setInterval(() => setSelected(index => {
   if (index >= events.length - 1) { setPlaying(false); return index; }
   return index + 1;
  }), 700);
  return () => window.clearInterval(timer);
 }, [playing, events.length]);

 const current = events[selected];
 const candidates = current?.path ? events.filter(item => item.path === current.path && item.sequence < current.sequence) : [];
 const orderedCheckpoints = checkpoints.slice().sort((a, b) => a.sequence - b.sequence);
 const session = sessions.find(item => item.id === sessionId);
 const duration = session ? Math.max(0, (session.endedAt ?? now) - session.startedAt) : 0;
 const durationText = `${Math.floor(duration / 3_600_000)}h ${Math.floor(duration / 60_000) % 60}m`;
 const aligned = comparison ? alignDiff(comparison.before, comparison.after) : undefined;

 const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
  const target = event.target as HTMLElement;
  if (target.classList.contains('event-row') && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
   event.preventDefault(); const next = Math.max(0, Math.min(events.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)));
   setSelected(next); document.getElementById(`event-${events[next]?.id}`)?.focus(); return;
  }
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => Math.max(0, index - 1)); }
  if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(index => Math.min(events.length - 1, index + 1)); }
  if (event.key === ' ') { event.preventDefault(); setPlaying(value => !value); }
 };
 const copyHistorical = async (): Promise<void> => {
  try { if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this webview'); await navigator.clipboard.writeText(content); setCopied(true); setNotice({ message: 'Historical contents copied to clipboard.', error: false }); window.setTimeout(() => setCopied(false), 1500); }
  catch { setCopied(false); setNotice({ message: 'Could not copy historical contents. Check webview clipboard permissions.', error: true }); }
 };

 return <main className="app" onKeyDown={onKeyDown}>
  <header className="app-header">
   <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
   <div className="brand-copy"><strong>Parallax</strong><span title={projectName}>{projectName}</span></div>
   <div className={`recording-state ${recording ? 'is-recording' : ''}`} role="status" aria-live="polite">
    <span className="status-dot" aria-hidden="true" />{recording ? 'Recording' : 'Paused'}
   </div>
   <button className="icon-button settings-button" title="Open Parallax settings" aria-label="Open Parallax settings" onClick={() => vscode.postMessage({ type: 'open-settings' })}>⚙</button>
  </header>

  <section className="session-bar" aria-label="History controls">
   <label className="field session-field"><span>Session</span><select aria-label="Session" value={sessionId} onChange={event => { setSessionId(event.target.value); vscode.postMessage({ type: 'open-session', sessionId: event.target.value }); }}>
    {sessions.map(item => <option key={item.id} value={item.id}>{new Date(item.startedAt).toLocaleString()} · {item.endedAt ? 'ended' : item.id === activeSessionId ? 'active here' : 'open or interrupted'}</option>)}
    {!sessions.length && <option value="">No sessions yet</option>}
   </select></label>
   <div className="session-summary"><span>{session ? `${events.length}${hasOlder ? '+' : ''} events loaded` : 'History ready'}</span>{recording && session && <span className="duration">{durationText}</span>}</div>
   <button className="record-button" aria-pressed={recording} onClick={() => vscode.postMessage({ type: 'recording', enabled: !recording })}><span aria-hidden="true">{recording ? 'Ⅱ' : '●'}</span>{recording ? 'Stop' : 'Start'}</button>
   <button className="icon-button refresh-button" title="Refresh history" aria-label="Refresh history" onClick={() => vscode.postMessage({ type: 'refresh' })}>↻</button>
  </section>

  {notice && <div className={`notice ${notice.error ? 'notice-error' : ''}`} role="status" aria-live="polite"><span>{notice.error ? '!' : '✓'}</span>{notice.message}<button aria-label="Dismiss notification" onClick={() => setNotice(undefined)}>×</button></div>}

  <section className="timeline-toolbar" aria-label="Timeline navigation">
   <div className="replay-controls">
    <button className="icon-button" aria-label="Previous event" title="Previous event (↑)" disabled={selected <= 0} onClick={() => setSelected(index => Math.max(0, index - 1))}>‹</button>
    <button className="play-button" aria-label={playing ? 'Pause replay' : 'Play replay'} title="Play or pause (Space)" disabled={!events.length} onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
    <button className="icon-button" aria-label="Next event" title="Next event (↓)" disabled={selected >= events.length - 1} onClick={() => setSelected(index => Math.min(events.length - 1, index + 1))}>›</button>
   </div>
   <input className="scrubber" aria-label="Replay position" type="range" min="0" max={Math.max(0, events.length - 1)} value={selected} disabled={!events.length} onChange={event => setSelected(Number(event.target.value))} />
   <span className="position-label" aria-live="polite">{events.length ? `${selected + 1} / ${events.length}${hasOlder ? '+' : ''}` : '—'}</span>
  </section>

  <div className="workspace-grid">
   <section className="history-pane" aria-label="Development timeline">
    <div className="pane-heading"><div><h1>History</h1><span>{session ? `Started ${dateTime(session.startedAt)}` : 'Your project, over time'}</span></div>
     <label className="field checkpoint-field"><span>Checkpoint</span><select aria-label="Checkpoint" value="" onChange={event => { if (event.target.value) vscode.postMessage({ type: 'open-checkpoint', checkpointId: event.target.value, requestId: ++checkpointRequestRef.current }); }}><option value="">Jump to…</option>{orderedCheckpoints.map(item => <option key={item.id} value={item.id}>{item.name} · {dateTime(item.timestamp)}</option>)}</select></label>
    </div>
    {checkpointSequence !== undefined && <div className="checkpoint-jump"><span>Checkpoint files</span><select aria-label="Checkpoint file" value={checkpointPath} onChange={event => { setCheckpointPath(event.target.value); if (event.target.value) vscode.postMessage({ type: 'inspect', sessionId, sequence: checkpointSequence, path: event.target.value }); }}><option value="">Choose a file…</option>{checkpointFiles.map(item => <option key={item} value={item}>{item}</option>)}</select></div>}
    {hasOlder && <button className="load-older" disabled={loadingOlder} onClick={() => { setLoadingOlder(true); vscode.postMessage({ type: 'load-older', sessionId, beforeSequence: events[0]?.sequence ?? Number.MAX_SAFE_INTEGER }); }}>{loadingOlder ? <><span className="spinner" aria-hidden="true" />Loading older history…</> : 'Load older events'}</button>}
    <div className="timeline" role="listbox" aria-label="Recorded events" aria-activedescendant={current ? `event-${current.id}` : undefined}>
     {events.map((item, index) => {
      const previous = events[index - 1], newDate = !previous || dateLabel(previous.timestamp) !== dateLabel(item.timestamp);
      return <React.Fragment key={item.id}>
       {newDate && <div className="date-divider"><span>{dateLabel(item.timestamp)}</span></div>}
       <button id={`event-${item.id}`} role="option" aria-posinset={index + 1} aria-setsize={events.length} aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} className={`event-row ${index === selected ? 'selected' : ''}`} onClick={() => { setSelected(index); setPlaying(false); }}>
        <span className={`event-glyph glyph-${item.kind}`} aria-hidden="true">{eventIcon[item.kind] ?? '·'}</span>
        <span className="event-copy"><span className="event-title">{prettyKind[item.kind] ?? item.kind}</span><span className="event-path" title={item.oldPath ? `${item.oldPath} → ${item.path ?? ''}` : item.path ?? item.name}>{item.path ? fileName(item.path) : item.name ?? item.metadata?.repository ?? (item.oldPath ? `${fileName(item.oldPath)} → ${fileName(item.path)}` : item.kind === 'git-commit' ? item.metadata?.commit?.slice(0, 8) : item.kind)}</span></span>
        <time className="event-time" dateTime={new Date(item.timestamp).toISOString()} title={dateTime(item.timestamp)}>{shortTime(item.timestamp)}</time>
       </button>
      </React.Fragment>;
     })}
     {!events.length && <div className="empty-state"><div className="empty-mark" aria-hidden="true">◷</div><h2>{sessions.length ? 'No events in this session' : 'Start your development history'}</h2><p>{sessions.length ? 'Choose another session or refresh to check for new activity.' : 'Parallax keeps a local record of eligible text-file changes as you work.'}</p>{!recording && <button className="primary-button" onClick={() => vscode.postMessage({ type: 'recording', enabled: true })}>Start recording</button>}</div>}
    </div>
   </section>

   <section className="detail-pane" aria-label="Selected historical event">
    {current ? <>
     <div className="detail-heading"><div className="detail-kind"><span className={`event-glyph glyph-${current.kind}`} aria-hidden="true">{eventIcon[current.kind] ?? '·'}</span><span>{prettyKind[current.kind] ?? current.kind}</span></div><time dateTime={new Date(current.timestamp).toISOString()}>{dateTime(current.timestamp)}</time></div>
     <div className="file-heading"><div className="file-icon" aria-hidden="true">{current.path?.endsWith('.ts') ? 'TS' : current.path?.endsWith('.js') ? 'JS' : '▤'}</div><div className="file-heading-copy"><strong title={current.path ?? current.name}>{current.path ?? current.name ?? 'Workspace event'}</strong>{current.oldPath && <span>Renamed from {current.oldPath}</span>}</div></div>
     {current.path ? <div className="viewer-actions">
      <label className="field compare-field"><span>Compare from</span><select aria-label="Compare from" value={baseSequence} onChange={event => setBaseSequence(event.target.value)}><option value="">Choose a version…</option>{candidates.map(item => <option key={item.id} value={item.sequence}>{prettyKind[item.kind] ?? item.kind} · {dateTime(item.timestamp)}</option>)}{orderedCheckpoints.map(item => <option key={item.id} value={`c:${item.sequence}`}>{item.name} · {dateTime(item.timestamp)}</option>)}</select></label>
      <button className="secondary-button" disabled={!baseSequence} onClick={() => { const request = { sessionId, baseSequence: Number(baseSequence.replace('c:', '')), sequence: current.sequence, path: current.path! }; requestedComparison.current = request; vscode.postMessage({ type: 'compare', ...request }); }}>Compare</button>
      <button className="text-button" disabled={!content || content.startsWith('Choose a session') || content.startsWith('Loading historical')} onClick={() => { void copyHistorical(); }}>{copied ? 'Copied' : 'Copy'}</button>
      <button className="text-button" onClick={() => vscode.postMessage({ type: 'open-history', sessionId, sequence: current.sequence, path: current.path })}>Open in Editor</button>
     </div> : <div className="event-metadata">{current.name && <span>{current.name}</span>}{current.metadata?.commit && <span>Commit <code>{current.metadata.commit.slice(0, 12)}</code></span>}{current.metadata?.ref && <span>Ref <code>{current.metadata.ref}</code></span>}{current.metadata?.repository && <span>Repository <code>{current.metadata.repository}</code></span>}</div>}
     {current.path && <div className="history-note"><span className="history-badge">HISTORICAL VERSION</span><span>Read-only · {dateTime(current.timestamp)}</span></div>}
     <div className="code-frame"><div className="code-toolbar"><span>{fileName(current.path) || 'Event details'}</span><span className="read-only-label">Recorded content</span></div><pre className="code-view" aria-label="Historical file contents"><code>{content}</code></pre></div>
     {current.path && <div className="restore-actions"><button className="restore-button" onClick={() => vscode.postMessage({ type: 'restore', sessionId, sequence: current.sequence, path: current.path })}>Preview file restore…</button><button className="text-button" onClick={() => vscode.postMessage({ type: 'restore-workspace', sessionId, sequence: current.sequence })}>Preview workspace restore…</button></div>}
     <details className="advanced-details"><summary>Event details</summary><dl>
      <div><dt>Sequence</dt><dd>{current.sequence}</dd></div><div><dt>Session</dt><dd>{session?.id.slice(0, 8) ?? '—'}</dd></div>
      {current.previousHash && <div><dt>Previous fingerprint</dt><dd><code>{current.previousHash}</code></dd></div>}{current.contentHash && <div><dt>Content fingerprint</dt><dd><code>{current.contentHash}</code></dd></div>}
     </dl></details>
     {comparison && aligned && <section className="comparison-panel" aria-label="Historical comparison"><div className="comparison-heading"><div><span className="eyebrow">Historical comparison</span><h2>{comparison.path ?? current.path}</h2></div><span className="change-count"><b>+{comparison.diff.added}</b> <b>−{comparison.diff.removed}</b></span></div>
      <div className="comparison-labels"><span><i className="diff-dot removed-dot" />Previous · {comparison.baseTimestamp ? dateTime(comparison.baseTimestamp) : 'Checkpoint'}</span><span><i className="diff-dot added-dot" />Selected · {comparison.timestamp ? dateTime(comparison.timestamp) : dateTime(current.timestamp)}</span></div>
      <div className="comparison"><DiffColumn title="Previous" lines={aligned.left} /><DiffColumn title="Selected" lines={aligned.right} /></div><details className="unified-details"><summary>View unified diff</summary><pre>{comparison.diff.patch}</pre></details>
     </section>}
    </> : <div className="empty-detail"><div className="empty-mark" aria-hidden="true">⌁</div><h2>Choose a point in history</h2><p>Select a file event to inspect its recorded version. Replay is read-only and never changes your workspace.</p></div>}
   </section>
  </div>
 </main>;
}

function DiffColumn({ title, lines }: { title: string; lines: DiffLine[] }): React.JSX.Element {
 return <div className="diff-column"><div className="diff-column-title">{title}</div><pre>{lines.map((line, index) => <div className={`diff-line ${line.kind}`} key={index}><span className="line-number">{line.kind === 'empty' ? '' : index + 1}</span><span className="line-sign">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span><code>{line.text || ' '}</code></div>)}</pre></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
