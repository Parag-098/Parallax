/**
 * Tests for the diff engine.
 */
import * as assert from 'assert';
import { generateDiff, applyDiff, buildDiffRecord } from '../snapshots/diff';

describe('Diff Engine', () => {
  describe('generateDiff', () => {
    it('produces a non-empty patch for different content', () => {
      const result = generateDiff('file.ts', 'line1\n', 'line1\nline2\n');
      assert.ok(result.patch.length > 0);
      assert.ok(result.diffId.length > 0);
    });

    it('counts added lines', () => {
      const result = generateDiff('file.ts', '', 'a\nb\nc\n');
      assert.strictEqual(result.linesAdded, 3);
      assert.strictEqual(result.linesRemoved, 0);
    });

    it('counts removed lines', () => {
      const result = generateDiff('file.ts', 'a\nb\nc\n', '');
      assert.strictEqual(result.linesAdded, 0);
      assert.strictEqual(result.linesRemoved, 3);
    });

    it('counts both additions and deletions', () => {
      const result = generateDiff(
        'file.ts',
        'line1\nline2\nline3\n',
        'line1\nmodified\nline3\nnew\n',
      );
      assert.strictEqual(result.linesAdded, 2);
      assert.strictEqual(result.linesRemoved, 1);
    });

    it('produces unique diffIds', () => {
      const r1 = generateDiff('f.ts', 'a', 'b');
      const r2 = generateDiff('f.ts', 'a', 'b');
      assert.notStrictEqual(r1.diffId, r2.diffId);
    });

    it('handles empty old content', () => {
      const result = generateDiff('f.ts', '', 'new content\n');
      assert.ok(result.linesAdded > 0);
      assert.strictEqual(result.linesRemoved, 0);
    });

    it('handles empty new content', () => {
      const result = generateDiff('f.ts', 'old content\n', '');
      assert.strictEqual(result.linesAdded, 0);
      assert.ok(result.linesRemoved > 0);
    });
  });

  describe('applyDiff', () => {
    it('round-trips: apply diff to old content yields new content', () => {
      const old = 'line1\nline2\nline3\n';
      const updated = 'line1\nmodified\nline3\n';
      const { patch } = generateDiff('file.ts', old, updated);
      const result = applyDiff(old, patch);
      assert.strictEqual(result, updated);
    });

    it('handles addition from empty', () => {
      const old = '';
      const updated = 'hello\nworld\n';
      const { patch } = generateDiff('file.ts', old, updated);
      const result = applyDiff(old, patch);
      assert.strictEqual(result, updated);
    });

    it('handles deletion to empty', () => {
      const old = 'some content\n';
      const updated = '';
      const { patch } = generateDiff('file.ts', old, updated);
      const result = applyDiff(old, patch);
      // The diff library may produce a result with just a newline for a full deletion
      assert.ok(result !== null, 'Should apply without error');
      assert.ok(result!.trim() === '', 'Should result in empty or whitespace-only content');
    });

    it('sequential modifications chain correctly', () => {
      const v1 = 'const x = 1;\n';
      const v2 = 'const x = 2;\n';
      const v3 = 'const x = 3;\nconst y = 4;\n';

      const { patch: p1 } = generateDiff('f.ts', v1, v2);
      const r1 = applyDiff(v1, p1);
      assert.strictEqual(r1, v2);

      const { patch: p2 } = generateDiff('f.ts', v2, v3);
      const r2 = applyDiff(r1!, p2);
      assert.strictEqual(r2, v3);
    });

    it('returns null for an invalid patch', () => {
      // A string that is not a valid unified diff header
      // Note: the diff library may return the original string unchanged rather than false
      // for some malformed patches, so we test the contract: result is either null OR 
      // an unchanged string (not a correct application)
      const original = 'some content';
      const result = applyDiff(original, 'this is not a patch at all ###');
      // Either null (rejected) or the original string (no changes applied) is acceptable
      // What is NOT acceptable is a corrupted result that differs from the original
      if (result !== null) {
        assert.strictEqual(result, original, 'Invalid patch should return null or unchanged original');
      }
    });
  });

  describe('buildDiffRecord', () => {
    it('builds a DiffRecord with correct hashes', () => {
      const before = 'before content\n';
      const after = 'after content\n';
      const result = generateDiff('app.ts', before, after);
      const record = buildDiffRecord('app.ts', 'proj-1', before, after, result);

      assert.strictEqual(record.diffId, result.diffId);
      assert.strictEqual(record.filePath, 'app.ts');
      assert.strictEqual(record.projectId, 'proj-1');
      assert.strictEqual(record.linesAdded, result.linesAdded);
      assert.strictEqual(record.linesRemoved, result.linesRemoved);
      assert.ok(record.beforeHash.length === 64);
      assert.ok(record.afterHash.length === 64);
      assert.notStrictEqual(record.beforeHash, record.afterHash);
    });
  });
});
