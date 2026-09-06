/**
 * Tests for SHA-256 content hashing.
 */
import * as assert from 'assert';
import { hashContent, hashBuffer, EMPTY_HASH, hashesEqual } from '../snapshots/hash';

describe('Content Hashing', () => {
  it('produces a 64-character hex string', () => {
    const h = hashContent('hello world');
    assert.strictEqual(h.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(h), 'Should be lowercase hex');
  });

  it('is deterministic - same content same hash', () => {
    const content = 'const x = 42;\n';
    const h1 = hashContent(content);
    const h2 = hashContent(content);
    assert.strictEqual(h1, h2);
  });

  it('produces different hashes for different content', () => {
    const h1 = hashContent('content A');
    const h2 = hashContent('content B');
    assert.notStrictEqual(h1, h2);
  });

  it('is sensitive to whitespace', () => {
    const h1 = hashContent('hello');
    const h2 = hashContent('hello ');
    assert.notStrictEqual(h1, h2);
  });

  it('handles empty string', () => {
    const h = hashContent('');
    assert.strictEqual(h.length, 64);
    assert.strictEqual(h, EMPTY_HASH);
  });

  it('EMPTY_HASH is stable across calls', () => {
    assert.strictEqual(EMPTY_HASH, hashContent(''));
  });

  it('handles unicode content', () => {
    const h1 = hashContent('こんにちは');
    const h2 = hashContent('こんにちは');
    assert.strictEqual(h1, h2);
    const h3 = hashContent('hello');
    assert.notStrictEqual(h1, h3);
  });

  it('hashes Buffer correctly', () => {
    const content = 'test content';
    const bufferHash = hashBuffer(Buffer.from(content, 'utf8'));
    const stringHash = hashContent(content);
    assert.strictEqual(bufferHash, stringHash);
  });

  it('hashesEqual returns true for equal hashes', () => {
    const h = hashContent('abc');
    assert.ok(hashesEqual(h, h));
  });

  it('hashesEqual returns false for different hashes', () => {
    const h1 = hashContent('abc');
    const h2 = hashContent('def');
    assert.ok(!hashesEqual(h1, h2));
  });

  it('produces the known SHA-256 for "hello world"', () => {
    const crypto = require('crypto') as typeof import('crypto');
    const nodeHash = crypto.createHash('sha256').update('hello world', 'utf8').digest('hex');
    assert.strictEqual(hashContent('hello world'), nodeHash);
  });
});
