/**
 * Tests for the JSON file-based storage layer.
 * Uses a temporary directory instead of VS Code storage.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Stub vscode before requiring storage
// ---------------------------------------------------------------------------
class MockUri {
  fsPath: string;
  constructor(p: string) { this.fsPath = p; }
  static file(p: string) { return new MockUri(p); }
}

const Module = require('module') as { _load: (...args: unknown[]) => unknown };
const _orig = Module._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module._load = function (...args: unknown[]) {
  const req = args[0] as string;
  if (req === 'vscode') {
    return { Uri: MockUri };
  }
  return _orig(...args);
};

// Now we can safely require storage
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JsonFileStorage } = require('../storage/storage') as typeof import('../storage/storage');
Module._load = _orig;

// Helper to create storage with a temp dir URI
function makeStorage(dir: string) {
  return new JsonFileStorage({ fsPath: dir } as import('vscode').Uri);
}

describe('Storage Layer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallax-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Projects', () => {
    it('saves and loads a project', async () => {
      const storage = makeStorage(tempDir);
      const project = {
        projectId: 'proj-1',
        name: 'Test Project',
        rootPath: '/workspace',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      await storage.saveProject(project);
      const loaded = await storage.loadProject('proj-1');
      assert.deepStrictEqual(loaded, project);
    });

    it('returns undefined for a missing project', async () => {
      const storage = makeStorage(tempDir);
      const result = await storage.loadProject('nonexistent');
      assert.strictEqual(result, undefined);
    });

    it('loads all projects', async () => {
      const storage = makeStorage(tempDir);
      const p1 = { projectId: 'p1', name: 'A', rootPath: '/a', createdAt: '', lastActiveAt: '' };
      const p2 = { projectId: 'p2', name: 'B', rootPath: '/b', createdAt: '', lastActiveAt: '' };
      await storage.saveProject(p1);
      await storage.saveProject(p2);
      const all = await storage.loadAllProjects();
      assert.strictEqual(all.length, 2);
    });
  });

  describe('Sessions', () => {
    it('saves and loads a session', async () => {
      const storage = makeStorage(tempDir);
      const session = {
        sessionId: 'sess-1',
        projectId: 'proj-1',
        startTime: new Date().toISOString(),
        endTime: undefined,
        eventCount: 0,
      };
      await storage.saveSession(session);
      const loaded = await storage.loadSession('sess-1');
      assert.ok(loaded !== undefined);
      assert.strictEqual(loaded.sessionId, 'sess-1');
    });

    it('loads sessions for a project', async () => {
      const storage = makeStorage(tempDir);
      const s1 = { sessionId: 's1', projectId: 'proj-1', startTime: '', endTime: undefined, eventCount: 0 };
      const s2 = { sessionId: 's2', projectId: 'proj-1', startTime: '', endTime: undefined, eventCount: 0 };
      const s3 = { sessionId: 's3', projectId: 'proj-2', startTime: '', endTime: undefined, eventCount: 0 };
      await Promise.all([storage.saveSession(s1), storage.saveSession(s2), storage.saveSession(s3)]);
      const sessions = await storage.loadSessionsForProject('proj-1');
      assert.strictEqual(sessions.length, 2);
    });
  });

  describe('Events', () => {
    it('appends and loads events for a session', async () => {
      const storage = makeStorage(tempDir);
      const baseEvent = {
        projectId: 'proj-1',
        sessionId: 'sess-1',
        source: 'user' as const,
        actor: 'system',
      };
      const event1 = {
        ...baseEvent,
        eventId: 'e1',
        timestamp: '2024-01-01T10:00:00.000Z',
        type: 'FILE_CREATED' as const,
        filePath: '/f.ts', afterHash: 'hash1', sizeBytes: 10,
      };
      const event2 = {
        ...baseEvent,
        eventId: 'e2',
        timestamp: '2024-01-01T10:01:00.000Z',
        type: 'FILE_MODIFIED' as const,
        filePath: '/f.ts', beforeHash: 'hash1', afterHash: 'hash2',
        diffId: undefined, linesAdded: 1, linesRemoved: 0,
      };
      await storage.appendEvent(event1 as Parameters<typeof storage.appendEvent>[0]);
      await storage.appendEvent(event2 as Parameters<typeof storage.appendEvent>[0]);
      const loaded = await storage.loadEventsForSession('sess-1');
      assert.strictEqual(loaded.length, 2);
      assert.strictEqual(loaded[0].eventId, 'e1');
      assert.strictEqual(loaded[1].eventId, 'e2');
    });

    it('loads events sorted by timestamp', async () => {
      const storage = makeStorage(tempDir);
      const base = { projectId: 'proj-1', sessionId: 'sess-1', source: 'user' as const, actor: 'system' };
      const later = {
        ...base, eventId: 'e2', timestamp: '2024-01-01T10:05:00.000Z',
        type: 'FILE_SAVED' as const, filePath: '/f.ts', contentHash: 'h', sizeBytes: 5,
      };
      const earlier = {
        ...base, eventId: 'e1', timestamp: '2024-01-01T10:00:00.000Z',
        type: 'FILE_CREATED' as const, filePath: '/f.ts', afterHash: 'h', sizeBytes: 5,
      };
      await storage.appendEvent(later as Parameters<typeof storage.appendEvent>[0]);
      await storage.appendEvent(earlier as Parameters<typeof storage.appendEvent>[0]);
      const events = await storage.loadEventsForProject('proj-1');
      assert.ok(events[0].timestamp < events[1].timestamp);
    });
  });

  describe('Content store', () => {
    it('saves and loads content by hash', async () => {
      const storage = makeStorage(tempDir);
      const hash = 'a'.repeat(64);
      await storage.saveContent(hash, 'hello world');
      const loaded = await storage.loadContent(hash);
      assert.strictEqual(loaded, 'hello world');
    });

    it('returns undefined for missing content', async () => {
      const storage = makeStorage(tempDir);
      const loaded = await storage.loadContent('z'.repeat(64));
      assert.strictEqual(loaded, undefined);
    });

    it('does not throw on duplicate saves', async () => {
      const storage = makeStorage(tempDir);
      const hash = 'b'.repeat(64);
      await storage.saveContent(hash, 'content');
      await storage.saveContent(hash, 'content');
      const loaded = await storage.loadContent(hash);
      assert.strictEqual(loaded, 'content');
    });
  });

  describe('Diffs', () => {
    it('saves and loads a diff by id', async () => {
      const storage = makeStorage(tempDir);
      const diff = {
        diffId: 'diff-1',
        filePath: '/app.ts',
        projectId: 'proj-1',
        timestamp: new Date().toISOString(),
        beforeHash: 'a'.repeat(64),
        afterHash: 'b'.repeat(64),
        patch: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
        linesAdded: 1,
        linesRemoved: 1,
      };
      await storage.saveDiff(diff);
      const loaded = await storage.loadDiff('diff-1');
      assert.deepStrictEqual(loaded, diff);
    });

    it('returns undefined for missing diff', async () => {
      const storage = makeStorage(tempDir);
      const loaded = await storage.loadDiff('nonexistent');
      assert.strictEqual(loaded, undefined);
    });
  });

  describe('Checkpoints', () => {
    it('saves and loads a checkpoint', async () => {
      const storage = makeStorage(tempDir);
      const cp = {
        checkpointId: 'cp-1',
        projectId: 'proj-1',
        sessionId: 'sess-1',
        name: 'Auth Complete',
        description: 'Authentication done',
        timestamp: new Date().toISOString(),
        snapshotId: 'snap-1',
        gitCommitHash: 'abc123',
        gitBranch: 'main',
      };
      await storage.saveCheckpoint(cp);
      const loaded = await storage.loadCheckpoint('cp-1');
      assert.deepStrictEqual(loaded, cp);
    });

    it('loads all checkpoints for a project', async () => {
      const storage = makeStorage(tempDir);
      const ts = (offset: number) => new Date(Date.now() + offset).toISOString();
      const base = {
        projectId: 'proj-1', sessionId: undefined,
        description: '',
        snapshotId: undefined, gitCommitHash: undefined, gitBranch: undefined,
      };
      await storage.saveCheckpoint({ ...base, checkpointId: 'cp-1', name: 'A', timestamp: ts(0) });
      await storage.saveCheckpoint({ ...base, checkpointId: 'cp-2', name: 'B', timestamp: ts(1000) });
      const loaded = await storage.loadCheckpointsForProject('proj-1');
      assert.strictEqual(loaded.length, 2);
    });

    it('persists across storage instances', async () => {
      const storage = makeStorage(tempDir);
      await storage.saveCheckpoint({
        checkpointId: 'cp-persist', projectId: 'proj-1', sessionId: undefined,
        name: 'Persist Test', description: '', timestamp: new Date().toISOString(),
        snapshotId: undefined, gitCommitHash: undefined, gitBranch: undefined,
      });
      const storage2 = makeStorage(tempDir);
      const loaded = await storage2.loadCheckpoint('cp-persist');
      assert.ok(loaded !== undefined);
      assert.strictEqual(loaded.name, 'Persist Test');
    });
  });

  describe('Snapshots', () => {
    it('saves and loads a snapshot', async () => {
      const storage = makeStorage(tempDir);
      const snap = {
        snapshotId: 'snap-1',
        projectId: 'proj-1',
        sessionId: 'sess-1',
        timestamp: new Date().toISOString(),
        trigger: 'manual' as const,
        entries: [{ filePath: '/app.ts', contentHash: 'c'.repeat(64), sizeBytes: 50 }],
        totalSizeBytes: 50,
      };
      await storage.saveSnapshot(snap);
      const loaded = await storage.loadSnapshot('snap-1');
      assert.ok(loaded !== undefined);
      assert.strictEqual(loaded.snapshotId, 'snap-1');
      assert.strictEqual(loaded.entries.length, 1);
    });

    it('loads snapshots sorted by timestamp', async () => {
      const storage = makeStorage(tempDir);
      const base = { projectId: 'proj-1', sessionId: undefined, trigger: 'auto' as const, entries: [], totalSizeBytes: 0 };
      await storage.saveSnapshot({ ...base, snapshotId: 'sn2', timestamp: '2024-01-01T11:00:00.000Z' });
      await storage.saveSnapshot({ ...base, snapshotId: 'sn1', timestamp: '2024-01-01T10:00:00.000Z' });
      const snaps = await storage.loadSnapshotsForProject('proj-1');
      assert.strictEqual(snaps.length, 2);
      assert.ok(snaps[0].timestamp < snaps[1].timestamp);
    });
  });
});
