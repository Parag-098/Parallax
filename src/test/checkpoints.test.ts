/**
 * Tests for the checkpoint service.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ParallaxEvent } from '../events/types';

// Stub vscode - avoid TypeScript parameter properties (Node 24 strip-only mode)
class MockUri {
  fsPath: string;
  constructor(p: string) { this.fsPath = p; }
}

const Module = require('module') as { _load: (...args: unknown[]) => unknown };
const _orig = Module._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module._load = function (...args: unknown[]) {
  const req = args[0] as string;
  if (req === 'vscode') {
    return {
      Uri: MockUri,
      workspace: { getConfiguration: () => ({ get: () => [] }) },
    };
  }
  return _orig(...args);
};
const { JsonFileStorage } = require('../storage/storage') as typeof import('../storage/storage');
const { CheckpointService } = require('../checkpoints/checkpointService') as typeof import('../checkpoints/checkpointService');
Module._load = _orig;

function makeStorage(dir: string) {
  return new JsonFileStorage({ fsPath: dir } as import('vscode').Uri);
}

describe('Checkpoint Service', () => {
  let tempDir: string;
  const projectId = 'proj-cp';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallax-cp-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a checkpoint with correct fields', async () => {
    const storage = makeStorage(tempDir);
    const emitted: ParallaxEvent[] = [];
    const service = new CheckpointService(projectId, () => 'sess-1', storage, undefined, undefined, (e: ParallaxEvent) => emitted.push(e));

    const cp = await service.createCheckpoint('Auth Complete', 'Authentication done');

    assert.ok(cp.checkpointId.length > 0);
    assert.strictEqual(cp.name, 'Auth Complete');
    assert.strictEqual(cp.description, 'Authentication done');
    assert.strictEqual(cp.projectId, projectId);
    assert.strictEqual(cp.sessionId, 'sess-1');
    assert.ok(!isNaN(Date.parse(cp.timestamp)));
  });

  it('persists the checkpoint to storage', async () => {
    const storage = makeStorage(tempDir);
    const service = new CheckpointService(projectId, () => 'sess-1', storage, undefined, undefined, () => {});

    const cp = await service.createCheckpoint('DB Complete', '');
    const loaded = await storage.loadCheckpoint(cp.checkpointId);
    assert.ok(loaded !== undefined);
    assert.strictEqual(loaded.name, 'DB Complete');
  });

  it('emits a CHECKPOINT_CREATED event', async () => {
    const storage = makeStorage(tempDir);
    const emitted: ParallaxEvent[] = [];
    const service = new CheckpointService(projectId, () => 'sess-1', storage, undefined, undefined, (e: ParallaxEvent) => emitted.push(e));

    await service.createCheckpoint('MVP', 'Reached MVP');
    const event = emitted.find((e) => e.type === 'CHECKPOINT_CREATED');
    assert.ok(event !== undefined, 'Expected CHECKPOINT_CREATED event to be emitted');
  });

  it('lists checkpoints for project', async () => {
    const storage = makeStorage(tempDir);
    const service = new CheckpointService(projectId, () => 'sess-1', storage, undefined, undefined, () => {});

    await service.createCheckpoint('Phase 1', '');
    await service.createCheckpoint('Phase 2', '');
    const list = await service.listCheckpoints();
    assert.strictEqual(list.length, 2);
  });

  it('persists across new service instances', async () => {
    const storage = makeStorage(tempDir);
    const service1 = new CheckpointService(projectId, () => 'sess-1', storage, undefined, undefined, () => {});
    await service1.createCheckpoint('Persist Me', 'Test persistence');

    const storage2 = makeStorage(tempDir);
    const service2 = new CheckpointService(projectId, () => 'sess-2', storage2, undefined, undefined, () => {});
    const list = await service2.listCheckpoints();
    assert.ok(list.some((c: { name: string }) => c.name === 'Persist Me'));
  });

  it('correctly associates current state (no snapshot engine)', async () => {
    const storage = makeStorage(tempDir);
    const service = new CheckpointService(projectId, () => 'sess-1', storage, undefined, undefined, () => {});

    const cp = await service.createCheckpoint('No Snapshot', 'Created without snapshot engine');
    assert.strictEqual(cp.snapshotId, undefined);
    assert.strictEqual(cp.gitCommitHash, undefined);
  });
});
