/**
 * Core event types for Parallax.
 * Every development activity is represented as a typed event in an append-only stream.
 */

// ---------------------------------------------------------------------------
// Event type enumeration
// ---------------------------------------------------------------------------

export const enum ParallaxEventType {
  // Lifecycle
  PROJECT_OPENED = 'PROJECT_OPENED',
  SESSION_STARTED = 'SESSION_STARTED',
  SESSION_ENDED = 'SESSION_ENDED',

  // File activity
  FILE_CREATED = 'FILE_CREATED',
  FILE_MODIFIED = 'FILE_MODIFIED',
  FILE_DELETED = 'FILE_DELETED',
  FILE_RENAMED = 'FILE_RENAMED',
  FILE_SAVED = 'FILE_SAVED',

  // Git
  GIT_COMMIT = 'GIT_COMMIT',
  GIT_CHECKOUT = 'GIT_CHECKOUT',

  // User milestones
  CHECKPOINT_CREATED = 'CHECKPOINT_CREATED',
  SNAPSHOT_CREATED = 'SNAPSHOT_CREATED',
}

// String union for serialization/deserialization
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

// ---------------------------------------------------------------------------
// Base event
// ---------------------------------------------------------------------------

export interface BaseParallaxEvent {
  /** Globally unique event identifier (UUID v4) */
  eventId: string;
  /** Project identifier derived from workspace root */
  projectId: string;
  /** Session identifier – undefined for events outside a session */
  sessionId: string | undefined;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Discriminator */
  type: ParallaxEventTypeString;
  /** Where the event came from: 'user' | 'system' | 'git' */
  source: 'user' | 'system' | 'git';
  /** Human actor identifier – typically a username or 'system' */
  actor: string;
  /** Arbitrary extensible metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------

export interface ProjectOpenedEvent extends BaseParallaxEvent {
  type: 'PROJECT_OPENED';
  projectPath: string;
  projectName: string;
}

export interface SessionStartedEvent extends BaseParallaxEvent {
  type: 'SESSION_STARTED';
  sessionId: string;
}

export interface SessionEndedEvent extends BaseParallaxEvent {
  type: 'SESSION_ENDED';
  sessionId: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// File events
// ---------------------------------------------------------------------------

export interface FileCreatedEvent extends BaseParallaxEvent {
  type: 'FILE_CREATED';
  filePath: string;
  afterHash: string;
  sizeBytes: number;
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

export interface FileDeletedEvent extends BaseParallaxEvent {
  type: 'FILE_DELETED';
  filePath: string;
  beforeHash: string;
}

export interface FileRenamedEvent extends BaseParallaxEvent {
  type: 'FILE_RENAMED';
  oldPath: string;
  newPath: string;
  contentHash: string;
}

export interface FileSavedEvent extends BaseParallaxEvent {
  type: 'FILE_SAVED';
  filePath: string;
  contentHash: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Git events
// ---------------------------------------------------------------------------

export interface GitCommitEvent extends BaseParallaxEvent {
  type: 'GIT_COMMIT';
  commitHash: string;
  commitMessage: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  filesChanged: number;
}

export interface GitCheckoutEvent extends BaseParallaxEvent {
  type: 'GIT_CHECKOUT';
  fromBranch: string;
  toBranch: string;
  commitHash: string;
}

// ---------------------------------------------------------------------------
// Checkpoint / snapshot events
// ---------------------------------------------------------------------------

export interface CheckpointCreatedEvent extends BaseParallaxEvent {
  type: 'CHECKPOINT_CREATED';
  checkpointId: string;
  name: string;
  description: string;
  snapshotId: string | undefined;
  gitCommitHash: string | undefined;
  gitBranch: string | undefined;
}

export interface SnapshotCreatedEvent extends BaseParallaxEvent {
  type: 'SNAPSHOT_CREATED';
  snapshotId: string;
  fileCount: number;
  totalSizeBytes: number;
  trigger: 'auto' | 'manual' | 'checkpoint';
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type ParallaxEvent =
  | ProjectOpenedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | FileCreatedEvent
  | FileModifiedEvent
  | FileDeletedEvent
  | FileRenamedEvent
  | FileSavedEvent
  | GitCommitEvent
  | GitCheckoutEvent
  | CheckpointCreatedEvent
  | SnapshotCreatedEvent;

// ---------------------------------------------------------------------------
// Supporting domain types
// ---------------------------------------------------------------------------

export interface Project {
  projectId: string;
  name: string;
  rootPath: string;
  createdAt: string;
  lastActiveAt: string;
}

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

export interface FileVersion {
  versionId: string;
  filePath: string;
  projectId: string;
  contentHash: string;
  timestamp: string;
  sizeBytes: number;
  eventId: string;
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

export interface SnapshotEntry {
  filePath: string;
  contentHash: string;
  sizeBytes: number;
}

export interface Snapshot {
  snapshotId: string;
  projectId: string;
  sessionId: string | undefined;
  timestamp: string;
  trigger: 'auto' | 'manual' | 'checkpoint';
  entries: SnapshotEntry[];
  totalSizeBytes: number;
}
