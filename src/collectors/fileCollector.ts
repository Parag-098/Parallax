/**
 * File activity collector.
 *
 * Watches the VS Code workspace for file changes and emits typed Parallax events
 * after debouncing rapid edits so history stays meaningful.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ExclusionMatcher } from './exclusions';
import { hashContent } from '../snapshots/hash';
import { generateDiff, buildDiffRecord } from '../snapshots/diff';
import {
  createFileCreatedEvent,
  createFileModifiedEvent,
  createFileDeletedEvent,
  createFileRenamedEvent,
  createFileSavedEvent,
} from '../events/factory';
import type { ParallaxEvent } from '../events/types';
import type { IParallaxStorage } from '../storage/storage';

type EventEmitter = (event: ParallaxEvent) => void;

interface PendingModification {
  filePath: string;
  originalContent: string;
  timer: ReturnType<typeof setTimeout>;
}

export class FileCollector implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly exclusions: ExclusionMatcher;
  private readonly pendingMods = new Map<string, PendingModification>();
  private readonly contentCache = new Map<string, string>(); // filePath → last known content hash
  private isRunning = false;

  constructor(
    private readonly projectId: string,
    private readonly getSessionId: () => string | undefined,
    private readonly storage: IParallaxStorage,
    private readonly emit: EventEmitter,
    exclusions?: ExclusionMatcher,
  ) {
    this.exclusions = exclusions ?? new ExclusionMatcher();
  }

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    const watcher = vscode.workspace.createFileSystemWatcher('**/*');

    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => this.onCreated(uri)),
      watcher.onDidChange((uri) => this.onChanged(uri)),
      watcher.onDidDelete((uri) => this.onDeleted(uri)),
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSaved(doc)),
      vscode.workspace.onDidRenameFiles((e) => this.onRenamed(e)),
    );
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    this.flushAllPending();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  dispose(): void {
    this.stop();
  }

  // ---------- Handlers ----------

  private onCreated(uri: vscode.Uri): void {
    if (this.exclusions.isExcluded(uri.fsPath)) {
      return;
    }
    try {
      const content = fs.readFileSync(uri.fsPath, 'utf8');
      const afterHash = hashContent(content);
      this.contentCache.set(uri.fsPath, afterHash);

      const event = createFileCreatedEvent(
        this.projectId,
        this.getSessionId(),
        uri.fsPath,
        afterHash,
        Buffer.byteLength(content, 'utf8'),
      );
      this.storage
        .saveContent(afterHash, content)
        .catch(() => undefined);
      this.emit(event);
      this.storage
        .saveFileVersion({
          versionId: event.eventId,
          filePath: uri.fsPath,
          projectId: this.projectId,
          contentHash: afterHash,
          timestamp: event.timestamp,
          sizeBytes: Buffer.byteLength(content, 'utf8'),
          eventId: event.eventId,
        })
        .catch(() => undefined);
    } catch {
      // File may have been deleted immediately after creation – skip
    }
  }

  private onChanged(uri: vscode.Uri): void {
    if (this.exclusions.isExcluded(uri.fsPath)) {
      return;
    }

    const debounceMs = this.getDebounceMs();

    // Cancel any existing timer for this file
    const existing = this.pendingMods.get(uri.fsPath);
    let originalContent = '';

    if (existing) {
      clearTimeout(existing.timer);
      originalContent = existing.originalContent;
    } else {
      // Capture current on-disk content as the "before" baseline
      try {
        originalContent = fs.readFileSync(uri.fsPath, 'utf8');
      } catch {
        return;
      }
    }

    const timer = setTimeout(() => {
      this.flushModification(uri.fsPath, originalContent);
    }, debounceMs);

    this.pendingMods.set(uri.fsPath, {
      filePath: uri.fsPath,
      originalContent,
      timer,
    });
  }

  private onDeleted(uri: vscode.Uri): void {
    if (this.exclusions.isExcluded(uri.fsPath)) {
      return;
    }

    // Cancel any pending modification for this file
    const pending = this.pendingMods.get(uri.fsPath);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingMods.delete(uri.fsPath);
    }

    const beforeHash = this.contentCache.get(uri.fsPath) ?? '';

    const event = createFileDeletedEvent(
      this.projectId,
      this.getSessionId(),
      uri.fsPath,
      beforeHash,
    );
    this.contentCache.delete(uri.fsPath);
    this.emit(event);
  }

  private onSaved(doc: vscode.TextDocument): void {
    if (this.exclusions.isExcluded(doc.uri.fsPath)) {
      return;
    }

    const content = doc.getText();
    const contentHash = hashContent(content);

    // Cancel pending modification – save consolidates it
    const pending = this.pendingMods.get(doc.uri.fsPath);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingMods.delete(doc.uri.fsPath);
    }

    const lastHash = this.contentCache.get(doc.uri.fsPath);
    this.contentCache.set(doc.uri.fsPath, contentHash);

    // If content changed since last save, emit FILE_MODIFIED first
    if (lastHash && lastHash !== contentHash) {
      this.emitModification(doc.uri.fsPath, lastHash, contentHash, content);
    }

    const event = createFileSavedEvent(
      this.projectId,
      this.getSessionId(),
      doc.uri.fsPath,
      contentHash,
      Buffer.byteLength(content, 'utf8'),
    );
    this.storage.saveContent(contentHash, content).catch(() => undefined);
    this.emit(event);
    this.storage
      .saveFileVersion({
        versionId: event.eventId,
        filePath: doc.uri.fsPath,
        projectId: this.projectId,
        contentHash,
        timestamp: event.timestamp,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        eventId: event.eventId,
      })
      .catch(() => undefined);
  }

  private onRenamed(e: vscode.FileRenameEvent): void {
    for (const { oldUri, newUri } of e.files) {
      if (this.exclusions.isExcluded(newUri.fsPath)) {
        continue;
      }
      let contentHash = this.contentCache.get(oldUri.fsPath) ?? '';
      if (!contentHash) {
        try {
          contentHash = hashContent(fs.readFileSync(newUri.fsPath, 'utf8'));
        } catch {
          contentHash = '';
        }
      }
      this.contentCache.delete(oldUri.fsPath);
      this.contentCache.set(newUri.fsPath, contentHash);

      const event = createFileRenamedEvent(
        this.projectId,
        this.getSessionId(),
        oldUri.fsPath,
        newUri.fsPath,
        contentHash,
      );
      this.emit(event);
    }
  }

  // ---------- Helpers ----------

  private flushModification(filePath: string, originalContent: string): void {
    this.pendingMods.delete(filePath);
    let newContent: string;
    try {
      newContent = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    const beforeHash = hashContent(originalContent);
    const afterHash = hashContent(newContent);

    if (beforeHash === afterHash) {
      return; // no actual change
    }

    this.contentCache.set(filePath, afterHash);
    this.emitModification(filePath, beforeHash, afterHash, newContent, originalContent);
  }

  private emitModification(
    filePath: string,
    beforeHash: string,
    afterHash: string,
    newContent: string,
    oldContent?: string,
  ): void {
    let linesAdded = 0;
    let linesRemoved = 0;
    let diffId: string | undefined;

    if (oldContent !== undefined) {
      const result = generateDiff(filePath, oldContent, newContent);
      linesAdded = result.linesAdded;
      linesRemoved = result.linesRemoved;
      diffId = result.diffId;

      const diffRecord = buildDiffRecord(filePath, this.projectId, oldContent, newContent, result);
      this.storage.saveDiff(diffRecord).catch(() => undefined);
    }

    this.storage.saveContent(afterHash, newContent).catch(() => undefined);

    const event = createFileModifiedEvent(
      this.projectId,
      this.getSessionId(),
      filePath,
      beforeHash,
      afterHash,
      diffId,
      linesAdded,
      linesRemoved,
    );
    this.emit(event);
    this.storage
      .saveFileVersion({
        versionId: event.eventId,
        filePath,
        projectId: this.projectId,
        contentHash: afterHash,
        timestamp: event.timestamp,
        sizeBytes: Buffer.byteLength(newContent, 'utf8'),
        eventId: event.eventId,
      })
      .catch(() => undefined);
  }

  private flushAllPending(): void {
    for (const [filePath, pending] of this.pendingMods.entries()) {
      clearTimeout(pending.timer);
      this.flushModification(filePath, pending.originalContent);
    }
    this.pendingMods.clear();
  }

  private getDebounceMs(): number {
    try {
      const config = vscode.workspace.getConfiguration('parallax');
      return config.get<number>('debounceMs') ?? 1000;
    } catch {
      return 1000;
    }
  }

  /** Pre-populate the content cache by scanning existing workspace files */
  async preloadCache(workspaceRoot: string): Promise<void> {
    try {
      const files = await vscode.workspace.findFiles('**/*', '{node_modules,dist,build,.git}/**');
      for (const uri of files) {
        if (this.exclusions.isExcluded(uri.fsPath)) {
          continue;
        }
        try {
          const content = fs.readFileSync(uri.fsPath, 'utf8');
          const hash = hashContent(content);
          this.contentCache.set(uri.fsPath, hash);
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Workspace not open – skip
    }
  }
}
