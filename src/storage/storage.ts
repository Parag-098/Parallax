/**
 * Storage abstraction for Parallax.
 *
 * All persistent state is stored as JSON files inside VS Code's
 * globalStorageUri directory.  The abstraction is intentionally thin so it
 * can be swapped for a backend implementation in a future phase without
 * touching business logic.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ParallaxEvent,
  Project,
  Session,
  Checkpoint,
  FileVersion,
  DiffRecord,
  Snapshot,
} from '../events/types';
import { deserializeEvent, serializeEvent } from '../events/factory';

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export interface IParallaxStorage {
  // Projects
  saveProject(project: Project): Promise<void>;
  loadProject(projectId: string): Promise<Project | undefined>;
  loadAllProjects(): Promise<Project[]>;

  // Sessions
  saveSession(session: Session): Promise<void>;
  loadSession(sessionId: string): Promise<Session | undefined>;
  loadSessionsForProject(projectId: string): Promise<Session[]>;

  // Events
  appendEvent(event: ParallaxEvent): Promise<void>;
  loadEventsForSession(sessionId: string): Promise<ParallaxEvent[]>;
  loadEventsForProject(projectId: string, limit?: number): Promise<ParallaxEvent[]>;

  // File versions
  saveFileVersion(version: FileVersion): Promise<void>;
  loadFileVersions(projectId: string, filePath: string): Promise<FileVersion[]>;
  loadFileVersionByHash(projectId: string, contentHash: string): Promise<FileVersion | undefined>;

  // Diffs
  saveDiff(diff: DiffRecord): Promise<void>;
  loadDiff(diffId: string): Promise<DiffRecord | undefined>;
  loadDiffsForFile(projectId: string, filePath: string): Promise<DiffRecord[]>;

  // Snapshots
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  loadSnapshot(snapshotId: string): Promise<Snapshot | undefined>;
  loadSnapshotsForProject(projectId: string): Promise<Snapshot[]>;

  // Checkpoints
  saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
  loadCheckpoint(checkpointId: string): Promise<Checkpoint | undefined>;
  loadCheckpointsForProject(projectId: string): Promise<Checkpoint[]>;

  // Content store (indexed by hash)
  saveContent(hash: string, content: string): Promise<void>;
  loadContent(hash: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// JSON file-based implementation
// ---------------------------------------------------------------------------

/**
 * Persists all data as JSON files inside the extension's global storage directory.
 *
 * Directory layout:
 *   <storageRoot>/
 *     projects/
 *       <projectId>.json
 *     sessions/
 *       <sessionId>.json
 *     events/
 *       <projectId>/
 *         <sessionId>.jsonl      ← one JSON object per line
 *     fileVersions/
 *       <projectId>/
 *         <urlEncoded-filePath>.json
 *     diffs/
 *       <projectId>/
 *         <diffId>.json
 *     snapshots/
 *       <projectId>/
 *         <snapshotId>.json
 *     checkpoints/
 *       <projectId>/
 *         <checkpointId>.json
 *     content/
 *       <first2chars>/
 *         <hash>.txt             ← sharded to keep directories manageable
 */
export class JsonFileStorage implements IParallaxStorage {
  private readonly root: string;

  constructor(storageUri: vscode.Uri) {
    this.root = storageUri.fsPath;
    this.ensureDir(this.root);
  }

  // ---------- helpers ----------

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private readJson<T>(filePath: string): T | undefined {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  private writeJson(filePath: string, data: unknown): void {
    this.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private readJsonl<T>(filePath: string): T[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const results: T[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        results.push(JSON.parse(trimmed) as T);
      } catch {
        // skip corrupted lines
      }
    }
    return results;
  }

  private appendJsonl(filePath: string, data: unknown): void {
    this.ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, JSON.stringify(data) + '\n', 'utf8');
  }

  private safeFilename(raw: string): string {
    // Replace characters unsafe for file paths with underscores
    return raw.replace(/[/\\:*?"<>|]/g, '_');
  }

  // ---------- Projects ----------

  async saveProject(project: Project): Promise<void> {
    const dir = path.join(this.root, 'projects');
    this.writeJson(path.join(dir, `${project.projectId}.json`), project);
  }

  async loadProject(projectId: string): Promise<Project | undefined> {
    return this.readJson<Project>(
      path.join(this.root, 'projects', `${projectId}.json`),
    );
  }

  async loadAllProjects(): Promise<Project[]> {
    const dir = path.join(this.root, 'projects');
    if (!fs.existsSync(dir)) {
      return [];
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => this.readJson<Project>(path.join(dir, f)))
      .filter((p): p is Project => p !== undefined);
  }

  // ---------- Sessions ----------

  async saveSession(session: Session): Promise<void> {
    const dir = path.join(this.root, 'sessions');
    this.writeJson(path.join(dir, `${session.sessionId}.json`), session);
  }

  async loadSession(sessionId: string): Promise<Session | undefined> {
    return this.readJson<Session>(
      path.join(this.root, 'sessions', `${sessionId}.json`),
    );
  }

  async loadSessionsForProject(projectId: string): Promise<Session[]> {
    const dir = path.join(this.root, 'sessions');
    if (!fs.existsSync(dir)) {
      return [];
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => this.readJson<Session>(path.join(dir, f)))
      .filter((s): s is Session => s !== undefined && s.projectId === projectId);
  }

  // ---------- Events ----------

  async appendEvent(event: ParallaxEvent): Promise<void> {
    const dir = path.join(this.root, 'events', event.projectId);
    const sessionKey = event.sessionId ?? '_global';
    this.appendJsonl(path.join(dir, `${sessionKey}.jsonl`), event);
  }

  async loadEventsForSession(sessionId: string): Promise<ParallaxEvent[]> {
    // We don't know the projectId without scanning, so search all project dirs
    const eventsRoot = path.join(this.root, 'events');
    if (!fs.existsSync(eventsRoot)) {
      return [];
    }
    const events: ParallaxEvent[] = [];
    for (const projectDir of fs.readdirSync(eventsRoot)) {
      const filePath = path.join(eventsRoot, projectDir, `${sessionId}.jsonl`);
      if (fs.existsSync(filePath)) {
        const raw = this.readJsonl<Record<string, unknown>>(filePath);
        for (const obj of raw) {
          try {
            events.push(deserializeEvent(JSON.stringify(obj)));
          } catch {
            // skip invalid
          }
        }
      }
    }
    return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async loadEventsForProject(
    projectId: string,
    limit?: number,
  ): Promise<ParallaxEvent[]> {
    const dir = path.join(this.root, 'events', projectId);
    if (!fs.existsSync(dir)) {
      return [];
    }
    const events: ParallaxEvent[] = [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      const raw = this.readJsonl<Record<string, unknown>>(
        path.join(dir, file),
      );
      for (const obj of raw) {
        try {
          events.push(deserializeEvent(JSON.stringify(obj)));
        } catch {
          // skip invalid
        }
      }
    }
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (limit !== undefined && events.length > limit) {
      return events.slice(events.length - limit);
    }
    return events;
  }

  // ---------- File versions ----------

  async saveFileVersion(version: FileVersion): Promise<void> {
    const dir = path.join(this.root, 'fileVersions', version.projectId);
    const safe = this.safeFilename(version.filePath);
    const existing =
      this.readJson<FileVersion[]>(path.join(dir, `${safe}.json`)) ?? [];
    // Avoid duplicates by hash+timestamp
    const alreadyExists = existing.some(
      (v) =>
        v.contentHash === version.contentHash &&
        v.timestamp === version.timestamp,
    );
    if (!alreadyExists) {
      existing.push(version);
      this.writeJson(path.join(dir, `${safe}.json`), existing);
    }
  }

  async loadFileVersions(
    projectId: string,
    filePath: string,
  ): Promise<FileVersion[]> {
    const safe = this.safeFilename(filePath);
    return (
      this.readJson<FileVersion[]>(
        path.join(this.root, 'fileVersions', projectId, `${safe}.json`),
      ) ?? []
    );
  }

  async loadFileVersionByHash(
    projectId: string,
    contentHash: string,
  ): Promise<FileVersion | undefined> {
    const dir = path.join(this.root, 'fileVersions', projectId);
    if (!fs.existsSync(dir)) {
      return undefined;
    }
    for (const file of fs.readdirSync(dir)) {
      const versions = this.readJson<FileVersion[]>(path.join(dir, file));
      if (!versions) {
        continue;
      }
      const found = versions.find((v) => v.contentHash === contentHash);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  // ---------- Diffs ----------

  async saveDiff(diff: DiffRecord): Promise<void> {
    const dir = path.join(this.root, 'diffs', diff.projectId);
    this.writeJson(path.join(dir, `${diff.diffId}.json`), diff);
  }

  async loadDiff(diffId: string): Promise<DiffRecord | undefined> {
    const diffsRoot = path.join(this.root, 'diffs');
    if (!fs.existsSync(diffsRoot)) {
      return undefined;
    }
    for (const projectDir of fs.readdirSync(diffsRoot)) {
      const filePath = path.join(diffsRoot, projectDir, `${diffId}.json`);
      if (fs.existsSync(filePath)) {
        return this.readJson<DiffRecord>(filePath);
      }
    }
    return undefined;
  }

  async loadDiffsForFile(
    projectId: string,
    filePath: string,
  ): Promise<DiffRecord[]> {
    const dir = path.join(this.root, 'diffs', projectId);
    if (!fs.existsSync(dir)) {
      return [];
    }
    const results: DiffRecord[] = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const diff = this.readJson<DiffRecord>(path.join(dir, file));
      if (diff && diff.filePath === filePath) {
        results.push(diff);
      }
    }
    return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // ---------- Snapshots ----------

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    const dir = path.join(this.root, 'snapshots', snapshot.projectId);
    this.writeJson(path.join(dir, `${snapshot.snapshotId}.json`), snapshot);
  }

  async loadSnapshot(snapshotId: string): Promise<Snapshot | undefined> {
    const root = path.join(this.root, 'snapshots');
    if (!fs.existsSync(root)) {
      return undefined;
    }
    for (const projectDir of fs.readdirSync(root)) {
      const filePath = path.join(root, projectDir, `${snapshotId}.json`);
      if (fs.existsSync(filePath)) {
        return this.readJson<Snapshot>(filePath);
      }
    }
    return undefined;
  }

  async loadSnapshotsForProject(projectId: string): Promise<Snapshot[]> {
    const dir = path.join(this.root, 'snapshots', projectId);
    if (!fs.existsSync(dir)) {
      return [];
    }
    const results: Snapshot[] = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const snap = this.readJson<Snapshot>(path.join(dir, file));
      if (snap) {
        results.push(snap);
      }
    }
    return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // ---------- Checkpoints ----------

  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const dir = path.join(this.root, 'checkpoints', checkpoint.projectId);
    this.writeJson(
      path.join(dir, `${checkpoint.checkpointId}.json`),
      checkpoint,
    );
  }

  async loadCheckpoint(checkpointId: string): Promise<Checkpoint | undefined> {
    const root = path.join(this.root, 'checkpoints');
    if (!fs.existsSync(root)) {
      return undefined;
    }
    for (const projectDir of fs.readdirSync(root)) {
      const filePath = path.join(root, projectDir, `${checkpointId}.json`);
      if (fs.existsSync(filePath)) {
        return this.readJson<Checkpoint>(filePath);
      }
    }
    return undefined;
  }

  async loadCheckpointsForProject(projectId: string): Promise<Checkpoint[]> {
    const dir = path.join(this.root, 'checkpoints', projectId);
    if (!fs.existsSync(dir)) {
      return [];
    }
    const results: Checkpoint[] = [];
    for (const file of fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))) {
      const cp = this.readJson<Checkpoint>(path.join(dir, file));
      if (cp) {
        results.push(cp);
      }
    }
    return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // ---------- Content store ----------

  async saveContent(hash: string, content: string): Promise<void> {
    const shard = hash.slice(0, 2);
    const dir = path.join(this.root, 'content', shard);
    const filePath = path.join(dir, `${hash}.txt`);
    if (!fs.existsSync(filePath)) {
      this.ensureDir(dir);
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  async loadContent(hash: string): Promise<string | undefined> {
    const shard = hash.slice(0, 2);
    const filePath = path.join(this.root, 'content', shard, `${hash}.txt`);
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return undefined;
    }
  }
}
