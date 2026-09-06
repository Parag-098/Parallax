/**
 * Diff engine.
 * Produces unified-diff patches from old and new file content strings.
 * Uses the `diff` npm package under the hood.
 */
import { createPatch, applyPatch } from 'diff';
import { v4 as uuidv4 } from 'uuid';
import type { DiffRecord } from '../events/types';
import { hashContent } from '../snapshots/hash';

export interface DiffResult {
  diffId: string;
  patch: string;
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Generate a unified diff between oldContent and newContent.
 * Returns a DiffRecord-ready object with a fresh diffId.
 */
export function generateDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
): DiffResult {
  const patch = createPatch(filePath, oldContent, newContent, '', '', {
    context: 3,
  });

  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      linesAdded++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      linesRemoved++;
    }
  }

  return {
    diffId: uuidv4(),
    patch,
    linesAdded,
    linesRemoved,
  };
}

/**
 * Apply a unified diff patch to oldContent and return the reconstructed content.
 * Returns null when the patch cannot be applied cleanly.
 */
export function applyDiff(oldContent: string, patch: string): string | null {
  try {
    const result = applyPatch(oldContent, patch);
    if (result === false) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Build a DiffRecord from a diff result and its file metadata.
 */
export function buildDiffRecord(
  filePath: string,
  projectId: string,
  beforeContent: string,
  afterContent: string,
  result: DiffResult,
): DiffRecord {
  return {
    diffId: result.diffId,
    filePath,
    projectId,
    timestamp: new Date().toISOString(),
    beforeHash: hashContent(beforeContent),
    afterHash: hashContent(afterContent),
    patch: result.patch,
    linesAdded: result.linesAdded,
    linesRemoved: result.linesRemoved,
  };
}
