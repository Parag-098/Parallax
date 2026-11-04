export type EventKind = 'create' | 'modify' | 'delete' | 'rename' | 'save' | 'checkpoint' | 'session-start' | 'session-end' | 'workspace-baseline' | 'git-commit' | 'git-checkout' | 'git-head' | 'snapshot';
export interface HistoryEvent { schemaVersion: 1; id: string; workspaceId: string; sessionId: string; sequence: number; timestamp: number; kind: EventKind; path?: string; oldPath?: string; contentHash?: string; previousHash?: string; name?: string; metadata?: Record<string, string>; }
export interface Session { id: string; workspaceId: string; startedAt: number; endedAt?: number; }
export interface Checkpoint { id: string; sessionId: string; workspaceId: string; timestamp: number; sequence: number; name: string; }
export interface Snapshot { schemaVersion: 1; sessionId: string; sequence: number; timestamp: number; files: Record<string,string>; inventoryComplete?: boolean; omittedPaths?: string[]; omissionsTruncated?: boolean; fingerprint?: string; }
