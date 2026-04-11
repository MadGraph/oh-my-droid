/**
 * Task Manager
 *
 * File-based task management with atomic claiming protocol.
 * Implements TOCTOU-safe task claiming using claim files.
 *
 * v3 Security Features:
 * - TOCTOU guard: Re-checks task status AFTER winning claim race
 * - Safe JSON parsing: All JSON.parse wrapped in try-catch
 * - Atomic writes: Uses rename() for crash-safe updates
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import type { Task, TaskStatus, WorkerStatusFile } from './types.js';

/**
 * Safe JSON parse with error handling (v3 FIX)
 * Returns null on parse failure instead of throwing
 *
 * @param content - JSON string to parse
 * @param fallback - Value to return on parse failure (default: null)
 * @returns Parsed object or fallback value
 */
function safeJsonParse<T>(content: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

/**
 * Task Manager for coordinating worker task claims
 *
 * Uses a file-based protocol for atomic task claiming:
 * 1. Check task status is 'pending'
 * 2. Create claim file: task-{id}.claim.{workerId}
 * 3. Read all claim files for this task
 * 4. Winner is the earliest timestamp
 * 5. Re-read task to verify still 'pending' (TOCTOU guard)
 * 6. Update task status to 'claimed'
 */
export class TaskManager {
  private tasksDir: string;
  private workersDir: string;
  private statusDir: string;

  constructor(private teamDir: string) {
    this.tasksDir = join(teamDir, 'tasks');
    this.workersDir = join(teamDir, 'workers');
    this.statusDir = join(teamDir, 'status');
  }

  /**
   * Initialize directory structure
   */
  ensureDirectories(): void {
    [this.teamDir, this.tasksDir, this.workersDir, this.statusDir].forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  // ============ Task CRUD ============

  /**
   * Write a task to disk (atomic)
   */
  writeTask(task: Task): void {
    const path = join(this.tasksDir, `${task.id}.json`);
    this.atomicWrite(path, JSON.stringify(task, null, 2));
  }

  /**
   * Read a task by ID
   * @returns Task or null if not found/corrupt
   */
  readTask(taskId: string): Task | null {
    const path = join(this.tasksDir, `${taskId}.json`);
    if (!existsSync(path)) return null;

    // v3 FIX: Safe JSON parse
    const content = readFileSync(path, 'utf-8');
    return safeJsonParse<Task>(content);
  }

  /**
   * Read all tasks from disk
   * Filters out corrupt JSON files (v3 FIX)
   */
  readAllTasks(): Task[] {
    if (!existsSync(this.tasksDir)) return [];

    return readdirSync(this.tasksDir)
      .filter(f => f.endsWith('.json') && !f.includes('.claim.'))
      .map(f => {
        const content = readFileSync(join(this.tasksDir, f), 'utf-8');
        // v3 FIX: Safe JSON parse, filter out corrupt files
        return safeJsonParse<Task>(content);
      })
      .filter((t): t is Task => t !== null);
  }

  /**
   * Get all pending tasks
   */
  getPendingTasks(): Task[] {
    return this.readAllTasks().filter(t => t.status === 'pending');
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.readAllTasks().filter(t => t.status === status);
  }

  // ============ Atomic Task Claiming Protocol (v3 HARDENED) ============

  /**
   * Attempt to claim a task for a worker.
   * Uses atomic claim file creation to prevent race conditions.
   *
   * Protocol:
   * 1. Check task status is 'pending'
   * 2. Create claim file: task-{id}.claim.{workerId}
   * 3. Read all claim files for this task
   * 4. If we're the first by timestamp, claim succeeds
   * 5. v3 FIX: Re-read task AFTER winning to detect concurrent modification
   * 6. If another worker claimed first, remove our claim and return false
   *
   * @param taskId - Task to claim
   * @param workerId - Worker attempting to claim
   * @returns true if claim succeeded, false if task already claimed
   */
  claimTask(taskId: string, workerId: string): boolean {
    const task = this.readTask(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    // Create claim file
    const claimFile = join(this.tasksDir, `${taskId}.claim.${workerId}`);
    const claimData = {
      workerId,
      claimedAt: Date.now(),
    };

    try {
      // Use wx flag: fail if file exists (atomic create)
      writeFileSync(claimFile, JSON.stringify(claimData), { flag: 'wx' });
    } catch {
      // Claim file already exists (we already claimed)
      // Continue to check if we won
    }

    // Read all claim files for this task
    const claimFiles = readdirSync(this.tasksDir)
      .filter(f => f.startsWith(`${taskId}.claim.`));

    if (claimFiles.length === 0) {
      return false; // Something went wrong
    }

    // Find the winner (first claim by timestamp)
    let winner: { workerId: string; claimedAt: number } | null = null;

    for (const cf of claimFiles) {
      const content = readFileSync(join(this.tasksDir, cf), 'utf-8');
      // v3 FIX: Safe JSON parse for claim files
      const claim = safeJsonParse<{ workerId: string; claimedAt: number }>(content);
      if (!claim) continue; // Skip corrupt claim files

      if (!winner || claim.claimedAt < winner.claimedAt) {
        winner = claim;
      }
    }

    if (winner?.workerId === workerId) {
      // v3 FIX (TOCTOU): Re-read task AFTER winning to ensure it's still pending
      // Another worker might have updated the task between our first check and now
      const taskRecheck = this.readTask(taskId);
      if (!taskRecheck || taskRecheck.status !== 'pending') {
        // Task was modified by another process - clean up and fail
        try {
          unlinkSync(claimFile);
        } catch {
          // Ignore cleanup errors
        }
        return false;
      }

      // We won AND task is still pending! Update task status
      taskRecheck.status = 'claimed';
      taskRecheck.assignedWorker = workerId;
      taskRecheck.claimedAt = winner.claimedAt;
      this.writeTask(taskRecheck);

      // Clean up all claim files
      for (const cf of claimFiles) {
        try {
          unlinkSync(join(this.tasksDir, cf));
        } catch {
          // Ignore cleanup errors
        }
      }

      return true;
    } else {
      // We lost, remove our claim file
      try {
        unlinkSync(claimFile);
      } catch {
        // Ignore cleanup errors
      }
      return false;
    }
  }

  /**
   * Mark task as in progress (after successful claim)
   *
   * @param taskId - Task to start
   * @param workerId - Worker starting the task (must be assigned)
   * @returns true if task was updated
   */
  startTask(taskId: string, workerId: string): boolean {
    const task = this.readTask(taskId);
    if (!task || task.assignedWorker !== workerId) {
      return false;
    }
    task.status = 'in_progress';
    this.writeTask(task);
    return true;
  }

  /**
   * Mark task as completed
   *
   * @param taskId - Task to complete
   * @param workerId - Worker completing the task (must be assigned)
   * @param result - Optional result/output from the task
   * @returns true if task was updated
   */
  completeTask(taskId: string, workerId: string, result?: string): boolean {
    const task = this.readTask(taskId);
    if (!task || task.assignedWorker !== workerId) {
      return false;
    }
    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = result;
    this.writeTask(task);
    return true;
  }

  /**
   * Mark task as failed
   *
   * @param taskId - Task that failed
   * @param workerId - Worker that failed the task (must be assigned)
   * @param error - Error message/reason
   * @returns true if task was updated
   */
  failTask(taskId: string, workerId: string, error?: string): boolean {
    const task = this.readTask(taskId);
    if (!task || task.assignedWorker !== workerId) {
      return false;
    }
    task.status = 'failed';
    task.completedAt = Date.now();
    task.result = error;
    this.writeTask(task);
    return true;
  }

  /**
   * Release a claimed task back to pending
   *
   * @param taskId - Task to release
   * @param workerId - Worker releasing the task (must be assigned)
   * @returns true if task was released
   */
  releaseTask(taskId: string, workerId: string): boolean {
    const task = this.readTask(taskId);
    if (!task || task.assignedWorker !== workerId) {
      return false;
    }
    task.status = 'pending';
    task.assignedWorker = undefined;
    task.claimedAt = undefined;
    this.writeTask(task);
    return true;
  }

  // ============ Worker Status Files ============

  /**
   * Write worker status file (called by workers)
   */
  writeWorkerStatus(status: WorkerStatusFile): void {
    const path = join(this.statusDir, `${status.workerId}.json`);
    this.atomicWrite(path, JSON.stringify(status, null, 2));
  }

  /**
   * Read worker status file
   */
  readWorkerStatus(workerId: string): WorkerStatusFile | null {
    const path = join(this.statusDir, `${workerId}.json`);
    if (!existsSync(path)) return null;

    // v3 FIX: Safe JSON parse
    const content = readFileSync(path, 'utf-8');
    return safeJsonParse<WorkerStatusFile>(content);
  }

  /**
   * Check if worker has completed (based on status file)
   * This is the primary completion detection mechanism.
   */
  isWorkerCompleted(workerId: string): boolean {
    const status = this.readWorkerStatus(workerId);
    if (!status) return false;
    return status.status === 'completed' || status.status === 'failed';
  }

  /**
   * Get all worker statuses
   * Filters out corrupt JSON files (v3 FIX)
   */
  getAllWorkerStatuses(): WorkerStatusFile[] {
    if (!existsSync(this.statusDir)) return [];

    return readdirSync(this.statusDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const content = readFileSync(join(this.statusDir, f), 'utf-8');
        // v3 FIX: Safe JSON parse, filter out corrupt files
        return safeJsonParse<WorkerStatusFile>(content);
      })
      .filter((s): s is WorkerStatusFile => s !== null);
  }

  // ============ Worker Prompts ============

  /**
   * Write a worker prompt file
   *
   * @param workerId - Worker ID
   * @param prompt - Prompt content (markdown)
   * @returns Path to the prompt file
   */
  writeWorkerPrompt(workerId: string, prompt: string): string {
    const path = join(this.workersDir, `${workerId}-prompt.md`);
    this.atomicWrite(path, prompt);
    return path;
  }

  /**
   * Read a worker prompt file
   */
  readWorkerPrompt(workerId: string): string | null {
    const path = join(this.workersDir, `${workerId}-prompt.md`);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  }

  // ============ Utilities ============

  /**
   * Atomic write using rename
   * Writes to a temp file first, then renames for crash safety
   */
  private atomicWrite(path: string, content: string): void {
    const tmpPath = `${path}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, path);
  }

  /**
   * Get the tasks directory path
   */
  getTasksDir(): string {
    return this.tasksDir;
  }

  /**
   * Get the workers directory path
   */
  getWorkersDir(): string {
    return this.workersDir;
  }

  /**
   * Get the status directory path
   */
  getStatusDir(): string {
    return this.statusDir;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    pending: number;
    claimed: number;
    inProgress: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const tasks = this.readAllTasks();
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      claimed: tasks.filter(t => t.status === 'claimed').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      total: tasks.length,
    };
  }
}
