/**
 * Shared message types between the VS Code extension host and the webview.
 * Both sides import this module for type safety.
 */
import type { ParallaxEvent, Checkpoint, DiffRecord, Session } from '../events/types';

// ---------------------------------------------------------------------------
// Extension → Webview messages
// ---------------------------------------------------------------------------

export interface MsgInitialize {
  type: 'initialize';
  projectId: string;
  projectName: string;
  projectPath: string;
  events: ParallaxEvent[];
  sessions: Session[];
  checkpoints: Checkpoint[];
  isRecording: boolean;
}

export interface MsgEventsUpdated {
  type: 'eventsUpdated';
  events: ParallaxEvent[];
}

export interface MsgReplayState {
  type: 'replayState';
  status: 'idle' | 'playing' | 'paused';
  currentIndex: number;
  currentTimestamp: string | undefined;
}

export interface MsgFileContent {
  type: 'fileContent';
  requestId: string;
  filePath: string;
  content: string | undefined;
  timestamp: string;
  error: string | undefined;
}

export interface MsgDiffContent {
  type: 'diffContent';
  requestId: string;
  diff: DiffRecord | undefined;
  beforeContent: string | undefined;
  afterContent: string | undefined;
  error: string | undefined;
}

export interface MsgRecordingStatus {
  type: 'recordingStatus';
  isRecording: boolean;
}

export interface MsgError {
  type: 'error';
  message: string;
}

export type ExtensionMessage =
  | MsgInitialize
  | MsgEventsUpdated
  | MsgReplayState
  | MsgFileContent
  | MsgDiffContent
  | MsgRecordingStatus
  | MsgError;

// ---------------------------------------------------------------------------
// Webview → Extension messages
// ---------------------------------------------------------------------------

export interface WebviewMsgReady {
  type: 'ready';
}

export interface WebviewMsgStartRecording {
  type: 'startRecording';
}

export interface WebviewMsgStopRecording {
  type: 'stopRecording';
}

export interface WebviewMsgReplayPlay {
  type: 'replayPlay';
}

export interface WebviewMsgReplayPause {
  type: 'replayPause';
}

export interface WebviewMsgReplayStepForward {
  type: 'replayStepForward';
}

export interface WebviewMsgReplayStepBackward {
  type: 'replayStepBackward';
}

export interface WebviewMsgReplayJumpToIndex {
  type: 'replayJumpToIndex';
  index: number;
}

export interface WebviewMsgReplayJumpToTimestamp {
  type: 'replayJumpToTimestamp';
  timestamp: string;
}

export interface WebviewMsgGetFileContent {
  type: 'getFileContent';
  requestId: string;
  filePath: string;
  timestamp: string;
}

export interface WebviewMsgGetDiff {
  type: 'getDiff';
  requestId: string;
  diffId: string;
}

export interface WebviewMsgCreateCheckpoint {
  type: 'createCheckpoint';
  name: string;
  description: string;
}

export type WebviewMessage =
  | WebviewMsgReady
  | WebviewMsgStartRecording
  | WebviewMsgStopRecording
  | WebviewMsgReplayPlay
  | WebviewMsgReplayPause
  | WebviewMsgReplayStepForward
  | WebviewMsgReplayStepBackward
  | WebviewMsgReplayJumpToIndex
  | WebviewMsgReplayJumpToTimestamp
  | WebviewMsgGetFileContent
  | WebviewMsgGetDiff
  | WebviewMsgCreateCheckpoint;
