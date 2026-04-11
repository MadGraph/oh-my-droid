/**
 * Team CMUX Worker Module
 *
 * Multi-worker orchestration for parallel task execution using
 * CMUX (Factory) or tmux (fallback) for visible terminal splits.
 *
 * @module team
 */

// Types
export type {
  WorkerMode,
  WorkerStatus,
  TaskStatus,
  WorkerConfig,
  WorkerHandle,
  Task,
  WorkerStatusFile,
  WorkerPool,
} from './types.js';

// Exec utilities
export {
  ExecErrorCode,
  execCommand,
  type ExecResult,
} from './exec-utils.js';

// Detection
export {
  detectWorkerMode,
  hasCmuxEnv,
  cmuxSmokeTest,
  isTmuxAvailable,
  type DetectionResult,
  type SmokeTestResult,
} from './detection.js';

// CMUX worker
export {
  spawnCmuxWorker,
  readCmuxScreen,
  closeCmuxWorker,
  checkCmuxWorkerCompletion,
  type CmuxSpawnResult,
} from './cmux-worker.js';

// tmux worker
export {
  spawnTmuxWorker,
  readTmuxPane,
  closeTmuxWorker,
  tmuxSessionExists,
  killTmuxSession,
  checkTmuxWorkerCompletion,
  type TmuxSpawnResult,
} from './tmux-worker.js';

// Task manager
export { TaskManager } from './task-manager.js';

// Worker pool
export {
  TeamWorkerPool,
  type ReadScreenResult,
  type SpawnAllResult,
  type CompletionStatus,
  type CloseAllResult,
} from './worker-pool.js';
