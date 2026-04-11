/**
 * Team CMUX Worker Module Types
 *
 * Type definitions for the CMUX-based worker spawn/management system.
 * Supports CMUX (Factory), tmux (fallback), and nohup (deferred).
 */

/**
 * Worker spawn mode
 * - cmux: Factory CMUX splits (preferred)
 * - tmux: Standard tmux panes (fallback)
 * - nohup: Background processes (deferred to v4)
 */
export type WorkerMode = 'cmux' | 'tmux' | 'nohup';

/**
 * Worker lifecycle status
 */
export type WorkerStatus = 'pending' | 'starting' | 'running' | 'completed' | 'failed';

/**
 * Task lifecycle status
 */
export type TaskStatus = 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed';

/**
 * Configuration for spawning a worker
 */
export interface WorkerConfig {
  /** Unique worker identifier */
  id: string;
  /** Path to the prompt file for the worker */
  promptFile: string;
  /** Auto-accept level for droid exec */
  autoLevel: 'low' | 'medium' | 'high';
  /** Optional model override */
  model?: string;
  /** Working directory */
  cwd: string;
}

/**
 * Handle to a spawned worker
 */
export interface WorkerHandle {
  /** Worker identifier */
  id: string;
  /** CMUX surface ID (format: "surface:XX") */
  surfaceId?: string;
  /** tmux pane ID */
  tmuxPane?: string;
  /** nohup process ID */
  pid?: number;
  /** Current worker status */
  status: WorkerStatus;
  /** Unix timestamp when worker was started */
  startedAt: number;
  /** Unix timestamp when worker completed (undefined if still running) */
  completedAt?: number;
}

/**
 * A task in the task pool
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Human-readable task title */
  title: string;
  /** Detailed task description */
  description: string;
  /** Current task status */
  status: TaskStatus;
  /** Worker ID that claimed this task */
  assignedWorker?: string;
  /** Unix timestamp when task was claimed */
  claimedAt?: number;
  /** Unix timestamp when task was completed */
  completedAt?: number;
  /** Result/output from the task */
  result?: string;
}

/**
 * Worker status file format
 * Written by workers to signal completion to the orchestrator.
 */
export interface WorkerStatusFile {
  /** Worker identifier */
  workerId: string;
  /** Current worker status */
  status: 'running' | 'completed' | 'failed';
  /** Task currently being worked on */
  currentTask?: string;
  /** List of completed task IDs */
  completedTasks: string[];
  /** Unix timestamp of last status update */
  lastUpdate: number;
  /** Reason for exit (on failure) */
  exitReason?: string;
}

/**
 * Worker pool state
 */
export interface WorkerPool {
  /** Team slug/identifier */
  slug: string;
  /** Active worker mode */
  mode: WorkerMode;
  /** Map of worker ID to handle */
  workers: Map<string, WorkerHandle>;
}
