/**
 * Event factory – creates typed ParallaxEvents with stable IDs and timestamps.
 */
import { v4 as uuidv4 } from 'uuid';
import type {
  ParallaxEvent,
  ProjectOpenedEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  FileCreatedEvent,
  FileModifiedEvent,
  FileDeletedEvent,
  FileRenamedEvent,
  FileSavedEvent,
  GitCommitEvent,
  GitCheckoutEvent,
  CheckpointCreatedEvent,
  SnapshotCreatedEvent,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function makeBase(
  type: string,
  projectId: string,
  sessionId: string | undefined,
  source: 'user' | 'system' | 'git' = 'system',
  actor = 'system',
) {
  return {
    eventId: uuidv4(),
    projectId,
    sessionId,
    timestamp: nowIso(),
    type,
    source,
    actor,
  };
}

export function createProjectOpenedEvent(
  projectId: string,
  projectPath: string,
  projectName: string,
): ProjectOpenedEvent {
  return {
    ...makeBase('PROJECT_OPENED', projectId, undefined, 'system'),
    type: 'PROJECT_OPENED' as const,
    projectPath,
    projectName,
  };
}

export function createSessionStartedEvent(
  projectId: string,
  sessionId: string,
): SessionStartedEvent {
  return {
    ...makeBase('SESSION_STARTED', projectId, sessionId, 'system'),
    type: 'SESSION_STARTED' as const,
    sessionId,
  };
}

export function createSessionEndedEvent(
  projectId: string,
  sessionId: string,
  startTime: string,
): SessionEndedEvent {
  const endTime = new Date();
  const durationMs = endTime.getTime() - new Date(startTime).getTime();
  return {
    ...makeBase('SESSION_ENDED', projectId, sessionId, 'system'),
    type: 'SESSION_ENDED' as const,
    sessionId,
    durationMs,
  };
}

export function createFileCreatedEvent(
  projectId: string,
  sessionId: string | undefined,
  filePath: string,
  afterHash: string,
  sizeBytes: number,
): FileCreatedEvent {
  return {
    ...makeBase('FILE_CREATED', projectId, sessionId, 'user'),
    type: 'FILE_CREATED' as const,
    filePath,
    afterHash,
    sizeBytes,
  };
}

export function createFileModifiedEvent(
  projectId: string,
  sessionId: string | undefined,
  filePath: string,
  beforeHash: string,
  afterHash: string,
  diffId: string | undefined,
  linesAdded: number,
  linesRemoved: number,
): FileModifiedEvent {
  return {
    ...makeBase('FILE_MODIFIED', projectId, sessionId, 'user'),
    type: 'FILE_MODIFIED' as const,
    filePath,
    beforeHash,
    afterHash,
    diffId,
    linesAdded,
    linesRemoved,
  };
}

export function createFileDeletedEvent(
  projectId: string,
  sessionId: string | undefined,
  filePath: string,
  beforeHash: string,
): FileDeletedEvent {
  return {
    ...makeBase('FILE_DELETED', projectId, sessionId, 'user'),
    type: 'FILE_DELETED' as const,
    filePath,
    beforeHash,
  };
}

export function createFileRenamedEvent(
  projectId: string,
  sessionId: string | undefined,
  oldPath: string,
  newPath: string,
  contentHash: string,
): FileRenamedEvent {
  return {
    ...makeBase('FILE_RENAMED', projectId, sessionId, 'user'),
    type: 'FILE_RENAMED' as const,
    oldPath,
    newPath,
    contentHash,
  };
}

export function createFileSavedEvent(
  projectId: string,
  sessionId: string | undefined,
  filePath: string,
  contentHash: string,
  sizeBytes: number,
): FileSavedEvent {
  return {
    ...makeBase('FILE_SAVED', projectId, sessionId, 'user'),
    type: 'FILE_SAVED' as const,
    filePath,
    contentHash,
    sizeBytes,
  };
}

export function createGitCommitEvent(
  projectId: string,
  sessionId: string | undefined,
  commitHash: string,
  commitMessage: string,
  branch: string,
  authorName: string,
  authorEmail: string,
  filesChanged: number,
): GitCommitEvent {
  return {
    ...makeBase('GIT_COMMIT', projectId, sessionId, 'git'),
    type: 'GIT_COMMIT' as const,
    commitHash,
    commitMessage,
    branch,
    authorName,
    authorEmail,
    filesChanged,
  };
}

export function createGitCheckoutEvent(
  projectId: string,
  sessionId: string | undefined,
  fromBranch: string,
  toBranch: string,
  commitHash: string,
): GitCheckoutEvent {
  return {
    ...makeBase('GIT_CHECKOUT', projectId, sessionId, 'git'),
    type: 'GIT_CHECKOUT' as const,
    fromBranch,
    toBranch,
    commitHash,
  };
}

export function createCheckpointCreatedEvent(
  projectId: string,
  sessionId: string | undefined,
  checkpointId: string,
  name: string,
  description: string,
  snapshotId: string | undefined,
  gitCommitHash: string | undefined,
  gitBranch: string | undefined,
): CheckpointCreatedEvent {
  return {
    ...makeBase('CHECKPOINT_CREATED', projectId, sessionId, 'user'),
    type: 'CHECKPOINT_CREATED' as const,
    checkpointId,
    name,
    description,
    snapshotId,
    gitCommitHash,
    gitBranch,
  };
}

export function createSnapshotCreatedEvent(
  projectId: string,
  sessionId: string | undefined,
  snapshotId: string,
  fileCount: number,
  totalSizeBytes: number,
  trigger: 'auto' | 'manual' | 'checkpoint',
): SnapshotCreatedEvent {
  return {
    ...makeBase('SNAPSHOT_CREATED', projectId, sessionId, 'system'),
    type: 'SNAPSHOT_CREATED' as const,
    snapshotId,
    fileCount,
    totalSizeBytes,
    trigger,
  };
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

export function serializeEvent(event: ParallaxEvent): string {
  return JSON.stringify(event);
}

export function deserializeEvent(raw: string): ParallaxEvent {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid event JSON: ${e}`);
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Invalid event JSON: not an object');
  }
  const ev = obj as Record<string, unknown>;
  if (typeof ev['eventId'] !== 'string') {
    throw new Error('Invalid event: missing eventId');
  }
  if (typeof ev['type'] !== 'string') {
    throw new Error('Invalid event: missing type');
  }
  return ev as unknown as ParallaxEvent;
}
