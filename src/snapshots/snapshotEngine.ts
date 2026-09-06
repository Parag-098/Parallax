/**
 * Snapshot engine.
 * Creates periodic or on-demand full snapshots of the workspace.
 * Each snapshot is a manifest of file paths + content hashes.
 * Actual content is stored in the content store keyed by hash.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ExclusionMatcher } from '../collectors/exclusions';
import { hashContent } from './hash';
import { createSnapshotCreatedEvent } from '../events/factory';
import type { Snapshot, SnapshotEntry } from '../events/types';
import type { IParallaxStorage } from '../storage/storage';

export class SnapshotEngine implements vscode.Disposable {
  private autoTimer: ReturnType<typeof setInterval> | undefined;
  private readonly exclusions: ExclusionMatcher;

  constructor(
    private readonly projectId: string,
    private readonly projectRoot: string,
    private readonly getSessionId: () => string | undefined,
    private readonly storage: IParallaxStorage,
    private readonly onEventEmit: (event: ReturnType<typeof createSnapshotCreatedEvent>) => void,
    exclusions?: ExclusionMatcher,
  ) {
    this.exclusions = exclusions ?? new ExclusionMatcher();
  }

  dispose(): void {
    this.stopAutoSnapshot();
  }

  startAutoSnapshot(): void {
    this.stopAutoSnapshot();
    const intervalMs = this.getIntervalMs();
    this.autoTimer = setInterval(() => {
      this.takeSnapshot('auto').catch(() => undefined);
    }, intervalMs);
  }

  stopAutoSnapshot(): void {
    if (this.autoTimer !== undefined) {
      clearInterval(this.autoTimer);
      this.autoTimer = undefined;
    }
  }

  async takeSnapshot(trigger: 'auto' | 'manual' | 'checkpoint'): Promise<Snapshot> {
    const entries = await this.collectEntries();
    const totalSizeBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

    const snapshot: Snapshot = {
      snapshotId: uuidv4(),
      projectId: this.projectId,
      sessionId: this.getSessionId(),
      timestamp: new Date().toISOString(),
      trigger,
      entries,
      totalSizeBytes,
    };

    await this.storage.saveSnapshot(snapshot);

    const event = createSnapshotCreatedEvent(
      this.projectId,
      this.getSessionId(),
      snapshot.snapshotId,
      entries.length,
      totalSizeBytes,
      trigger,
    );
    this.onEventEmit(event);
    await this.storage.appendEvent(event);

    return snapshot;
  }

  private async collectEntries(): Promise<SnapshotEntry[]> {
    let uris: vscode.Uri[];
    try {
      uris = await vscode.workspace.findFiles('**/*', '{node_modules,dist,build,.git,coverage,out}/**');
    } catch {
      return [];
    }

    const entries: SnapshotEntry[] = [];

    for (const uri of uris) {
      if (this.exclusions.isExcluded(uri.fsPath)) {
        continue;
      }
      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const contentHash = hashContent(content);
        const sizeBytes = Buffer.byteLength(content, 'utf8');

        // Persist content by hash
        await this.storage.saveContent(contentHash, content);

        entries.push({
          filePath: uri.fsPath,
          contentHash,
          sizeBytes,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return entries;
  }

  private getIntervalMs(): number {
    try {
      const config = vscode.workspace.getConfiguration('parallax');
      const minutes = config.get<number>('snapshotIntervalMinutes') ?? 30;
      return minutes * 60 * 1000;
    } catch {
      return 30 * 60 * 1000;
    }
  }
}
