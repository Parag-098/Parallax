/**
 * Git integration service.
 * Uses the VS Code Git extension API to detect commits, checkouts, and branch info.
 * Does not replace Git – only adds awareness.
 */
import * as vscode from 'vscode';
import {
  createGitCommitEvent,
  createGitCheckoutEvent,
} from '../events/factory';
import type { ParallaxEvent } from '../events/types';

// VS Code Git extension API types (minimal subset we need)
interface GitExtension {
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: RepositoryState;
  log(options?: { maxEntries?: number }): Promise<Commit[]>;
}

interface RepositoryState {
  HEAD: Branch | undefined;
  onDidChange: vscode.Event<void>;
}

interface Branch {
  name?: string;
  commit?: string;
  upstream?: { name?: string };
}

interface Commit {
  hash: string;
  message: string;
  authorName?: string;
  authorEmail?: string;
  commitDate?: Date;
}

export interface GitInfo {
  branch: string | undefined;
  commitHash: string | undefined;
  authorName: string | undefined;
  authorEmail: string | undefined;
}

export class GitService implements vscode.Disposable {
  private api: GitAPI | undefined;
  private repo: GitRepository | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private lastCommitHash: string | undefined;
  private lastBranch: string | undefined;

  constructor(
    private readonly projectId: string,
    private readonly getSessionId: () => string | undefined,
    private readonly emit: (event: ParallaxEvent) => void,
  ) {}

  async initialize(): Promise<void> {
    try {
      const gitExtension =
        vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!gitExtension) {
        return;
      }
      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }
      this.api = gitExtension.exports.getAPI(1);
      this.attachToRepo();
    } catch {
      // Git not available – continue without it
    }
  }

  private attachToRepo(): void {
    if (!this.api) {
      return;
    }
    const repos = this.api.repositories;
    if (repos.length > 0) {
      this.repo = repos[0];
      this.watchRepo();
    }
    this.disposables.push(
      this.api.onDidOpenRepository((repo) => {
        this.repo = repo;
        this.watchRepo();
      }),
    );
  }

  private watchRepo(): void {
    if (!this.repo) {
      return;
    }
    // Capture initial state
    const head = this.repo.state.HEAD;
    if (head) {
      this.lastCommitHash = head.commit;
      this.lastBranch = head.name;
    }

    this.disposables.push(
      this.repo.state.onDidChange(async () => {
        if (!this.repo) {
          return;
        }
        const head = this.repo.state.HEAD;
        if (!head) {
          return;
        }

        const newCommit = head.commit;
        const newBranch = head.name;

        try {
          if (newCommit && newCommit !== this.lastCommitHash) {
            // A new commit happened
            const logs = await this.repo.log({ maxEntries: 1 });
            const latest = logs[0];
            if (latest) {
              const event = createGitCommitEvent(
                this.projectId,
                this.getSessionId(),
                latest.hash,
                latest.message ?? '',
                newBranch ?? 'HEAD',
                latest.authorName ?? '',
                latest.authorEmail ?? '',
                0,
              );
              this.emit(event);
            }
            this.lastCommitHash = newCommit;
          }

          if (newBranch && newBranch !== this.lastBranch) {
            // Branch changed
            const event = createGitCheckoutEvent(
              this.projectId,
              this.getSessionId(),
              this.lastBranch ?? '',
              newBranch,
              newCommit ?? '',
            );
            this.emit(event);
            this.lastBranch = newBranch;
          }
        } catch {
          // Git operations can fail – swallow and continue
        }
      }),
    );
  }

  async getCurrentInfo(): Promise<GitInfo> {
    if (!this.repo) {
      return {
        branch: undefined,
        commitHash: undefined,
        authorName: undefined,
        authorEmail: undefined,
      };
    }
    try {
      const head = this.repo.state.HEAD;
      let authorName: string | undefined;
      let authorEmail: string | undefined;

      try {
        const logs = await this.repo.log({ maxEntries: 1 });
        if (logs.length > 0) {
          authorName = logs[0].authorName;
          authorEmail = logs[0].authorEmail;
        }
      } catch {
        // Ignore
      }

      return {
        branch: head?.name,
        commitHash: head?.commit,
        authorName,
        authorEmail,
      };
    } catch {
      return {
        branch: undefined,
        commitHash: undefined,
        authorName: undefined,
        authorEmail: undefined,
      };
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
