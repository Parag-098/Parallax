/**
 * Minimal types re-exported for the webview bundle.
 * The webview cannot import from src/events/types.ts directly because that
 * module may pull in Node/VS Code globals at build time.
 * All types here are plain data — no VS Code dependencies.
 */

export type ParallaxEventTypeString =
  | 'PROJECT_OPENED'
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'FILE_CREATED'
  | 'FILE_MODIFIED'
  | 'FILE_DELETED'
  | 'FILE_RENAMED'
  | 'FILE_SAVED'
  | 'GIT_COMMIT'
  | 'GIT_CHECKOUT'
  | 'CHECKPOINT_CREATED'
  | 'SNAPSHOT_CREATED';

export interface BaseParallaxEvent {
  eventId: string;
  projectId: string;
  sessionId: string | undefined;
  timestamp: string;
  type: ParallaxEventTypeString;
  source: 'user' | 'system' | 'git';
  actor: string;
  metadata?: Record<string, unknown>;
}

export interface FileModifiedEvent extends BaseParallaxEvent {
  type: 'FILE_MODIFIED';
  filePath: string;
  beforeHash: string;
  afterHash: string;
  diffId: string | undefined;
  linesAdded: number;
  linesRemoved: number;
}

export interface FileSavedEvent extends BaseParallaxEvent {
  type: 'FILE_SAVED';
  filePath: string;
  contentHash: string;
  sizeBytes: number;
}

export type ParallaxEvent = BaseParallaxEvent & Record<string, unknown>;

export interface Session {
  sessionId: string;
  projectId: string;
  startTime: string;
  endTime: string | undefined;
  eventCount: number;
}

export interface Checkpoint {
  checkpointId: string;
  projectId: string;
  sessionId: string | undefined;
  name: string;
  description: string;
  timestamp: string;
  snapshotId: string | undefined;
  gitCommitHash: string | undefined;
  gitBranch: string | undefined;
}

export interface DiffRecord {
  diffId: string;
  filePath: string;
  projectId: string;
  timestamp: string;
  beforeHash: string;
  afterHash: string;
  patch: string;
  linesAdded: number;
  linesRemoved: number;
}
