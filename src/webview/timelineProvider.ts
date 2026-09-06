/**
 * Timeline webview provider.
 * Hosts the React app and handles message passing between extension and UI.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { IParallaxStorage } from '../storage/storage';
import type { ReplayEngine } from '../replay/replayEngine';
import type { ReconstructionService } from '../snapshots/reconstruction';
import type { CheckpointService } from '../checkpoints/checkpointService';
import type { ParallaxEvent, Project, Session, Checkpoint } from '../events/types';
import type {
  ExtensionMessage,
  WebviewMessage,
} from './messages';

export class TimelineWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'parallax.timelineView';

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storage: IParallaxStorage,
    private readonly replay: ReplayEngine,
    private readonly reconstruction: ReconstructionService,
    private readonly checkpoints: CheckpointService,
    private readonly project: Project | undefined,
    private readonly getSessions: () => Promise<Session[]>,
    private readonly isRecordingFn: () => boolean,
    private readonly startRecordingFn: () => Promise<void>,
    private readonly stopRecordingFn: () => Promise<void>,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      this.handleWebviewMessage(msg).catch((err) => {
        console.error('[Parallax] Webview message error:', err);
      });
    });

    // Listen for replay state changes and push to webview
    this.replay.onUpdate((state) => {
      this.postMessage({
        type: 'replayState',
        status: state.status,
        currentIndex: state.currentIndex,
        currentTimestamp: state.currentTimestamp,
      });
    });
  }

  /** Push an updated event list to the webview */
  pushEventsUpdate(events: ParallaxEvent[]): void {
    this.postMessage({ type: 'eventsUpdated', events });
  }

  /** Notify the webview of recording status change */
  pushRecordingStatus(isRecording: boolean): void {
    this.postMessage({ type: 'recordingStatus', isRecording });
  }

  private async handleWebviewMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.sendInitialData();
        break;

      case 'startRecording':
        await this.startRecordingFn();
        break;

      case 'stopRecording':
        await this.stopRecordingFn();
        break;

      case 'replayPlay':
        this.replay.play();
        break;

      case 'replayPause':
        this.replay.pause();
        break;

      case 'replayStepForward':
        this.replay.stepForward();
        break;

      case 'replayStepBackward':
        this.replay.stepBackward();
        break;

      case 'replayJumpToIndex':
        this.replay.jumpToIndex(msg.index);
        break;

      case 'replayJumpToTimestamp':
        this.replay.jumpToTimestamp(msg.timestamp);
        break;

      case 'getFileContent':
        await this.handleGetFileContent(msg.requestId, msg.filePath, msg.timestamp);
        break;

      case 'getDiff':
        await this.handleGetDiff(msg.requestId, msg.diffId);
        break;

      case 'createCheckpoint':
        await this.checkpoints.createCheckpoint(msg.name, msg.description);
        break;
    }
  }

  private async sendInitialData(): Promise<void> {
    if (!this.project) {
      return;
    }
    try {
      const [events, sessions, checkpoints] = await Promise.all([
        this.storage.loadEventsForProject(this.project.projectId),
        this.getSessions(),
        this.checkpoints.listCheckpoints(),
      ]);

      await this.replay.loadProject(this.project.projectId);

      this.postMessage({
        type: 'initialize',
        projectId: this.project.projectId,
        projectName: this.project.name,
        projectPath: this.project.rootPath,
        events,
        sessions,
        checkpoints,
        isRecording: this.isRecordingFn(),
      });
    } catch (err) {
      this.postMessage({
        type: 'error',
        message: `Failed to load project data: ${err}`,
      });
    }
  }

  private async handleGetFileContent(
    requestId: string,
    filePath: string,
    timestamp: string,
  ): Promise<void> {
    if (!this.project) {
      return;
    }
    try {
      const content = await this.reconstruction.getFileAtTimestamp(
        this.project.projectId,
        filePath,
        timestamp,
      );
      this.postMessage({
        type: 'fileContent',
        requestId,
        filePath,
        content,
        timestamp,
        error: undefined,
      });
    } catch (err) {
      this.postMessage({
        type: 'fileContent',
        requestId,
        filePath,
        content: undefined,
        timestamp,
        error: `${err}`,
      });
    }
  }

  private async handleGetDiff(requestId: string, diffId: string): Promise<void> {
    try {
      const diff = await this.storage.loadDiff(diffId);
      let beforeContent: string | undefined;
      let afterContent: string | undefined;

      if (diff) {
        [beforeContent, afterContent] = await Promise.all([
          this.storage.loadContent(diff.beforeHash),
          this.storage.loadContent(diff.afterHash),
        ]);
      }

      this.postMessage({
        type: 'diffContent',
        requestId,
        diff,
        beforeContent,
        afterContent,
        error: undefined,
      });
    } catch (err) {
      this.postMessage({
        type: 'diffContent',
        requestId,
        diff: undefined,
        beforeContent: undefined,
        afterContent: undefined,
        error: `${err}`,
      });
    }
  }

  private postMessage(msg: ExtensionMessage): void {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'webview.js'),
    );

    const nonce = generateNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data:;" />
  <title>Parallax Timeline</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; width: 100%; overflow: hidden; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
