/**
 * Replay engine.
 * Moves through development history event-by-event or by time.
 * Non-destructive: never modifies current working files.
 */
import type { ParallaxEvent } from '../events/types';
import type { IParallaxStorage } from '../storage/storage';

export type ReplayStatus = 'idle' | 'playing' | 'paused';

export interface ReplayState {
  status: ReplayStatus;
  events: ParallaxEvent[];
  currentIndex: number;
  currentTimestamp: string | undefined;
}

export type ReplayUpdateCallback = (state: ReplayState) => void;

export class ReplayEngine {
  private events: ParallaxEvent[] = [];
  private currentIndex = -1;
  private status: ReplayStatus = 'idle';
  private playTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners: ReplayUpdateCallback[] = [];
  private playIntervalMs = 800;

  constructor(private readonly storage: IParallaxStorage) {}

  /** Load all events for a project into the replay buffer */
  async loadProject(projectId: string): Promise<void> {
    this.stop();
    this.events = await this.storage.loadEventsForProject(projectId);
    this.currentIndex = this.events.length > 0 ? 0 : -1;
    this.notifyListeners();
  }

  /** Load events for a specific session */
  async loadSession(sessionId: string): Promise<void> {
    this.stop();
    this.events = await this.storage.loadEventsForSession(sessionId);
    this.currentIndex = this.events.length > 0 ? 0 : -1;
    this.notifyListeners();
  }

  getState(): ReplayState {
    return {
      status: this.status,
      events: this.events,
      currentIndex: this.currentIndex,
      currentTimestamp:
        this.currentIndex >= 0 && this.currentIndex < this.events.length
          ? this.events[this.currentIndex].timestamp
          : undefined,
    };
  }

  getCurrentEvent(): ParallaxEvent | undefined {
    if (this.currentIndex < 0 || this.currentIndex >= this.events.length) {
      return undefined;
    }
    return this.events[this.currentIndex];
  }

  stepForward(): boolean {
    if (this.currentIndex < this.events.length - 1) {
      this.currentIndex++;
      this.notifyListeners();
      return true;
    }
    return false;
  }

  stepBackward(): boolean {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.notifyListeners();
      return true;
    }
    return false;
  }

  jumpToIndex(index: number): void {
    if (index >= 0 && index < this.events.length) {
      this.currentIndex = index;
      this.notifyListeners();
    }
  }

  jumpToTimestamp(timestamp: string): void {
    // Find the last event at or before the target timestamp
    let best = 0;
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i].timestamp <= timestamp) {
        best = i;
      } else {
        break;
      }
    }
    this.currentIndex = best;
    this.notifyListeners();
  }

  play(intervalMs?: number): void {
    if (this.status === 'playing') {
      return;
    }
    if (intervalMs !== undefined) {
      this.playIntervalMs = intervalMs;
    }
    this.status = 'playing';
    this.scheduleNextStep();
    this.notifyListeners();
  }

  pause(): void {
    if (this.status !== 'playing') {
      return;
    }
    this.status = 'paused';
    this.clearTimer();
    this.notifyListeners();
  }

  stop(): void {
    this.status = 'idle';
    this.clearTimer();
    this.notifyListeners();
  }

  onUpdate(callback: ReplayUpdateCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx >= 0) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  private scheduleNextStep(): void {
    this.clearTimer();
    this.playTimer = setTimeout(() => {
      const advanced = this.stepForward();
      if (advanced && this.status === 'playing') {
        this.scheduleNextStep();
      } else {
        this.status = 'idle';
        this.notifyListeners();
      }
    }, this.playIntervalMs);
  }

  private clearTimer(): void {
    if (this.playTimer !== undefined) {
      clearTimeout(this.playTimer);
      this.playTimer = undefined;
    }
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Listener errors should not crash replay
      }
    }
  }
}
