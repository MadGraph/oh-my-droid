/**
 * Worker Pool Management
 *
 * Orchestrates CMUX and tmux workers for parallel task execution.
 * Provides a unified interface for spawning, monitoring, and closing workers
 * regardless of the underlying worker mode.
 */

import { detectWorkerMode, type DetectionResult } from './detection.js';
import {
  spawnCmuxWorker,
  readCmuxScreen,
  closeCmuxWorker,
} from './cmux-worker.js';
import {
  spawnTmuxWorker,
  readTmuxPane,
  closeTmuxWorker,
} from './tmux-worker.js';
import { TaskManager } from './task-manager.js';
import type {
  WorkerConfig,
  WorkerHandle,
  WorkerMode,
  WorkerStatusFile,
} from './types.js';

/**
 * Result of reading a worker's screen/pane
 */
export interface ReadScreenResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Result of spawning workers
 */
export interface SpawnAllResult {
  spawned: string[];
  failed: { id: string; error: string }[];
}

/**
 * Completion check result
 */
export interface CompletionStatus {
  completed: string[];
  running: string[];
  failed: string[];
}

/**
 * Result of closing workers
 */
export interface CloseAllResult {
  closed: string[];
  failed: { id: string; error: string }[];
}

/**
 * Team Worker Pool
 *
 * Manages a pool of workers for parallel task execution.
 * Automatically detects the best available worker mode (CMUX or tmux)
 * and provides a unified interface for worker lifecycle management.
 */
export class TeamWorkerPool {
  private workers: Map<string, WorkerHandle> = new Map();
  private mode: WorkerMode;
  private detection: DetectionResult;
  private taskManager: TaskManager;
  private tmuxSession: string;

  /**
   * Create a new worker pool
   *
   * @param slug - Team/pool identifier (used for tmux session naming)
   * @param teamDir - Directory for task/status files
   */
  constructor(
    private slug: string,
    private teamDir: string
  ) {
    this.detection = detectWorkerMode();
    this.mode = this.detection.mode;
    this.taskManager = new TaskManager(teamDir);
    this.tmuxSession = `omd-team-${slug}`;

    // Initialize directories
    this.taskManager.ensureDirectories();
  }

  /**
   * Get the active worker mode
   */
  getMode(): WorkerMode {
    return this.mode;
  }

  /**
   * Get the detection result
   */
  getDetection(): DetectionResult {
    return this.detection;
  }

  /**
   * Get the task manager instance
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  /**
   * Get the tmux session name (if applicable)
   */
  getTmuxSession(): string {
    return this.tmuxSession;
  }

  /**
   * Spawn a single worker
   *
   * @param config - Worker configuration
   * @returns Success status and optional error
   */
  spawnWorker(config: WorkerConfig): { success: boolean; error?: string } {
    // Check if worker already exists
    if (this.workers.has(config.id)) {
      return { success: false, error: `Worker ${config.id} already exists` };
    }

    let result: { success: boolean; handle?: WorkerHandle; error?: string };

    switch (this.mode) {
      case 'cmux':
        result = spawnCmuxWorker(config);
        break;
      case 'tmux':
        result = spawnTmuxWorker(config, this.tmuxSession);
        break;
      default:
        return { success: false, error: 'nohup mode not implemented in v3' };
    }

    if (result.success && result.handle) {
      this.workers.set(config.id, result.handle);
      return { success: true };
    }

    return { success: false, error: result.error };
  }

  /**
   * Spawn multiple workers
   *
   * @param configs - Array of worker configurations
   * @returns Arrays of spawned IDs and failed spawns with errors
   */
  spawnAll(configs: WorkerConfig[]): SpawnAllResult {
    const spawned: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const config of configs) {
      const result = this.spawnWorker(config);
      if (result.success) {
        spawned.push(config.id);
      } else {
        failed.push({ id: config.id, error: result.error || 'Unknown error' });
      }
    }

    return { spawned, failed };
  }

  /**
   * Get a worker handle by ID
   */
  getWorker(id: string): WorkerHandle | undefined {
    return this.workers.get(id);
  }

  /**
   * Get all worker handles
   */
  getAllWorkers(): WorkerHandle[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get all worker IDs
   */
  getWorkerIds(): string[] {
    return Array.from(this.workers.keys());
  }

  /**
   * Get the number of workers
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Check if a worker exists
   */
  hasWorker(id: string): boolean {
    return this.workers.has(id);
  }

  /**
   * Read a worker's screen/pane content
   *
   * @param id - Worker ID
   * @returns Screen content or error
   */
  readWorkerScreen(id: string): ReadScreenResult {
    const handle = this.workers.get(id);
    if (!handle) {
      return { success: false, output: '', error: `Worker ${id} not found` };
    }

    let result;
    switch (this.mode) {
      case 'cmux':
        if (!handle.surfaceId) {
          return { success: false, output: '', error: 'No surface ID' };
        }
        result = readCmuxScreen(handle.surfaceId);
        break;
      case 'tmux':
        if (!handle.tmuxPane) {
          return { success: false, output: '', error: 'No pane ID' };
        }
        result = readTmuxPane(handle.tmuxPane);
        break;
      default:
        return { success: false, output: '', error: 'nohup mode not implemented' };
    }

    return {
      success: result.success,
      output: result.output,
      error: result.errorMessage,
    };
  }

  /**
   * Check if a worker has completed (based on status file)
   *
   * This is the primary completion detection mechanism.
   * Workers write status files when they complete.
   */
  isWorkerCompleted(id: string): boolean {
    return this.taskManager.isWorkerCompleted(id);
  }

  /**
   * Get worker status from status file
   */
  getWorkerStatus(id: string): WorkerStatusFile | null {
    return this.taskManager.readWorkerStatus(id);
  }

  /**
   * Check completion status of all workers
   *
   * @returns Arrays of completed, running, and failed worker IDs
   */
  checkAllCompletion(): CompletionStatus {
    const completed: string[] = [];
    const running: string[] = [];
    const failed: string[] = [];

    for (const id of Array.from(this.workers.keys())) {
      const status = this.taskManager.readWorkerStatus(id);
      if (!status) {
        running.push(id); // No status file yet, still starting/running
      } else if (status.status === 'completed') {
        completed.push(id);
      } else if (status.status === 'failed') {
        failed.push(id);
      } else {
        running.push(id);
      }
    }

    return { completed, running, failed };
  }

  /**
   * Wait for all workers to complete
   *
   * @param pollIntervalMs - How often to check (default: 5000ms)
   * @param timeoutMs - Maximum time to wait (default: 30 minutes)
   * @returns Final completion status
   */
  async waitForCompletion(
    pollIntervalMs: number = 5000,
    timeoutMs: number = 30 * 60 * 1000
  ): Promise<CompletionStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = this.checkAllCompletion();

      // Check if all workers have finished
      if (status.running.length === 0) {
        return status;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout reached
    return this.checkAllCompletion();
  }

  /**
   * Update a worker's handle status
   */
  updateWorkerStatus(id: string, status: WorkerHandle['status']): boolean {
    const handle = this.workers.get(id);
    if (!handle) return false;

    handle.status = status;
    if (status === 'completed' || status === 'failed') {
      handle.completedAt = Date.now();
    }

    return true;
  }

  /**
   * Close a single worker
   *
   * @param id - Worker ID to close
   * @returns Success status and optional error
   */
  closeWorker(id: string): { success: boolean; error?: string } {
    const handle = this.workers.get(id);
    if (!handle) {
      return { success: false, error: `Worker ${id} not found` };
    }

    let result;
    switch (this.mode) {
      case 'cmux':
        if (!handle.surfaceId) {
          return { success: false, error: 'No surface ID' };
        }
        result = closeCmuxWorker(handle.surfaceId);
        break;
      case 'tmux':
        if (!handle.tmuxPane) {
          return { success: false, error: 'No pane ID' };
        }
        result = closeTmuxWorker(handle.tmuxPane);
        break;
      default:
        return { success: false, error: 'nohup mode not implemented' };
    }

    if (result.success) {
      handle.status = 'completed';
      handle.completedAt = Date.now();
    }

    return { success: result.success, error: result.errorMessage };
  }

  /**
   * Close all workers
   *
   * @returns Arrays of closed IDs and failed closures with errors
   */
  closeAll(): CloseAllResult {
    const closed: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of Array.from(this.workers.keys())) {
      const result = this.closeWorker(id);
      if (result.success) {
        closed.push(id);
      } else {
        failed.push({ id, error: result.error || 'Unknown error' });
      }
    }

    return { closed, failed };
  }

  /**
   * Remove a worker from the pool (without closing it)
   */
  removeWorker(id: string): boolean {
    return this.workers.delete(id);
  }

  /**
   * Clear all workers from the pool (without closing them)
   */
  clearWorkers(): void {
    this.workers.clear();
  }

  /**
   * Get a summary of the pool state
   */
  getSummary(): {
    mode: WorkerMode;
    totalWorkers: number;
    workerIds: string[];
    taskSummary: ReturnType<TaskManager['getSummary']>;
    detection: DetectionResult;
  } {
    return {
      mode: this.mode,
      totalWorkers: this.workers.size,
      workerIds: this.getWorkerIds(),
      taskSummary: this.taskManager.getSummary(),
      detection: this.detection,
    };
  }
}
