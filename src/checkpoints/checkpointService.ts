/**
 * Checkpoint service.
 * Creates named milestones in the development history.
 * Does not modify the project – purely additive.
 */
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { createCheckpointCreatedEvent } from '../events/factory';
import type { Checkpoint, ParallaxEvent } from '../events/types';
import type { IParallaxStorage } from '../storage/storage';
import type { GitService } from '../git/gitService';
import type { SnapshotEngine } from '../snapshots/snapshotEngine';

export class CheckpointService {
  constructor(
    private readonly projectId: string,
    private readonly getSessionId: () => string | undefined,
    private readonly storage: IParallaxStorage,
    private readonly gitService: GitService | undefined,
    private readonly snapshotEngine: SnapshotEngine | undefined,
    private readonly emit: (event: ParallaxEvent) => void,
  ) {}

  async createCheckpoint(
    name: string,
    description: string,
  ): Promise<Checkpoint> {
    // Gather Git metadata if available
    let gitCommitHash: string | undefined;
    let gitBranch: string | undefined;
    if (this.gitService) {
      try {
        const info = await this.gitService.getCurrentInfo();
        gitCommitHash = info.commitHash;
        gitBranch = info.branch;
      } catch {
        // Git unavailable – continue
      }
    }

    // Take an associated snapshot
    let snapshotId: string | undefined;
    if (this.snapshotEngine) {
      try {
        const snap = await this.snapshotEngine.takeSnapshot('checkpoint');
        snapshotId = snap.snapshotId;
      } catch {
        // Snapshot failed – checkpoint still created
      }
    }

    const checkpointId = uuidv4();
    const timestamp = new Date().toISOString();

    const checkpoint: Checkpoint = {
      checkpointId,
      projectId: this.projectId,
      sessionId: this.getSessionId(),
      name,
      description,
      timestamp,
      snapshotId,
      gitCommitHash,
      gitBranch,
    };

    await this.storage.saveCheckpoint(checkpoint);

    const event = createCheckpointCreatedEvent(
      this.projectId,
      this.getSessionId(),
      checkpointId,
      name,
      description,
      snapshotId,
      gitCommitHash,
      gitBranch,
    );
    this.emit(event);
    await this.storage.appendEvent(event);

    return checkpoint;
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    return this.storage.loadCheckpointsForProject(this.projectId);
  }
}
