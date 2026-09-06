/**
 * Tests for the Parallax event system.
 */
import * as assert from 'assert';
import {
  createFileCreatedEvent,
  createFileModifiedEvent,
  createFileDeletedEvent,
  createFileRenamedEvent,
  createFileSavedEvent,
  createSessionStartedEvent,
  createSessionEndedEvent,
  createProjectOpenedEvent,
  createCheckpointCreatedEvent,
  serializeEvent,
  deserializeEvent,
} from '../events/factory';

describe('Event System', () => {
  const projectId = 'test-project-123';
  const sessionId = 'test-session-456';
  const filePath = '/workspace/src/app.ts';

  describe('Event creation', () => {
    it('creates FILE_CREATED event with correct type', () => {
      const event = createFileCreatedEvent(projectId, sessionId, filePath, 'abc123', 42);
      assert.strictEqual(event.type, 'FILE_CREATED');
      assert.strictEqual(event.projectId, projectId);
      assert.strictEqual(event.sessionId, sessionId);
      assert.strictEqual(event.filePath, filePath);
      assert.strictEqual(event.afterHash, 'abc123');
      assert.strictEqual(event.sizeBytes, 42);
    });

    it('creates FILE_MODIFIED event with correct fields', () => {
      const event = createFileModifiedEvent(
        projectId, sessionId, filePath, 'hash1', 'hash2', 'diff-id', 5, 2
      );
      assert.strictEqual(event.type, 'FILE_MODIFIED');
      assert.strictEqual(event.beforeHash, 'hash1');
      assert.strictEqual(event.afterHash, 'hash2');
      assert.strictEqual(event.diffId, 'diff-id');
      assert.strictEqual(event.linesAdded, 5);
      assert.strictEqual(event.linesRemoved, 2);
    });

    it('creates FILE_DELETED event', () => {
      const event = createFileDeletedEvent(projectId, sessionId, filePath, 'oldhash');
      assert.strictEqual(event.type, 'FILE_DELETED');
      assert.strictEqual(event.beforeHash, 'oldhash');
    });

    it('creates FILE_RENAMED event', () => {
      const event = createFileRenamedEvent(
        projectId, sessionId, '/old.ts', '/new.ts', 'contenthash'
      );
      assert.strictEqual(event.type, 'FILE_RENAMED');
      assert.strictEqual(event.oldPath, '/old.ts');
      assert.strictEqual(event.newPath, '/new.ts');
    });

    it('creates FILE_SAVED event', () => {
      const event = createFileSavedEvent(projectId, sessionId, filePath, 'savedHash', 100);
      assert.strictEqual(event.type, 'FILE_SAVED');
      assert.strictEqual(event.contentHash, 'savedHash');
    });

    it('creates SESSION_STARTED event', () => {
      const event = createSessionStartedEvent(projectId, sessionId);
      assert.strictEqual(event.type, 'SESSION_STARTED');
      assert.strictEqual(event.sessionId, sessionId);
    });

    it('creates SESSION_ENDED event with duration', () => {
      const startTime = new Date(Date.now() - 5000).toISOString();
      const event = createSessionEndedEvent(projectId, sessionId, startTime);
      assert.strictEqual(event.type, 'SESSION_ENDED');
      assert.ok(event.durationMs >= 4000, 'Expected duration >= 4000ms');
    });

    it('creates PROJECT_OPENED event', () => {
      const event = createProjectOpenedEvent(projectId, '/workspace', 'MyProject');
      assert.strictEqual(event.type, 'PROJECT_OPENED');
      assert.strictEqual(event.projectPath, '/workspace');
      assert.strictEqual(event.projectName, 'MyProject');
    });

    it('assigns unique eventIds to different events', () => {
      const e1 = createFileCreatedEvent(projectId, sessionId, filePath, 'h1', 0);
      const e2 = createFileCreatedEvent(projectId, sessionId, filePath, 'h2', 0);
      assert.notStrictEqual(e1.eventId, e2.eventId);
    });

    it('assigns ISO timestamp', () => {
      const event = createFileCreatedEvent(projectId, sessionId, filePath, 'h', 0);
      assert.ok(!isNaN(Date.parse(event.timestamp)), 'Expected valid ISO timestamp');
    });

    it('allows undefined sessionId', () => {
      const event = createFileCreatedEvent(projectId, undefined, filePath, 'h', 0);
      assert.strictEqual(event.sessionId, undefined);
    });
  });

  describe('Serialization', () => {
    it('round-trips a FILE_CREATED event', () => {
      const original = createFileCreatedEvent(projectId, sessionId, filePath, 'testhash', 512);
      const json = serializeEvent(original);
      const restored = deserializeEvent(json);
      assert.strictEqual(restored.type, 'FILE_CREATED');
      assert.strictEqual(restored.eventId, original.eventId);
      assert.strictEqual(restored.timestamp, original.timestamp);
    });

    it('round-trips a FILE_MODIFIED event', () => {
      const original = createFileModifiedEvent(
        projectId, sessionId, filePath, 'before', 'after', 'diffId', 3, 1
      );
      const json = serializeEvent(original);
      const restored = deserializeEvent(json);
      assert.strictEqual(restored.type, 'FILE_MODIFIED');
      assert.strictEqual((restored as typeof original).linesAdded, 3);
    });

    it('round-trips a CHECKPOINT_CREATED event', () => {
      const original = createCheckpointCreatedEvent(
        projectId, sessionId, 'cp-id', 'MVP Complete', 'Finished MVP', 'snap-id', 'abc123', 'main'
      );
      const json = serializeEvent(original);
      const restored = deserializeEvent(json);
      assert.strictEqual(restored.type, 'CHECKPOINT_CREATED');
      assert.strictEqual((restored as typeof original).name, 'MVP Complete');
    });

    it('throws on invalid JSON', () => {
      assert.throws(() => deserializeEvent('not json'), /JSON/);
    });

    it('throws when eventId is missing', () => {
      assert.throws(() => deserializeEvent('{"type":"FILE_CREATED"}'), /eventId/);
    });

    it('throws when type is missing', () => {
      assert.throws(() => deserializeEvent('{"eventId":"abc"}'), /type/);
    });
  });
});
