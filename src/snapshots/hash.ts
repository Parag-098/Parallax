/**
 * SHA-256 content hashing.
 * Deterministic: the same content always produces the same hash.
 * Uses Node.js built-in crypto – no external dependency.
 */
import * as crypto from 'crypto';

/**
 * Hash a string (typically file content) with SHA-256.
 * Returns a lowercase hex digest (64 characters).
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Hash a Buffer (raw bytes) with SHA-256.
 * Returns a lowercase hex digest (64 characters).
 */
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * A sentinel hash for empty content.
 */
export const EMPTY_HASH: string = hashContent('');

/**
 * Returns true when a and b are the same hash string.
 */
export function hashesEqual(a: string, b: string): boolean {
  return a === b;
}
