/**
 * Parallax VS Code extension entry point.
 * Wires all modules together and manages the extension lifecycle.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { JsonFileStorage } from './storage/storage';
import { FileCollector } from './collectors/fileCollector';
import { ExclusionMatcher } from './collectors/exclusions';
import { SnapshotEngine } from './snapshots/snapshotEngine';
import { ReconstructionService } from './snapshots/reconstruction';
import { GitService } from './git/gitService';
import { CheckpointService } from './checkpoints/checkpointService';
import { ReplayEngine } from './replay/replayEngine';
import { TimelineWebviewProvider } from './webview/timelineProvider';
import { registerCommands } from './commands/commands';
import type { ParallaxEvent, Project, Session } from './events/types';
import {
  createProjectOpenedEvent,
  createSessionStartedEvent,
  createSessionEndedEvent,
} from './events/factory';

// ---------------------------------------------------------------------------
// ParallaxController – central coordinator
// ---------------------------------------------------------------------------

export class ParallaxController implements vscode.Disposable {
  private storage: JsonFileStorage;
  private exclusions: ExclusionMatcher;
  private collector: FileCollector | undefined;
  private snapshotEngine: SnapshotEngine | undefined;
  private gitService: GitService | undefined;
  private checkpointSvc: CheckpointService | undefined;
  private replayEngine: ReplayEngine;
  private reconstructionSvc: ReconstructionService;
  private webviewProvider: TimelineWebviewProvider | undefined;

  private project: Project | undefined;
  private activeSession: Session | undefined;
  private isRecording = false;

  private statusBarItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly eventBuffer: ParallaxEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
  ) {
    this.storage = new JsonFileStorage(context.globalStorageUri);
    this.exclusions = new ExclusionMatcher();
    this.replayEngine = new ReplayEngine(this.storage);
    this.reconstructionSvc = new ReconstructionService(this.storage);

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = 'parallax.openTimeline';
    this.updateStatusBar();
    this.statusBarItem.show();
  }

  // ---------- Lifecycle ----------

  async initialize(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.updateStatusBar('No workspace');
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const projectId = deriveProjectId(workspaceRoot);
    const projectName = path.basename(workspaceRoot);

    // Load or create project record
    let project = await this.storage.loadProject(projectId);
    if (!project) {
      project = {
        projectId,
        name: projectName,
        rootPath: workspaceRoot,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      await this.storage.saveProject(project);

      const openedEvent = createProjectOpenedEvent(projectId, workspaceRoot, projectName);
      await this.storage.appendEvent(openedEvent);
    } else {
      project.lastActiveAt = new Date().toISOString();
      await this.storage.saveProject(project);
    }

    this.project = project;

    // Initialize Git service
    this.gitService = new GitService(
      projectId,
      () => this.activeSession?.sessionId,
      (event) => this.handleEvent(event),
    );
    await this.gitService.initialize();

    // Initialize snapshot engine
    this.snapshotEngine = new SnapshotEngine(
      projectId,
      workspaceRoot,
      () => this.activeSession?.sessionId,
      this.storage,
      (event) => this.handleEvent(event),
      this.exclusions,
    );

    // Initialize checkpoint service
    this.checkpointSvc = new CheckpointService(
      projectId,
      () => this.activeSession?.sessionId,
      this.storage,
      this.gitService,
      this.snapshotEngine,
      (event) => this.handleEvent(event),
    );

    // Check autostart setting
    const config = vscode.workspace.getConfiguration('parallax');
    const autoStart = config.get<boolean>('recordingEnabled') ?? true;
    if (autoStart) {
      await this.startRecording();
    }

    this.updateStatusBar();
  }

  async startRecording(): Promise<void> {
    if (!this.project) {
      void vscode.window.showWarningMessage('Parallax: No workspace open.');
      return;
    }
    if (this.isRecording) {
      return;
    }

    const sessionId = uuidv4();
    const startTime = new Date().toISOString();

    const session: Session = {
      sessionId,
      projectId: this.project.projectId,
      startTime,
      endTime: undefined,
      eventCount: 0,
    };
    await this.storage.saveSession(session);
    this.activeSession = session;

    const event = createSessionStartedEvent(this.project.projectId, sessionId);
    await this.storage.appendEvent(event);

    // Start file collector
    this.collector = new FileCollector(
      this.project.projectId,
      () => this.activeSession?.sessionId,
      this.storage,
      (ev) => this.handleEvent(ev),
      this.exclusions,
    );
    await this.collector.preloadCache(this.project.rootPath);
    this.collector.start();

    // Start auto-snapshot
    this.snapshotEngine?.startAutoSnapshot();

    this.isRecording = true;
    this.updateStatusBar();
    this.webviewProvider?.pushRecordingStatus(true);
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording || !this.activeSession || !this.project) {
      return;
    }

    this.collector?.stop();
    this.snapshotEngine?.stopAutoSnapshot();

    const event = createSessionEndedEvent(
      this.project.projectId,
      this.activeSession.sessionId,
      this.activeSession.startTime,
    );
    await this.storage.appendEvent(event);

    const endTime = new Date().toISOString();
    this.activeSession.endTime = endTime;
    await this.storage.saveSession(this.activeSession);

    this.isRecording = false;
    this.activeSession = undefined;
    this.updateStatusBar();
    this.webviewProvider?.pushRecordingStatus(false);
  }

  async createCheckpoint(name: string, description: string): Promise<void> {
    if (!this.checkpointSvc) {
      void vscode.window.showWarningMessage('Parallax: No workspace open.');
      return;
    }
    await this.checkpointSvc.createCheckpoint(name, description);
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  getProject(): Project | undefined {
    return this.project;
  }

  async getSessions(): Promise<Session[]> {
    if (!this.project) {
      return [];
    }
    return this.storage.loadSessionsForProject(this.project.projectId);
  }

  getStorage(): JsonFileStorage {
    return this.storage;
  }

  getReplayEngine(): ReplayEngine {
    return this.replayEngine;
  }

  getReconstruction(): ReconstructionService {
    return this.reconstructionSvc;
  }

  getCheckpointService(): CheckpointService | undefined {
    return this.checkpointSvc;
  }

  setWebviewProvider(provider: TimelineWebviewProvider): void {
    this.webviewProvider = provider;
  }

  // ---------- Event handling ----------

  private handleEvent(event: ParallaxEvent): void {
    this.storage.appendEvent(event).catch(() => undefined);

    if (this.activeSession) {
      this.activeSession.eventCount++;
      this.storage.saveSession(this.activeSession).catch(() => undefined);
    }

    // Buffer events and flush to webview in batches
    this.eventBuffer.push(event);
    if (this.flushTimer === undefined) {
      this.flushTimer = setTimeout(() => {
        this.flushToWebview();
      }, 500);
    }
  }

  private flushToWebview(): void {
    this.flushTimer = undefined;
    if (this.eventBuffer.length === 0 || !this.project) {
      return;
    }

    this.storage
      .loadEventsForProject(this.project.projectId)
      .then((events) => {
        this.webviewProvider?.pushEventsUpdate(events);
        this.replayEngine.loadProject(this.project!.projectId).catch(() => undefined);
      })
      .catch(() => undefined);

    this.eventBuffer.length = 0;
  }

  // ---------- Status bar ----------

  private updateStatusBar(message?: string): void {
    if (message) {
      this.statusBarItem.text = `$(history) Parallax: ${message}`;
      return;
    }
    if (!this.project) {
      this.statusBarItem.text = '$(history) Parallax';
      this.statusBarItem.tooltip = 'Open Parallax timeline';
      return;
    }
    if (this.isRecording) {
      this.statusBarItem.text = '$(record) Parallax: Recording';
      this.statusBarItem.tooltip = 'Parallax is recording – click to open timeline';
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      this.statusBarItem.text = '$(history) Parallax: Stopped';
      this.statusBarItem.tooltip = 'Parallax recording stopped – click to open timeline';
      this.statusBarItem.color = undefined;
    }
  }

  // ---------- Disposable ----------

  dispose(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
    }
    this.collector?.dispose();
    this.snapshotEngine?.dispose();
    this.gitService?.dispose();
    this.statusBarItem.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

// ---------------------------------------------------------------------------
// Extension activate / deactivate
// ---------------------------------------------------------------------------

let controller: ParallaxController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    controller = new ParallaxController(context);

    const checkpointSvcPlaceholder = {
      createCheckpoint: async (n: string, d: string) =>
        controller!.createCheckpoint(n, d),
      listCheckpoints: async () => {
        if (!controller?.getCheckpointService()) {
          return [];
        }
        return controller!.getCheckpointService()!.listCheckpoints();
      },
    };

    const webviewProvider = new TimelineWebviewProvider(
      context.extensionUri,
      controller.getStorage(),
      controller.getReplayEngine(),
      controller.getReconstruction(),
      checkpointSvcPlaceholder as unknown as import('./checkpoints/checkpointService').CheckpointService,
      controller.getProject(),
      () => controller!.getSessions(),
      () => controller!.isCurrentlyRecording(),
      () => controller!.startRecording(),
      () => controller!.stopRecording(),
    );
    controller.setWebviewProvider(webviewProvider);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        TimelineWebviewProvider.viewType,
        webviewProvider,
      ),
    );

    registerCommands(context, controller);

    context.subscriptions.push(controller);

    await controller.initialize();

    console.log('[Parallax] Extension activated');
  } catch (err) {
    console.error('[Parallax] Activation failed:', err);
  }
}

export async function deactivate(): Promise<void> {
  try {
    await controller?.stopRecording();
  } catch {
    // Ignore deactivation errors
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a stable project ID from the workspace root path.
 * Uses a hash of the absolute path so the ID is stable across restarts.
 */
function deriveProjectId(workspaceRoot: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto
    .createHash('sha256')
    .update(workspaceRoot.toLowerCase().replace(/\\/g, '/'))
    .digest('hex')
    .slice(0, 16);
}
