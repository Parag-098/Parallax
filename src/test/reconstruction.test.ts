/**
 * Tests for historical state reconstruction.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { hashContent } from '../snapshots/hash';
import { generateDiff } from '../snapshots/diff';
import type { ParallaxEvent, Snapshot } from '../events/types';

// Stub vscode
const Module = require('module') as { _load: (...args: unknown[]) => unknown };
const _orig = Module._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module._load = function (...args: unknown[]) {
  const req = args[0] as string;
  if (req === 'vscode') return { Uri: class MockUri { fsPath: string; constructor(p: string) { this.fsPath = p; } } };
  return _orig(...args);
};
const { JsonFileStorage } = require('../storage/storage') as typeof import('../storage/storage');
const { ReconstructionService } = require('../snapshots/reconstruction') as typeof import('../snapshots/reconstruction');
Module._load = _orig;

function makeStorage(dir: string) {
  return new JsonFileStorage({ fsPath: dir } as import('vscode').Uri);
}

function makeFileCreated(
  projectId: string,
  filePath: string,
  content: string,
  timestamp: string,
): ParallaxEvent {
  return {
    eventId: `e-${Math.random()}`,
    projectId,
    sessionId: undefined,
    timestamp,
    type: 'FILE_CREATED',
    source: 'user',
    actor: 'test',
    filePath,
    afterHash: hashContent(content),
    sizeBytes: content.length,
  } as unknown as ParallaxEvent;
}

function makeFileModified(
  projectId: string,
  filePath: string,
  beforeContent: string,
  afterContent: string,
  timestamp: string,
  diffId?: string,
): ParallaxEvent {
  return {
    eventId: `e-${Math.random()}`,
    projectId,
    sessionId: undefined,
    timestamp,
    type: 'FILE_MODIFIED',
    source: 'user',
    actor: 'test',
    filePath,
    beforeHash: hashContent(beforeContent),
    afterHash: hashContent(afterContent),
    diffId: diffId ?? undefined,
    linesAdded: 1,
    linesRemoved: 0,
  } as unknown as ParallaxEvent;
}

function makeFileDeleted(projectId: string, filePath: string, timestamp: string): ParallaxEvent {
  return {
    eventId: `e-${Math.random()}`,
    projectId,
    sessionId: undefined,
    timestamp,
    type: 'FILE_DELETED',
    source: 'user',
    actor: 'test',
    filePath,
    beforeHash: '',
  } as unknown as ParallaxEvent;
}

function makeFileRenamed(
  projectId: string,
  oldPath: string,
  newPath: string,
  content: string,
  timestamp: string,
): ParallaxEvent {
  return {
    eventId: `e-${Math.random()}`,
    projectId,
    sessionId: undefined,
    timestamp,
    type: 'FILE_RENAMED',
    source: 'user',
    actor: 'test',
    oldPath,
    newPath,
    contentHash: hashContent(content),
  } as unknown as ParallaxEvent;
}

describe('Historical State Reconstruction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallax-recon-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const projectId = 'proj-recon';

  it('reconstructs new file creation', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const content = 'hello world\n';
    const event = makeFileCreated(projectId, '/app.ts', content, '2024-01-01T10:00:00.000Z');
    await storage.appendEvent(event);
    await storage.saveContent(hashContent(content), content);

    const result = await service.reconstructState(projectId, '2024-01-01T10:01:00.000Z');
    assert.strictEqual(result.state.get('/app.ts'), content);
    assert.strictEqual(result.warnings.length, 0);
  });

  it('reconstructs empty file', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const content = '';
    const event = makeFileCreated(projectId, '/empty.ts', content, '2024-01-01T10:00:00.000Z');
    await storage.appendEvent(event);
    await storage.saveContent(hashContent(content), content);

    const result = await service.reconstructState(projectId, '2024-01-01T10:01:00.000Z');
    assert.strictEqual(result.state.get('/empty.ts'), '');
  });

  it('reconstructs modified file using diff', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const v1 = 'line1\n';
    const v2 = 'line1\nline2\n';

    const { diffId, patch } = generateDiff('/app.ts', v1, v2);
    await storage.saveContent(hashContent(v1), v1);
    await storage.saveContent(hashContent(v2), v2);
    await storage.saveDiff({
      diffId, filePath: '/app.ts', projectId,
      timestamp: '2024-01-01T10:05:00.000Z',
      beforeHash: hashContent(v1), afterHash: hashContent(v2),
      patch, linesAdded: 1, linesRemoved: 0,
    });

    await storage.appendEvent(makeFileCreated(projectId, '/app.ts', v1, '2024-01-01T10:00:00.000Z'));
    await storage.appendEvent(makeFileModified(projectId, '/app.ts', v1, v2, '2024-01-01T10:05:00.000Z', diffId));

    const result = await service.reconstructState(projectId, '2024-01-01T10:06:00.000Z');
    assert.strictEqual(result.state.get('/app.ts'), v2);
    assert.strictEqual(result.eventsApplied, 2);
  });

  it('reconstructs deleted file (file absent from state)', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const content = 'exists\n';
    await storage.saveContent(hashContent(content), content);

    await storage.appendEvent(makeFileCreated(projectId, '/will-be-deleted.ts', content, '2024-01-01T10:00:00.000Z'));
    await storage.appendEvent(makeFileDeleted(projectId, '/will-be-deleted.ts', '2024-01-01T10:05:00.000Z'));

    const result = await service.reconstructState(projectId, '2024-01-01T10:10:00.000Z');
    assert.strictEqual(result.state.has('/will-be-deleted.ts'), false);
  });

  it('reconstructs renamed file', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const content = 'renamed content\n';
    await storage.saveContent(hashContent(content), content);

    await storage.appendEvent(makeFileCreated(projectId, '/old.ts', content, '2024-01-01T10:00:00.000Z'));
    await storage.appendEvent(makeFileRenamed(projectId, '/old.ts', '/new.ts', content, '2024-01-01T10:05:00.000Z'));

    const result = await service.reconstructState(projectId, '2024-01-01T10:10:00.000Z');
    assert.strictEqual(result.state.has('/old.ts'), false);
    assert.strictEqual(result.state.get('/new.ts'), content);
  });

  it('applies multiple diffs sequentially', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const v1 = 'const x = 1;\n';
    const v2 = 'const x = 2;\n';
    const v3 = 'const x = 2;\nconst y = 3;\n';

    const diff1 = generateDiff('/f.ts', v1, v2);
    const diff2 = generateDiff('/f.ts', v2, v3);

    await storage.saveContent(hashContent(v1), v1);
    await storage.saveContent(hashContent(v2), v2);
    await storage.saveContent(hashContent(v3), v3);

    for (const [d, bef, aft, ts] of [
      [diff1, v1, v2, '2024-01-01T10:01:00.000Z'],
      [diff2, v2, v3, '2024-01-01T10:02:00.000Z'],
    ] as [ReturnType<typeof generateDiff>, string, string, string][]) {
      await storage.saveDiff({
        diffId: d.diffId, filePath: '/f.ts', projectId, timestamp: ts,
        beforeHash: hashContent(bef), afterHash: hashContent(aft),
        patch: d.patch, linesAdded: d.linesAdded, linesRemoved: d.linesRemoved,
      });
    }

    await storage.appendEvent(makeFileCreated(projectId, '/f.ts', v1, '2024-01-01T10:00:00.000Z'));
    await storage.appendEvent(makeFileModified(projectId, '/f.ts', v1, v2, '2024-01-01T10:01:00.000Z', diff1.diffId));
    await storage.appendEvent(makeFileModified(projectId, '/f.ts', v2, v3, '2024-01-01T10:02:00.000Z', diff2.diffId));

    const result = await service.reconstructState(projectId, '2024-01-01T10:03:00.000Z');
    assert.strictEqual(result.state.get('/f.ts'), v3);
  });

  it('uses snapshot as base and applies subsequent diffs', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const snapContent = 'snapshot content\n';
    const afterModify = 'snapshot content\nadded line\n';

    await storage.saveContent(hashContent(snapContent), snapContent);
    await storage.saveContent(hashContent(afterModify), afterModify);

    const diff = generateDiff('/f.ts', snapContent, afterModify);
    await storage.saveDiff({
      diffId: diff.diffId, filePath: '/f.ts', projectId,
      timestamp: '2024-01-01T10:05:00.000Z',
      beforeHash: hashContent(snapContent), afterHash: hashContent(afterModify),
      patch: diff.patch, linesAdded: diff.linesAdded, linesRemoved: diff.linesRemoved,
    });

    const snapshot: Snapshot = {
      snapshotId: 'snap-base',
      projectId,
      sessionId: undefined,
      timestamp: '2024-01-01T10:00:00.000Z',
      trigger: 'auto',
      entries: [{ filePath: '/f.ts', contentHash: hashContent(snapContent), sizeBytes: snapContent.length }],
      totalSizeBytes: snapContent.length,
    };
    await storage.saveSnapshot(snapshot);

    await storage.appendEvent(makeFileModified(projectId, '/f.ts', snapContent, afterModify, '2024-01-01T10:05:00.000Z', diff.diffId));

    const result = await service.reconstructState(projectId, '2024-01-01T10:10:00.000Z');
    assert.strictEqual(result.state.get('/f.ts'), afterModify);
    assert.strictEqual(result.snapshotTimestamp, '2024-01-01T10:00:00.000Z');
  });

  it('handles missing content gracefully (adds warning, no crash)', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    // Event references a hash not in content store
    const event = makeFileCreated(projectId, '/mystery.ts', 'data', '2024-01-01T10:00:00.000Z');
    await storage.appendEvent(event);

    const result = await service.reconstructState(projectId, '2024-01-01T10:01:00.000Z');
    assert.ok(result.warnings.length > 0);
  });

  it('getFileAtTimestamp returns correct content', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const content = 'target content\n';
    await storage.saveContent(hashContent(content), content);
    await storage.appendEvent(makeFileCreated(projectId, '/target.ts', content, '2024-01-01T10:00:00.000Z'));

    const result = await service.getFileAtTimestamp(projectId, '/target.ts', '2024-01-01T10:01:00.000Z');
    assert.strictEqual(result, content);
  });

  it('getFileAtTimestamp returns undefined for non-existent file at timestamp', async () => {
    const storage = makeStorage(tempDir);
    const service = new ReconstructionService(storage);
    const result = await service.getFileAtTimestamp(projectId, '/nonexistent.ts', '2024-01-01T10:00:00.000Z');
    assert.strictEqual(result, undefined);
  });
});
