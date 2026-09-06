/**
 * Historical state reconstruction service.
 *
 * Given a project and a target timestamp, reconstructs the file tree state
 * by finding the nearest preceding snapshot and replaying diffs forward.
 *
 * Strategy:
 *   1. Find the latest snapshot at or before targetTimestamp.
 *   2. Collect all FILE_MODIFIED / FILE_CREATED / FILE_DELETED / FILE_RENAMED
 *      events between the snapshot timestamp and targetTimestamp.
 *   3. Apply diffs sequentially to produce the final state.
 *   4. Return a map of filePath → content.
 */
import type { IParallaxStorage } from '../storage/storage';
import type {
  ParallaxEvent,
  Snapshot,
  FileModifiedEvent,
  FileCreatedEvent,
  FileDeletedEvent,
  FileRenamedEvent,
} from '../events/types';
import { applyDiff } from '../snapshots/diff';

export type ReconstructedState = Map<string, string>; // filePath → content

export interface ReconstructionResult {
  state: ReconstructedState;
  snapshotTimestamp: string | undefined;
  eventsApplied: number;
  warnings: string[];
}

export class ReconstructionService {
  constructor(private readonly storage: IParallaxStorage) {}

  /**
   * Reconstruct the state of all tracked files at a specific timestamp.
   * Returns a map of relative/absolute file path → file content string.
   */
  async reconstructState(
    projectId: string,
    targetTimestamp: string,
  ): Promise<ReconstructionResult> {
    const warnings: string[] = [];

    // 1. Find all snapshots for the project
    let snapshots: Snapshot[];
    try {
      snapshots = await this.storage.loadSnapshotsForProject(projectId);
    } catch {
      snapshots = [];
      warnings.push('Could not load snapshots – reconstructing from events only');
    }

    // Pick the latest snapshot at or before targetTimestamp
    const candidateSnapshots = snapshots.filter(
      (s) => s.timestamp <= targetTimestamp,
    );
    const baseSnapshot =
      candidateSnapshots.length > 0
        ? candidateSnapshots[candidateSnapshots.length - 1]
        : undefined;

    // 2. Load base state from snapshot
    const state: ReconstructedState = new Map();

    if (baseSnapshot) {
      for (const entry of baseSnapshot.entries) {
        const content = await this.storage.loadContent(entry.contentHash);
        if (content !== undefined) {
          state.set(entry.filePath, content);
        } else {
          warnings.push(
            `Missing content for hash ${entry.contentHash} (${entry.filePath})`,
          );
        }
      }
    }

    // 3. Load all events for this project after the snapshot (or from the start)
    let allEvents: ParallaxEvent[];
    try {
      allEvents = await this.storage.loadEventsForProject(projectId);
    } catch {
      allEvents = [];
      warnings.push('Could not load events');
    }

    const baseTime = baseSnapshot?.timestamp ?? '';
    const relevantEvents = allEvents.filter(
      (e) =>
        e.timestamp > baseTime &&
        e.timestamp <= targetTimestamp &&
        [
          'FILE_CREATED',
          'FILE_MODIFIED',
          'FILE_DELETED',
          'FILE_RENAMED',
        ].includes(e.type),
    );

    let eventsApplied = 0;

    // 4. Apply events chronologically
    for (const event of relevantEvents) {
      try {
        switch (event.type) {
          case 'FILE_CREATED': {
            const e = event as FileCreatedEvent;
            const content = await this.storage.loadContent(e.afterHash);
            if (content !== undefined) {
              state.set(e.filePath, content);
            } else {
              warnings.push(`Missing content for created file ${e.filePath}`);
              state.set(e.filePath, '');
            }
            eventsApplied++;
            break;
          }

          case 'FILE_MODIFIED': {
            const e = event as FileModifiedEvent;
            if (e.diffId) {
              const diff = await this.storage.loadDiff(e.diffId);
              if (diff) {
                const currentContent = state.get(e.filePath) ?? '';
                const patched = applyDiff(currentContent, diff.patch);
                if (patched !== null) {
                  state.set(e.filePath, patched);
                } else {
                  // Patch failed – fall back to loading content directly
                  const fallback = await this.storage.loadContent(e.afterHash);
                  if (fallback !== undefined) {
                    state.set(e.filePath, fallback);
                  } else {
                    warnings.push(
                      `Could not apply diff for ${e.filePath} at ${e.timestamp}`,
                    );
                  }
                }
              } else {
                // No diff record – load content directly
                const content = await this.storage.loadContent(e.afterHash);
                if (content !== undefined) {
                  state.set(e.filePath, content);
                } else {
                  warnings.push(
                    `Missing diff and content for ${e.filePath}`,
                  );
                }
              }
            } else {
              const content = await this.storage.loadContent(e.afterHash);
              if (content !== undefined) {
                state.set(e.filePath, content);
              }
            }
            eventsApplied++;
            break;
          }

          case 'FILE_DELETED': {
            const e = event as FileDeletedEvent;
            state.delete(e.filePath);
            eventsApplied++;
            break;
          }

          case 'FILE_RENAMED': {
            const e = event as FileRenamedEvent;
            const content = state.get(e.oldPath);
            if (content !== undefined) {
              state.set(e.newPath, content);
              state.delete(e.oldPath);
            } else {
              // Try loading from content store
              const stored = await this.storage.loadContent(e.contentHash);
              if (stored !== undefined) {
                state.set(e.newPath, stored);
              }
            }
            eventsApplied++;
            break;
          }
        }
      } catch {
        warnings.push(`Error applying event ${event.eventId} (${event.type})`);
      }
    }

    return {
      state,
      snapshotTimestamp: baseSnapshot?.timestamp,
      eventsApplied,
      warnings,
    };
  }

  /**
   * Retrieve the content of a single file at a given timestamp.
   * Returns undefined when the file did not exist at that time.
   */
  async getFileAtTimestamp(
    projectId: string,
    filePath: string,
    targetTimestamp: string,
  ): Promise<string | undefined> {
    const result = await this.reconstructState(projectId, targetTimestamp);
    return result.state.get(filePath);
  }
}
